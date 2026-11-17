import { clamp, dist, type V } from "../core/math";
import type { Grip, Orientation } from "../core/types";
export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type Features = number[];
export function elbowBend(
  shoulder: Landmark,
  elbow: Landmark,
  wrist: Landmark,
  previous: number,
) {
  const cross =
    (elbow.x - shoulder.x) * (wrist.y - shoulder.y) -
    (elbow.y - shoulder.y) * (wrist.x - shoulder.x);
  const scale =
    Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y) *
    Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);
  return scale > 1e-6 && Math.abs(cross / scale) > 0.18
    ? Math.sign(cross)
    : previous;
}
export type GestureSample = {
  grip: Grip;
  score: number;
  features: Features;
  orientation: Orientation;
};
const angle = (a: Landmark, b: Landmark, c: Landmark) => {
  const x = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)],
    y = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  return (
    Math.acos(
      clamp(
        x.reduce((s, n, i) => s + n * y[i], 0) /
          (Math.hypot(...x) * Math.hypot(...y) || 1),
        -1,
        1,
      ),
    ) / Math.PI
  );
};
export function features(points: Landmark[], width = 1, height = 1): Features {
  if (
    points.length !== 21 ||
    points.some((p) => !Number.isFinite(p.x + p.y + (p.z ?? 0)))
  )
    return [];
  const p = points.map((a) => ({
    x: a.x * width,
    y: a.y * height,
    z: (a.z || 0) * width,
  }));
  const scale = dist(p[5], p[17]);
  if (scale < 0.0001) return [];
  const bends = [5, 9, 13, 17].map((k) => 1 - angle(p[k], p[k + 1], p[k + 2]));
  const compact = [8, 12, 16, 20].map((k) => dist(p[k], p[0]) / scale);
  const spread =
    (dist(p[8], p[12]) + dist(p[12], p[16]) + dist(p[16], p[20])) / scale;
  const pinch =
    Math.hypot(
      p[4].x - p[8].x,
      p[4].y - p[8].y,
      (p[4].z ?? 0) - (p[8].z ?? 0),
    ) / scale;
  const distal = [5, 9, 13, 17].map(
    (k) => 1 - angle(p[k + 1], p[k + 2], p[k + 3]),
  );
  const knuckles = [5, 9, 13, 17].map((k) => 1 - angle(p[0], p[k], p[k + 1]));
  return [...bends, ...compact, spread, pinch, ...distal, ...knuckles];
}
export const validFeatures = (f: Features | undefined): f is Features =>
  !!f && f.length >= 10 && f.every(Number.isFinite);
export type Prototypes = Partial<
  Record<Grip, { mean: Features; spread: Features }>
