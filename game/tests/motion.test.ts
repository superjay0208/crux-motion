import { describe, expect, it } from "vitest";
import {
  ReachMapper,
  InputProtection,
  ARM_REACH,
  ComfortFrame,
} from "../src/tracking/motion";
import { initialInputs } from "../src/core/types";
import type { Landmark } from "../src/tracking/gestures";
const body = (width: number, height: number, scale = 1) => {
  const p = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  // Independent 120px shoulder width and 200px straight arm, scaled together.
  p[11] = { x: 0.5 + (60 * scale) / width, y: 0.6, visibility: 1 };
  p[12] = { x: 0.5 - (60 * scale) / width, y: 0.6, visibility: 1 };
  p[13] = { x: p[11].x, y: 0.6 - (100 * scale) / height, visibility: 1 };
  p[15] = { x: p[11].x, y: 0.6 - (200 * scale) / height, visibility: 1 };
  return p;
};
describe("camera reach mapping", () => {
  it("rebases relaxed hands to the existing grip positions and uses a compact travel range", () => {
    const c = new ComfortFrame();
    const raw = { left: { x: -0.1, y: 0.2 }, right: { x: 0.1, y: 0.2 } };
    const anchors = { left: { x: -0.13, y: 0.5 }, right: { x: 0.13, y: 0.5 } };
    c.rebase(raw, anchors);
    expect(c.map("left", raw.left)).toEqual(anchors.left);
    expect(c.map("right", raw.right)).toEqual(anchors.right);
    const up = c.map("left", { x: -0.1, y: 0.38 })!;
    expect(up.y).toBeGreaterThan(0.7);
    const down = c.map("right", { x: 0.1, y: 0.05 })!;
    expect(down.y).toBeLessThan(0.31);
    expect(Math.hypot(up.x, up.y)).toBeLessThanOrEqual(ARM_REACH + 1e-9);
  });
  it("maps a real full extension to the full avatar arm without manual calibration", () => {
    const p = body(1280, 720),
      m = new ReachMapper();
    expect(m.map("left", p, p[15], 1280, 720).y).toBeCloseTo(ARM_REACH, 5);
    // Previous default mapped this 200px extension to only 0.266m.
    expect((200 / (1280 * 0.44)) * 0.75).toBeLessThan(0.27);
  });
  it("preserves reach across camera distance and aspect ratios", () => {
    for (const [w, h, scale] of [
      [1280, 720, 0.65],
      [640, 480, 1],
      [960, 540, 1.3],
    ]) {
      const p = body(w, h, scale);
      expect(new ReachMapper().map("left", p, p[15], w, h).y).toBeCloseTo(
        ARM_REACH,
        5,
      );
    }
  });
  it("keeps anatomical crossing direction and bounds diagonal reach", () => {
    const p = body(1280, 720),
      m = new ReachMapper();
    const crossed: Landmark = { x: p[11].x - 0.2, y: p[11].y - 0.2 };
    const out = m.map("left", p, crossed, 1280, 720);
    expect(out.x).toBeGreaterThan(0);
    expect(Math.hypot(out.x, out.y)).toBeLessThanOrEqual(ARM_REACH + 1e-10);
  });
});
describe("independent camera input protection", () => {
  it("lets an uncertain finger shape move without pausing or acquiring", () => {
    const g = new InputProtection(),
      input = initialInputs();
    input.left = {
      ...input.left,
      target: { x: -0.4, y: 0.6 },
      grip: "unknown",
      ready: false,
    };
    const r = g.accept(input, 1000);
    expect(r.pause).toBe(false);
    expect(r.input.left.target.x).toBe(-0.4);
    expect(r.input.left.ready).toBe(false);
  });
  it("keeps the visible arm moving through a short occlusion of the other", () => {
    const g = new InputProtection(),
      input = initialInputs();
    g.accept(input, 100);
    input.left.quality = false;
    input.left.grip = "release";
    input.right.target.x = 0.5;
    const r = g.accept(input, 300);
    expect(r.pause).toBe(false);
    expect(r.input.right.target.x).toBe(0.5);
    expect(r.input.left.quality).toBe(false);
    expect(r.input.left.grip).toBe("jug");
    expect(g.accept(input, 700).pause).toBe(true);
  });
});
