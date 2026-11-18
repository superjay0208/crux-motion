/**
 * 2D adaptation of Another-Axiom/GorillaLocomotion Player.cs (MIT, 2021)
 * commit bc42e959cf3e69178f9147d89bd3ffeab1c432c4:
 * inverse planted-hand position correction and averaging simultaneous supports.
 * Velocity history adapted from GodotVR/godot-xr-tools (MIT), commit
 * 6c6189bdfcdf855052ef1aeb9f3e0ec4c7a7eb60, velocity_averager_linear.gd.
 * Original licenses ship in public/licenses. No Unity/Godot runtime is required.
 * Differences: 2D vectors, time-window history, bounded native Planck actuator;
 * no floor push, collision sphere casts, jump multiplier or forward push.
 */
import { add, sub, mul, len, dist, clamp, v, type V } from "../../core/math";

export type HandSupport = {
  anchor: V;
  requested: V;
  shoulder?: V;
};

export function inverseHandCorrection(supports: HandSupport[]): V {
  if (supports.length === 2) {
    const [a, b] = supports,
      sep = Math.abs(a.anchor.y - b.anchor.y);
    if (sep > 0.2) {
      const [upper, lower] = a.anchor.y >= b.anchor.y ? [a, b] : [b, a],
        du = sub(upper.anchor, upper.requested),
        dl = sub(lower.anchor, lower.requested),
        pull = du.y;
      if (pull > 0.06) {
        const tSep = clamp((sep - 0.2) / 0.08, 0, 1),
          tPull = clamp((pull - 0.06) / 0.1, 0, 1),
          tDrag = clamp((du.y - dl.y - 0.04) / 0.1, 0, 1),
          tReach = lower.shoulder
            ? clamp((dist(lower.shoulder, lower.anchor) - 0.62) / 0.1, 0, 1)
            : 0,
          t = tSep * tPull * Math.max(tDrag, tReach);
        if (t > 0) {
          const wUpper = 0.5 + 0.28 * t;
          return add(mul(du, wUpper), mul(dl, 1 - wUpper));
        }
      }
    }
  }
  let correction = v();
  for (const hand of supports)
    correction = add(correction, sub(hand.anchor, hand.requested));
  return supports.length ? mul(correction, 1 / supports.length) : correction;
}

export class ReleaseVelocity {
  private samples: { dt: number; distance: V }[] = [];
  constructor(readonly windowSeconds = 0.18) {}
  addDistance(dt: number, distance: V) {
    if (dt <= 0 || !Number.isFinite(dt + distance.x + distance.y)) return;
    this.samples.push({ dt, distance: { ...distance } });
    let duration = this.samples.reduce((n, s) => n + s.dt, 0);
    while (
      this.samples.length > 1 &&
      duration - this.samples[0].dt >= this.windowSeconds
    )
      duration -= this.samples.shift()!.dt;
  }
  velocity(maxSpeed = 4.2): V {
    const duration = this.samples.reduce((n, s) => n + s.dt, 0);
    const distance = this.samples.reduce((n, s) => add(n, s.distance), v());
    let result = duration > 0 ? mul(distance, 1 / duration) : v();
    if (duration >= 0.1) {
      let skip = 0.05,
        earlyDuration = 0,
        earlyDistance = v();
      for (let i = this.samples.length - 1; i >= 0; i--) {
        const s = this.samples[i];
        if (skip >= s.dt) {
          skip -= s.dt;
          continue;
        }
        const keep = skip > 0 ? (s.dt - skip) / s.dt : 1;
        skip = 0;
        earlyDuration += s.dt * keep;
        earlyDistance = add(earlyDistance, mul(s.distance, keep));
      }
      if (earlyDuration >= 0.04) {
        const early = mul(earlyDistance, 1 / earlyDuration);
        if (
          early.x * result.x + early.y * result.y > 0 &&
          len(early) > len(result)
        )
          result = early;
      }
    }
    return len(result) > maxSpeed
      ? mul(result, maxSpeed / len(result))
      : result;
  }
  clear() {
    this.samples = [];
  }
}
