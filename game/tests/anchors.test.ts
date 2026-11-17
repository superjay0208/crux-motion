import { describe, it, expect } from "vitest";
import { Simulation } from "../src/core/Simulation";
import { AnchorRig } from "../src/core/AnchorRig";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { v, sub, dist } from "../src/core/math";
import { Camera } from "../src/tracking/Camera";
import { observation, handShape } from "./fixtures/hands";
import {
  inverseHandCorrection,
  ReleaseVelocity,
} from "../src/vendor/climbing/HandAnchors";
import { PositionSignal, cameraGrip } from "../src/tracking/upstream";

const fixture = () => {
  const s = new Simulation(routes[0], "camera");
  s.fatigue = false;
  const input = structuredClone(s.input);
  for (const side of hands)
    input[side].target = sub(s.rig.hand(side), s.rig.shoulder(side));
  s.setInput(input);
  s.start();
  return { s, input };
};
describe("ported hand-anchor locomotion", () => {
  it("keeps the native anchor rig finite over 600 seconds of varied attempts", () => {
    let { s, input } = fixture(),
      seed = 91;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let t = 0; t < 72000; t++) {
      if (s.state !== "playing") ({ s, input } = fixture());
      if (t % 12 === 0) {
        for (const side of hands) {
          input[side].target = v((rand() - 0.5) * 1.4, rand() * 0.8);
          input[side].grip = rand() < 0.15 ? "release" : "jug";
        }
        s.setInput(input);
      }
      s.step();
      if (t % 120 === 0) {
        expect(Number.isFinite(s.rig.com().x + s.rig.com().y)).toBe(true);
        expect(Math.hypot(s.rig.velocity().x, s.rig.velocity().y)).toBeLessThan(
          30,
        );
        expect(s.rig.torso.getAngle()).toBe(0);
      }
    }
  });
  it("cannot hang from an undercling alone or retain an exhausted grip", () => {
    const { s, input } = fixture();
    s.route = structuredClone(s.route);
    s.route.holds.find((h) => h.id === "start-r")!.direction = v(0, -1);
    s.contacts.right!.hold = s.route.holds.find((h) => h.id === "start-r")!;
    input.left.grip = "release";
    input.right.orientation = "down";
    s.setInput(input);
    for (let t = 0; t < 180; t++) s.step();
    expect(!!s.contacts.right).toBe(false);
    const weak = fixture();
    weak.s.fatigue = true;
    weak.s.reserve.left = weak.s.reserve.right = 0;
    weak.s.energy = 0.1;
    for (let t = 0; t < 240; t++) weak.s.step();
    expect(!!(weak.s.contacts.left || weak.s.contacts.right)).toBe(false);
  });
  it("averages simultaneous hands instead of doubling body motion", () => {
    const p = inverseHandCorrection([
      { anchor: v(0, 1), requested: v(0.2, 0.8) },
      { anchor: v(1, 1), requested: v(1.2, 0.8) },
    ]);
    expect(p.x).toBeCloseTo(-0.2, 8);
    expect(p.y).toBeCloseTo(0.2, 8);
  });
  it("requires a fresh attempt after a slip instead of endlessly recatching the same patch", () => {
    const { s, input } = fixture();
    for (let n = 0; n < 120; n++) s.step();
    s.release("left", "Grip overloaded", true);
    for (let n = 0; n < 180; n++) s.step();
    expect(s.contacts.left).toBeNull();
    expect(s.contacts.right?.hold.id).toBe("start-r");
    input.left.grip = "release";
    s.setInput(input);
    for (let n = 0; n < 30; n++) s.step();
    input.left.grip = "jug";
    s.setInput(input);
    for (let n = 0; n < 30; n++) s.step();
    expect(s.contacts.left?.hold.id).toBe("start-l");
  });
  it("uses total displacement divided by elapsed time for irregular sample rates", () => {
    const h = new ReleaseVelocity();
    h.addDistance(0.02, v(0.02, 0.04));
    h.addDistance(0.06, v(0.06, 0.12));
    expect(h.velocity()).toEqual(v(1, 2));
    h.clear();
    expect(h.velocity()).toEqual(v());
  });
  it("remains still with stationary hands, with no flips or motor-driven slips", () => {
    const { s } = fixture();
    for (let t = 0; t < 3600; t++) s.step();
    expect(s.rig).toBeInstanceOf(AnchorRig);
    expect(Math.abs(s.rig.torso.getAngle())).toBe(0);
    expect(Math.abs(s.rig.com().x)).toBeLessThan(0.005);
    expect(Math.hypot(s.rig.velocity().x, s.rig.velocity().y)).toBeLessThan(
      0.01,
    );
    expect(s.contacts.left && s.contacts.right).toBeTruthy();
    expect(s.events).toHaveLength(0);
  });
  for (const side of hands)
    it(`transfers a 20cm supporting-hand pull into body rise on the ${side}`, () => {
      const { s, input } = fixture(),
        other = side === "left" ? "right" : "left";
      input[other].grip = "release";
      input[other].ready = false;
      s.setInput(input);
      for (let t = 0; t < 120; t++) s.step();
      const before = s.rig.torso.getPosition().y;
      for (let t = 0; t < 120; t++) {
        input[side].target.y = 0.5 - 0.2 * Math.min(1, t / 60);
        s.setInput(input);
        s.step();
      }
      expect(s.rig.torso.getPosition().y - before).toBeGreaterThan(0.18);
      expect(s.contacts[side]).not.toBeNull();
      expect(s.events.some((e) => e.kind === "slip")).toBe(false);
    });
  it("sweeps opposite the planted hands and releases measured momentum with gravity", () => {
    const { s, input } = fixture();
    for (let t = 0; t < 120; t++) s.step();
    for (let t = 0; t < 60; t++) {
      for (const side of hands) input[side].target.x += 0.002;
      s.setInput(input);
      s.step();
    }
    expect(s.rig.torso.getPosition().x).toBeLessThan(-0.08);
    const expected = (s.rig as AnchorRig).launchVelocity;
    for (const side of hands) input[side].grip = "release";
    s.setInput(input);
    s.step();
    expect(s.contacts.left || s.contacts.right).toBeFalsy();
    expect(s.rig.velocity().x).toBeCloseTo(expected.x, 2);
    const before = { ...s.rig.velocity() };
    for (let t = 0; t < 30; t++) {
      input.left.target = v(0.6, Math.sin(t));
      s.setInput(input);
      s.step();
    }
    expect(s.rig.velocity().x).toBeCloseTo(before.x, 5);
    expect(s.rig.velocity().y).toBeCloseTo(before.y - 9.81 * 0.25, 4);
  });
  it("never replays a recenter or pause displacement as a launch", () => {
    const { s, input } = fixture();
    for (let t = 0; t < 120; t++) s.step();
    s.pause();
    const before = structuredClone(s.summary());
    (s.rig as AnchorRig).rebase();
    for (let t = 0; t < 120; t++) s.step();
    expect(s.summary()).toEqual(before);
    expect((s.rig as AnchorRig).launchVelocity).toEqual(v());
  });
  it("ignores the failing projected elbow sign while keeping crossed wrists independent", () => {
    const c = new Camera({} as HTMLVideoElement),
      { s, input } = fixture();
    for (let t = 0; t < 8; t++) c.process(observation(input, t, t * 80));
    c.recenter({
      left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
      right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
    });
    const before = { ...c.currentInput!.right.target };
    for (let n = 0; n < 12; n++) {
      const o = observation(input, 30 + n, 1000 + n * 80);
      o.pose[14].x = 0.9;
      o.pose[14].y = n % 2 ? 0.1 : 0.9;
      c.process(o);
    }
    expect(c.currentInput!.right.arm).toBeUndefined();
    expect(dist(c.currentInput!.right.target, before)).toBeLessThan(0.005);
    expect(c.currentInput!.right.quality).toBe(true);
  });
  it("retains an arm position when elbow visibility disappears", () => {
    const c = new Camera({} as HTMLVideoElement),
      { input } = fixture();
    const o = observation(input, 1, 100);
    o.pose[13].visibility = 0;
    c.process(o);
    expect(c.currentInput!.left.quality).toBe(true);
  });
  it("adapts the upstream filter to milliseconds and rejects duplicate observations", () => {
    const f = new PositionSignal();
    expect(f.update(0, 100)).toBe(0);
    const a = f.update(0.2, 180);
    expect(a).toBeGreaterThan(0.1);
    expect(f.update(5, 180)).toBe(a);
    expect(f.update(0.7, 1000)).toBe(0.7);
  });
  it("uses the imported finger scoring for clear open/closed states", () => {
    for (const grip of ["jug", "release"] as const) {
      const d = { points: handShape(grip), score: 0.99, label: "Left" };
      expect(cameraGrip(d, "left", 1, 1, {}, "unknown").found.grip).toBe(grip);
    }
  });
  it("uses world-space finger bend when screen projection hides the grip shape", () => {
    for (const grip of ["jug", "release"] as const) {
      const original = handShape(grip),
        world = original.map((p) => ({ x: p.x, y: -(p.z ?? 0), z: p.y }));
      const projected = world.map((p) => ({ x: p.x, y: p.y, z: 0 }));
      const result = cameraGrip(
        { points: projected, world, label: "Left", score: 0.99 },
        "left",
        1,
        1,
        {},
        "unknown",
      );
      expect(result.scores?.world).toBe(true);
      expect(result.found.grip).toBe(grip);
    }
  });
  it("replays the new controller without silently switching back to the motor rig", () => {
    const { s, input } = fixture();
    for (let t = 0; t < 240; t++) {
      if (t % 8 === 0) {
        input.left.target.x = -0.13 + 0.08 * Math.sin(t * 0.02);
        s.setInput(input);
      }
      s.step();
    }
    const r = s.replay(),
      copy = new Simulation(routes[0], "review", r.controller);
    copy.fatigue = false;
    copy.start();
    let n = 0;
    for (let t = 0; t < r.duration; t++) {
      if (r.frames[n]?.tick === t) copy.setInput(r.frames[n++].input);
      copy.step();
    }
    expect(copy.summary()).toEqual(s.summary());
  });
});
