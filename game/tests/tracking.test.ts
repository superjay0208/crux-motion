import { afterEach, describe, it, expect, vi } from "vitest";
import { IdentityTracker, type Detection } from "../src/tracking/identity";
import { elbowBend } from "../src/tracking/gestures";
import {
  GestureLatch,
  classify,
  prototype,
  features,
  OneEuro,
} from "../src/tracking/gestures";
import {
  HAND_LANDMARKER_CONFIDENCE,
  normalizeHolisticResult,
} from "../src/tracking/inference.worker";
import { Camera } from "../src/tracking/Camera";
import { cameraGrip } from "../src/tracking/upstream";
import { initialInputs } from "../src/core/types";
import {
  handShape,
  fistWithThumbNearIndex,
  observation,
} from "./fixtures/hands";
afterEach(() => vi.unstubAllGlobals());
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
  it("confirms ambiguous transitions over >=2 frames & >=50ms while latching high-confidence release and catch in 1 frame", () => {
    const l = new GestureLatch();
    // Ambiguous moderate-score release (0.40 <= score < 0.86, immediate = false) needs >=2 fresh frames & >=50ms.
    expect(l.update("release", 0.65, 100)).toBe("unknown");
    expect(l.update("release", 0.65, 100)).toBe("unknown");
    expect(l.update("release", 0.65, 140)).toBe("unknown");
    expect(l.update("release", 0.65, 160)).toBe("release");

    // Instant 1-frame catch from "release" when score >= 0.80.
    expect(l.update("jug", 0.85, 190)).toBe("jug");

    // Static hang protection: 1-frame noisy grip-to-grip flicker ("jug" -> "pinch") does NOT switch on frame 1.
    expect(l.update("pinch", 0.9, 220)).toBe("jug");
    expect(l.update("jug", 0.9, 250)).toBe("jug");

    // Instant 1-frame intentional release when score >= 0.86 or immediate = true.
    expect(l.update("release", 0.9, 280)).toBe("release");
    expect(l.update("crimp", 0.82, 310)).toBe("crimp");
    expect(l.update("release", 0.7, 340, true)).toBe("release");
  });
  it("shows persistent uncertainty without converting it into a release", () => {
    const l = new GestureLatch();
    expect(l.update("jug", 0.9, 100)).toBe("jug");
    expect(l.update("jug", 0.9, 180)).toBe("jug");
    expect(l.update("unknown", 0.1, 220)).toBe("jug");
    expect(l.update("unknown", 0.1, 300)).toBe("jug");
    expect(l.update("unknown", 0.1, 340)).toBe("unknown");
    expect(l.update("release", 0.65, 380)).toBe("unknown");
    expect(l.update("release", 0.65, 440)).toBe("release");
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

describe("holistic normalization and worker thresholds", () => {
  it("unwraps 2D HolisticLandmarker person arrays and lowers HandLandmarker thresholds to 0.45", () => {
    expect(HAND_LANDMARKER_CONFIDENCE).toEqual({
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
    const pose = Array.from({ length: 33 }, (_, i) => ({
      x: i === 15 ? 0.65 : i === 16 ? 0.35 : 0.5,
      y: 0.6,
      z: 0,
      visibility: 1,
    }));
    const leftPts = handShape("jug", { x: 0.65, y: 0.6 }, "left");
    const rightPts = handShape("crimp", { x: 0.35, y: 0.6 }, "right");
    const leftWorld = leftPts.map((p) => ({
      x: p.x - 0.65,
      y: p.y - 0.6,
      z: p.z ?? 0,
    }));
    const rightWorld = rightPts.map((p) => ({
      x: p.x - 0.35,
      y: p.y - 0.6,
      z: p.z ?? 0,
    }));
    const normalized = normalizeHolisticResult({
      poseLandmarks: [pose],
      leftHandLandmarks: [leftPts],
      leftHandWorldLandmarks: [leftWorld],
      rightHandLandmarks: [rightPts],
      rightHandWorldLandmarks: [rightWorld],
    });
    expect(normalized.pose).toHaveLength(33);
    expect(normalized.detections).toHaveLength(2);
    expect(normalized.detections[0].points).toHaveLength(21);
    expect(normalized.detections[0].world).toBe(leftWorld);
    expect(normalized.detections[1].world).toBe(rightWorld);
    const assigned = new IdentityTracker().assign(
      normalized.detections,
      normalized.pose,
      100,
    );
    expect(assigned.left?.points).toBe(leftPts);
    expect(assigned.right?.points).toBe(rightPts);

    const singleHand = normalizeHolisticResult({
      poseLandmarks: [pose],
      leftHandLandmarks: [leftPts],
      leftHandWorldLandmarks: [leftWorld],
      rightHandLandmarks: [],
      rightHandWorldLandmarks: [],
    });
    expect(singleHand.detections).toHaveLength(1);
    expect(singleHand.detections[0].label).toBe("Left");

    const empty = normalizeHolisticResult({
      poseLandmarks: [],
      leftHandLandmarks: [],
      leftHandWorldLandmarks: [],
      rightHandLandmarks: [],
      rightHandWorldLandmarks: [],
    });
    expect(empty.pose).toEqual([]);
    expect(empty.detections).toEqual([]);
  });
});

describe("ready-intent continuity and camera frame pipeline", () => {
  it("bridges <= 260ms hand-landmark motion-blur dropouts (down to 0.40 poseWrist visibility) while clearing on release or > 260ms occlusion", () => {
    const c = new Camera({} as HTMLVideoElement);
    const input = initialInputs();
    input.left.grip = "jug";
    input.left.target = { x: -0.2, y: 0.45 };
    const obs1 = observation(input, 1, 100);
    // Flip left palm ray downward to also verify undercling orientation continuity.
    obs1.detections[0].points[9].y = obs1.detections[0].points[0].y + 0.06;
    c.process(obs1);
    const obs2 = structuredClone(obs1);
    obs2.sequence = 2;
    obs2.t = 180;
    c.process(obs2);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);
    expect(c.currentInput!.left.orientation).toBe("down");

    // Multi-frame fast-pull motion-blur dropout (70ms..240ms <= 260ms) with dipped poseWrist.visibility = 0.42 (> 0.38)
    // and extrapolated poseWrist.y = 1.12 clamped safely into [0.005, 0.995].
    const drop1 = structuredClone(obs2);
    drop1.sequence = 3;
    drop1.t = 250;
    drop1.detections = [obs2.detections[1]];
    drop1.pose[15].visibility = 0.42;
    drop1.pose[15].y = 1.12;
    c.process(drop1);
    expect(c.currentInput!.left.quality).toBe(true);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);
    expect(c.currentInput!.left.orientation).toBe("down");
    expect(Number.isFinite(c.currentInput!.left.target.y)).toBe(true);

    const drop2 = structuredClone(drop1);
    drop2.sequence = 4;
    drop2.t = 410;
    c.process(drop2);
    expect(c.currentInput!.left.quality).toBe(true);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);

    // Reappearing at <= 260ms keeps continuous ready without a re-latch gap.
    const recover = structuredClone(obs2);
    recover.sequence = 5;
    recover.t = 430;
    c.process(recover);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);

    // Persistent dropout beyond 260ms transitions visibly to unknown with ready: false.
    const long1 = structuredClone(drop1);
    long1.sequence = 6;
    long1.t = 500;
    c.process(long1);
    expect(c.currentInput!.left.ready).toBe(true);
    const long2 = structuredClone(drop1);
    long2.sequence = 7;
    long2.t = 710;
    c.process(long2);
    expect(c.currentInput!.left.grip).toBe("unknown");
    expect(c.currentInput!.left.ready).toBe(false);

    // Immediate 1-frame clear on explicit release frame.
    const reJug = structuredClone(obs2);
    reJug.sequence = 8;
    reJug.t = 760;
    c.process(reJug);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);

    input.left.grip = "release";
    const rel = observation(input, 9, 800);
    c.process(rel);
    expect(c.currentInput!.left.grip).toBe("release");
    expect(c.currentInput!.left.ready).toBe(false);
    const afterRelDrop = structuredClone(rel);
    afterRelDrop.sequence = 10;
    afterRelDrop.t = 840;
    afterRelDrop.detections = [];
    c.process(afterRelDrop);
    expect(c.currentInput!.left.ready).toBe(false);
  });

  it("downscales >640px video frames preserving aspect ratio and schedules with requestVideoFrameCallback", async () => {
    const callbacks: { vfc?: () => void } = {};
    const cancelVfc = vi.fn();
    const requestVfc = vi.fn((cb: () => void) => {
      callbacks.vfc = cb;
      return 42;
    });
    const posted: any[] = [];
    let workerInstance: any = null;
    class MockWorker {
      onmessage: ((e: { data: any }) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      terminate = vi.fn();
      constructor() {
        workerInstance = this;
      }
      postMessage(msg: any) {
        posted.push(msg);
        if (msg.kind === "init") {
          queueMicrotask(() =>
            this.onmessage?.({ data: { kind: "ready", delegate: "GPU" } }),
          );
        }
      }
    }
    const bitmapCalls: any[] = [];
    vi.stubGlobal("Worker", MockWorker);
    vi.stubGlobal("location", { href: "http://127.0.0.1:4318/" });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (_source: unknown, opts?: unknown) => {
        bitmapCalls.push(opts);
        return { close: vi.fn() };
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
          getVideoTracks: () => [{ onended: null, stop: vi.fn() }],
        })),
      },
    });
    const video = {
      autoplay: false,
      muted: false,
      playsInline: false,
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
      currentTime: 0.033,
      srcObject: null,
      play: vi.fn(async () => {}),
      requestVideoFrameCallback: requestVfc,
      cancelVideoFrameCallback: cancelVfc,
    } as unknown as HTMLVideoElement;

    const cam = new Camera(video);
    await cam.start("paired");
    await Promise.resolve();
    expect(requestVfc).toHaveBeenCalledOnce();
    expect(bitmapCalls[0]).toEqual({
      resizeWidth: 640,
      resizeHeight: 360,
      resizeQuality: "low",
    });
    const frameMsg = posted.find((m) => m.kind === "frame");
    expect(frameMsg.width).toBe(640);
    expect(frameMsg.height).toBe(360);

    // Arrival of a new video frame while busy queues one replaceable pending frame.
    (video as any).currentTime = 0.066;
    callbacks.vfc?.();
    expect(bitmapCalls).toHaveLength(1);
    workerInstance.onmessage?.({ data: { kind: "skipped" } });
    await Promise.resolve();
    expect(bitmapCalls).toHaveLength(2);

    cam.stop();
    expect(cancelVfc).toHaveBeenCalledWith(42);

    // Fallback to requestAnimationFrame and native <=640px bitmap when rVFC is absent.
    const rafMock = vi.fn(() => 77);
    vi.stubGlobal("requestAnimationFrame", rafMock);
    const smallVideo = {
      autoplay: false,
      muted: false,
      playsInline: false,
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
      currentTime: 0.1,
      srcObject: null,
      play: vi.fn(async () => {}),
    } as unknown as HTMLVideoElement;
    const camFallback = new Camera(smallVideo);
    await camFallback.start("paired");
    await Promise.resolve();
    expect(rafMock).toHaveBeenCalled();
    expect(bitmapCalls.at(-1)).toBeUndefined();
    const lastFrameMsg = [...posted].reverse().find((m) => m.kind === "frame");
    expect(lastFrameMsg.width).toBe(640);
    expect(lastFrameMsg.height).toBe(480);
    camFallback.stop();
  });
});

