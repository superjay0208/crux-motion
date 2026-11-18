import { add, sub, clamp, dist, len, mul, type V, v } from "../core/math";
import { hands, initialInputs, type Hand, type Inputs } from "../core/types";
import type { Landmark } from "./gestures";

export const ARM_REACH = 0.745;

/** Camera-distance independent, wrist-based motion. Finger articulation cannot move the target. */
export class ReachMapper {
  private locked = false;
  rawPosition: Record<Hand, V> = { left: v(), right: v() };
  private span = 0.15;
  private ratios: Record<Hand, number[]> = { left: [], right: [] };
  private ratio: Record<Hand, number> = { left: 1.65, right: 1.65 };
  referencePixels = { left: 0, right: 0 };
  map(
    side: Hand,
    pose: Landmark[],
    wrist: Landmark,
    width: number,
    height: number,
    gain = 1,
  ): V {
    const shoulder = pose[side === "left" ? 11 : 12];
    const elbow = pose[side === "left" ? 13 : 14];
    if (!shoulder) return v();
    const px = (p: Landmark) => v(p.x * width, p.y * height);
    if (!this.locked && pose[11] && pose[12])
      this.span = Math.max(
        20 / width,
        dist(px(pose[11]), px(pose[12])) / width,
      );
    const span = this.span * width;
    if (!this.locked && elbow && (elbow.visibility ?? 1) > 0.5) {
      const arm = dist(px(shoulder), px(elbow)) + dist(px(elbow), px(wrist));
      const direct = dist(px(shoulder), px(wrist));
      const candidate = arm / span;
      if (candidate > 0.8 && candidate < 3.2 && direct / arm > 0.55) {
        const history = this.ratios[side];
        history.push(candidate);
        if (history.length > 90) history.shift();
        const sorted = [...history].sort((a, b) => a - b);
        const robust = sorted[Math.floor((sorted.length - 1) * 0.8)];
        this.ratio[side] =
          history.length === 1
            ? robust
            : this.ratio[side] + 0.12 * (robust - this.ratio[side]);
      }
    }
    const reference = span * this.ratio[side];
    this.referencePixels[side] = reference;
    const raw = v(
      (-(wrist.x - shoulder.x) * width) / reference,
      (-(wrist.y - shoulder.y) * height) / reference,
    );
    this.rawPosition[side] = { ...raw };
    // Extra reach grows toward extension; it must not make the tucked pull pose longer.
    const sensitivity =
      1 + (clamp(gain, 0.75, 1.6) - 1) * clamp((len(raw) - 0.35) / 0.5, 0, 1);
    const target = mul(raw, ARM_REACH * sensitivity);
    return len(target) > ARM_REACH
      ? mul(target, ARM_REACH / len(target))
      : target;
  }
  reset() {
    this.locked = false;
    this.span = 0.15;
    this.ratios = { left: [], right: [] };
    this.ratio = { left: 1.65, right: 1.65 };
  }
  lock() {
    this.locked = true;
  }
  unlock() {
    this.locked = false;
  }
}

const STROKE_LINEAR_RADIUS = 0.07;
const STROKE_BOOST_SCALE = 0.35;
const STROKE_BOOST_KNEE = 0.14;

function boostStroke(r: number): number {
  if (r <= STROKE_LINEAR_RADIUS) return r;
  const u = r - STROKE_LINEAR_RADIUS;
  return r + (STROKE_BOOST_SCALE * u * u) / (u + STROKE_BOOST_KNEE);
}

function unboostStroke(s: number): number {
  if (s <= STROKE_LINEAR_RADIUS) return s;
  const w = s - STROKE_LINEAR_RADIUS;
  const b = STROKE_BOOST_KNEE - w;
  const u =
    (-b +
      Math.sqrt(
        b * b + 4 * (1 + STROKE_BOOST_SCALE) * w * STROKE_BOOST_KNEE,
      )) /
    (2 * (1 + STROKE_BOOST_SCALE));
  return STROKE_LINEAR_RADIUS + u;
}

/** Rebase the user's comfortable pose without changing any physical body or grip. */
export class ComfortFrame {
  private centers: Record<Hand, V> | null = null;
  private anchors: Record<Hand, V> = { left: v(), right: v() };
  get active() {
    return !!this.centers;
  }
  get snapshot() {
    return this.centers
      ? {
          centers: structuredClone(this.centers),
          anchors: structuredClone(this.anchors),
        }
      : null;
  }
  rebase(raw: Record<Hand, V>, anchors: Record<Hand, V>) {
    this.centers = structuredClone(raw);
    this.anchors = structuredClone(anchors);
  }
  map(side: Hand, raw: V, gain = 2.1, followLimit = false) {
    if (!this.centers) return null;
    const sensitivity = ARM_REACH * clamp(gain, 1, 2.8);
    const delta = sub(raw, this.centers[side]);
    const r = len(delta);
    const boosted =
      r > 1e-9 ? mul(delta, (boostStroke(r) / r) * sensitivity) : v();
    const requested = add(this.anchors[side], boosted);
    const reqLen = len(requested);
    const limited =
      reqLen > ARM_REACH
        ? mul(requested, ARM_REACH / reqLen)
        : requested;
    // Discard only the unreachable overshoot, like a relative pointing device.
    // No drift toward neutral: stationary hands keep exactly the same target.
    // Reversing from full reach responds immediately instead of crossing an
    // invisible overshoot buffer. Each anatomical hand owns its own origin.
    if (followLimit && reqLen > ARM_REACH + 1e-12) {
      const kept = sub(limited, this.anchors[side]);
      const keptLen = len(kept);
      const keptRaw =
        keptLen > 1e-9
          ? mul(kept, unboostStroke(keptLen / sensitivity) / keptLen)
          : v();
      this.centers[side] = sub(raw, keptRaw);
    }
    return limited;
  }
  assistDynoFlight(raw: Record<Hand, V>, dynoVector: V): boolean {
    if (!this.centers || dynoVector.y <= 0.8) return false;
    if (!hands.every((side) => raw[side].y < this.centers![side].y - 0.04))
      return false;
    for (const side of hands) {
      const shift = clamp(
        (raw[side].y - this.centers[side].y) * 0.65,
        -0.32,
        0,
      );
      this.centers[side].y = clamp(this.centers[side].y + shift, -0.55, 0.65);
    }
    return true;
  }
  clear() {
    this.centers = null;
  }
}

/** Position confidence and finger-shape confidence are deliberately independent. */
export class InputProtection {
  private previous = initialInputs();
  private missing: Record<Hand, number | null> = { left: null, right: null };
  constructor(readonly maxMissingMs = 750) {}
  accept(input: Inputs, now: number) {
    const result = structuredClone(this.previous);
    for (const side of hands) {
      if (input[side].quality) {
        result[side] = structuredClone(input[side]);
        this.previous[side] = structuredClone(input[side]);
        this.missing[side] = null;
      } else {
        this.missing[side] ??= now;
        result[side].quality = false;
        result[side].ready = false;
      }
    }
    return {
      input: result,
      pause: hands.some(
        (side) =>
          this.missing[side] !== null &&
          now - this.missing[side]! > this.maxMissingMs,
      ),
    };
  }
  reset() {
    this.previous = initialInputs();
    this.missing = { left: null, right: null };
  }
}
