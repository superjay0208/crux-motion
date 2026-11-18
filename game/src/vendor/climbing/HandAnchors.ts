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

const RING_CAPACITY = 64;

export class ReleaseVelocity {
  private readonly dts = new Float64Array(RING_CAPACITY);
  private readonly xs = new Float64Array(RING_CAPACITY);
  private readonly ys = new Float64Array(RING_CAPACITY);
  private head = 0;
  private count = 0;
  private totalDuration = 0;
  constructor(readonly windowSeconds = 0.18) {}
  addDistance(dt: number, distance: V) {
    if (dt <= 0 || !Number.isFinite(dt + distance.x + distance.y)) return;
    if (this.count === RING_CAPACITY) {
      this.totalDuration -= this.dts[this.head];
      this.head = (this.head + 1) % RING_CAPACITY;
      this.count--;
    }
    const idx = (this.head + this.count) % RING_CAPACITY;
    this.dts[idx] = dt;
    this.xs[idx] = distance.x;
    this.ys[idx] = distance.y;
    this.count++;
    this.totalDuration += dt;
    while (
      this.count > 1 &&
      this.totalDuration - this.dts[this.head] >= this.windowSeconds
    ) {
      this.totalDuration -= this.dts[this.head];
      this.head = (this.head + 1) % RING_CAPACITY;
      this.count--;
    }
  }
  velocity(maxSpeed = 4.2): V {
    if (this.count === 0) return v();
    let duration = 0,
      dx = 0,
      dy = 0;
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % RING_CAPACITY;
      duration += this.dts[idx];
      dx += this.xs[idx];
      dy += this.ys[idx];
    }
    let rx = duration > 0 ? dx / duration : 0,
      ry = duration > 0 ? dy / duration : 0;
    if (duration >= 0.1) {
      let skip = 0.05,
        earlyDuration = 0,
        ex = 0,
        ey = 0;
      for (let i = this.count - 1; i >= 0; i--) {
        const idx = (this.head + i) % RING_CAPACITY;
        const sdt = this.dts[idx];
        if (skip >= sdt) {
          skip -= sdt;
          continue;
        }
        const keep = skip > 0 ? (sdt - skip) / sdt : 1;
        skip = 0;
        earlyDuration += sdt * keep;
        ex += this.xs[idx] * keep;
        ey += this.ys[idx] * keep;
      }
      if (earlyDuration >= 0.04) {
        const eax = ex / earlyDuration,
          eay = ey / earlyDuration;
        if (
          eax * rx + eay * ry > 0 &&
          Math.hypot(eax, eay) > Math.hypot(rx, ry)
        ) {
          rx = eax;
          ry = eay;
        }
      }
    }
    const speed = Math.hypot(rx, ry);
    return speed > maxSpeed
      ? v((rx * maxSpeed) / speed, (ry * maxSpeed) / speed)
      : v(rx, ry);
  }
  recentVelocity(maxSpeed = 4.2): V {
    if (this.count === 0) return v();
    const base = this.velocity(maxSpeed);
    let dur06 = 0,
      dx06 = 0,
      dy06 = 0,
      dur12 = 0,
      dx12 = 0,
      dy12 = 0;
    for (let i = this.count - 1; i >= 0 && dur12 < 0.12; i--) {
      const idx = (this.head + i) % RING_CAPACITY;
      const sdt = this.dts[idx],
        sx = this.xs[idx],
        sy = this.ys[idx];
      if (dur06 < 0.06) {
        const keep06 = Math.min(1, (0.06 - dur06) / sdt);
        dur06 += sdt * keep06;
        dx06 += sx * keep06;
        dy06 += sy * keep06;
      }
      const keep12 = Math.min(1, (0.12 - dur12) / sdt);
      dur12 += sdt * keep12;
      dx12 += sx * keep12;
      dy12 += sy * keep12;
    }
    const v06x = dur06 > 0 ? dx06 / dur06 : 0,
      v06y = dur06 > 0 ? dy06 / dur06 : 0;
    const v12x = dur12 >= 0.04 ? dx12 / dur12 : base.x,
      v12y = dur12 >= 0.04 ? dy12 / dur12 : base.y;
    let rx = base.x;
    if (dur06 >= 0.03 && v06x * base.x < 0 && Math.abs(v06x) > 0.2) {
      rx =
        v12x * v06x >= 0 && Math.abs(v12x) >= Math.abs(v06x) ? v12x : v06x;
    } else if (v12x * v06x >= -0.02 && Math.abs(v12x) > Math.abs(base.x)) {
      rx = v12x;
    }
    let ry = base.y;
    if (dur06 >= 0.03 && v06y < -0.2) {
      ry = Math.min(v12y, base.y);
    } else if (dur06 >= 0.03 && v06y > 0.25 && base.y < 0) {
      ry = Math.max(v06y, v12y);
    } else if (v12y > base.y && v06y >= -0.05) {
      ry = v12y;
    }
    const speed = Math.hypot(rx, ry);
    return speed > maxSpeed
      ? v((rx * maxSpeed) / speed, (ry * maxSpeed) / speed)
      : v(rx, ry);
  }
  clear() {
    this.head = 0;
    this.count = 0;
    this.totalDuration = 0;
  }
}
