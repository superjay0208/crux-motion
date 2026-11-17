import type { Landmark } from "./gestures";
import { dist, add, mul, sub, type V } from "../core/math";
import { hands, type Hand } from "../core/types";
export type Detection = {
  points: Landmark[];
  world?: Landmark[];
  label: string;
  score: number;
};
export class IdentityTracker {
  private last: Partial<Record<Hand, { p: V; velocity: V; t: number }>> = {};
  assign(
    d: Detection[],
    pose: Landmark[],
    t: number,
  ): Partial<Record<Hand, Detection>> {
    if (!d.length) return {};
    const cost = (side: Hand, c: Detection) => {
      const wrist = pose[side === "left" ? 15 : 16];
      const old = this.last[side];
      const prev = old && t - old.t < 600 ? old : undefined;
      let n = 0;
      if (wrist && (wrist.visibility ?? 1) > 0.5)
        n += dist(wrist, c.points[0]) * 5;
      else if (!prev)
        return c.score > 0.9
          ? c.label.toLowerCase() === side
            ? 0.2
            : 2.2
          : 20;
      if (prev) {
        const prediction = add(
          prev.p,
          mul(prev.velocity, Math.min(0.12, (t - prev.t) / 1000)),
        );
        n += dist(prediction, c.points[0]) * 2;
      }
      // Labels are evidence only. Raw, unmirrored MediaPipe labels verified in calibration.
      if (c.label.toLowerCase() !== side) n += 0.08 * c.score;
      return n;
    };
    let result: Partial<Record<Hand, Detection>> = {};
    if (d.length === 1) {
      const l = cost("left", d[0]),
        r = cost("right", d[0]);
      if (Math.abs(l - r) > 0.12 && Math.min(l, r) < 1.8)
        result[l < r ? "left" : "right"] = d[0];
    } else {
      const a = cost("left", d[0]) + cost("right", d[1]),
        b = cost("left", d[1]) + cost("right", d[0]);
      if (Math.abs(a - b) > 0.12 && Math.min(a, b) < 3.6) {
        result = { left: d[a < b ? 0 : 1], right: d[a < b ? 1 : 0] };
      }
    }
    for (const side of hands) {
      const c = result[side];
      if (c) {
        const p = c.points[0],
          old = this.last[side],
          prev = old && t - old.t < 600 ? old : undefined,
          dt = prev ? Math.max(0.01, (t - prev.t) / 1000) : 1;
        this.last[side] = {
          p,
          velocity: prev ? mul(sub(p, prev.p), 1 / dt) : { x: 0, y: 0 },
          t,
        };
      }
    }
    return result;
  }
  reset() {
    this.last = {};
  }
}
