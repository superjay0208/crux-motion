import {
  gripFits,
  type Grip,
  type Hold,
  type ArmPose,
  type ArmMotion,
} from "../core/types";
export type TestHand = {
  tracked: boolean;
  ready: boolean;
  grip: string;
  candidate: string;
  score: number;
  reason: string;
  orientation: string;
  reach: number;
  physicalReach: number;
  rawExtension: number;
  aimError: number;
  nextDistance: number;
  nextFromShoulder: number;
  contact: string | null;
  reserve: number;
  target: { x: number; y: number };
  hand: { x: number; y: number };
  shoulder: { x: number; y: number };
  features: number[];
  landmarks: number[][];
  nearFrameEdge?: boolean;
  gripScores?: unknown;
  worldLandmarks?: number[][];
  arm?: {
    source: ArmPose | null;
    requested: ArmMotion | null;
    actual: ArmPose;
    load: number;
    drift: number;
  };
};
export type TestFrame = {
  time: number;
  phase: string;
  route: string;
  state: string;
  pauseReason: string;
  tick: number;
  frameAge: number;
  inferenceMs: number;
  fps: number;
  cameraSequence: number;
  cameraSampleTime: number;
  cameraVideoTime: number;
  controlCenter?: unknown;
  recovery?: {
    active: boolean;
    reason: string;
    progress: number;
    safe: { left: boolean; right: boolean };
    positionSpeed: { left: number; right: number };
  };
  view?: { center: { x: number; y: number }; scale: number };
  armControl?: unknown;
  body?: {
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    angle: number;
    angularVelocity: number;
  };
  next: { id: string; kind: string; radius: number } | null;
  hands: { left: TestHand; right: TestHand };
  pose: number[][];
  events: {
    id: number;
    tick: number;
    kind: string;
    message: string;
    hand?: string;
  }[];
};
export type Finding = {
  title: string;
  detail: string;
  seconds: number;
  firstTime: number;
};
const q = (a: number[], p: number) =>
  [...a].sort((x, y) => x - y)[Math.floor(Math.max(0, a.length - 1) * p)] ?? 0;
export function analyzeTest(frames: TestFrame[]) {
  const findings: Finding[] = [];
  const active = frames.filter((f) => f.state === "playing");
  const interval =
    frames.length > 1
      ? Math.min(
          0.5,
          Math.max(
            0.01,
            (frames.at(-1)!.time - frames[0].time) / (frames.length - 1),
          ),
        )
      : 0.1;
  const add = (
    title: string,
    detail: string,
    matches: TestFrame[],
    threshold = 0.5,
  ) => {
    const seconds = matches.length * interval;
    if (seconds >= threshold)
      findings.push({
        title,
        detail,
        seconds: Math.round(seconds * 10) / 10,
        firstTime: matches[0].time,
      });
  };
  add(
    "Camera frames were delayed",
    "Old image observations can make movement late or trigger protective pauses. This measures software frame age, not motion-to-photon latency.",
    frames.filter((f) => f.frameAge > 300),
    0.5,
  );
  for (const side of ["left", "right"] as const) {
    const label = side === "left" ? "Left" : "Right";
    add(
      `${label} arm position was missing`,
      "The pose and hand models could not supply a confident wrist/shoulder position. Check framing and occlusion in the video.",
      frames.filter((f) => !f.hands[side].tracked),
      1,
    );
    add(
      `${label} fingers were uncertain`,
      "Arm movement was available, but finger uncertainty prevented a new grip. Compare the visible gesture with its candidate and score.",
      frames.filter(
        (f) => f.hands[side].tracked && f.hands[side].grip === "unknown",
      ),
      1,
    );
    add(
      `${label} aim reached farther than the physical hand`,
      "While free and tracked, the hand remained more than 18 cm behind its requested position. Check controller lag, momentum and current body position at these times.",
      active.filter((f) => {
        const h = f.hands[side];
        return h.tracked && !h.contact && h.aimError > 0.18;
      }),
      0.5,
    );
    add(
      `${label} real extension mapped short`,
      "A near-full measured real arm mapped to less than 75% avatar reach. Review the arm-length estimate and sensitivity.",
      frames.filter((f) => {
        const h = f.hands[side];
        return (
          !f.controlCenter &&
          h.tracked &&
          h.rawExtension > 0.9 &&
          h.reach < 0.75
        );
      }),
      0.5,
    );
    add(
      `${label} next hold was outside current physical reach`,
      "The next patch lay beyond the full arm from the current shoulder. A pull or swing was needed; compare the supporting hand and body height.",
      active.filter((f) => {
        const h = f.hands[side];
        return (
          !h.contact &&
          h.tracked &&
          h.reach > 0.9 &&
          !!f.next &&
          h.nextFromShoulder > 0.745 + f.next.radius + 0.025
        );
      }),
      0.5,
    );
    add(
      `${label} stayed attached while the aim moved away`,
      "The hand was still attached more than 25 cm from its aim. The video is needed to distinguish an intended pull from an open-hand release that was not recognized.",
      active.filter((f) => {
        const h = f.hands[side];
        return (
          !!h.contact && h.tracked && h.aimError > 0.25 && h.grip !== "release"
        );
      }),
      0.75,
    );
    add(
      `${label} was near the next hold with an incompatible grip`,
      "The physical hand entered the next patch, but its confirmed grip differed. This is a grip gate, rather than a pure reach limit.",
      active.filter((f) => {
        const h = f.hands[side];
        return (
          !h.contact &&
          h.ready &&
          !!f.next &&
          h.nextDistance < f.next.radius + 0.04 &&
          !gripFits(h.grip as Grip, f.next.kind as Hold["kind"])
        );
      }),
      0.3,
    );
  }
  const events = frames.flatMap((f) =>
    f.events.map((e) => ({ ...e, time: f.time, route: f.route })),
  );
  return {
    samples: frames.length,
    duration: frames.at(-1)?.time ?? 0,
    activeSeconds: Math.round(active.length * interval * 10) / 10,
    frameAgeP50: q(
      frames.map((f) => f.frameAge),
      0.5,
    ),
    frameAgeP95: q(
      frames.map((f) => f.frameAge),
      0.95,
    ),
    inferenceP95: q(
      frames.map((f) => f.inferenceMs),
      0.95,
    ),
    catches: events.filter((e) => e.kind === "catch").length,
    slips: events.filter((e) => e.kind === "slip").length,
    findings,
    limitation:
      "These are diagnostic flags, not verified root causes or gesture accuracy scores. Review the synchronized video and intended action at the flagged times.",
  };
}
