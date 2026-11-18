import { afterEach, describe, expect, it, vi } from "vitest";
import { ComfortFrame, ARM_REACH } from "../src/tracking/motion";
import { RecoveryGate } from "../src/tracking/RecoveryGate";
import { FollowCamera } from "../src/render/FollowCamera";
import { Camera } from "../src/tracking/Camera";
import { Simulation } from "../src/core/Simulation";
import { AnchorRig } from "../src/core/AnchorRig";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { dist, sub, v } from "../src/core/math";
import { observation } from "./fixtures/hands";
afterEach(() => vi.unstubAllGlobals());

describe("returning player controls", () => {
  it("migrates old mirror selection while preserving personal calibration", () => {
    const saved = {
      version: 1,
      reach: 0.44,
      armMode: "mirror",
      prototypes: { jug: { mean: [0.2] } },
      mirrorLabels: true,
      comfortGain: 2.2,
    };
    const write = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem: write,
    });
    const c = new Camera({} as HTMLVideoElement);
    expect(c.calibration.armMode).toBe("anchors");
    expect(c.calibration.controlRevision).toBe(2);
    expect(c.calibration.prototypes).toEqual(saved.prototypes);
    expect(c.calibration.mirrorLabels).toBe(true);
    expect(c.calibration.comfortGain).toBe(2.2);
    expect(write).toHaveBeenCalledOnce();
  });
  it("keeps an explicit selection made after the migration", () => {
    const saved = {
      version: 1,
      controlRevision: 2,
      reach: 0.44,
      armMode: "mirror",
    };
    const write = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem: write,
    });
    expect(new Camera({} as HTMLVideoElement).calibration.armMode).toBe(
      "mirror",
    );
    expect(write).not.toHaveBeenCalled();
  });
});

