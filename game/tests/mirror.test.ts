import { describe, it, expect } from "vitest";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands, type Hand } from "../src/core/types";
import { ik, v, sub, dist } from "../src/core/math";
import { ArmMirror, armOffset, observedArm } from "../src/tracking/arms";
import { initialInputs } from "../src/core/types";
import { observation } from "./fixtures/hands";
import { Camera } from "../src/tracking/Camera";
import { validateReplay } from "../src/core/replay";

const command = (p: { x: number; y: number }, side: Hand) => {
  const solved = ik(v(), p, 0.36, 0.39, side === "left" ? -1 : 1);
  return {
    upper: solved.upper,
    elbow: solved.elbow,
    upperVelocity: 0,
    elbowVelocity: 0,
  };
};
const prepared = () => {
  const s = new Simulation(routes[0], "camera", "motors"),
    input = structuredClone(s.input);
  s.fatigue = false;
  for (const side of hands)
    input[side].arm = {
      ...s.rig.pose(side, true),
      upperVelocity: 0,
      elbowVelocity: 0,
    };
  s.setInput(input);
  s.start();
  for (let t = 0; t < 180; t++) s.step();
  return { s, input };
};

describe("mirrored arm movement", () => {
  it("changes an observed elbow bend through its valid hinge range", () => {
    const mirror = new ArmMirror(),
      source = { upper: 1, elbow: -1.5 };
    mirror.observe(source, 0);
    mirror.rebase(source, 0);
    for (let t = 80; t < 1600; t += 80) {
      const m = mirror.observe({ ...source, elbow: 1.5 }, t, v(0.2, 0.5))!;
      expect(Math.abs(m.elbow)).toBeLessThanOrEqual(2.65);
    }
    expect(mirror.motion!.elbow).toBeGreaterThan(0);
    expect(dist(armOffset(mirror.motion!), v(0.2, 0.5))).toBeLessThan(0.01);
  });
  it("replays arm-driven motion deterministically and rejects invalid joint commands", () => {
    const { s, input } = prepared();
    for (let t = 0; t < 240; t++) {
      if (t % 8 === 0) {
        for (const side of hands)
          input[side].arm = command(
            v((side === "left" ? -0.13 : 0.13) + 0.1 * Math.sin(t * 0.04), 0.5),
            side,
          );
        s.setInput(input);
      }
      s.step();
    }
    const replay = validateReplay(s.replay()),
      copy = new Simulation(routes[0], "camera", "motors");
    copy.fatigue = false;
    copy.start();
    let i = 0;
    for (let t = 0; t < replay.duration; t++) {
      if (replay.frames[i]?.tick === t) copy.setInput(replay.frames[i++].input);
      copy.step();
    }
    expect(copy.summary()).toEqual(s.summary());
    const invalid = structuredClone(replay);
    invalid.frames[0].input.left.arm!.elbow = NaN;
    expect(() => validateReplay(invalid)).toThrow("mirrored arm");
  });
  it("retargets wrist direction and crossing without copying a misleading neutral angle offset", () => {
    const inputs = initialInputs(),
      source = observedArm(
        "left",
        observation(inputs, 1, 100).pose,
        observation(inputs, 1, 100).detections[0].points[0],
        960,
        540,
      )!;
    const mirror = new ArmMirror();
    mirror.observe(source, 100);
    const anchor = ik(v(), v(-0.13, 0.5), 0.36, 0.39, -1);
    mirror.rebase(anchor, 100);
    const desired = v(0.32, 0.48);
    for (let t = 200; t <= 1000; t += 80) mirror.observe(source, t, desired);
    expect(armOffset(mirror.motion!).x).toBeCloseTo(desired.x, 2);
    expect(armOffset(mirror.motion!).y).toBeCloseTo(desired.y, 2);
    expect(mirror.motion!.elbow).toBeLessThan(0);
    expect(Math.abs(mirror.motion!.upperVelocity)).toBeLessThan(0.01);
  });
  it("centers the actual camera-to-joint path and freezes normalization until the next setup", () => {
    const c = new Camera({} as HTMLVideoElement),
      { s } = prepared(),
      raw = initialInputs();
    c.calibration.armMode = "mirror";
    raw.left.target = v(-0.1, 0.15);
    raw.right.target = v(0.1, 0.15);
    for (let n = 0; n < 8; n++) c.process(observation(raw, n, n * 80));
    const anchors = {
      left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
      right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
    };
    c.recenter(anchors, {
      left: s.rig.pose("left", true),
      right: s.rig.pose("right", true),
    });
    c.onInput = (i) => s.setInput(i);
    const reference = c.mapper.referencePixels.left;
    for (let t = 0; t < 600; t++) {
      if (t % 8 === 0)
        c.process(observation(raw, 20 + t, 1000 + (t * 1000) / 120));
      s.step();
    }
    expect(c.currentInput!.left.arm).toBeDefined();
    expect(c.mapper.referencePixels.left).toBe(reference);
    expect(s.contacts.left?.hold.id).toBe("start-l");
    expect(s.contacts.right?.hold.id).toBe("start-r");
    expect(s.events.some((e) => e.kind === "slip")).toBe(false);
    expect(Math.abs(s.rig.com().x)).toBeLessThan(0.05);
  });
  for (const side of hands)
    it(`performs a finite-grip one-arm campus pull on the ${side}`, () => {
      const { s, input } = prepared(),
        other = side === "left" ? "right" : "left";
      input[other].grip = "release";
      input[other].ready = false;
      s.setInput(input);
      for (let t = 0; t < 120; t++) s.step();
      const before = s.rig.com().y;
      input[side].arm!.elbow += (side === "left" ? -1 : 1) * 0.6;
      s.setInput(input);
      for (let t = 0; t < 120; t++) s.step();
      expect(s.rig.com().y - before).toBeGreaterThan(0.1);
      expect(s.contacts[side]?.hold.id).toBe(
        side === "left" ? "start-l" : "start-r",
      );
      expect(s.events.some((e) => e.kind === "slip")).toBe(false);
    });
  it("builds horizontal momentum from arm sweeps and preserves it after release", () => {
    const { s, input } = prepared();
    let peakX = 0,
      peakSpeed = 0;
    for (let t = 0; t < 480; t++) {
      for (const side of hands)
        input[side].arm = command(
          v(
            (side === "left" ? -0.13 : 0.13) + 0.2 * Math.sin((t / 120) * 4),
            0.5,
          ),
          side,
        );
      s.setInput(input);
      s.step();
      peakX = Math.max(peakX, Math.abs(s.rig.com().x));
      peakSpeed = Math.max(peakSpeed, Math.abs(s.rig.velocity().x));
    }
    expect(peakX).toBeGreaterThan(0.12);
    expect(peakSpeed).toBeGreaterThan(0.6);
    expect(s.events.some((e) => e.kind === "slip")).toBe(false);
    for (const side of hands) {
      input[side].grip = "release";
      input[side].ready = false;
    }
    s.setInput(input);
    const before = { ...s.rig.velocity() };
    for (let t = 0; t < 30; t++) {
      input.left.arm = command(v(0.4, Math.sin(t) * 0.3), "left");
      s.setInput(input);
      s.step();
    }
    expect(s.rig.velocity().x).toBeCloseTo(before.x, 4);
    expect(s.rig.velocity().y).toBeCloseTo(before.y - 9.81 * 0.25, 3);
  });
  it("does not inject ongoing swing when the user holds still", () => {
    const { s } = prepared();
    let peak = 0,
      filtered = 0,
      displacement = 0;
    // Finite, competing contact constraints produce tiny high-frequency velocity
    // spikes. A swing must create sustained velocity and visible displacement.
    for (let t = 0; t < 600; t++) {
      s.step();
      filtered += 0.05 * (s.rig.velocity().x - filtered);
      if (t > 300) {
        peak = Math.max(peak, Math.abs(filtered));
        displacement = Math.max(displacement, Math.abs(s.rig.com().x));
      }
    }
    expect(peak).toBeLessThan(0.08);
    expect(displacement).toBeLessThan(0.03);
    expect(s.contacts.left && s.contacts.right).toBeTruthy();
  });
  it("cannot regrab the old Jug while the mirrored aim points to the next patch", () => {
    const { s, input } = prepared();
    input.left.grip = "release";
    s.setInput(input);
    for (let n = 0; n < 20; n++) s.step();
    for (let n = 0; n < 100; n++) {
      input.left.grip = "jug";
      input.left.arm = command(
        sub(v(-0.22, 1.34), s.rig.shoulder("left")),
        "left",
      );
      s.setInput(input);
      s.step();
      expect(s.contacts.left?.hold.id).not.toBe("start-l");
    }
  });
  it("reports a hidden elbow as uncertain rather than silently switching to a different controller", () => {
    const c = new Camera({} as HTMLVideoElement),
      raw = initialInputs();
    c.calibration.armMode = "mirror";
    for (let n = 0; n < 8; n++) c.process(observation(raw, n, n * 80));
    const s = new Simulation(routes[0]);
    c.recenter(
      {
        left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
        right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
      },
      { left: s.rig.pose("left", true), right: s.rig.pose("right", true) },
    );
    const o = observation(raw, 20, 1200);
    o.pose[13].visibility = 0.2;
    c.process(o);
    expect(c.currentInput!.left.quality).toBe(false);
    expect(c.currentInput!.left.arm).toBeDefined();
    expect(c.recognition.left.reason).toContain("Elbow hidden");
    expect(c.currentInput!.right.quality).toBe(true);
  });
});
