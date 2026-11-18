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
  const d3 = (a: Landmark, b: Landmark) =>
    Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const pinch12 = d3(p[4], p[12]) / scale;
  const indexSpan = d3(p[8], p[5]) / scale;
  const palmLen = Math.max(d3(p[0], p[9]), scale);
  const thumbOut = Math.min(d3(p[4], p[5]), d3(p[4], p[9]) * 1.15) / palmLen;
  return [
    ...bends,
    ...compact,
    spread,
    pinch,
    ...distal,
    ...knuckles,
    pinch12,
    indexSpan,
    thumbOut,
  ];
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
): { grip: Grip; score: number; classes: ClassScores } {
  if (!validFeatures(f)) return { grip: "unknown", score: 0, classes: { jug: 0, crimp: 0, pinch: 0, release: 0 } };
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
    ) {
      const winner = ranked[0].grip;
      const merged = { ...fallback.classes };
      if (winner !== "unknown")
        merged[winner] = Math.max(merged[winner], ranked[0].score);
      return { ...ranked[0], classes: merged };
    }
    const sticky = ranked.find((r) => r.grip === previous);
    if (sticky && sticky.score > 0.5 && ranked[0].score - sticky.score < 0.08) {
      const merged = { ...fallback.classes };
      if (sticky.grip !== "unknown")
        merged[sticky.grip] = Math.max(merged[sticky.grip], sticky.score);
      return { ...sticky, classes: merged };
    }
    // Finishing only some calibration steps must not disable every untrained grip.
    if (!usable.some(([g]) => g === fallback.grip)) return fallback;
    if (
      f.length >= 18 &&
      usable.every(([, p]) => p.mean.length === 10) &&
      fallback.score >= 0.88
    )
      return fallback;
    return { grip: "unknown", score: ranked[0].score, classes: fallback.classes };
  }
  return fallback;
}
export type ClassScores = Record<"jug" | "crimp" | "pinch" | "release", number>;

const ramp = (e0: number, e1: number, x: number) =>
  clamp((x - e0) / (e1 - e0), 0, 1);