describe("continuous climbing workspace", () => {
  it("responds immediately on reversal after an unreachable overshoot", () => {
    const c = new ComfortFrame();
    c.rebase({ left: v(), right: v() }, { left: v(0, 0.5), right: v(0, 0.5) });
    for (let n = 1; n <= 20; n++) c.map("left", v(0, n / 20), 1.8, true);
    expect(c.map("left", v(0, 1), 1.8, true)!.y).toBeCloseTo(ARM_REACH);
    expect(c.map("left", v(0, 0.98), 1.8, true)!.y).toBeCloseTo(
      ARM_REACH - 0.02 * 1.8 * ARM_REACH,
    );
    expect(c.map("right", v(), 1.8, true)).toEqual(v(0, 0.5));
  });
  it("never slowly recenters a stationary extended or crossed hand", () => {
    const c = new ComfortFrame();
    c.rebase(
      { left: v(), right: v() },
      { left: v(-0.13, 0.5), right: v(0.13, 0.5) },
    );
    const a = c.map("left", v(0.8, 0.8), 1.8, true)!;
    for (let n = 0; n < 3600; n++)
      expect(dist(c.map("left", v(0.8, 0.8), 1.8, true)!, a)).toBeLessThan(
        1e-10,
      );
    expect(a.x).toBeGreaterThan(0.3);
  });
  it("requires 700ms of distinct settled frames and resets on stale or unsafe input", () => {
    const g = new RecoveryGate();
    g.arm("edge");
    expect(g.update(0, 1, true)).toBe(false);
    expect(g.update(1000, 1, true)).toBe(false);
    expect(g.progress).toBe(0);
    for (let n = 0; n <= 6; n++)
      expect(g.update(1100 + n * 100, n + 2, true)).toBe(false);
    expect(g.update(1800, 9, false)).toBe(false);
    for (let n = 0; n <= 6; n++)
      expect(g.update(1900 + n * 100, n + 10, true)).toBe(false);
    expect(g.update(2600, 17, true)).toBe(true);
    g.cancel();
    expect(g.update(2800, 18, true)).toBe(false);
  });
  it("warns before a wrist leaves the image and requires an inner return zone", () => {
    const c = new Camera({} as HTMLVideoElement),
      s = new Simulation(routes[0], "camera"),
      input = structuredClone(s.input);
    input.left.target = v(0, 0.1);
    input.right.target = v(0, 0.1);
    const safe = observation(input, 1, 100);
    c.process(safe);
    expect(c.resetSafe.left).toBe(true);
    const edge = structuredClone(safe);
    edge.sequence = 2;
    edge.t = 180;
    const dy = edge.detections[0].points[0].y - 0.05;
    for (const p of edge.detections[0].points) p.y -= dy;
    edge.pose[15].y = 0.05;
    c.process(edge);
    expect(c.frameEdge.left).toBe(true);
    expect(c.resetSafe.left).toBe(false);
    const band = structuredClone(safe);
    band.sequence = 3;
    band.t = 220;
    const bandDy = band.detections[0].points[0].y - 0.12;
    for (const p of band.detections[0].points)
      p.y = Math.max(0.03, p.y - bandDy);
    band.pose[15].y = 0.12;
    c.process(band);
    expect(c.frameEdge.left).toBe(false);
    expect(c.resetSafe.left).toBe(false);
    c.process({ ...safe, sequence: 4, t: 280 });
    expect(c.frameEdge.left).toBe(false);
    expect(c.resetSafe.left).toBe(true);
  });
  it("accepts comfortable seated chest Jug poses while keeping >= 0.065 edge hysteresis", () => {
    const c = new Camera({} as HTMLVideoElement),
      s = new Simulation(routes[0], "camera"),
      seated = observation(structuredClone(s.input), 1, 100);
    for (const [sideIdx, poseShoulder, poseWrist] of [
      [0, 11, 15],
      [1, 12, 16],
    ] as const) {
      seated.pose[poseShoulder].y = 0.67;
      const shiftY = 0.85 - seated.detections[sideIdx].points[0].y;
      for (const p of seated.detections[sideIdx].points) p.y += shiftY;
      seated.pose[poseWrist].y = 0.85;
    }
    c.process(seated);
    expect(c.frameEdge).toEqual({ left: false, right: false });
    expect(c.resetSafe).toEqual({ left: true, right: true });
    const lowerBand = structuredClone(seated);
    lowerBand.sequence = 2;
    lowerBand.t = 180;
    const shiftBand = 0.93 - lowerBand.detections[0].points[0].y;
    for (const p of lowerBand.detections[0].points)
      p.y = Math.min(0.96, p.y + shiftBand);
    lowerBand.pose[15].y = 0.93;
    c.process(lowerBand);
    expect(c.frameEdge.left).toBe(false);
    expect(c.resetSafe.left).toBe(false);
    const lowerEdge = structuredClone(seated);
    lowerEdge.sequence = 3;
    lowerEdge.t = 260;
    const shiftEdge = 0.97 - lowerEdge.detections[0].points[0].y;
    for (const p of lowerEdge.detections[0].points) p.y += shiftEdge;
    lowerEdge.pose[15].y = 0.97;
    c.process(lowerEdge);
    expect(c.frameEdge.left).toBe(true);
    expect(c.resetSafe.left).toBe(false);
  });
  it("resets a dropped free-hand anchor to chest-ready neutral when held is provided", () => {
    const c = new Camera({} as HTMLVideoElement),
      s = new Simulation(routes[0], "camera"),
      raw = structuredClone(s.input);
    raw.left.target = v(-0.1, 0.15);
    raw.right.target = v(0.1, 0.15);
    for (let n = 0; n < 6; n++) c.process(observation(raw, n + 1, (n + 1) * 70));
    const droppedAnchors = {
      left: v(-0.269, -0.56),
      right: v(0.16, 0.48),
    };
    c.recenter(droppedAnchors);
    expect(c.currentInput!.left.target).toEqual(v(-0.269, -0.56));
    c.recenter(droppedAnchors, undefined, { left: false, right: true });
    expect(c.currentInput!.left.target).toEqual(v(-0.18, 0.42));
    expect(c.currentInput!.right.target).toEqual(v(0.16, 0.48));
    raw.left.target = v(-0.1, 0.35);
    for (let n = 0; n < 6; n++)
      c.process(observation(raw, 20 + n, 600 + n * 70));
    expect(c.currentInput!.left.target.y).toBeGreaterThan(0.7);
    expect(dist(c.currentInput!.right.target, v(0.16, 0.48))).toBeLessThan(
      1e-5,
    );
    const comfortableFree = { left: v(-0.15, 0.38), right: v(0.16, 0.48) };
    c.recenter(comfortableFree, undefined, { left: false, right: true });
    expect(c.currentInput!.left.target).toEqual(v(-0.15, 0.38));
  });
  it("can reset 30 times without moving a held climber or storing a fake launch", () => {
    const c = new Camera({} as HTMLVideoElement),
      s = new Simulation(routes[0], "camera"),
      raw = structuredClone(s.input);
    raw.left.target = v(-0.1, 0.15);
    raw.right.target = v(0.1, 0.15);
    for (let n = 0; n < 8; n++) c.process(observation(raw, n, n * 80));
    const center = () =>
      c.recenter({
        left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
        right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
      });
    center();
    s.setInput(c.currentInput!);
    s.start();
    for (let n = 0; n < 240; n++) s.step();
    const start = { ...s.rig.com() };
    for (let n = 0; n < 30; n++) {
      s.pause();
      const frozen = structuredClone(s.summary());
      raw.left.target.y = raw.right.target.y = 0.1 + (n % 5) * 0.03;
      for (let k = 0; k < 12; k++) {
        c.process(observation(raw, 100 + n * 12 + k, 2000 + (n * 12 + k) * 80));
        s.step();
      }
      expect(s.summary()).toEqual(frozen);
      center();
      (s.rig as AnchorRig).rebase();
      expect((s.rig as AnchorRig).launchVelocity).toEqual(v());
      s.setInput(c.currentInput!);
      s.start();
      for (let k = 0; k < 30; k++) s.step();
    }
    expect(dist(s.rig.com(), start)).toBeLessThan(0.01);
    expect(s.contacts.left && s.contacts.right).toBeTruthy();
    expect(s.events.filter((e) => e.kind === "slip")).toHaveLength(0);
    expect(s.energy).toBeGreaterThan(0.97);
  });
});

