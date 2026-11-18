import type { Grip, Hand, Inputs } from "../../src/core/types";
import type { Landmark } from "../../src/tracking/gestures";
import type { Observation } from "../../src/tracking/Camera";
export function handShape(
  grip: Grip,
  wrist: Landmark = { x: 0.5, y: 0.5 },
  side: Hand = "left",
) {
  const dir = side === "left" ? 1 : -1;
  const angles =
    grip === "jug"
      ? [65, 100, 60]
      : grip === "crimp"
        ? [8, 85, 15]
        : [0, 0, 0];
  const p: Landmark[] = Array.from({ length: 21 }, () => ({ ...wrist, z: 0 }));
  const positions = [-0.5, -0.16, 0.18, 0.5],
    bases = [1.1, 1.25, 1.17, 1.0];
  for (let finger = 0; finger < 4; finger++) {
    const base = 5 + finger * 4;
    let y = bases[finger],
      z = 0,
      angle = 0;
    p[base] = {
      x: wrist.x + positions[finger] * 0.055 * dir,
      y: wrist.y - y * 0.055,
      z: 0,
    };
    const fingerAngles =
      grip === "pinch"
        ? finger === 0
          ? [22, 52, 22]
          : finger === 1
            ? [12, 24, 10]
            : [6, 12, 6]
        : angles;
    for (let joint = 0; joint < 3; joint++) {
      angle += (fingerAngles[joint] * Math.PI) / 180;
      const length = [0.55, 0.35, 0.25][joint] * (finger === 3 ? 0.8 : 1);
      y += Math.cos(angle) * length;
      z += Math.sin(angle) * length;
      const splay =
        grip === "release" || grip === "unknown"
          ? positions[finger] * 0.09 * (joint + 1) * 0.055 * dir
          : 0;
      p[base + joint + 1] = {
        x: p[base].x + splay,
        y: wrist.y - y * 0.055,
        z: -z * 0.055,
      };
    }
  }
  p[1] = { x: wrist.x - 0.4 * 0.055 * dir, y: wrist.y - 0.3 * 0.055, z: 0 };
  p[2] = { x: wrist.x - 0.8 * 0.055 * dir, y: wrist.y - 0.55 * 0.055, z: 0 };
  if (grip === "pinch") {
    p[3] = {
      x: wrist.x - 0.72 * 0.055 * dir,
      y: wrist.y - 1.12 * 0.055,
      z: (p[8].z ?? 0) * 0.55,
    };
    p[4] = {
      x: p[8].x - 0.14 * 0.055 * dir,
      y: p[8].y + 0.05 * 0.055,
      z: p[8].z,
    };
  } else if (grip === "jug") {
    p[3] = { x: wrist.x - 0.78 * 0.055 * dir, y: wrist.y - 0.72 * 0.055, z: 0 };
    p[4] = { x: wrist.x - 0.86 * 0.055 * dir, y: wrist.y - 0.82 * 0.055, z: 0 };
  } else {
    p[3] = { x: wrist.x - 1.05 * 0.055 * dir, y: wrist.y - 0.82 * 0.055, z: 0 };
    p[4] = { x: wrist.x - 1.35 * 0.055 * dir, y: wrist.y - 0.95 * 0.055, z: 0 };
  }
  return p;
}

/** Closed power fist where thumb rests directly beside curled index fingertip (must remain Jug, never Pinch). */
export function fistWithThumbNearIndex(
  wrist: Landmark = { x: 0.5, y: 0.5 },
  side: Hand = "left",
) {
  const dir = side === "left" ? 1 : -1;
  const p = handShape("jug", wrist, side);
  p[3] = {
    x: p[6].x - 0.15 * 0.055 * dir,
    y: p[6].y,
    z: p[6].z,
  };
  p[4] = {
    x: p[8].x - 0.12 * 0.055 * dir,
    y: p[8].y + 0.02 * 0.055,
    z: p[8].z,
  };
  return p;
}

/** Authored orthographic person: 120px shoulders, two 100px segments per arm. */
export function observation(
  input: Inputs,
  sequence: number,
  t: number,
): Observation {
  const w = 960,
    h = 540;
  const pose: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.6,
    visibility: 1,
    z: 0,
  }));
  const detections = [];
  for (const side of ["left", "right"] as const) {
    const s = {
      x: 0.5 + (side === "left" ? 60 : -60) / w,
      y: 0.6,
      visibility: 1,
    };
    const target = input[side].target;
    const length = Math.hypot(target.x, target.y);
    const gain = length > 0.74 ? 0.74 / length : 1;
    const dx = ((-target.x * gain) / 0.745) * 200,
      dy = ((-target.y * gain) / 0.745) * 200;
    const distance = Math.hypot(dx, dy),
      half = Math.sqrt(Math.max(0, 100 ** 2 - (distance / 2) ** 2));
    const bend = side === "left" ? 1 : -1;
    const wrist = { x: s.x + dx / w, y: s.y + dy / h, visibility: 1 };
    pose[side === "left" ? 11 : 12] = s;
    pose[side === "left" ? 13 : 14] = {
      x: s.x + (dx / 2 - (dy / (distance || 1)) * half * bend) / w,
      y: s.y + (dy / 2 + (dx / (distance || 1)) * half * bend) / h,
      visibility: 1,
    };
    pose[side === "left" ? 15 : 16] = wrist;
    const points = handShape(input[side].grip, wrist, side).map((p) => ({
      ...p,
      y: wrist.y + ((p.y - wrist.y) * w) / h,
    }));
    detections.push({ points, label: side, score: 0.99 });
  }
  return {
    kind: "result",
    pose,
    detections,
    t,
    width: w,
    height: h,
    inferenceMs: 60,
    sequence,
  };
}