>;
export function prototype(samples: Features[]) {
  const mean = samples[0].map(
    (_, i) => samples.reduce((s, f) => s + f[i], 0) / samples.length,
  );
  return {
    mean,
    spread: mean.map((m, i) =>
      Math.max(
        0.08,
        Math.sqrt(
          samples.reduce((s, f) => s + (f[i] - m) ** 2, 0) / samples.length,
        ),
      ),
    ),
  };
}
export function classify(
  f: Features,
  prototypes: Prototypes = {},
  previous: Grip = "unknown",
): { grip: Grip; score: number } {
  if (!validFeatures(f)) return { grip: "unknown", score: 0 };
  const fallback = geometricGrip(f);
  const entries = Object.entries(prototypes) as [
    Grip,
    { mean: Features; spread: Features },
  ][];
  const usable = entries.filter(
    ([, p]) =>
      validFeatures(p.mean) &&
      p.mean.length <= f.length &&
      p.spread.length === p.mean.length &&
      p.spread.every(Number.isFinite),
  );
  if (usable.length >= 1) {
    const ranked = usable
      .map(([grip, p]) => ({
        grip,
        score: Math.exp(
          -p.mean.reduce(
            (s, x, i) =>
              s + ((f[i] - x) / Math.max(0.14, p.spread[i] * 2.5)) ** 2,
            0,
          ) / p.mean.length,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    // A clearly extended hand must remain a usable release, including with old tuning.
    if (fallback.grip === "release" && fallback.score >= 0.95) return fallback;
    if (
      ranked[0].score > 0.5 &&
      ranked[0].score - (ranked[1]?.score ?? 0) > 0.08
    )
      return ranked[0];
    const sticky = ranked.find((r) => r.grip === previous);
    if (sticky && sticky.score > 0.5 && ranked[0].score - sticky.score < 0.08)
      return sticky;
    // Finishing only some calibration steps must not disable every untrained grip.
    if (!usable.some(([g]) => g === fallback.grip)) return fallback;
    if (
      f.length >= 18 &&
      usable.every(([, p]) => p.mean.length === 10) &&
      fallback.score >= 0.88
    )
      return fallback;
    return { grip: "unknown", score: ranked[0].score };
  }
  return fallback;
}
function geometricGrip(f: Features): { grip: Grip; score: number } {
  const curl = f.slice(0, 4).reduce((a, b) => a + b) / 4,
    compact = f.slice(4, 8).reduce((a, b) => a + b) / 4;
  if (f.length >= 18) {
    const distal = f.slice(10, 14).reduce((a, b) => a + b) / 4;
    const knuckle = f.slice(14, 18).reduce((a, b) => a + b) / 4;
    if (
      Math.max(...f.slice(0, 4)) < 0.22 &&
      Math.max(...f.slice(10, 14)) < 0.25 &&
      Math.max(...f.slice(14, 18)) < 0.35 &&
      compact > 1.75 &&
      f[8] > 0.85
    )
      return { grip: "release", score: 0.96 };
    if (compact < 1.25 || (curl > 0.48 && distal > 0.3 && compact < 1.8))
      return { grip: "jug", score: 0.9 };
    if (curl > 0.27 && distal < 0.34 && knuckle < 0.48)
      return { grip: "crimp", score: 0.9 };
    if (f[9] < 0.55 && compact > 1.2 && (f[0] > 0.15 || f[14] > 0.2))
      return { grip: "pinch", score: 0.9 };
    if (
      compact > 1.3 &&
      compact < 2.6 &&
      (knuckle > 0.23 || curl > 0.12) &&
      f[8] < 1.6
    )
      return { grip: "sloper", score: 0.86 };
    if (curl > 0.5 && compact < 1.8) return { grip: "jug", score: 0.82 };
    return { grip: "unknown", score: 0.25 };
  }
  if (f[8] > 1.35 && curl < 0.25) return { grip: "release", score: 0.9 };
  if (f[9] < 0.6 && compact > 1.1) return { grip: "pinch", score: 0.85 };
  if (curl > 0.5 || compact < 1.2) return { grip: "jug", score: 0.85 };
  if (curl > 0.26) return { grip: "crimp", score: 0.8 };
  if (f[8] < 1.3) return { grip: "sloper", score: 0.8 };
  return { grip: "unknown", score: 0.3 };
}
export class GestureLatch {
  grip: Grip = "unknown";
  private pending: Grip = "unknown";
  private since = 0;
  private frames = 0;
  private last = -1;
  update(grip: Grip, score: number, t: number) {
    if (t <= this.last) return this.grip;
    this.last = t;
    if (grip !== this.pending) {
      this.pending = grip;
      this.since = t;
      this.frames = 1;
    } else this.frames++;
    // Uncertainty must become visible even when its classifier score is low.
    // Unknown is a protected tracking state, never an intentional release.
    if (
      (score >= 0.4 || grip === "unknown") &&
      this.frames >= 2 &&
      t - this.since >= (grip === "unknown" ? 100 : 65)
    )
      this.grip = grip;
    return this.grip;
  }
  reset() {
    this.grip = "unknown";
    this.pending = "unknown";
    this.frames = 0;
    this.last = -1;
  }
}
export class OneEuro {
  private last: number | null = null;
  private value = 0;
  private velocity = 0;
  private raw = 0;
  update(x: number, t: number) {
    if (this.last !== null && t <= this.last) return this.value;
    if (this.last === null || t - this.last > 300) {
      this.last = t;
      this.value = x;
      this.velocity = 0;
      this.raw = x;
      return x;
    }
    const dt = Math.max(0.001, (t - this.last) / 1000),
      a = (hz: number) => 1 / (1 + 1 / (2 * Math.PI * hz * dt));
    this.velocity += ((x - this.raw) / dt - this.velocity) * a(1);
    this.value += (x - this.value) * a(3.0 + 0.25 * Math.abs(this.velocity));
    this.raw = x;
    this.last = t;
    return this.value;
  }
}
