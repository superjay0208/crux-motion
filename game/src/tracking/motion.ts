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
      1 + (clamp(gain, 0.75, 1.5) - 1) * clamp((len(raw) - 0.35) / 0.5, 0, 1);
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
  map(side: Hand, raw: V, gain = 1.8, followLimit = false) {
    if (!this.centers) return null;
    const sensitivity = ARM_REACH * clamp(gain, 1, 2.5);
    const requested = add(
      this.anchors[side],
      mul(sub(raw, this.centers[side]), sensitivity),
    );
    const limited =
      len(requested) > ARM_REACH
        ? mul(requested, ARM_REACH / len(requested))
        : requested;
    // Discard only the unreachable overshoot, like a relative pointing device.
    // No drift toward neutral: stationary hands keep exactly the same target.
    // Reversing from full reach responds immediately instead of crossing an
    // invisible overshoot buffer. Each anatomical hand owns its own origin.
    if (followLimit)
      this.centers[side] = add(
        this.centers[side],
        mul(sub(requested, limited), 1 / sensitivity),
      );
    return limited;
  }
  clear() {
    this.centers = null;
  }
}

/** Position confidence and finger-shape confidence are deliberately independent. */
export class InputProtection {
  private previous = initialInputs();
  private missing: Record<Hand, number | null> = { left: null, right: null };
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
          this.missing[side] !== null && now - this.missing[side]! > 350,
      ),
    };
  }
  reset() {
    this.previous = initialInputs();
    this.missing = { left: null, right: null };
  }
}
