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
import { handShape, observation } from "./fixtures/hands";
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
  it("bridges <= 140ms hand-landmark dropouts while clearing on release or > 140ms occlusion", () => {
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

    // 1-2 frame closed-fist dropout (70ms and 135ms <= 140ms) with pose wrist still tracked.
    const drop1 = structuredClone(obs2);
    drop1.sequence = 3;
    drop1.t = 250;
    drop1.detections = [obs2.detections[1]];
    c.process(drop1);
    expect(c.currentInput!.left.quality).toBe(true);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);
    expect(c.currentInput!.left.orientation).toBe("down");

    const drop2 = structuredClone(drop1);
    drop2.sequence = 4;
    drop2.t = 315;
    c.process(drop2);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);

    // Reappearing at 140ms keeps continuous ready without a re-latch gap.
    const recover = structuredClone(obs2);
    recover.sequence = 5;
    recover.t = 320;
    c.process(recover);
    expect(c.currentInput!.left.grip).toBe("jug");
    expect(c.currentInput!.left.ready).toBe(true);

    // Persistent dropout beyond 140ms transitions visibly to unknown with ready: false.
    const long1 = structuredClone(drop1);
    long1.sequence = 6;
    long1.t = 380;
    c.process(long1);
    expect(c.currentInput!.left.ready).toBe(true);
    const long2 = structuredClone(drop1);
    long2.sequence = 7;
    long2.t = 490;
    c.process(long2);
    expect(c.currentInput!.left.grip).toBe("unknown");
    expect(c.currentInput!.left.ready).toBe(false);

    // Immediate clear on explicit release frame.
    const reJug1 = structuredClone(obs2);
    reJug1.sequence = 8;
    reJug1.t = 560;
    c.process(reJug1);
    const reJug2 = structuredClone(obs2);
    reJug2.sequence = 9;
    reJug2.t = 640;
    c.process(reJug2);
    expect(c.currentInput!.left.ready).toBe(true);

    input.left.grip = "release";
    const rel = observation(input, 10, 680);
    c.process(rel);
    expect(c.currentInput!.left.ready).toBe(false);
    const afterRelDrop = structuredClone(rel);
    afterRelDrop.sequence = 11;
    afterRelDrop.t = 720;
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
  it("mirrors metric world landmarks around 0 and protects Crimp, Pinch, Sloper and personal prototypes", () => {
    for (const grip of ["jug", "crimp", "sloper", "pinch", "release"] as const) {
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
    expect(cam.acceptsGrip("crimp", "jug")).toBe(true);

    cam.calibration.assistedGrips = true;
    expect(cam.assistedGrips).toBe(true);
    expect(cam.acceptsGrip("pinch", "jug")).toBe(true);
    expect(cam.acceptsGrip("jug", "crimp")).toBe(true);
    expect(cam.acceptsGrip("sloper", "pinch")).toBe(true);
    expect(cam.acceptsGrip("release", "jug")).toBe(false);
    expect(cam.acceptsGrip("unknown", "jug")).toBe(false);
  });
});
