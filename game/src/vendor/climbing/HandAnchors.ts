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
import { add, sub, mul, len, v, type V } from "../../core/math";

export function inverseHandCorrection(
  supports: { anchor: V; requested: V }[],
): V {
  let correction = v();
  for (const hand of supports)
    correction = add(correction, sub(hand.anchor, hand.requested));
  return supports.length ? mul(correction, 1 / supports.length) : correction;
}

export class ReleaseVelocity {
  private samples: { dt: number; distance: V }[] = [];
  constructor(readonly windowSeconds = 0.14) {}
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
  velocity(maxSpeed = 4): V {
    const duration = this.samples.reduce((n, s) => n + s.dt, 0);
    const distance = this.samples.reduce((n, s) => add(n, s.distance), v());
    const result = duration > 0 ? mul(distance, 1 / duration) : v();
    return len(result) > maxSpeed
      ? mul(result, maxSpeed / len(result))
      : result;
  }
  clear() {
    this.samples = [];
  }
}
