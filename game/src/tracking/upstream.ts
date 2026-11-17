import { OneEuroFilter } from "../vendor/one-euro/OneEuroFilter";
import { computeFeatures } from "../vendor/open-source-hands/features";
import { scorePose, POSES } from "../vendor/open-source-hands/poses";
import type { PoseDef } from "../vendor/open-source-hands/types";
import type { Detection } from "./identity";
import { classify, features, type Prototypes } from "./gestures";
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
const open: PoseDef = {
  id: "release",
  name: "Release",
  emoji: "",
  hint: "Spread fingers",
  fingers: ["any", "ext", "ext", "ext", "ext"],
};
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
    return { features: f, found: fallback, scores: null };
  const point = (p: { x: number; y: number; z?: number }) => ({
    x: 1 - p.x,
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
    world: world?.map(point),
    handedness: side === "left" ? "Left" : "Right",
    aspect: width / height,
  });
  const scores = {
    open: scorePose(open, shape),
    fist: scorePose(POSES.find((p) => p.id === "fist")!, shape),
    curl: shape.curl,
    openness: shape.openness,
    world: !!world,
  };
  // Clear open/closed states use the reusable per-finger engine. Climbing's
  // finer Crimp/Sloper/Pinch distinction and saved shapes remain separate.
  const found =
    scores.open > 0.86
      ? { grip: "release" as Grip, score: scores.open }
      : scores.fist > 0.72
        ? { grip: "jug" as Grip, score: scores.fist }
        : fallback;
  return { features: f, found, scores };
}
