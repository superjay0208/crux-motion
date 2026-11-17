import {
  features,
  classify,
  GestureLatch,
  OneEuro,
  prototype,
  validFeatures,
  type Landmark,
  type Features,
  type Prototypes,
} from "./gestures";
import { IdentityTracker, type Detection } from "./identity";
import { elbowBend } from "./gestures";
import {
  hands,
  type Hand,
  type Inputs,
  type Grip,
  type ArmPose,
} from "../core/types";
import { v, dist, type V } from "../core/math";
import { ReachMapper, ComfortFrame } from "./motion";
import { ArmMirror, armOffset, observedArm } from "./arms";
import { PositionSignal, cameraGrip } from "./upstream";
export type Observation = {
  kind: "result";
  pose: Landmark[];
  detections: Detection[];
  t: number;
  width: number;
  height: number;
  inferenceMs: number;
  sequence: number;
};
export type Calibration = {
  version: 1;
  controlRevision?: 2;
  prototypes: Prototypes;
  span: number;
  reach: number;
  mirrorLabels: boolean;
  provider: string;
  motionGain?: number;
  usePersonalGrips?: boolean;
  comfortGain?: number;
  armMode?: "anchors" | "mirror" | "reach";
  armGain?: number;
  orientations?: Partial<Record<"down" | "side", number[]>>;
};
export class Camera {
  mapper = new ReachMapper();
  comfort = new ComfortFrame();
  arms = { left: new ArmMirror(), right: new ArmMirror() };
  private targets = { left: v(-0.12, 0.6), right: v(0.12, 0.6) };
  get maxFrameAgeMs() {
    return Math.max(300, Math.min(550, this.inferenceMs * 3 + 60));
  }
  private bendHint = { left: -1, right: 1 };
  worker: Worker | null = null;
  stream: MediaStream | null = null;
  ready = false;
  busy = false;
  running = false;
  provider = "paired";
  sequence = 0;
  lastResult = 0;
  lastVideo = -1;
  latencies: number[] = [];
  inferenceMs = 0;
  fps = 0;
  private lastT = 0;
  identity = new IdentityTracker();
  latches = { left: new GestureLatch(), right: new GestureLatch() };
  filters = {
    left: [new OneEuro(), new OneEuro()],
    right: [new OneEuro(), new OneEuro()],
  };
  calibration: Calibration = {
    version: 1,
    controlRevision: 2,
    armMode: "anchors",
    prototypes: {},
    span: 0.23,
    reach: 0.44,
    mirrorLabels: false,
    provider: "paired",
  };
  observation: Observation | null = null;
  assigned: Partial<Record<Hand, Detection>> = {};
  currentFeatures: Partial<Record<Hand, Features>> = {};
  gripScores: Partial<Record<Hand, ReturnType<typeof cameraGrip>["scores"]>> =
    {};
  delegate = "CPU";
  private positionFilters = {
    left: [new PositionSignal(), new PositionSignal()],
    right: [new PositionSignal(), new PositionSignal()],
  };
  grips: Record<Hand, Grip> = { left: "unknown", right: "unknown" };
  currentInput: Inputs | null = null;
  frameEdge: Record<Hand, boolean> = { left: false, right: false };
  resetSafe = { left: false, right: false };
  positionSpeed = { left: 0, right: 0 };
  private previousPosition: Partial<Record<Hand, { p: V; t: number }>> = {};
  centerCount = 0;
  recognition: Record<
    Hand,
    { candidate: Grip; score: number; reason: string }
  > = {
    left: { candidate: "unknown", score: 0, reason: "Waiting for hand" },
    right: { candidate: "unknown", score: 0, reason: "Waiting for hand" },
  };
  onInput: (input: Inputs) => void = () => {};
  onStatus: (message: string) => void = () => {};
  onObservation: () => void = () => {};
  onLost: () => void = () => {};
  private raf = 0;
  private epoch = 0;
  constructor(
    readonly video: HTMLVideoElement = document.createElement("video"),
  ) {
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      const saved = JSON.parse(
        localStorage.getItem("crux-motion:calibration") || "null",
      );
      if (saved?.version === 1 && saved.reach > 0.05 && saved.reach < 2) {
        this.calibration = {
          ...this.calibration,
          ...saved,
          controlRevision: 2,
          // Old saved mirror settings otherwise silently keep returning players
          // on the broken motor path even after refreshing the new default.
          armMode:
            saved.controlRevision === 2 &&
            ["anchors", "mirror", "reach"].includes(saved.armMode)
              ? saved.armMode
              : "anchors",
        };
        if (saved.controlRevision !== 2)
          localStorage.setItem(
            "crux-motion:calibration",
            JSON.stringify(this.calibration),
          );
      }
    } catch {}
  }
  async start(provider = "paired", deviceId = "") {
    this.stop();
    const epoch = ++this.epoch;
    this.provider = provider;
    this.onStatus("Opening your camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (epoch !== this.epoch) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      stream.getVideoTracks()[0].onended = () => {
        this.onStatus("Camera disconnected. Reconnect to continue.");
        this.onLost();
      };
      this.running = true;
      this.onStatus("Loading local hand and pose models…");
      await this.loadWorker();
      if (epoch !== this.epoch) return;
      this.ready = true;
      this.onStatus(
        "Camera ready. Keep shoulders, elbows and both hands visible.",
      );
      this.loop();
    } catch (e) {
      if (epoch !== this.epoch) return;
      this.stop();
      const name = e instanceof Error ? e.name : "";
      this.onStatus(
        name === "NotAllowedError"
          ? "Camera permission was declined. Enable it in your browser to use camera controls."
          : name === "NotFoundError"
            ? "No camera found. Connect a webcam or use practice controls."
            : name === "NotReadableError"
              ? "The camera is busy. Close the app using it and retry."
              : `Camera could not start: ${e instanceof Error ? e.message : e}`,
      );
      throw e;
    }
  }
  private loadWorker() {
    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(
        new URL(
          "tracking.worker.js",
          new URL(import.meta.env.BASE_URL, location.href),
        ),
      );
      this.worker = worker;
      const timeout = setTimeout(
        () => reject(new Error("Model loading timed out. Retry the camera.")),
        45000,
      );
      worker.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(e.message));
        this.onLost();
      };
      worker.onmessage = ({ data }) => {
        if (data.kind === "ready") {
          this.delegate = data.delegate ?? "CPU";
          clearTimeout(timeout);
          resolve();
        } else if (data.kind === "skipped") {
          this.busy = false;
        } else if (data.kind === "error") {
          clearTimeout(timeout);
          this.busy = false;
          this.onStatus(data.message);
          this.onLost();
          reject(new Error(data.message));
        } else if (data.kind === "result") {
          this.busy = false;
          this.process(data);
        }
      };
      worker.postMessage({
        kind: "init",
        provider: this.provider,
        base: new URL(import.meta.env.BASE_URL, location.href).href,
      });
    });
  }
  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (
      this.ready &&
      !this.busy &&
      this.video.readyState >= 2 &&
      this.video.currentTime !== this.lastVideo
    ) {
      this.busy = true;
      this.lastVideo = this.video.currentTime;
      const t = performance.now(),
        epoch = this.epoch;
      createImageBitmap(this.video)
        .then((frame) => {
          if (epoch !== this.epoch || !this.worker) {
            frame.close();
            return;
          }
          this.worker.postMessage(
            {
              kind: "frame",
              frame,
              t,
              sequence: ++this.sequence,
              width: this.video.videoWidth,
              height: this.video.videoHeight,
            },
            [frame],
          );
        })
        .catch(() => {
          if (epoch === this.epoch) {
            this.busy = false;
            this.onLost();
          }
        });
    }
  };
  process(o: Observation) {
    this.observation = o;
    this.inferenceMs = o.inferenceMs;
    this.lastResult = performance.now();
    this.latencies.push(this.lastResult - o.t);
    if (this.latencies.length > 300) this.latencies.shift();
    if (this.lastT)
      this.fps = 0.85 * this.fps + (0.15 * 1000) / (o.t - this.lastT);
    this.lastT = o.t;
    const raw = this.identity.assign(o.detections, o.pose, o.t);
    const assigned = this.calibration.mirrorLabels
      ? { left: raw.right, right: raw.left }
      : raw;
    this.assigned = assigned;
    const input = {} as Inputs;
    for (const side of hands) {
      const poseSide = this.calibration.mirrorLabels
        ? side === "left"
          ? "right"
          : "left"
        : side;
      const d = assigned[side],
        s = o.pose[poseSide === "left" ? 11 : 12];
      const anchorsMode =
        !this.calibration.armMode || this.calibration.armMode === "anchors";
      const gripResult = cameraGrip(
        d,
        side,
        o.width,
        o.height,
        this.calibration.usePersonalGrips === false
          ? {}
          : this.calibration.prototypes,
        this.latches[side].grip,
      );
      const f = gripResult.features;
      this.gripScores[side] = gripResult.scores;
      this.currentFeatures[side] = f;
      const found = anchorsMode
          ? gripResult.found
          : classify(
              f,
              this.calibration.usePersonalGrips === false
                ? {}
                : this.calibration.prototypes,
              this.latches[side].grip,
            ),
        grip = this.latches[side].update(found.grip, found.score, o.t);
      this.grips[side] = grip;
      const poseWrist = o.pose[poseSide === "left" ? 15 : 16];
      const wrist =
        d &&
        d.points.length === 21 &&
        Number.isFinite(d.points[0].x + d.points[0].y)
          ? d.points[0]
          : poseWrist && (poseWrist.visibility ?? 0) > 0.65
            ? poseWrist
            : null;
      // Losing finger classification must not stop otherwise well-tracked arms.
      const elbow = o.pose[poseSide === "left" ? 13 : 14];
      if (elbow && s && wrist)
        this.bendHint[side] = elbowBend(s, elbow, wrist, this.bendHint[side]);
      const armSource = wrist
        ? observedArm(poseSide, o.pose, wrist, o.width, o.height)
        : null;
      if (armSource)
        armSource.elbow = this.bendHint[side] * Math.abs(armSource.elbow);
      const mirrorMode = this.calibration.armMode === "mirror";
      const quality =
        !!wrist &&
        !!s &&
        (s.visibility ?? 1) > 0.5 &&
        (!mirrorMode || !!armSource);
      this.frameEdge[side] =
        !!wrist &&
        (wrist.x < (anchorsMode ? 0.09 : 0.05) ||
          wrist.x > (anchorsMode ? 0.91 : 0.95) ||
          wrist.y < (anchorsMode ? 0.16 : 0.05) ||
          wrist.y > (anchorsMode ? 0.9 : 0.95) ||
          (d?.points.filter(
            (p) => p.x < 0.025 || p.x > 0.975 || p.y < 0.025 || p.y > 0.975,
          ).length ?? 0) >= 4);
      // A larger return zone provides hysteresis: do not repeatedly resume at
      // the same boundary that paused the climb. Whole fingers must fit too.
      this.resetSafe[side] =
        !!wrist &&
        quality &&
        wrist.x > 0.15 &&
        wrist.x < 0.85 &&
        wrist.y > 0.27 &&
        wrist.y < 0.82 &&
        !d?.points.some(
          (p) => p.x < 0.04 || p.x > 0.96 || p.y < 0.04 || p.y > 0.96,
        );
      this.recognition[side] = {
        candidate: found.grip,
        score: found.score,
        reason: !wrist
          ? "Hand position hidden"
          : !s || (s.visibility ?? 1) <= 0.5
            ? "Shoulder hidden"
            : mirrorMode && !armSource
              ? "Elbow hidden · show the whole upper arm"
              : !d || !validFeatures(f)
                ? "Arm tracked · show fingers to catch"
                : found.grip === "unknown"
                  ? "Shape unclear — hold steady"
                  : grip !== found.grip
                    ? "Confirming shape"
                    : "Recognized",
      };
      const p = d?.points || [];
      if (quality && wrist) {
        const absolute = this.mapper.map(
          poseSide,
          o.pose,
          wrist,
          o.width,
          o.height,
          this.calibration.motionGain ?? 1.15,
        );
        const requested =
          this.comfort.map(
            side,
            this.mapper.rawPosition[poseSide],
            mirrorMode
              ? (this.calibration.armGain ?? 1.8)
              : (this.calibration.comfortGain ?? 1.8),
            anchorsMode,
          ) ?? absolute;
        const rawPosition = this.mapper.rawPosition[poseSide],
          previous = this.previousPosition[side],
          elapsed = previous ? (o.t - previous.t) / 1000 : 0;
        const speed =
          previous && elapsed > 0 && elapsed < 0.3
            ? (dist(rawPosition, previous.p) * 0.745) / elapsed
            : 0;
        this.positionSpeed[side] = 0.5 * this.positionSpeed[side] + 0.5 * speed;
        this.previousPosition[side] = { p: { ...rawPosition }, t: o.t };
        const filters = anchorsMode
          ? this.positionFilters[side]
          : this.filters[side];
        this.targets[side] = v(
          filters[0].update(requested.x, o.t),
          filters[1].update(requested.y, o.t),
        );
      }
      const target = { ...this.targets[side] };
      const armMotion = this.arms[side].observe(armSource, o.t, target);
      let orientation: "up" | "down" | "side" =
        p.length && p[9].y > p[0].y + 0.025
          ? "down"
          : p.length && Math.abs(p[9].x - p[0].x) > 0.08
            ? "side"
            : "up";
      if (p.length && this.calibration.orientations) {
        const ray = orientationFeatures(p, o.width, o.height);
        const matches = Object.entries(this.calibration.orientations)
          .map(([name, mean]) => ({
            name,
            score: ray.reduce((s, x, i) => s + x * mean![i], 0),
          }))
          .sort((a, b) => b.score - a.score);
        if (matches[0]?.score > 0.88)
          orientation = matches[0].name as "down" | "side";
      }
      const bend = this.bendHint[side];
      input[side] = {
        target: mirrorMode && armMotion ? armOffset(armMotion) : target,
        grip,
        ready:
          validFeatures(f) &&
          grip === found.grip &&
          grip !== "release" &&
          grip !== "unknown",
        orientation,
        quality,
        bend: bend || (side === "left" ? -1 : 1),
        ...(mirrorMode && this.arms[side].motion
          ? {
              arm: armMotion ?? {
                ...this.arms[side].motion!,
                upperVelocity: 0,
                elbowVelocity: 0,
              },
            }
          : {}),
      };
    }
    this.currentInput = input;
    this.onInput(input);
    this.onObservation();
  }
  capture(grip: Grip, samples: Features[]) {
    if (samples.length < 8)
      throw new Error(
        "Keep both hands visible and hold the shape steady, then try again.",
      );
    this.calibration.prototypes[grip] = prototype(samples);
    this.calibration.usePersonalGrips = true;
    this.save();
  }
  recenter(anchors: Record<Hand, V>, poses?: Record<Hand, ArmPose>) {
    this.centerCount++;
    const raw = {
      left: this.mapper.rawPosition[
        this.calibration.mirrorLabels ? "right" : "left"
      ],
      right:
        this.mapper.rawPosition[
          this.calibration.mirrorLabels ? "left" : "right"
        ],
    };
    const mappedAnchors =
      poses && this.calibration.armMode === "mirror"
        ? { left: armOffset(poses.left), right: armOffset(poses.right) }
        : anchors;
    this.comfort.rebase(raw, mappedAnchors);
    this.mapper.lock();
    for (const side of hands) {
      if (poses && this.calibration.armMode === "mirror") {
        this.arms[side].rebase(poses[side], this.observation?.t ?? 0);
        if (this.currentInput)
          this.currentInput[side].arm = this.arms[side].motion!;
      } else {
        this.arms[side].clear();
        if (this.currentInput) delete this.currentInput[side].arm;
      }
      this.targets[side] = { ...mappedAnchors[side] };
      this.filters[side] = [new OneEuro(), new OneEuro()];
      this.positionFilters[side] = [new PositionSignal(), new PositionSignal()];
      this.positionFilters[side][0].update(
        mappedAnchors[side].x,
        this.observation?.t ?? 0,
      );
      this.positionFilters[side][1].update(
        mappedAnchors[side].y,
        this.observation?.t ?? 0,
      );
      if (this.currentInput)
        this.currentInput[side].target = { ...mappedAnchors[side] };
    }
  }
  clearCenter() {
    this.comfort.clear();
    for (const side of hands) this.arms[side].clear();
    this.mapper.unlock();
  }
  save() {
    this.calibration.provider = this.provider;
    try {
      localStorage.setItem(
        "crux-motion:calibration",
        JSON.stringify(this.calibration),
      );
    } catch {
      this.onStatus(
        "Calibration works for this session; browser storage is unavailable.",
      );
    }
  }
  resetFilters() {
    this.previousPosition = {};
    this.positionSpeed = { left: 0, right: 0 };
    this.identity.reset();
    for (const side of hands) {
      this.latches[side].reset();
      this.positionFilters[side] = [new PositionSignal(), new PositionSignal()];
      this.filters[side] = [new OneEuro(), new OneEuro()];
    }
  }
  stop() {
    this.epoch++;
    this.running = false;
    this.ready = false;
    this.busy = false;
    cancelAnimationFrame(this.raf);
    this.worker?.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.lastResult = 0;
    this.lastVideo = -1;
    this.lastT = 0;
    this.currentInput = null;
    this.mapper.reset();
    this.comfort.clear();
    for (const side of hands) this.arms[side].clear();
    this.grips = { left: "unknown", right: "unknown" };
    this.resetFilters();
  }
}
export function orientationFeatures(
  p: Landmark[],
  width: number,
  height: number,
) {
  const ray = [
      Math.abs(p[9].x - p[0].x) * width,
      (p[9].y - p[0].y) * height,
      ((p[9].z || 0) - (p[0].z || 0)) * width,
    ],
    length = Math.hypot(...ray) || 1;
  return ray.map((x) => x / length);
}
