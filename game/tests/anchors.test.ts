import { describe, it, expect } from "vitest";
import { Simulation } from "../src/core/Simulation";
import { AnchorRig } from "../src/core/AnchorRig";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { v, sub, dist, len } from "../src/core/math";
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
        expect(Math.abs(s.rig.torso.getAngle())).toBeLessThanOrEqual(0.2);
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
  it("initializes catch capacity immediately and engages substep-0 support on the catch tick", () => {
    const { s, input } = fixture();
    const hold = s.route.holds.find((h) => h.id === "move-0")!;
    input.left.grip = "release";
    input.right.grip = "release";
    s.setInput(input);
    for (let t = 0; t < 16; t++) s.step();
    expect(s.contacts.left).toBeNull();
    expect(s.contacts.right).toBeNull();
    expect(s.cooldown.left).toBe(0);
    // Position torso above move-0 with downward velocity so pre-step sync is just above
    // the rim (+0.004m) and substep 0 sweeps the hand into move-0 before substep 1.
    const edgeTop = hold.p.y + hold.radius + 0.025;
    s.rig.torso.setPosition(
      v(hold.p.x + 0.19, edgeTop + 0.004 - 0.28 - 0.4),
    );
    s.rig.torso.setLinearVelocity(v(0, -3.2));
    s.rig.legs.setPosition(v(hold.p.x + 0.19, edgeTop + 0.004 - 1.03 - 0.4));
    s.rig.legs.setLinearVelocity(v(0, -3.2));
    input.left.target = v(0, 0.4);
    input.left.grip = "jug";
    input.left.ready = true;
    input.right.target = v(0.3, -0.2);
    input.right.grip = "release";
    input.right.ready = false;
    (s.rig as AnchorRig).sync(input, {});
    s.setInput(input);
    s.step();
    expect(s.contacts.left?.hold.id).toBe("move-0");
    // Must use ramped Jug capacity (589 * 2.8 * 0.15 = 247.38 N), never raw 1000 N constructor default.
    expect(s.contacts.left!.joint.normal).toBeCloseTo(589 * 2.8 * 0.15, 2);
    expect(s.contacts.left!.joint.normal).toBeLessThan(300);
    // Substep-0 acquisition must immediately engage AnchorRig support before substep 1.
    expect(len((s.rig as AnchorRig).supportForce)).toBeGreaterThan(50);
  });
  it("preserves pull momentum across an 80ms finger-opening pause for human dyno launches", () => {
    const h = new ReleaseVelocity();
    expect(h.windowSeconds).toBeCloseTo(0.18, 5);
    for (let i = 0; i < 12; i++) h.addDistance(1 / 120, v(0, 2.4 / 120));
    for (let i = 0; i < 10; i++) h.addDistance(1 / 120, v(0, 0));
    expect(h.velocity().y).toBeGreaterThan(1.75);
    expect(h.velocity().y).toBeLessThanOrEqual(4.2);
    // Reversed back-and-forth motion cancels instead of launching backward.
    const rev = new ReleaseVelocity();
    for (let i = 0; i < 10; i++) rev.addDistance(1 / 120, v(0, 0.02));
    for (let i = 0; i < 10; i++) rev.addDistance(1 / 120, v(0, -0.025));
    expect(rev.velocity().y).toBeLessThanOrEqual(0);
    // Full simulation: pull down, hold stationary for ~83ms while opening fingers, then launch.
    const s = new Simulation(routes[8], "camera");
    s.fatigue = false;
    const input = structuredClone(s.input);
    for (const side of hands)
      input[side].target = sub(s.rig.hand(side), s.rig.shoulder(side));
    s.setInput(input);
    s.start();
    for (let t = 0; t < 60; t++) {
      for (const side of hands) input[side].target.y = 0.68;
      s.setInput(input);
      s.step();
    }
    for (let t = 0; t < 20; t++) {
      for (const side of hands) input[side].target.y = 0.16;
      s.setInput(input);
      s.step();
    }
    // 10 ticks (~83ms) of stationary hand targets simulating webcam finger-spread latency.
    for (let t = 0; t < 10; t++) s.step();
    for (const side of hands) input[side].grip = "release";
    s.setInput(input);
    s.step();
    expect(s.contacts.left || s.contacts.right).toBeFalsy();
    expect(s.rig.velocity().y).toBeGreaterThan(1.25);
  });
  it("prevents accidental upward-sweep snags on lower start holds while allowing deliberate down-climbs and split pulls", () => {
    // Vertical-separation pull weighting favors upper pulling hand while preserving 50/50 at rest.
    const splitPull = inverseHandCorrection([
      { anchor: v(-0.22, 1.45), requested: v(-0.22, 1.2), shoulder: v(-0.22, 0.95) },
      { anchor: v(0.32, 1.1), requested: v(0.32, 1.1), shoulder: v(0.18, 0.95) },
    ]);
    expect(splitPull.y).toBeCloseTo(0.25 * 0.78, 5);
    const splitRest = inverseHandCorrection([
      { anchor: v(-0.22, 1.45), requested: v(-0.22, 1.42), shoulder: v(-0.22, 0.95) },
      { anchor: v(0.32, 1.1), requested: v(0.32, 1.07), shoulder: v(0.18, 0.95) },
    ]);
    expect(splitRest.y).toBeCloseTo(0.03, 6);

    // Simulation upward-sweep snag prevention on start-l / start-r while left holds move-0 (y = 1.34 > 1.10 + 0.18).
    const { s, input } = fixture();
    const move0 = s.route.holds.find((h) => h.id === "move-0")!,
      startL = s.route.holds.find((h) => h.id === "start-l")!,
      startR = s.route.holds.find((h) => h.id === "start-r")!;
    input.left.grip = "release";
    input.left.ready = false;
    input.right.target = v(0.13, 0.32);
    s.setInput(input);
    for (let t = 0; t < 25; t++) s.step();
    expect(s.contacts.left).toBeNull();
    // Attach left to move-0 by aiming at move-0.
    for (let t = 0; t < 90 && !s.contacts.left; t++) {
      input.left.target = sub(move0.p, s.rig.shoulder("left"));
      input.left.grip = "jug";
      input.left.ready = true;
      s.setInput(input);
      s.step();
    }
    expect(s.contacts.left?.hold.id).toBe("move-0");
    // Open right from start-r and wait past cooldown.
    input.right.grip = "release";
    input.right.ready = false;
    s.setInput(input);
    for (let t = 0; t < 20; t++) s.step();
    expect(s.contacts.right).toBeNull();
    // Sweep right hand from below start-l up past start-l's upper rim (> 0.85 * radius from center,
    // still inside radius + 0.025m patch tolerance): must NOT snag start-l while left holds move-0!
    input.right.target = sub(
      v(startL.p.x, startL.p.y - 0.12),
      s.rig.shoulder("right"),
    );
    input.right.grip = "release";
    s.setInput(input);
    s.step();
    input.right.target = sub(
      v(startL.p.x, startL.p.y + startL.radius * 0.95),
      s.rig.shoulder("right"),
    );
    input.right.grip = "jug";
    input.right.ready = true;
    s.setInput(input);
    s.step();
    expect(s.contacts.right).toBeNull();
    // Deliberate down-climb aiming directly at start-r center succeeds.
    input.right.target = sub(startR.p, s.rig.shoulder("right"));
    s.setInput(input);
    for (let t = 0; t < 10; t++) s.step();
    expect(s.contacts.right?.hold.id).toBe("start-r");
  });
  it("applies bounded postural torso sway with natural leg pendulum and settles strictly to zero at rest and rebase", () => {
    const { s, input } = fixture();
    for (let t = 0; t < 60; t++) s.step();
    expect(s.rig.torso.getAngle()).toBe(0);
    let maxTorso = 0,
      maxLegSwing = 0;
    for (let t = 0; t < 90; t++) {
      const x = 0.28 * Math.sin((t / 90) * Math.PI * 2);
      input.left.target.x = -0.13 + x;
      input.right.target.x = 0.13 + x;
      s.setInput(input);
      s.step();
      maxTorso = Math.max(maxTorso, Math.abs(s.rig.torso.getAngle()));
      maxLegSwing = Math.max(
        maxLegSwing,
        Math.abs(s.rig.legs.getAngle() - s.rig.torso.getAngle()),
      );
      expect(Math.abs(s.rig.torso.getAngle())).toBeLessThanOrEqual(0.2);
    }
    expect(maxTorso).toBeGreaterThan(0.03);
    expect(maxLegSwing).toBeGreaterThan(0.04);
    // Rebase immediately zeros torso angle.
    (s.rig as AnchorRig).rebase();
    expect(s.rig.torso.getAngle()).toBe(0);
    // Trigger another brief sweep and verify stationary hands decay back to exact 0.
    for (let t = 0; t < 25; t++) {
      input.left.target.x = -0.35;
      input.right.target.x = -0.09;
      s.setInput(input);
      s.step();
    }
    expect(Math.abs(s.rig.torso.getAngle())).toBeGreaterThan(0.01);
    for (let t = 0; t < 240; t++) s.step();
    expect(s.rig.torso.getAngle()).toBe(0);
  });
  it("reports normalized grip strain in [0, 1] and supports assisted grip & reach tolerance", () => {
    const { s, input } = fixture();
    s.fatigue = true;
    for (let t = 0; t < 60; t++) s.step();
    expect(s.strain("left")).toBeGreaterThan(0.05);
    expect(s.strain("left")).toBeLessThan(0.45);
    input.left.grip = "pinch";
    s.setInput(input);
    let peakStrain = 0;
    for (let t = 0; t < 60 && s.contacts.left; t++) {
      s.step();
      peakStrain = Math.max(peakStrain, s.strain("left"));
    }
    expect(peakStrain).toBeGreaterThan(0.8);
    expect(peakStrain).toBeLessThanOrEqual(1);
    expect(s.contacts.left).toBeNull();
    expect(s.strain("left")).toBe(0);

    // Assisted mode: allows non-matching ready grip (jug on crimp) + 0.035m tolerance, while keeping undercling orientation check.
    const crimpRoute = routes[2]; // move-0 is crimp at (-0.36, 1.45), radius 0.115
    const crimpHold = crimpRoute.holds.find((h) => h.id === "move-0")!;
    const runAttempt = (assisted: boolean) => {
      const sim = new Simulation(crimpRoute, "camera");
      sim.fatigue = false;
      sim.assisted = assisted;
      const inp = structuredClone(sim.input);
      for (const side of hands)
        inp[side].target = sub(sim.rig.hand(side), sim.rig.shoulder(side));
      sim.setInput(inp);
      sim.start();
      inp.left.grip = "release";
      inp.left.ready = false;
      sim.setInput(inp);
      for (let t = 0; t < 20; t++) sim.step();
      // Aim +0.045m below crimpHold rim (> 0.025m unassisted tolerance, <= 0.060m assisted tolerance) with a "jug" fist.
      const nearRim = v(crimpHold.p.x, crimpHold.p.y - crimpHold.radius - 0.045);
      inp.left.target = sub(nearRim, sim.rig.shoulder("left"));
      inp.left.grip = "jug";
      inp.left.ready = true;
      sim.setInput(inp);
      for (let t = 0; t < 70; t++) sim.step();
      return sim.contacts.left?.hold.id ?? null;
    };
    expect(runAttempt(false)).toBeNull();
    expect(runAttempt(true)).toBe("move-0");

    // Undercling still requires palm-up ("down") orientation even when assisted.
    const scoopRoute = routes[5];
    const scoopHold = scoopRoute.holds.find((h) => h.id === "move-1")!;
    const scoopSim = new Simulation(scoopRoute, "camera");
    scoopSim.assisted = true;
    const scoopIn = structuredClone(scoopSim.input);
    for (const side of hands)
      scoopIn[side].target = sub(scoopSim.rig.hand(side), scoopSim.rig.shoulder(side));
    scoopSim.setInput(scoopIn);
    scoopSim.start();
    scoopIn.right.grip = "release";
    scoopSim.setInput(scoopIn);
    for (let t = 0; t < 20; t++) scoopSim.step();
    scoopIn.right.target = sub(scoopHold.p, scoopSim.rig.shoulder("right"));
    scoopIn.right.grip = "pinch";
    scoopIn.right.ready = true;
    scoopIn.right.orientation = "up";
    scoopSim.setInput(scoopIn);
    for (let t = 0; t < 15; t++) scoopSim.step();
    expect(scoopSim.contacts.right).toBeNull();
    scoopIn.right.orientation = "down";
    scoopSim.setInput(scoopIn);
    for (let t = 0; t < 15; t++) scoopSim.step();
    expect(scoopSim.contacts.right?.hold.id).toBe("move-1");
  });
});
