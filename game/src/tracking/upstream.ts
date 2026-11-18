import { OneEuroFilter } from "../vendor/one-euro/OneEuroFilter";
import { computeFeatures, smooth } from "../vendor/open-source-hands/features";
import { scorePose, POSES } from "../vendor/open-source-hands/poses";
import type { PoseDef } from "../vendor/open-source-hands/types";
import type { Detection } from "./identity";
import {
  classify,
  features,
  type Prototypes,
  type ClassScores,
} from "./gestures";
import type { Grip, Hand } from "../core/types";

/** Millisecond API adapter around the original BSD-licensed 1-Euro implementation. */
export class PositionSignal {
  private filter = new OneEuroFilter(30, 2.5, 1.8, 1);
  private t: number | null = null;
  private value = 0;
  update(value: number, t: number) {
    if (this.t !== null && t <= this.t) return this.value;
    if (this.t !== null && t - this.t > 300) this.filter.reset();
    this.t = t;
    this.value = this.filter.filter(value, t / 1000);
    return this.value;
  }
}

const openPose: PoseDef = {
  id: "release",
  name: "Release",
  emoji: "",
  hint: "Spread fingers",
  fingers: ["any", "ext", "ext", "ext", "ext"],
  extra: (s) => smooth(0.32, 0.52, Math.min(s.tipGap[0], s.tipGap[1])),
};

const fistPose = POSES.find((p) => p.id === "fist")!;
const clawPose = POSES.find((p) => p.id === "claw")!;
const pinchPose = POSES.find((p) => p.id === "pinch")!;
const okPose = POSES.find((p) => p.id === "ok")!;
const pinchMiddlePose = POSES.find((p) => p.id === "pinch-middle")!;

export function cameraGrip(
  d: Detection | undefined,
  side: Hand,
  width: number,
  height: number,
  prototypes: Prototypes,
  previous: Grip,
) {
  const f = d ? features(d.points, width, height) : [];
  const fallback = classify(f, prototypes, previous);
  if (!d || d.points.length !== 21)
    return {
      features: f,
      found: { grip: fallback.grip, score: fallback.score },
      scores: null,
      classes: fallback.classes,
    };
  const point = (p: { x: number; y: number; z?: number }) => ({
    x: 1 - p.x,
    y: p.y,
    z: p.z ?? 0,
  });
  const worldPoint = (p: { x: number; y: number; z?: number }) => ({
    x: -p.x,
    y: p.y,
    z: p.z ?? 0,
  });
  const world =
    d.world?.length === 21 &&
    d.world.every((p) => Number.isFinite(p.x + p.y + (p.z ?? 0)))
      ? d.world
      : undefined;
  const shape = computeFeatures({
    landmarks: d.points.map(point),
    world: world?.map(worldPoint),
    handedness: side === "left" ? "Left" : "Right",
    aspect: width / height,
  });
  const fingerSpread = shape.spread[0] + shape.spread[1] + shape.spread[2];
  const openScore = scorePose(openPose, shape);
  const fistScore = scorePose(fistPose, shape);
  const clawScore = scorePose(clawPose, shape);
  const pinchScore = Math.max(
    scorePose(pinchPose, shape),
    scorePose(okPose, shape),
    scorePose(pinchMiddlePose, shape),
  );
  const minTipGap = Math.min(shape.tipGap[0], shape.tipGap[1]);
  const compact2d =
    f.length >= 8 ? (f[4] + f[5] + f[6] + f[7]) / 4 : 1.5;
  const rolledFist =
    (!world && compact2d < 1.24) || (fistScore > 0.74 && shape.openness < 0.28);

  const personalMatch =
    fallback.grip !== "unknown" &&
    !!prototypes[fallback.grip] &&
    fallback.score >= 0.65;

  // Smooth 4-class blend combining 3D open-source-hands pose scores + 2D/3D geometric scores
  const classes: ClassScores = {
    jug: rolledFist
      ? Math.max(fallback.classes.jug, 0.94, fistScore)
      : personalMatch && fallback.grip !== "jug"
        ? Math.min(fallback.classes.jug, 0.2)
        : fallback.grip === "crimp" || fallback.grip === "pinch"
          ? Math.min(fallback.classes.jug, 0.16)
          : Math.max(
              fallback.classes.jug,
              fistScore > 0.72 ? fistScore * 0.95 : fistScore * 0.25,
            ),
    crimp: rolledFist
      ? Math.min(fallback.classes.crimp, 0.12)
      : Math.max(
          fallback.classes.crimp,
          clawScore > 0.58 && pinchScore < 0.5 && fistScore < 0.65
            ? clawScore * 0.92
            : clawScore * 0.2,
        ),
    pinch: rolledFist
      ? Math.min(fallback.classes.pinch, 0.08)
      : Math.max(
          fallback.classes.pinch,
          pinchScore > 0.58 && fistScore < 0.6
            ? pinchScore * 0.92
            : pinchScore * 0.2,
        ),
    release:
      rolledFist || minTipGap < 0.36 || fallback.grip === "pinch"
        ? Math.min(fallback.classes.release, 0.14)
        : Math.max(
            fallback.classes.release,
            openScore > 0.78 && shape.openness > 0.58
              ? openScore
              : openScore * 0.22,
          ),
  };

  if (personalMatch && fallback.grip !== "unknown") {
    classes[fallback.grip] = Math.max(classes[fallback.grip], fallback.score);
  }

  for (const k of ["jug", "crimp", "pinch", "release"] as const) {
    classes[k] = Math.min(1, Math.max(0, classes[k]));
  }

  const openRelease =
    fallback.grip === "release" ||
    (openScore > 0.78 &&
      shape.openness > 0.58 &&
      minTipGap >= 0.42 &&
      fallback.grip !== "pinch" &&
      fallback.grip !== "crimp" &&
      !(personalMatch && openScore <= 0.88));
  const fistJug =
    !personalMatch &&
    fistScore > 0.72 &&
    (fallback.grip === "unknown" || fallback.grip === "jug");
  const worldCrimp =
    !personalMatch &&
    !!world &&
    fallback.grip === "unknown" &&
    clawScore > 0.68 &&
    fistScore < 0.55 &&
    pinchScore < 0.45;
  const worldPinch =
    !personalMatch &&
    !!world &&
    !rolledFist &&
    fallback.grip === "unknown" &&
    pinchScore > 0.68 &&
    fistScore < 0.55;

  const found = openRelease
    ? {
        grip: "release" as Grip,
        score: Math.max(
          openScore,
          fallback.grip === "release" ? fallback.score : 0,
        ),
      }
    : fistJug
      ? {
          grip: "jug" as Grip,
          score: Math.max(
            fistScore,
            fallback.grip === "jug" ? fallback.score : 0,
          ),
        }
      : worldCrimp
        ? { grip: "crimp" as Grip, score: clawScore }
        : worldPinch
          ? { grip: "pinch" as Grip, score: pinchScore }
          : { grip: fallback.grip, score: fallback.score };

  const scores = {
    open: openScore,
    fist: fistScore,
    claw: clawScore,
    pinch: pinchScore,
    curl: shape.curl,
    openness: shape.openness,
    spread: fingerSpread,
    world: !!world,
    classes,
  };

  return { features: f, found, scores, classes };
}