function geometricGrip(f: Features): { grip: Grip; score: number; classes: ClassScores } {
  const bends = f.slice(0, 4).reduce((a, b) => a + b) / 4,
    curl = bends,
    compact = f.slice(4, 8).reduce((a, b) => a + b) / 4;
  const spread = f[8] ?? 0;
  const pinch8 = f[9] ?? 1;
  const minPinch = Math.min(pinch8, f[18] ?? pinch8);

  let classes: ClassScores = { jug: 0, crimp: 0, pinch: 0, release: 0 };

  if (f.length >= 18) {
    const distal = f.slice(10, 14).reduce((a, b) => a + b) / 4;
    const knuckle = f.slice(14, 18).reduce((a, b) => a + b) / 4;
    const maxBend = Math.max(...f.slice(0, 4));
    const maxTipDist = Math.max(f[4] ?? compact, f[5] ?? compact);
    const indexSpan = f[19] ?? (compact >= 1.25 ? 0.75 : 0.45);
    const thumbOut = f[20] ?? (minPinch >= 0.5 ? 0.48 : 0.25);
    const openness = 1 - (0.65 * bends + 0.35 * distal);
    const rolledFist =
      compact < 1.24 || (curl > 0.56 && knuckle > 0.36 && compact < 1.48);

    // 1. Release: Open 5 / Spread Hand — 4 fingers extended, unpinched, not arched into a claw
    const clearlyOpen =
      !rolledFist &&
      minPinch >= 0.48 &&
      bends <= 0.28 &&
      ((openness > 0.56 && compact > 1.36) ||
        (curl < 0.34 && compact > 1.50) ||
        (maxBend < 0.24 && compact > 1.65 && spread > 0.8));
    const releaseScore = clearlyOpen
      ? clamp(
          0.88 +
            0.06 * ramp(0.56, 0.88, openness) +
            0.04 * ramp(1.45, 1.9, compact),
          0.88,
          0.98,
        )
      : minPinch < 0.48 || rolledFist || bends > 0.3
        ? clamp(0.12 * ramp(0.42, 0.16, bends), 0.03, 0.12)
        : clamp(0.22 * ramp(1.25, 1.6, compact) * ramp(0.38, 0.2, bends), 0.04, 0.22);

    // 2. Jug: Full Closed Power Fist — all 4 fingers rolled into palm
    const jugScore =
      compact < 1.24
        ? clamp(0.93 + 0.05 * ramp(1.24, 0.88, compact), 0.93, 0.98)
        : curl > 0.56 && knuckle > 0.36 && compact < 1.48
          ? clamp(0.90 + 0.06 * ramp(0.56, 0.78, curl), 0.90, 0.96)
          : curl > 0.5 && distal > 0.28 && knuckle > 0.3 && compact < 1.68
            ? 0.85
            : clamp(
                0.15 * ramp(1.75, 1.24, compact) * ramp(0.2, 0.56, knuckle),
                0.03,
                0.15,
              );

    // 3. Crimp: Arched 4-Finger Claw / Half-Crimp Hook — PIP bent, MCP open, unpinched
    const clawCrimp =
      !rolledFist &&
      minPinch >= 0.46 &&
      ((bends > 0.28 && knuckle < 0.42 && compact >= 1.25 && compact <= 1.88) ||
        (bends > 0.27 && distal < 0.36 && knuckle < 0.46 && compact >= 1.24 && compact <= 1.92));
    const crimpScore = clawCrimp
      ? clamp(
          0.90 +
            0.05 * ramp(0.28, 0.52, bends) +
            0.03 * ramp(0.42, 0.08, knuckle),
          0.88,
          0.96,
        )
      : rolledFist || minPinch < 0.46 || bends <= 0.24
        ? clamp(0.12 * ramp(0.2, 0.4, bends) * (rolledFist ? 0.5 : 1), 0.03, 0.13)
        : clamp(0.2 * ramp(0.24, 0.32, bends) * ramp(0.55, 0.35, knuckle), 0.04, 0.2);

    // 4. Pinch: Opposed Thumb-to-Index/Middle Clamp out in front of palm (NEVER when rolledFist / compact < 1.24)
    const beakPinch =
      !rolledFist &&
      compact >= 1.24 &&
      minPinch < 0.48 &&
      maxTipDist >= 1.25 &&
      indexSpan > 0.62;
    const cClampPinch =
      !rolledFist &&
      minPinch < 0.62 &&
      compact > 1.30 &&
      thumbOut > 0.35 &&
      indexSpan > 0.62;
    const pinchScore = rolledFist
      ? clamp(0.08 * ramp(1.0, 1.24, compact), 0.02, 0.08)
      : beakPinch
        ? clamp(0.91 + 0.06 * ramp(0.48, 0.12, minPinch), 0.91, 0.97)
        : cClampPinch
          ? clamp(0.86 + 0.06 * ramp(0.62, 0.25, minPinch), 0.86, 0.92)
          : clamp(0.14 * ramp(0.85, 0.48, minPinch), 0.03, 0.14);

    classes = {
      jug: jugScore,
      crimp: crimpScore,
      pinch: pinchScore,
      release: releaseScore,
    };

    const entries = Object.entries(classes) as [keyof ClassScores, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const [bestGrip, bestScore] = entries[0];
    const runnerUp = entries[1][1];

    if (bestScore >= 0.72 && bestScore - runnerUp >= 0.15) {
      return { grip: bestGrip, score: bestScore, classes };
    }
    return { grip: "unknown", score: 0.25, classes };
  }

  // Short feature vector fallback (10 features)
  if (spread > 1.35 && curl < 0.25 && minPinch >= 0.5) {
    classes = { jug: 0.08, crimp: 0.08, pinch: 0.08, release: 0.92 };
    return { grip: "release", score: 0.92, classes };
  }
  if (minPinch < 0.55 && compact >= 1.24) {
    classes = { jug: 0.08, crimp: 0.1, pinch: 0.88, release: 0.1 };
    return { grip: "pinch", score: 0.88, classes };
  }
  if (curl > 0.5 || compact < 1.24) {
    classes = { jug: 0.88, crimp: 0.1, pinch: 0.08, release: 0.08 };
    return { grip: "jug", score: 0.88, classes };
  }
  if (curl > 0.26) {
    classes = { jug: 0.1, crimp: 0.85, pinch: 0.1, release: 0.1 };
    return { grip: "crimp", score: 0.85, classes };
  }
  classes = { jug: 0.25, crimp: 0.25, pinch: 0.2, release: 0.2 };
  return { grip: "unknown", score: 0.25, classes };
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