describe("upstream gesture classifier and assisted grips", () => {
  it("mirrors metric world landmarks around 0 and protects Crimp, Pinch, and personal prototypes", () => {
    for (const grip of ["jug", "crimp", "pinch", "release"] as const) {
      const pts = handShape(grip, { x: 0.5, y: 0.5 }, "left").map((p) => ({
        ...p,
        y: 0.5 + ((p.y - 0.5) * 960) / 540,
      }));
      const world = handShape(grip, { x: 0, y: 0 }, "left");
      const res = cameraGrip(
        { points: pts, world, label: "Left", score: 0.99 },
        "left",
        960,
        540,
        {},
        "unknown",
      );
      expect(res.found.grip).toBe(grip);
      expect(res.scores?.world).toBe(true);
    }

    // Calibrated personal Crimp prototype with strong 3D fist curl must NOT be clobbered to Jug.
    const jugPts = handShape("jug", { x: 0.5, y: 0.5 }, "left").map((p) => ({
      ...p,
      y: 0.5 + ((p.y - 0.5) * 960) / 540,
    }));
    const jugWorld = handShape("jug", { x: 0, y: 0 }, "left");
    const fJug = features(jugPts, 960, 540);
    const personalCrimp = { crimp: prototype([fJug, fJug]) };
    const keptCrimp = cameraGrip(
      { points: jugPts, world: jugWorld, label: "Left", score: 0.99 },
      "left",
      960,
      540,
      personalCrimp,
      "crimp",
    );
    expect(keptCrimp.scores!.fist).toBeGreaterThan(0.72);
    expect(keptCrimp.found.grip).toBe("crimp");
  });

  it("recognizes foreshortened splayed open hands as release without misclassifying cupped sloper", () => {
    const baseOpen = handShape("release", { x: 0.5, y: 0.5 }, "left");
    // Foreshorten fingers in 2D (compact < 1.75) with splayed finger angles and slightly relaxed pinky.
    const spreadAngles = [-0.24, -0.08, 0.08, 0.24];
    const foreshortened = baseOpen.map((p, idx) => {
      if (idx === 0) return { ...p };
      const finger = Math.floor((idx - 5) / 4);
      const splay = idx >= 5 ? spreadAngles[finger] * ((idx - 5) % 4) * 0.012 : 0;
      const pinkyRelax = idx >= 19 ? 0.012 : 0;
      return {
        x: p.x + splay,
        y: 0.5 + (p.y - 0.5) * 0.68 * (960 / 540) + pinkyRelax,
        z: (p.z ?? 0) - (idx >= 5 ? 0.02 : 0),
      };
    });
    const res = cameraGrip(
      { points: foreshortened, label: "Left", score: 0.99 },
      "left",
      960,
      540,
      {},
      "jug",
    );
    expect(res.scores!.open).toBeGreaterThan(0.78);
    expect(res.found.grip).toBe("release");
  });

  it("keeps assistedGrips strict false by default and accepts any confirmed grasp when enabled", () => {
    const cam = new Camera({} as HTMLVideoElement);
    expect(cam.assistedGrips).toBe(false);
    expect(cam.acceptsGrip("pinch", "jug")).toBe(false);
    expect(cam.acceptsGrip("jug", "crimp")).toBe(false);
    expect(cam.acceptsGrip("crimp", "jug")).toBe(false);

    cam.calibration.assistedGrips = true;
    expect(cam.assistedGrips).toBe(true);
    expect(cam.acceptsGrip("pinch", "jug")).toBe(true);
    expect(cam.acceptsGrip("jug", "crimp")).toBe(true);
    expect(cam.acceptsGrip("jug", "pinch")).toBe(true);
    expect(cam.acceptsGrip("release", "jug")).toBe(false);
    expect(cam.acceptsGrip("unknown", "jug")).toBe(false);
  });

  it("separates Jug, Crimp, Pinch, and Release with >= 0.25 class margin and never misclassifies thumb-near-index fist as Pinch", () => {
    for (const side of ["left", "right"] as const) {
      for (const grip of ["jug", "crimp", "pinch", "release"] as const) {
        const pts = handShape(grip, { x: 0.5, y: 0.5 }, side).map((p) => ({
          ...p,
          y: 0.5 + ((p.y - 0.5) * 960) / 540,
        }));
        const world = handShape(grip, { x: 0, y: 0 }, side);
        const geo = classify(features(pts, 960, 540));
        expect(geo.grip).toBe(grip);
        const geoSorted = Object.values(geo.classes).sort((a, b) => b - a);
        expect(geo.classes[grip]).toBe(geoSorted[0]);
        expect(geoSorted[0] - geoSorted[1]).toBeGreaterThanOrEqual(0.25);

        const up = cameraGrip(
          {
            points: pts,
            world,
            label: side === "left" ? "Left" : "Right",
            score: 0.99,
          },
          side,
          960,
          540,
          {},
          "unknown",
        );
        expect(up.found.grip).toBe(grip);
        expect(up.scores?.classes).toEqual(up.classes);
        const upSorted = Object.values(up.classes).sort((a, b) => b - a);
        expect(up.classes[grip]).toBe(upSorted[0]);
        expect(upSorted[0] - upSorted[1]).toBeGreaterThanOrEqual(0.25);
      }

      // Negative test: rolled fist with thumb resting near curled index finger must stay Jug, never Pinch
      const fistPts = fistWithThumbNearIndex({ x: 0.5, y: 0.5 }, side).map(
        (p) => ({
          ...p,
          y: 0.5 + ((p.y - 0.5) * 960) / 540,
        }),
      );
      const fistWorld = fistWithThumbNearIndex({ x: 0, y: 0 }, side);
      const fistGeo = classify(features(fistPts, 960, 540));
      expect(fistGeo.grip).toBe("jug");
      expect(fistGeo.classes.jug - fistGeo.classes.pinch).toBeGreaterThanOrEqual(
        0.25,
      );
      const fistGeoSorted = Object.values(fistGeo.classes).sort((a, b) => b - a);
      expect(fistGeoSorted[0] - fistGeoSorted[1]).toBeGreaterThanOrEqual(0.25);

      const fistUp = cameraGrip(
        {
          points: fistPts,
          world: fistWorld,
          label: side === "left" ? "Left" : "Right",
          score: 0.99,
        },
        side,
        960,
        540,
        {},
        "unknown",
      );
      expect(fistUp.found.grip).toBe("jug");
      expect(fistUp.classes.jug - fistUp.classes.pinch).toBeGreaterThanOrEqual(
        0.25,
      );
      const fistUpSorted = Object.values(fistUp.classes).sort((a, b) => b - a);
      expect(fistUpSorted[0] - fistUpSorted[1]).toBeGreaterThanOrEqual(0.25);
    }

    // Verify Camera.classScores[side] updates live and strips legacy sloper prototype
    const saved = {
      version: 1,
      controlRevision: 2,
      reach: 0.44,
      armMode: "anchors",
      prototypes: {
        sloper: { mean: Array(18).fill(0.3), spread: Array(18).fill(0.1) },
        jug: { mean: Array(18).fill(0.5), spread: Array(18).fill(0.1) },
      },
    };
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem,
    });
    const cam = new Camera({} as HTMLVideoElement);
    expect("sloper" in cam.calibration.prototypes).toBe(false);
    expect(cam.calibration.prototypes.jug).toBeDefined();
    expect(setItem).toHaveBeenCalledOnce();
    const input = initialInputs();
    input.left.grip = "pinch";
    input.right.grip = "crimp";
    cam.process(observation(input, 1, 100));
    expect(cam.classScores.left.pinch - cam.classScores.left.jug).toBeGreaterThanOrEqual(0.25);
    expect(cam.classScores.right.crimp - cam.classScores.right.jug).toBeGreaterThanOrEqual(0.25);
  });

  it("latches rapid fist uncurling and simultaneous dual-hand dyno release in 1 frame (0ms lag) and catches airborne grips in 1 frame", () => {
    const cam = new Camera({} as HTMLVideoElement);
    const input = initialInputs();
    input.left.grip = "jug";
    input.right.grip = "jug";
    cam.process(observation(input, 1, 100));
    expect(cam.currentInput!.left.grip).toBe("jug");
    expect(cam.currentInput!.left.ready).toBe(true);
    expect(cam.currentInput!.right.grip).toBe("jug");
    expect(cam.currentInput!.right.ready).toBe(true);

    // Build a mid-uncurl left hand (~53% uncurled, foreshortened in 2D so compact < 1.32)
    // to exercise the velocity-aware prevShape uncurling promoter directly on frame 2 (dt = 33ms).
    const obsUncurl = observation(input, 2, 133);
    const wristL = obsUncurl.pose[15];
    const u = 0.54;
    const angles = [65 * (1 - u), 100 * (1 - u), 60 * (1 - u)];
    const positions = [-0.5, -0.16, 0.18, 0.5],
      bases = [1.1, 1.25, 1.17, 1.0];
    const pts = Array.from({ length: 21 }, () => ({
      x: wristL.x,
      y: wristL.y,
      z: 0,
    }));
    for (let finger = 0; finger < 4; finger++) {
      const base = 5 + finger * 4;
      let y = bases[finger] * 0.76,
        z = 0,
        ang = 0;
      pts[base] = {
        x: wristL.x + positions[finger] * 0.055,
        y: wristL.y - (y * 0.055 * 960) / 540,
        z: 0,
      };
      for (let joint = 0; joint < 3; joint++) {
        ang += (angles[joint] * Math.PI) / 180;
        const length = [0.55, 0.35, 0.25][joint] * (finger === 3 ? 0.8 : 1) * 0.76;
        y += Math.cos(ang) * length;
        z += Math.sin(ang) * length;
        const splay = positions[finger] * 0.08 * (joint + 1) * 0.055;
        pts[base + joint + 1] = {
          x: pts[base].x + splay,
          y: wristL.y - (y * 0.055 * 960) / 540,
          z: -z * 0.055,
        };
      }
    }
    pts[1] = { x: wristL.x - 0.4 * 0.055, y: wristL.y - (0.3 * 0.055 * 960) / 540, z: 0 };
    pts[2] = { x: wristL.x - 0.8 * 0.055, y: wristL.y - (0.55 * 0.055 * 960) / 540, z: 0 };
    pts[3] = { x: wristL.x - 1.0 * 0.055, y: wristL.y - (0.78 * 0.055 * 960) / 540, z: 0 };
    pts[4] = { x: wristL.x - 1.25 * 0.055, y: wristL.y - (0.9 * 0.055 * 960) / 540, z: 0 };
    obsUncurl.detections[0].points = pts;

    cam.process(obsUncurl);
    expect(cam.currentInput!.left.grip).toBe("release");
    expect(cam.currentInput!.left.ready).toBe(false);
    expect(cam.currentInput!.right.grip).toBe("jug");

    // 1-frame instant airborne catch from "release" -> "jug", "crimp", and "pinch".
    for (const [idx, catchGrip] of (["jug", "crimp", "pinch"] as const).entries()) {
      const tBase = 200 + idx * 100;
      input.left.grip = "release";
      input.right.grip = "release";
      cam.process(observation(input, 10 + idx * 2, tBase));
      expect(cam.currentInput!.left.grip).toBe("release");
      expect(cam.currentInput!.left.ready).toBe(false);
      expect(cam.currentInput!.right.grip).toBe("release");
      expect(cam.currentInput!.right.ready).toBe(false);

      input.left.grip = catchGrip;
      input.right.grip = catchGrip;
      cam.process(observation(input, 11 + idx * 2, tBase + 33));
      expect(cam.currentInput!.left.grip).toBe(catchGrip);
      expect(cam.currentInput!.left.ready).toBe(true);
      expect(cam.currentInput!.right.grip).toBe(catchGrip);
      expect(cam.currentInput!.right.ready).toBe(true);
    }

    // Simultaneous two-hand dyno release latches BOTH hands on Frame 1 with zero stagger.
    input.left.grip = "release";
    input.right.grip = "release";
    cam.process(observation(input, 30, 600));
    expect(cam.currentInput!.left.grip).toBe("release");
    expect(cam.currentInput!.right.grip).toBe("release");
    expect(cam.currentInput!.left.ready).toBe(false);
    expect(cam.currentInput!.right.ready).toBe(false);
  });
});