describe("wall follow camera", () => {
  it("follows a multi-metre climb without shrinking the avatar or losing its feet", () => {
    const c = new FollowCamera();
    c.update(900, 600, v(0, 0.4), v(0, 1.4), 1 / 60);
    const scale = c.scale;
    for (let n = 0; n < 900; n++)
      c.update(
        900,
        600,
        v(0.4 * Math.sin(n / 90), 0.4 + n / 180),
        v(0, 2 + n / 180),
        1 / 60,
      );
    const body = v(0.4 * Math.sin(899 / 90), 0.4 + 899 / 180),
      screen = c.toScreen(body);
    expect(c.scale).toBe(scale);
    expect(screen.x).toBeGreaterThan(250);
    expect(screen.x).toBeLessThan(650);
    expect(screen.y).toBeGreaterThan(300);
    expect(screen.y).toBeLessThan(420);
    expect(c.toScreen({ ...body, y: body.y - 1.05 }).y).toBeLessThan(600);
    expect(dist(c.toWorld(screen), body)).toBeLessThan(1e-9);
  });
  it("ignores small jitter and resets immediately on a new route", () => {
    const c = new FollowCamera();
    c.update(900, 600, v(0, 0.4), undefined, 1 / 60);
    const origin = { ...c.origin };
    for (let n = 0; n < 600; n++)
      c.update(
        900,
        600,
        v(0.02 * Math.sin(n), 0.4 + 0.02 * Math.cos(n)),
        undefined,
        1 / 60,
      );
    expect(c.origin).toEqual(origin);
    c.reset();
    c.update(600, 900, v(0, 3), undefined, 1 / 60);
    expect(c.center.y).toBeCloseTo(3.38);
    expect(c.toScreen(v(0, 3)).x).toBe(300);
  });
  it("keeps full arm reach and legs visible during fast flight", () => {
    const c = new FollowCamera();
    c.update(900, 600, v(), undefined, 1 / 60);
    for (let n = 0; n < 120; n++) {
      const p = v((n * 4) / 60, (n * 4) / 60 - 4.905 * (n / 60) ** 2);
      c.update(900, 600, p, undefined, 1 / 60);
      expect(c.toScreen({ x: p.x + 0.935, y: p.y }).x).toBeLessThan(900);
      expect(c.toScreen({ x: p.x - 0.935, y: p.y }).x).toBeGreaterThan(0);
      expect(c.toScreen({ x: p.x, y: p.y + 0.935 }).y).toBeGreaterThan(0);
      expect(c.toScreen({ x: p.x, y: p.y - 1.05 }).y).toBeLessThan(600);
    }
  });
});
