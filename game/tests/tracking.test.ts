import { describe, it, expect } from "vitest";
import { IdentityTracker, type Detection } from "../src/tracking/identity";
import { elbowBend } from "../src/tracking/gestures";
import {
  GestureLatch,
  classify,
  prototype,
  features,
  OneEuro,
} from "../src/tracking/gestures";
const detection = (x: number, y: number, label: string): Detection => ({
  label,
  score: 0.99,
  points: Array.from({ length: 21 }, () => ({ x, y })),
});
describe("anatomical identity", () => {
  it("follows pose wrists through a crossing and detector reordering", () => {
    const tracker = new IdentityTracker();
    for (let i = 0; i <= 100; i++) {
      const x = 0.8 - i * 0.006,
        y = 0.2 + i * 0.006,
        pose = Array.from({ length: 33 }, () => ({
          x: 0,
          y: 0,
          visibility: 1,
        }));
      pose[15] = { x, y: 0.4, visibility: 1 };
      pose[16] = { x: y, y: 0.6, visibility: 1 };
      const left = detection(x, 0.4, "Left"),
        right = detection(y, 0.6, "Right"),
        d = i % 2 ? [right, left] : [left, right],
        r = tracker.assign(d, pose, i * 40);
      expect(r.left).toBe(left);
      expect(r.right).toBe(right);
    }
  });
  it("rejects an ambiguous overlap instead of swapping identity", () => {
    const tracker = new IdentityTracker(),
      pose = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.5,
        visibility: 1,
      })),
      d = [detection(0.5, 0.5, ""), detection(0.5, 0.5, "")];
    expect(tracker.assign(d, pose, 100)).toEqual({});
  });
  it("does not assume array position means left/right", () => {
    const t = new IdentityTracker(),
      pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
    pose[15].x = 0.8;
    pose[16].x = 0.2;
    const r = t.assign(
      [detection(0.2, 0, "Right"), detection(0.8, 0, "Left")],
      pose,
      1,
    );
    expect(r.left?.points[0].x).toBe(0.8);
  });
});
describe("gesture transitions", () => {
  it("preserves elbow bend when both camera axes are mirrored and retains it near straight", () => {
    const s = { x: 0.6, y: 0.5 },
      e = { x: 0.75, y: 0.6 },
      w = { x: 0.7, y: 0.2 },
      flip = (p: { x: number; y: number }) => ({ x: 1 - p.x, y: 1 - p.y });
    expect(elbowBend(s, e, w, -1)).toBe(-1);
    expect(elbowBend(flip(s), flip(e), flip(w), -1)).toBe(-1);
    expect(elbowBend({ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, 1)).toBe(
      1,
    );
  });
  it("needs independent fresh frames and elapsed confirmation time", () => {
    const l = new GestureLatch();
    expect(l.update("release", 0.9, 100)).toBe("unknown");
    expect(l.update("release", 0.9, 100)).toBe("unknown");
    expect(l.update("release", 0.9, 140)).toBe("unknown");
    expect(l.update("release", 0.9, 180)).toBe("release");
  });
  it("shows persistent uncertainty without converting it into a release", () => {
    const l = new GestureLatch();
    l.update("jug", 0.9, 100);
    expect(l.update("jug", 0.9, 180)).toBe("jug");
    expect(l.update("unknown", 0.1, 220)).toBe("jug");
    expect(l.update("unknown", 0.1, 300)).toBe("jug");
    expect(l.update("unknown", 0.1, 340)).toBe("unknown");
    expect(l.update("release", 0.9, 380)).toBe("unknown");
    expect(l.update("release", 0.9, 460)).toBe("release");
  });
  it("keeps incompatible calibrated shapes distinct and rejects ambiguous samples", () => {
    const a = Array(10).fill(0.1),
      b = Array(10).fill(1),
      p = { jug: prototype([a, a]), release: prototype([b, b]) };
    expect(classify(a, p).grip).toBe("jug");
    expect(classify(b, p).grip).toBe("release");
    expect(classify(Array(10).fill(0.55), p).grip).toBe("unknown");
  });
  it("rejects invalid and degenerate hands", () => {
    expect(features([])).toEqual([]);
    expect(
      features(Array.from({ length: 21 }, () => ({ x: 0, y: 0 }))),
    ).toEqual([]);
  });
  it("resets a position filter after a discontinuity", () => {
    const f = new OneEuro();
    expect(f.update(1, 100)).toBe(1);
    expect(f.update(2, 1000)).toBe(2);
  });
});
