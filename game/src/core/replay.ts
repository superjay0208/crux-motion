import type { Replay } from "./types";
import { hands } from "./types";
export function validateReplay(value: unknown): Replay {
  const r = value as Replay;
  if (
    r?.controller !== undefined &&
    r.controller !== "anchors" &&
    r.controller !== "motors"
  )
    throw new Error("Unknown replay controller");
  if (
    !r ||
    r.version !== 1 ||
    typeof r.route !== "string" ||
    typeof r.mode !== "string" ||
    !Number.isInteger(r.duration) ||
    r.duration < 1 ||
    r.duration > 120 * 60 * 20 ||
    !Array.isArray(r.frames) ||
    r.frames.length > 144000
  )
    throw new Error("Unsupported replay");
  let previous = -1;
  for (const f of r.frames) {
    if (
      !Number.isInteger(f.tick) ||
      f.tick <= previous ||
      f.tick < 0 ||
      f.tick >= r.duration
    )
      throw new Error("Invalid replay timing");
    previous = f.tick;
    for (const side of hands) {
      const i = f.input?.[side];
      if (
        !i ||
        !Number.isFinite(i.target?.x) ||
        !Number.isFinite(i.target?.y) ||
        Math.abs(i.target.x) > 100 ||
        Math.abs(i.target.y) > 100 ||
        !["jug", "crimp", "sloper", "pinch", "release", "unknown"].includes(
          i.grip,
        ) ||
        !["up", "down", "side"].includes(i.orientation) ||
        typeof i.ready !== "boolean" ||
        typeof i.quality !== "boolean" ||
        ![-1, 1].includes(i.bend)
      )
        throw new Error("Invalid replay input");
      if (
        i.arm &&
        (!Number.isFinite(i.arm.upper) ||
          !Number.isFinite(i.arm.elbow) ||
          !Number.isFinite(i.arm.upperVelocity) ||
          !Number.isFinite(i.arm.elbowVelocity) ||
          Math.abs(i.arm.upper) > 20 ||
          Math.abs(i.arm.elbow) > 2.7 ||
          Math.abs(i.arm.upperVelocity) > 5 ||
          Math.abs(i.arm.elbowVelocity) > 5)
      )
        throw new Error("Invalid mirrored arm input");
    }
  }
  return r;
}
