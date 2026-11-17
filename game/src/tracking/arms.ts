import { clamp, v, wrap, ik, type V } from "../core/math";
import { type ArmPose, type ArmMotion, type Hand } from "../core/types";
import { OneEuro, type Landmark } from "./gestures";

export const armOffset = (pose: ArmPose): V =>
  v(
    0.36 * Math.cos(pose.upper) + 0.39 * Math.cos(pose.upper + pose.elbow),
    0.36 * Math.sin(pose.upper) + 0.39 * Math.sin(pose.upper + pose.elbow),
  );

/** Mirrored image-plane directions, relative to the observed shoulder line. */
export function observedArm(
  side: Hand,
  pose: Landmark[],
  wrist: Landmark,
  width: number,
  height: number,
): ArmPose | null {
  const i = side === "left" ? 11 : 12;
  const s = pose[i],
    e = pose[i + 2],
    l = pose[11],
    r = pose[12];
  if (![s, e, l, r].every((p) => p && (p.visibility ?? 1) > 0.65)) return null;
  const upper = v(-(e.x - s.x) * width, -(e.y - s.y) * height);
  const fore = v(-(wrist.x - e.x) * width, -(wrist.y - e.y) * height);
  const span = Math.hypot((r.x - l.x) * width, (r.y - l.y) * height);
  if (
    span < 20 ||
    Math.hypot(upper.x, upper.y) < span * 0.12 ||
    Math.hypot(fore.x, fore.y) < span * 0.12
  )
    return null;
  const body = Math.atan2(-(r.y - l.y) * height, -(r.x - l.x) * width);
  const a = Math.atan2(upper.y, upper.x);
  const b = Math.atan2(fore.y, fore.x);
  // The projected elbow can cross +/-pi when folded toward the camera.
  // Preserve anatomical bend rather than interpreting that as a full inversion.
  return {
    upper: wrap(a - body),
    elbow: (side === "left" ? -1 : 1) * Math.min(2.7, Math.abs(wrap(b - a))),
  };
}

/** Retarget a mirrored wrist path and anatomical elbow bend into physical joints. */
export class ArmMirror {
  source: ArmPose | null = null;
  private center: ArmPose | null = null;
  private anchor: ArmPose | null = null;
  private unwrapped = { upper: 0, elbow: 0 };
  private filters = { upper: new OneEuro(), elbow: new OneEuro() };
  private previous: (ArmPose & { t: number }) | null = null;
  motion: ArmMotion | null = null;
  observe(pose: ArmPose | null, t: number, target?: V) {
    this.source = pose;
    if (!pose || !this.center || !this.anchor || !target) return null;
    const radius = Math.hypot(target.x, target.y);
    const fallback = armOffset(this.anchor);
    const ray = radius > 1e-5 ? target : fallback;
    const bounded =
      radius < 0.24
        ? {
            x: (ray.x * 0.24) / Math.hypot(ray.x, ray.y),
            y: (ray.y * 0.24) / Math.hypot(ray.x, ray.y),
          }
        : target;
    const solved = ik(
      v(),
      bounded,
      0.36,
      0.39,
      Math.sign(pose.elbow) || Math.sign(this.anchor.elbow),
    );
    const requested = { upper: solved.upper, elbow: solved.elbow };
    this.unwrapped.upper += wrap(requested.upper - this.unwrapped.upper);
    // A limited elbow hinge must straighten through zero to change bend;
    // wrapping from -2 to +2 through pi would request an impossible joint.
    this.unwrapped.elbow = requested.elbow;
    const filtered = {
      upper: this.filters.upper.update(this.unwrapped.upper, t),
      elbow: this.filters.elbow.update(this.unwrapped.elbow, t),
    };
    const dt = this.previous ? (t - this.previous.t) / 1000 : 0;
    const fresh = dt > 0 && dt < 0.3;
    const motion = {
      upper: wrap(filtered.upper),
      elbow: clamp(filtered.elbow, -2.65, 2.65),
      upperVelocity: fresh
        ? clamp((filtered.upper - this.previous!.upper) / dt, -5, 5)
        : 0,
      elbowVelocity: fresh
        ? clamp((filtered.elbow - this.previous!.elbow) / dt, -5, 5)
        : 0,
    };
    this.previous = { ...filtered, t };
    this.motion = motion;
    return motion;
  }
  rebase(anchor: ArmPose, t: number) {
    if (!this.source) return false;
    this.center = { ...this.source };
    this.anchor = { ...anchor };
    this.unwrapped = { ...anchor };
    this.filters = { upper: new OneEuro(), elbow: new OneEuro() };
    this.filters.upper.update(anchor.upper, t);
    this.filters.elbow.update(anchor.elbow, t);
    this.previous = { ...anchor, t };
    this.motion = { ...anchor, upperVelocity: 0, elbowVelocity: 0 };
    return true;
  }
  get snapshot() {
    return this.center ? { source: this.center, anchor: this.anchor } : null;
  }
  clear() {
    this.source = null;
    this.center = null;
    this.anchor = null;
    this.previous = null;
    this.motion = null;
  }
}
