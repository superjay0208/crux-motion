import { describe, expect, it } from "vitest";
import { Camera } from "../src/tracking/Camera";
import { InputProtection } from "../src/tracking/motion";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { initialInputs, gripFits } from "../src/core/types";
import { observation, handShape } from "./fixtures/hands";
import { classify, features, prototype } from "../src/tracking/gestures";
describe("geometric gesture fixtures", () => {
  it("accepts a curled Crimp grasp on a Jug without making precise holds interchangeable", () => {
    expect(gripFits("crimp", "jug")).toBe(false);
    expect(gripFits("jug", "crimp")).toBe(false);
    expect(gripFits("pinch", "jug")).toBe(false);
    const p = handShape("crimp");
    // Thumb wraps over curled index near MCP, not touching fingertips
    p[4] = { x: p[5].x + 0.01, y: p[5].y - 0.01, z: 0 };
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
  for (const grip of ["jug", "crimp", "pinch", "release"] as const)
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
  it("completes a compact webcam dyno on Launchpad across a top-of-pull pause and staggered camera-frame release", () => {
    const c = new Camera({} as HTMLVideoElement),
      sim = new Simulation(routes[6], "camera");
    c.calibration.comfortGain = 1.8;
    c.calibration.armMode = "anchors";
    const neutral = initialInputs();
    neutral.left.target = { x: -0.1, y: 0.18 };
    neutral.right.target = { x: 0.1, y: 0.18 };
    for (let n = 0; n < 8; n++) c.process(observation(neutral, n, n * 33));
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

    const human = structuredClone(neutral);
    let seq = 20;
    const stepWebcam = (ticks: number) => {
      for (let n = 0; n < ticks && sim.state === "playing"; n++) {
        if (sim.tick % 4 === 0) {
          const o = observation(human, seq++, 500 + (sim.tick * 1000) / 120);
          for (const d of o.detections)
            for (const p of d.points) {
              expect(p.x).toBeGreaterThan(0.02);
              expect(p.x).toBeLessThan(0.98);
              expect(p.y).toBeGreaterThan(0.02);
              expect(p.y).toBeLessThan(0.98);
            }
          c.process(o);
        }
        sim.step();
      }
    };

    // Settle, then do a compact ~11cm physical downward pull inside the webcam box (mapped * 1.8 gain = ~20cm game pull).
    stepWebcam(32);
    for (let f = 0; f < 6; f++) {
      const drop = 0.11 * ((f + 1) / 6);
      human.left.target.y = neutral.left.target.y - drop;
      human.right.target.y = neutral.right.target.y - drop;
      stepWebcam(4);
    }
    expect(sim.dynoReady).toBe(true);
    expect(sim.dynoWindowRemaining).toBeGreaterThan(0.8);

    // Pause stationary at top of pull for 24 ticks (200ms), then stagger left/right finger spread by 20 ticks (5 webcam frames).
    stepWebcam(24);
    expect(sim.dynoReady).toBe(true);
    human.left.grip = "release";
    stepWebcam(20);
    expect(sim.dynoReady).toBe(true);
    human.right.grip = "release";
    stepWebcam(8);
    expect(sim.dynoLaunch).toBe(true);

    // Reach up to Launchpad's CATCH bucket (move-0) and close fists to stick the dyno!
    const catchHold = sim.route.holds.find((h) => h.id === "move-0")!;
    for (let t = 0; t < 20 && !(sim.contacts.left && sim.contacts.right); t++) {
      for (const side of ["left", "right"] as const) {
        const patchX = catchHold.p.x + (side === "left" ? -0.09 : 0.09);
        const gameTarget = {
          x: patchX - sim.rig.shoulder(side).x,
          y: catchHold.p.y - sim.rig.shoulder(side).y,
        };
        human[side].target = {
          x: neutral[side].target.x + (gameTarget.x - anchors[side].x) / 1.8,
          y: neutral[side].target.y + (gameTarget.y - anchors[side].y) / 1.8,
        };
        human[side].grip = t >= 2 ? "jug" : "release";
      }
      stepWebcam(4);
    }
    expect(sim.contacts.left?.hold.id).toBe("move-0");
    expect(sim.contacts.right?.hold.id).toBe("move-0");
    expect(sim.flew).toBe(true);
  });

  it("stress-tests bottom-edge pull (wrist.y = 0.985, visibility = 0.42 dropout), 0.38x Dyno Focus reaction window, 22-tick staggered uncurl, and assistDynoFlight across Launchpad (motion-07) and Ricochet (motion-10)", () => {
    const shiftDeskCameraY = (
      obs: ReturnType<typeof observation>,
      dy: number,
    ) => {
      for (const p of obs.pose) {
        p.y = Math.min(0.994, p.y + dy);
      }
      for (const d of obs.detections) {
        const poseIdx = d.label === "left" ? 15 : 16;
        for (const pt of d.points) {
          pt.y = Math.min(0.994, pt.y + dy);
        }
        obs.pose[poseIdx].y = d.points[0].y;
      }
      return obs;
    };

    // 1. Launchpad (motion-07): extreme bottom-edge downward pull (wrist.y ~ 0.985) + visibility = 0.42 dropout + 0.38x slow-mo + 22-tick stagger + assistDynoFlight
    {
      const c = new Camera({} as HTMLVideoElement),
        prot = new InputProtection(),
        sim = new Simulation(routes[6], "camera");
      c.calibration.comfortGain = 2.1;
      c.calibration.armMode = "anchors";
      let pauseTriggers = 0;
      let wallMs = 100;
      let seq = 1;
      c.onInput = (inp) => {
        const guarded = prot.accept(inp, wallMs);
        const activeDyno =
          sim.dynoCharge > 0.28 || sim.dynoReady || sim.flight > 0;
        const edgePause =
          !activeDyno && (c.frameEdge.left || c.frameEdge.right);
        if (guarded.pause || edgePause) pauseTriggers++;
        sim.setInput(guarded.input);
      };

      const deskDy = 0.377; // neutral wrist.y ~ 0.897 (inside resetSafe), pull wrist.y ~ 0.985!
      const neutral = initialInputs();
      neutral.left.target = { x: -0.1, y: 0.16 };
      neutral.right.target = { x: 0.1, y: 0.16 };
      for (let n = 0; n < 8; n++) {
        wallMs += 33.33;
        c.process(
          shiftDeskCameraY(observation(neutral, seq++, wallMs), deskDy),
        );
      }
      const startAnchors = {
        left: {
          x: sim.rig.hand("left").x - sim.rig.shoulder("left").x,
          y: sim.rig.hand("left").y - sim.rig.shoulder("left").y,
        },
        right: {
          x: sim.rig.hand("right").x - sim.rig.shoulder("right").x,
          y: sim.rig.hand("right").y - sim.rig.shoulder("right").y,
        },
      };
      c.recenter(startAnchors);
      prot.reset();
      prot.accept(c.currentInput!, wallMs);
      sim.setInput(c.currentInput!);
      sim.start();

      const human = structuredClone(neutral);
      let acc = 0;
      let maxObservedWristY = 0;
      const advanceRealMs = (
        ms: number,
        timeScale: number,
        opts?: { poseOnlyVis?: number },
      ) => {
        const frames = Math.max(1, Math.round(ms / (1000 / 30)));
        const frameDt = ms / 1000 / frames;
        let stepped = 0;
        for (let f = 0; f < frames && sim.state === "playing"; f++) {
          wallMs += frameDt * 1000;
          const o = shiftDeskCameraY(
            observation(human, seq++, wallMs),
            deskDy,
          );
          maxObservedWristY = Math.max(
            maxObservedWristY,
            o.pose[15].y,
            o.pose[16].y,
          );
          if (opts?.poseOnlyVis !== undefined) {
            o.detections = [];
            o.pose[15].visibility = opts.poseOnlyVis;
            o.pose[16].visibility = opts.poseOnlyVis;
          }
          c.process(o);
          expect(c.frameEdge.left).toBe(false);
          expect(c.frameEdge.right).toBe(false);
          acc += frameDt * timeScale;
          while (acc >= sim.dt) {
            sim.step();
            stepped++;
            acc -= sim.dt;
          }
        }
        return stepped;
      };

      // Settle briefly at 1.0x
      advanceRealMs(200, 1.0);

      // Pull sharply down to bottom edge (wrist.y ~ 0.985), including poseWrist visibility = 0.42 hand-detection dropout frames!
      for (let f = 0; f < 6; f++) {
        const drop = 0.175 * ((f + 1) / 6);
        human.left.target.y = neutral.left.target.y - drop;
        human.right.target.y = neutral.right.target.y - drop;
        const isDropout = f === 3 || f === 4;
        advanceRealMs(33.33, 1.0, {
          poseOnlyVis: isDropout ? 0.42 : undefined,
        });
      }
      expect(maxObservedWristY).toBeGreaterThan(0.983);
      expect(maxObservedWristY).toBeLessThan(0.988);
      expect(pauseTriggers).toBe(0);
      expect(sim.dynoReady).toBe(true);
      const peakLaunchVec = { ...sim.dynoVector };
      expect(peakLaunchVec.y).toBeGreaterThan(2.0);

      // Hold 0.50 s real wall-clock reaction pause at wrist.y ~ 0.985 under 0.38x Dyno Focus slow-mo (~23 sim ticks < 60-tick dyno window!)
      const focusSteps = advanceRealMs(500, 0.38);
      expect(focusSteps).toBeGreaterThanOrEqual(21);
      expect(focusSteps).toBeLessThanOrEqual(25);
      expect(sim.dynoReady).toBe(true);
      expect(sim.dynoWindowRemaining).toBeGreaterThan(0.35);
      expect(pauseTriggers).toBe(0);

      // Rapid uncurl left hand first, wait 22 sim ticks under 0.38x slow-mo, then uncurl right hand -> dynoLaunch + assistDynoFlight!
      human.left.grip = "release";
      let staggerTicks = 0;
      while (staggerTicks < 22) {
        staggerTicks += advanceRealMs(33.33, 0.38);
      }
      expect(sim.dynoReady).toBe(true);
      human.right.grip = "release";
      advanceRealMs(33.33, 1.0);
      expect(sim.dynoLaunch).toBe(true);
      expect(c.assistDynoFlight(peakLaunchVec)).toBe(true);

      // Return physical hands to comfortable chest-chin height -> overhead catch on Launchpad's CATCH bucket (move-0)!
      const catchHold = sim.route.holds.find((h) => h.id === "move-0")!;
      const snap = c.comfort.snapshot!;
      for (
        let f = 0;
        f < 20 && !(sim.contacts.left && sim.contacts.right);
        f++
      ) {
        for (const side of ["left", "right"] as const) {
          const patchX = catchHold.p.x + (side === "left" ? -0.09 : 0.09);
          const gameTarget = {
            x: patchX - sim.rig.shoulder(side).x,
            y: catchHold.p.y - sim.rig.shoulder(side).y,
          };
          human[side].target = {
            x:
              snap.centers[side].x +
              (gameTarget.x - snap.anchors[side].x) / 2.1,
            y:
              snap.centers[side].y +
              (gameTarget.y - snap.anchors[side].y) / 2.1,
          };
          // Thanks to assistDynoFlight, aiming overhead at CATCH stays comfortably near chest height!
          expect(human[side].target.y).toBeLessThan(neutral[side].target.y + 0.12);
          human[side].grip = f >= 3 ? "jug" : "release";
        }
        advanceRealMs(33.33, 1.0);
      }
      expect(sim.contacts.left?.hold.id).toBe("move-0");
      expect(sim.contacts.right?.hold.id).toBe("move-0");
      expect(sim.flew).toBe(true);
      expect(pauseTriggers).toBe(0);
    }

    // 2. Ricochet (motion-10): match offset LAUNCH jug (move-0), build diagonal swing/pull + 0.38x reaction + 22-tick stagger + catch move-1
    {
      const c = new Camera({} as HTMLVideoElement),
        prot = new InputProtection(),
        sim = new Simulation(routes[9], "camera");
      c.calibration.comfortGain = 2.1;
      c.calibration.armMode = "anchors";
      let pauseTriggers = 0;
      let wallMs = 100;
      let seq = 1;
      c.onInput = (inp) => {
        const guarded = prot.accept(inp, wallMs);
        const activeDyno =
          sim.dynoCharge > 0.28 || sim.dynoReady || sim.flight > 0;
        const edgePause =
          !activeDyno && (c.frameEdge.left || c.frameEdge.right);
        if (guarded.pause || edgePause) pauseTriggers++;
        sim.setInput(guarded.input);
      };

      // Attach climber on Ricochet's LAUNCH match hold (move-0 at (-0.28, 1.40)) to test diagonal dyno across the wall
      const launchHold = sim.route.holds.find((h) => h.id === "move-0")!;
      const catchHold = sim.route.holds.find((h) => h.id === "move-1")!;
      const neutral = initialInputs();
      neutral.left.target = { x: -0.1, y: 0.18 };
      neutral.right.target = { x: 0.1, y: 0.18 };
      for (let n = 0; n < 8; n++) {
        wallMs += 33.33;
        c.process(shiftDeskCameraY(observation(neutral, seq++, wallMs), 0.2));
      }
      const startAnchors = {
        left: {
          x: sim.rig.hand("left").x - sim.rig.shoulder("left").x,
          y: sim.rig.hand("left").y - sim.rig.shoulder("left").y,
        },
        right: {
          x: sim.rig.hand("right").x - sim.rig.shoulder("right").x,
          y: sim.rig.hand("right").y - sim.rig.shoulder("right").y,
        },
      };
      c.recenter(startAnchors);
      prot.reset();
      prot.accept(c.currentInput!, wallMs);
      sim.setInput(c.currentInput!);
      sim.start();

      const human = structuredClone(neutral);
      let acc = 0;
      const advanceRealMs = (ms: number, timeScale: number) => {
        const frames = Math.max(1, Math.round(ms / (1000 / 30)));
        const frameDt = ms / 1000 / frames;
        let stepped = 0;
        for (let f = 0; f < frames && sim.state === "playing"; f++) {
          wallMs += frameDt * 1000;
          c.process(shiftDeskCameraY(observation(human, seq++, wallMs), 0.2));
          acc += frameDt * timeScale;
          while (acc >= sim.dt) {
            sim.step();
            stepped++;
            acc -= sim.dt;
          }
        }
        return stepped;
      };

      // Climb from start holds onto move-0 (LAUNCH) with both hands
      for (const side of ["left", "right"] as const) {
        const other = side === "left" ? "right" : "left";
        human[other].target = {
          x: neutral[other].target.x,
          y: neutral[other].target.y - 0.05,
        };
        for (let f = 0; f < 30 && sim.contacts[side]?.hold.id !== "move-0"; f++) {
          const patchX = launchHold.p.x + (side === "left" ? -0.09 : 0.09);
          const gameTarget = {
            x: patchX - sim.rig.shoulder(side).x,
            y: launchHold.p.y - sim.rig.shoulder(side).y,
          };
          human[side].target = {
            x: neutral[side].target.x + (gameTarget.x - startAnchors[side].x) / 2.1,
            y: neutral[side].target.y + (gameTarget.y - startAnchors[side].y) / 2.1,
          };
          human[side].grip = f < 3 ? "release" : "jug";
          advanceRealMs(33.33, 1.0);
        }
        expect(sim.contacts[side]?.hold.id).toBe("move-0");
      }

      // Recenter on move-0 so physical hands are relaxed at neutral before the Ricochet dyno
      human.left.target = { ...neutral.left.target };
      human.right.target = { ...neutral.right.target };
      human.left.grip = "jug";
      human.right.grip = "jug";
      for (let n = 0; n < 4; n++) {
        wallMs += 33.33;
        c.process(shiftDeskCameraY(observation(human, seq++, wallMs), 0.2));
      }
      const launchAnchors = {
        left: {
          x: sim.rig.hand("left").x - sim.rig.shoulder("left").x,
          y: sim.rig.hand("left").y - sim.rig.shoulder("left").y,
        },
        right: {
          x: sim.rig.hand("right").x - sim.rig.shoulder("right").x,
          y: sim.rig.hand("right").y - sim.rig.shoulder("right").y,
        },
      };
      c.recenter(launchAnchors);
      sim.setInput(c.currentInput!);
      advanceRealMs(200, 1.0);

      // Drive hands down-and-left so climber rockets up-and-right toward move-1 (0.24, 1.84)!
      for (let f = 0; f < 7; f++) {
        const u = (f + 1) / 7;
        human.left.target = {
          x: neutral.left.target.x - 0.11 * u,
          y: neutral.left.target.y - 0.15 * u,
        };
        human.right.target = {
          x: neutral.right.target.x - 0.11 * u,
          y: neutral.right.target.y - 0.15 * u,
        };
        advanceRealMs(33.33, 1.0);
      }
      expect(sim.dynoReady).toBe(true);
      const ricochetVec = { ...sim.dynoVector };
      expect(ricochetVec.x).toBeGreaterThan(0.5);
      expect(ricochetVec.y).toBeGreaterThan(1.8);

      // 0.50 s real wall-clock reaction pause at 0.38x Dyno Focus (~23 sim ticks) + 22-tick staggered dual release!
      advanceRealMs(500, 0.38);
      expect(sim.dynoReady).toBe(true);
      human.left.grip = "release";
      let stagger = 0;
      while (stagger < 22) {
        stagger += advanceRealMs(33.33, 0.38);
      }
      expect(sim.dynoReady).toBe(true);
      human.right.grip = "release";
      advanceRealMs(33.33, 1.0);
      expect(sim.dynoLaunch).toBe(true);
      expect(c.assistDynoFlight(ricochetVec)).toBe(true);

      // Aim toward Ricochet's CATCH hold (move-1) and close fists to stick the diagonal dyno!
      for (
        let f = 0;
        f < 22 && !(sim.contacts.left || sim.contacts.right);
        f++
      ) {
        const snap = c.comfort.snapshot!;
        for (const side of ["left", "right"] as const) {
          const patchX = catchHold.p.x + (side === "left" ? -0.09 : 0.09);
          const gameTarget = {
            x: patchX - sim.rig.shoulder(side).x,
            y: catchHold.p.y - sim.rig.shoulder(side).y,
          };
          human[side].target = {
            x:
              snap.centers[side].x +
              (gameTarget.x - snap.anchors[side].x) / 2.1,
            y:
              snap.centers[side].y +
              (gameTarget.y - snap.anchors[side].y) / 2.1,
          };
          human[side].grip = f >= 2 ? "jug" : "release";
        }
        advanceRealMs(33.33, 1.0);
      }
      expect(
        sim.contacts.left?.hold.id === "move-1" ||
          sim.contacts.right?.hold.id === "move-1",
      ).toBe(true);
      expect(sim.flew).toBe(true);
      expect(pauseTriggers).toBe(0);
    }
  });
});
