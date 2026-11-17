import { describe, expect, it } from "vitest";
import { Camera } from "../src/tracking/Camera";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { initialInputs, gripFits } from "../src/core/types";
import { observation, handShape } from "./fixtures/hands";
import { classify, features, prototype } from "../src/tracking/gestures";
describe("geometric gesture fixtures", () => {
  it("accepts a curled Crimp grasp on a Jug without making precise holds interchangeable", () => {
    expect(gripFits("crimp", "jug")).toBe(true);
    expect(gripFits("jug", "crimp")).toBe(false);
    expect(gripFits("pinch", "jug")).toBe(false);
    expect(gripFits("sloper", "jug")).toBe(false);
    const p = handShape("crimp");
    p[4] = { ...p[8], x: p[8].x + 0.005 };
    expect(classify(features(p)).grip).toBe("crimp");
  });
  it("finishes a matched route without silently requiring every optional intermediate hold", () => {
    const r = structuredClone(routes[0]);
    for (const h of r.holds) if (r.start.includes(h.id)) h.finish = true;
    const s = new Simulation(r);
    s.fatigue = false;
    s.start();
    for (let n = 0; n < 120; n++) s.step();
    expect(s.visited.size).toBe(0);
    expect(s.state).toBe("finished");
  });
  for (const grip of ["jug", "crimp", "sloper", "pinch", "release"] as const)
    it(`recognizes an articulated ${grip} fixture`, () => {
      expect(classify(features(handShape(grip))).grip).toBe(grip);
    });
  it("partial calibration still allows untrained release and pinch", () => {
    const jug = features(handShape("jug")),
      crimp = features(handShape("crimp"));
    const partial = {
      jug: prototype([jug, jug]),
      crimp: prototype([crimp, crimp]),
    };
    expect(classify(features(handShape("release")), partial).grip).toBe(
      "release",
    );
    expect(classify(features(handShape("pinch")), partial).grip).toBe("pinch");
  });
  it("uses pose wrists to move arms when fingers are temporarily occluded", () => {
    const camera = new Camera({} as HTMLVideoElement);
    const input = initialInputs();
    input.left.target = { x: -0.3, y: 0.55 };
    const o = observation(input, 1, 100);
    o.detections = [];
    camera.process(o);
    camera.process({ ...o, sequence: 2, t: 240 });
    expect(camera.currentInput!.left.quality).toBe(true);
    expect(camera.currentInput!.left.target.x).toBeLessThan(-0.2);
    expect(camera.currentInput!.left.ready).toBe(false);
    expect(camera.currentInput!.left.grip).toBe("unknown");
  });
  it("keeps wrist aim steady when fingers change from Jug to Release", () => {
    const c = new Camera({} as HTMLVideoElement),
      input = initialInputs();
    input.left.target = { x: -0.2, y: 0.5 };
    for (let n = 1; n <= 10; n++) c.process(observation(input, n, n * 70));
    const target = { ...c.currentInput!.left.target };
    input.left.grip = "release";
    for (let n = 11; n <= 20; n++) c.process(observation(input, n, n * 70));
    expect(c.currentInput!.left.grip).toBe("release");
    expect(c.currentInput!.left.target.x).toBeCloseTo(target.x, 6);
    expect(c.currentInput!.left.target.y).toBeCloseTo(target.y, 6);
  });
  it("does not drop a Jug on a short known-shape flicker, but a sustained wrong grip slips", () => {
    const s = new Simulation(routes[0]);
    s.fatigue = false;
    s.start();
    const i = initialInputs();
    s.setInput(i);
    for (let n = 0; n < 120; n++) s.step();
    i.left.grip = "pinch";
    s.setInput(i);
    for (let n = 0; n < 12; n++) s.step();
    expect(s.contacts.left?.hold.id).toBe("start-l");
    for (let n = 0; n < 90; n++) s.step();
    expect(s.contacts.left).toBe(null);
  });
});
describe("camera-to-physics starter playability", () => {
  for (const [cameraStep, comfortGain, armMode] of [
    [8, 1.8, "anchors"],
    [12, 1.8, "anchors"],
    [8, 2.2, "anchors"],
    [8, 1.8, "reach"],
    [12, 1.8, "reach"],
    [8, 2.2, "reach"],
    [8, 1.8, "mirror"],
    [12, 1.8, "mirror"],
    [8, 2.2, "mirror"],
  ] as const)
    it(`completes the route in a compact centered camera box at ${120 / Number(cameraStep)}Hz and ${comfortGain} gain (${armMode})`, () => {
      const mirrored = armMode === "mirror";
      const c = new Camera({} as HTMLVideoElement),
        s = new Simulation(routes[0], "camera");
      c.calibration.comfortGain = Number(comfortGain);
      c.calibration.armGain = Number(comfortGain);
      c.calibration.armMode = armMode;
      const neutral = initialInputs();
      neutral.left.target = { x: -0.1, y: 0.15 };
      neutral.right.target = { x: 0.1, y: 0.15 };
      for (let n = 0; n < 8; n++) c.process(observation(neutral, n, n * 70));
      const anchors = {
        left: {
          x: s.rig.hand("left").x - s.rig.shoulder("left").x,
          y: s.rig.hand("left").y - s.rig.shoulder("left").y,
        },
        right: {
          x: s.rig.hand("right").x - s.rig.shoulder("right").x,
          y: s.rig.hand("right").y - s.rig.shoulder("right").y,
        },
      };
      c.recenter(
        anchors,
        mirrored
          ? { left: s.rig.pose("left", true), right: s.rig.pose("right", true) }
          : undefined,
      );
      c.onInput = (i) => s.setInput(i);
      const desired = initialInputs();
      desired.left.target = { ...anchors.left };
      desired.right.target = { ...anchors.right };
      let seq = 20;
      const advance = (ticks: number) => {
        for (let n = 0; n < ticks && s.state === "playing"; n++) {
          if (s.tick % Number(cameraStep) === 0) {
            const human = structuredClone(desired);
            for (const side of ["left", "right"] as const) {
              let p = desired[side].target;
              const l = Math.hypot(p.x, p.y);
              if (l > 0.745) p = { x: (p.x * 0.745) / l, y: (p.y * 0.745) / l };
              human[side].target = {
                x:
                  neutral[side].target.x +
                  (p.x - anchors[side].x) / Number(comfortGain),
                y:
                  neutral[side].target.y +
                  (p.y - anchors[side].y) / Number(comfortGain),
              };
            }
            const o = observation(human, seq++, 1000 + (s.tick * 1000) / 120);
            for (const d of o.detections)
              for (const p of d.points) {
                expect(p.x).toBeGreaterThan(0.02);
                expect(p.x).toBeLessThan(0.98);
                expect(p.y).toBeGreaterThan(0.02);
                expect(p.y).toBeLessThan(0.98);
              }
            c.process(o);
            if (armMode === "anchors") {
              expect(c.frameEdge.left || c.frameEdge.right).toBe(false);
              expect(c.resetSafe.left && c.resetSafe.right).toBe(true);
            }
          }
          s.step();
        }
      };
      s.start();
      advance(120);
      for (const [id, side] of [
        ["move-0", "left"],
        ["move-1", "right"],
        ["move-2", "left"],
        ["top", "right"],
        ["top", "left"],
      ] as const) {
        const h = s.route.holds.find((h) => h.id === id)!,
          other = side === "left" ? "right" : "left";
        desired[other].target = { x: other === "left" ? -0.1 : 0.1, y: 0.3 };
        for (let t = 0; t < 400 && s.state === "playing"; t++) {
          desired[side].target = {
            x:
              h.p.x +
              (h.match ? (side === "left" ? -0.09 : 0.09) : 0) -
              s.rig.shoulder(side).x,
            y: h.p.y - s.rig.shoulder(side).y,
          };
          desired[side].grip = t < 35 ? "release" : "jug";
          advance(1);
          if (s.contacts[side]?.hold.id === id) break;
        }
        expect(
          s.visited.has(id),
          JSON.stringify({
            ...s.summary(),
            id,
            angles: s.rig.torso.getAngle(),
            intents: c.currentInput,
            physical: Object.fromEntries(
              (["left", "right"] as const).map((side) => [
                side,
                {
                  hand: s.rig.hand(side),
                  shoulder: s.rig.shoulder(side),
                  aim: s.rig.aim(side, c.currentInput!),
                },
              ]),
            ),
          }),
        ).toBe(true);
        advance(50);
      }
      advance(100);
      expect(s.state).toBe("finished");
    });
  it("keeps relaxed fists stable at start and rebases a paused climb without moving bodies or changing resources", () => {
    const c = new Camera({} as HTMLVideoElement),
      sim = new Simulation(routes[0], "camera");
    const raw = initialInputs();
    raw.left.target = { x: -0.1, y: 0.15 };
    raw.right.target = { x: 0.1, y: 0.15 };
    for (let n = 0; n < 10; n++) c.process(observation(raw, n, n * 70));
    const anchors = {
      left: {
        x: sim.rig.hand("left").x - sim.rig.shoulder("left").x,
        y: sim.rig.hand("left").y - sim.rig.shoulder("left").y,
      },
      right: {
        x: sim.rig.hand("right").x - sim.rig.shoulder("right").x,
        y: sim.rig.hand("right").y - sim.rig.shoulder("right").y,
      },
    };
    c.recenter(anchors);
    c.onInput = (i) => sim.setInput(i);
    sim.start();
    for (let t = 0; t < 600; t++) {
      if (t % 8 === 0)
        c.process(observation(raw, 20 + t, 1000 + (t * 1000) / 120));
      sim.step();
    }
    expect(sim.catchCount).toBe(0);
    expect(sim.contacts.left?.hold.id).toBe("start-l");
    expect(sim.contacts.right?.hold.id).toBe("start-r");
    sim.pause();
    const before = structuredClone(sim.summary());
    raw.left.target = { x: -0.2, y: 0.3 };
    raw.right.target = { x: 0.2, y: 0.3 };
    c.process(observation(raw, 1000, 9000));
    c.recenter(anchors);
    expect(sim.summary()).toEqual(before);
  });
});
