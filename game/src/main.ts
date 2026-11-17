import "./style.css";
import { Simulation } from "./core/Simulation";
import { AnchorRig } from "./core/AnchorRig";
import { validateReplay } from "./core/replay";
import { routes, gripNames, gripCues } from "./core/levels";
import {
  hands,
  initialInputs,
  type Hand,
  type Grip,
  type Inputs,
  type Replay,
  gripFits,
} from "./core/types";
import { v, sub, dist, clamp, add } from "./core/math";
import { Renderer } from "./render/Renderer";
import { AudioFeedback } from "./render/Audio";
import { Camera, orientationFeatures } from "./tracking/Camera";
import { HandsFreeGate } from "./tracking/HandsFreeGate";
import { RecoveryGate } from "./tracking/RecoveryGate";
import { validFeatures, type Features } from "./tracking/gestures";
import { InputProtection, ARM_REACH } from "./tracking/motion";
import {
  TestRecorder,
  testPrompt,
  testIsPreparing,
  type TestScenario,
} from "./debug/Recorder";
import type { TestFrame, TestHand } from "./debug/analysis";

const icon = (name: string) =>
  ({
    camera: "▣",
    arrow: "↗",
    play: "▶",
    retry: "↻",
    pause: "Ⅱ",
    sound: "♫",
  })[name] || name;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<header class="masthead"><a class="wordmark" href="#" aria-label="Crux Motion home"><span class="mark">⌁</span> CRUX<span class="wordmark-motion">MOTION</span></a><div class="edition"><span class="live-dot"></span> THE CAMPUS EXPERIMENT <span class="edition-line">/</span> VOL. 01</div><button class="text-button" id="about-button">How it works <span>↗</span></button></header>
<main class="shell"><section class="intro" id="intro"><div class="eyebrow"><span class="short-rule"></span> A DIFFERENT WAY UP</div><h1>Your hands.<br>Your next <em>move.</em></h1><p class="intro-copy">Reach for it. Feel the swing. Stick the catch.<br>A climbing game that moves with you.</p><div class="launch-actions"><button class="primary" id="camera-start">${icon("camera")} Use your camera <span>↗</span></button><button class="secondary" id="practice-start">Explore with practice controls <span>→</span></button></div><p class="privacy-note"><span>◈</span> On-device tracking. Your camera stays yours.</p><div class="feature-strip"><div><strong>02</strong><span>HANDS. ONE RHYTHM.</span></div><div><strong>12</strong><span>WAYS TO THE TOP.</span></div><div><strong>∞</strong><span>ONE MORE TRY.</span></div></div><div class="intro-bottom"><span>NO FOOTWORK. ALL FEEL.</span><span>↓ FIND YOUR FLOW</span></div></section>
<section class="wall-wrap"><div class="wall-top"><span id="wall-label">THE MOVEMENT LAB</span><span id="wall-top-right">LIVE PHYSICS / 120 HZ</span></div><canvas id="wall" aria-label="Physical climbing wall and climber"></canvas><div class="wall-caption" id="wall-caption"><span class="tiny-tag">01 / JUG LADDER</span><span>Every move begins with a little trust.</span></div><div class="game-overlay hidden" id="game-overlay"></div><div class="wall-legend"><span><i style="background:#8ae2c7"></i> JUG</span><span><i style="background:#efb373"></i> CRIMP</span><span><i style="background:#a9baf2"></i> SLOPER</span><span><i style="background:#ef9f96"></i> PINCH</span><span>↥ UNDERCLING</span></div></section>
<aside class="play-panel hidden" id="play-panel"><div class="eyebrow" id="session-mode">PRACTICE SESSION</div><h2 id="route-name">Jug Ladder</h2><p class="panel-subtitle" id="route-subtitle"></p><div class="route-progress"><span id="progress-label">0 / 3 holds</span><span id="clock">00:00</span><div class="progress-track"><i id="progress-fill"></i></div></div><div class="coach-card"><span class="eyebrow">THE NEXT MOVE</span><p id="hint"></p></div><div class="hand-cards"><button class="hand-card selected" data-hand="left"><span>LEFT HAND <b>L</b></span><strong id="left-grip">${gripNames.jug}</strong><div class="meter"><i id="left-reserve"></i></div><small id="left-contact">Holding</small></button><button class="hand-card" data-hand="right"><span>RIGHT HAND <b>R</b></span><strong id="right-grip">${gripNames.jug}</strong><div class="meter"><i id="right-reserve"></i></div><small id="right-contact">Holding</small></button></div><div class="grip-selector" id="grip-selector"><label>GRIP SHAPE <span>1–4</span></label>${(["jug", "crimp", "sloper", "pinch"] as Grip[]).map((g, i) => `<button data-grip="${g}" class="grip-option ${i === 0 ? "active" : ""}" title="${i + 1}: ${gripNames[g]}"><span class="grip-symbol">${["∩", "⌐", "◡", "⊂"][i]}</span>${gripNames[g]}</button>`).join("")}</div><button class="release-button" id="release-hand">Release selected hand <span>Q / E</span></button><div class="camera-preview hidden" id="camera-preview"></div><p class="camera-status" id="camera-status"></p><div class="session-tools"><button id="calibrate-button">Calibrate</button><button id="lab-button">Grip lab ↗</button><button id="settings-button" aria-label="Open settings">⚙</button></div><div class="controls-note" id="controls-note">Drag a wrist to reach. Space pulls; Shift extends.<br>Q / E releases left / right. Tab changes hand.</div><div class="panel-bottom"><button class="icon-button" id="retry" aria-label="Retry route">↻</button><button class="icon-button" id="pause" aria-label="Pause or resume">Ⅱ</button><button class="secondary compact" id="routes-button">All routes <span>↗</span></button></div></aside></main>
<footer><span>BUILT FOR THE MOMENT IT CLICKS.</span><span class="footer-right">UPPER BODY. HIGHER POSSIBILITIES. <b>↗</b></span></footer>
<dialog id="modal"><button class="modal-close" id="modal-close" aria-label="Close dialog">×</button><div id="modal-content"></div></dialog>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("wall"),
  renderer = new Renderer(canvas),
  audio = new AudioFeedback(),
  camera = new Camera();
const testRecorder = new TestRecorder();
let testStartQueued = false;
let recordedSim: Simulation | null = null;
let recordedEvent = 0;
let reviewVideoUrl = "";
canvas.tabIndex = 0;
let index = 0,
  sim = new Simulation(routes[0]),
  selected: Hand = "left",
  grip: Grip = "jug",
  mode: "intro" | "practice" | "camera" = "intro",
  inputs = initialInputs(),
  dragging = false,
  pointer = v(),
  pull = false,
  extend = false,
  replay: Replay | null = null,
  replayIndex = 0,
  review = false,
  lab = false;
let last = performance.now(),
  accumulator = 0,
  lastHud = 0,
  lastState = "",
  lastSeen = 0,
  lastCheckpoint = 0,
  seenVisited = 0;
let calibrationStep = 0,
  calibrating = false,
  calibrationSamples: Features[] = [],
  reachSamples: number[] = [];
let orientationSamples: number[][] = [];
let isReview = false;
let checkpointPractice = false;
const startGate = new HandsFreeGate();
const recoveryGate = new RecoveryGate();
const inputProtection = new InputProtection();
const calibrationGate = new HandsFreeGate(3000, 300);
let calibrationCaptureStart: number | null = null;
let lastCalibrationSequence = -1;
let calibrationCounts = { left: 0, right: 0 };
function cancelHandsFree() {
  startGate.cancel();
  recoveryGate.cancel();
  calibrationGate.cancel();
  calibrationCaptureStart = null;
}
function text(id: string, value: string) {
  const target = document.getElementById(id);
  if (target && target.textContent !== value) target.textContent = value;
}
const calibrationSteps = [
  {
    name: "Find your frame",
    grip: null,
    help: "Sit or stand comfortably. Keep shoulders, elbows and both hands in view. Move your LEFT hand first, then your right. The L and R markers should follow the named hands.",
  },
  {
    name: "Comfortable reach",
    grip: null,
    help: "Reach gently above, across and beside your shoulders. Use only the space that feels comfortable. Smaller motion works too.",
  },
  {
    name: "Jug",
    grip: "jug",
    help: "Curl all fingers into a relaxed closed hand. Keep the thumb comfortable. Hold both hands steady.",
  },
  {
    name: "Crimp",
    grip: "crimp",
    help: "Bend your fingers into a small hook, with the fingertips pointing down. Keep this different from a fist.",
  },
  {
    name: "Sloper",
    grip: "sloper",
    help: "Cup both hands with fingers together, almost like holding a little water. A gentle curl is enough.",
  },
  {
    name: "Pinch",
    grip: "pinch",
    help: "Bring your thumb toward bent index and middle fingers in a C shape. Keep the remaining fingers relaxed.",
  },
  {
    name: "Spread to release",
    grip: "release",
    help: "Extend and SPREAD all fingers clearly. This must feel different from your cupped sloper gesture.",
  },
];
calibrationSteps.push(
  {
    name: "Undercling",
    grip: null,
    help: "Curl your fingers gently and turn your palms toward the ceiling, as if scooping under a ledge. Hold both hands in view.",
  },
  {
    name: "Turn for a sidepull",
    grip: null,
    help: "Turn both hands sideways in a comfortable grip. This captures your personal sidepull orientation.",
  },
);
type Save = {
  version: 1;
  cleared: string[];
  best: Record<string, number>;
  muted: boolean;
  reduced: boolean;
};
let save: Save = {
  version: 1,
  cleared: [],
  best: {},
  muted: false,
  reduced: renderer.reduced,
};
try {
  const x = JSON.parse(localStorage.getItem("crux-motion:v1") || "null");
  if (x?.version === 1 && Array.isArray(x.cleared) && x.best)
    save = { ...save, ...x };
} catch {}
audio.muted = save.muted;
renderer.reduced = save.reduced;
function persist() {
  try {
    localStorage.setItem("crux-motion:v1", JSON.stringify(save));
  } catch {}
}
function showModal(html: string) {
  cancelHandsFree();
  sim.pause();
  el("modal-content").innerHTML = html;
  el<HTMLDialogElement>("modal").showModal();
}
function closeModal() {
  cancelHandsFree();
  el<HTMLDialogElement>("modal").close();
  calibrating = false;
  if (mode === "camera" && camera.running)
    el("camera-preview").append(camera.video);
}
el("modal-close").onclick = closeModal;
el<HTMLDialogElement>("modal").addEventListener("cancel", () => {
  cancelHandsFree();
  calibrating = false;
});
el<HTMLDialogElement>("modal").addEventListener("close", () => {
  cancelHandsFree();
  document.querySelector<HTMLVideoElement>("#test-review-video")?.pause();
  calibrating = false;
  if (mode === "camera" && camera.running)
    el("camera-preview").append(camera.video);
});
function enter(next: "camera" | "practice") {
  mode = next;
  el("intro").classList.add("hidden");
  el("play-panel").classList.remove("hidden");
  document.body.classList.add("playing");
  el("camera-preview").classList.toggle("hidden", next !== "camera");
  el("grip-selector").classList.toggle("hidden", next === "camera");
  el("release-hand").classList.toggle("hidden", next === "camera");
  el("controls-note").textContent =
    next === "camera"
      ? "Start with relaxed Jug fists near your chest. Spread fingers to release; close to catch a Jug. Lower the supporting fist a little to pull. Recenter hands · C resets your comfortable pose."
      : "Drag a wrist to reach. Space pulls; Shift extends. Q / E release. X changes hand. O turns the palm.";
  audio.unlock();
  loadRoute(index);
}
function loadRoute(i: number) {
  cancelHandsFree();
  camera.clearCenter();
  index = i;
  sim = new Simulation(
    routes[i],
    mode,
    mode === "camera" &&
    (!camera.calibration.armMode || camera.calibration.armMode === "anchors")
      ? "anchors"
      : "motors",
  );
  inputs = initialInputs();
  selected = "left";
  grip = "jug";
  pull = extend = dragging = false;
  review = false;
  isReview = false;
  checkpointPractice = false;
  replay = null;
  lastSeen = lastCheckpoint = seenVisited = 0;
  lastState = "";
  renderer.reset();
  audio.reset();
  inputProtection.reset();
  accumulator = 0;
  lab = false;
  updateLabels();
  updateSelection();
}
function updateLabels() {
  el("route-name").textContent = sim.route.name;
  el("route-subtitle").textContent = sim.route.subtitle;
  el("hint").textContent = sim.route.hint;
  el("wall-label").textContent =
    `${String(index + 1).padStart(2, "0")} / ${sim.route.name.toUpperCase()}`;
  el("wall-caption").classList.toggle("hidden", mode !== "intro");
  el("wall-top-right").textContent =
    mode === "camera" ? "CAMERA CONTROL / LOCAL" : "PRACTICE / LOCAL";
  el("session-mode").textContent = lab
    ? "GESTURE LAB"
    : review
      ? "ATTEMPT REVIEW"
      : mode === "camera"
        ? "CAMERA SESSION"
        : "PRACTICE SESSION";
  el("game-overlay").classList.add("hidden");
}
el("practice-start").onclick = () => enter("practice");
async function useCamera() {
  enter("camera");
  el("camera-preview").append(camera.video);
  try {
    await camera.start(camera.provider);
    sim.pause(
      "Camera ready. Reach scales to your body automatically. Click Begin climb, then put the mouse down.",
    );
    lastState = "";
  } catch {
    showModal(
      `<div class="eyebrow">CAMERA SETUP</div><h2>Let’s get you connected.</h2><p>${el("camera-status").textContent}</p><button class="primary" id="camera-retry">Try camera again</button><button class="secondary" id="use-practice">Use practice controls</button>`,
    );
    el("camera-retry").onclick = () => {
      closeModal();
      void useCamera();
    };
    el("use-practice").onclick = () => {
      closeModal();
      camera.stop();
      enter("practice");
    };
  }
}
el("camera-start").onclick = () => void useCamera();
camera.onStatus = (message) => {
  el("camera-status").textContent = message;
};
camera.onLost = () => {
  if (review) return;
  const resumeWhenReady = mode === "camera" && sim.state === "playing";
  if (resumeWhenReady) recoverCamera("Camera tracking interrupted");
};
camera.onInput = (input) => {
  if (review) return;
  const protectedInput = inputProtection.accept(input, performance.now());
  inputs = protectedInput.input;
  if (
    (protectedInput.pause || hands.some((side) => camera.frameEdge[side])) &&
    sim.state === "playing"
  ) {
    recoverCamera(
      hands.some((side) => camera.frameEdge[side])
        ? "Hand near the image edge"
        : "Hand tracking interrupted",
    );
  }
};
camera.onObservation = () => {
  drawTracking();
  if (!calibrating) return;
  const o = camera.observation;
  if (!o) return;
  text(
    "calibration-status",
    `L: ${gripNames[camera.grips.left]} · R: ${gripNames[camera.grips.right]} · captured L ${calibrationCounts.left} / R ${calibrationCounts.right}`,
  );
  // Mouse movement and the preparation countdown never enter the sample set.
  if (
    calibrationCaptureStart === null ||
    !rawHandsReady(performance.now()) ||
    o.sequence <= lastCalibrationSequence
  )
    return;
  lastCalibrationSequence = o.sequence;
  for (const side of hands) {
    const d = camera.assigned[side];
    if (d)
      orientationSamples.push(orientationFeatures(d.points, o.width, o.height));
  }
  if (calibrationStep === 1 && o.pose[11] && o.pose[12]) {
    const span = dist(o.pose[11], o.pose[12]);
    camera.calibration.span = span;
    for (const side of hands) {
      const poseSide = camera.calibration.mirrorLabels
        ? side === "left"
          ? "right"
          : "left"
        : side;
      const d = camera.assigned[side],
        s = o.pose[poseSide === "left" ? 11 : 12];
      if (d && s)
        reachSamples.push(
          dist(
            { x: d.points[0].x, y: (d.points[0].y * o.height) / o.width },
            { x: s.x, y: (s.y * o.height) / o.width },
          ),
        );
    }
  }
  for (const side of hands) {
    const f = camera.currentFeatures[side];
    if (validFeatures(f)) {
      calibrationSamples.push(f);
      calibrationCounts[side]++;
    }
  }
};
function drawTracking() {
  const o = camera.observation,
    parent = camera.video.parentElement;
  if (!o || !parent) return;
  let overlay = parent.querySelector<HTMLCanvasElement>("canvas");
  if (!overlay) {
    overlay = document.createElement("canvas");
    overlay.className = "tracking-overlay";
    parent.append(overlay);
  }
  overlay.width = o.width;
  overlay.height = o.height;
  const c = overlay.getContext("2d")!;
  const point = (p: { x: number; y: number }) => ({
    x: (1 - p.x) * o.width,
    y: p.y * o.height,
  });
  if (
    mode === "camera" &&
    (recoveryGate.active || sim.state === "ready" || sim.state === "paused") &&
    !calibrating
  ) {
    c.strokeStyle = "#d2f8c9dd";
    c.lineWidth = Math.max(2, o.width / 320);
    c.setLineDash([12, 8]);
    c.strokeRect(
      o.width * 0.15,
      o.height * 0.27,
      o.width * 0.7,
      o.height * 0.55,
    );
    c.setLineDash([]);
    c.fillStyle = "#d2f8c9";
    c.font = `600 ${Math.max(16, o.width / 50)}px sans-serif`;
    c.fillText("RETURN HANDS HERE", o.width * 0.17, o.height * 0.27 - 10);
  }
  c.lineWidth = 3;
  for (const [a, b] of [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ]) {
    if (o.pose[a] && o.pose[b]) {
      const A = point(o.pose[a]),
        B = point(o.pose[b]);
      c.strokeStyle = "#a4e6d088";
      c.beginPath();
      c.moveTo(A.x, A.y);
      c.lineTo(B.x, B.y);
      c.stroke();
    }
  }
  for (const side of hands) {
    const d = camera.assigned[side];
    if (!d) continue;
    c.strokeStyle = side === "left" ? "#8ae2c7" : "#f3ba77";
    for (const base of [1, 5, 9, 13, 17]) {
      c.beginPath();
      const p = point(d.points[0]);
      c.moveTo(p.x, p.y);
      for (let k = base; k <= base + 3; k++) {
        const q = point(d.points[k]);
        c.lineTo(q.x, q.y);
      }
      c.stroke();
    }
    const p = point(d.points[0]);
    c.fillStyle = c.strokeStyle;
    c.font = "bold 28px sans-serif";
    c.fillText(side === "left" ? "L" : "R", p.x + 12, p.y);
  }
}
function calibrate() {
  if (mode !== "camera" || !camera.ready) {
    void useCamera();
    return;
  }
  calibrationStep = 0;
  reachSamples = [];
  showCalibration();
}
function showCalibration() {
  calibrating = true;
  clearCalibrationSamples();
  const step = calibrationSteps[calibrationStep];
  showModal(
    `<div class="eyebrow">YOUR MOVEMENT SPACE · ${calibrationStep + 1} / ${calibrationSteps.length}</div><h2>${step.name}</h2><p>${step.help}</p><div class="calibration-video"></div><div class="capture-prompt" role="status" aria-live="polite"><strong id="capture-countdown"></strong><p id="calibration-action-status">Click once, put the mouse down, then bring both hands into view. A 3-second countdown gives you time to pose.</p></div><p id="calibration-status" class="mono">Waiting for both hands…</p><button class="primary" id="capture-step">${calibrationStep === 0 ? "Confirm framing" : calibrationStep === 1 ? "Measure comfortable reach" : "Set up capture"} <span>→</span></button><p class="fine-print">Samples are recorded only after the countdown. Move the mouse freely before then. Video stays on this device.</p>`,
  );
  el("modal-content").querySelector(".calibration-video")!.append(camera.video);
  if (calibrationStep === 0) {
    const swap = document.createElement("button");
    swap.className = "secondary";
    swap.textContent = "L / R labels reversed? Swap hands";
    el("capture-step").before(swap);
    swap.onclick = () => {
      camera.calibration.mirrorLabels = !camera.calibration.mirrorLabels;
      camera.save();
    };
  }
  el("capture-step").onclick = () => {
    if (calibrationGate.active || calibrationCaptureStart !== null) {
      calibrationGate.cancel();
      calibrationCaptureStart = null;
      clearCalibrationSamples();
      text("capture-countdown", "");
      text(
        "calibration-action-status",
        "Capture canceled. Click to set it up again when you are ready.",
      );
      text("capture-step", "Set up capture");
      return;
    }
    clearCalibrationSamples();
    calibrationGate.arm(performance.now());
    text("capture-step", "Cancel capture");
    text(
      "calibration-action-status",
      "Capture armed. Put the mouse down and bring both hands into view.",
    );
  };
}
function clearCalibrationSamples() {
  calibrationSamples = [];
  orientationSamples = [];
  reachSamples = [];
  calibrationCounts = { left: 0, right: 0 };
  lastCalibrationSequence = -1;
}
function rawHandsReady(now: number) {
  const o = camera.observation;
  return (
    camera.ready &&
    !!o &&
    now - o.t <= camera.maxFrameAgeMs &&
    hands.every((side) => {
      const poseSide = camera.calibration.mirrorLabels
        ? side === "left"
          ? "right"
          : "left"
        : side;
      const shoulder = o.pose[poseSide === "left" ? 11 : 12];
      return (
        !!camera.assigned[side] &&
        !!shoulder &&
        (shoulder.visibility ?? 1) > 0.5 &&
        validFeatures(camera.currentFeatures[side])
      );
    })
  );
}
function finishCalibrationStep() {
  const step = calibrationSteps[calibrationStep];
  calibrationCaptureStart = null;
  try {
    if (!rawHandsReady(performance.now()))
      throw new Error(
        "Both hands need to be visible to finish. Click to set up another capture.",
      );
    if (
      calibrationStep > 0 &&
      hands.some((side) => calibrationCounts[side] < 8)
    )
      throw new Error(
        "Not enough fresh samples from each hand. Set up capture and hold both hands in frame.",
      );
    if (step.grip) camera.capture(step.grip as Grip, calibrationSamples);
    if (calibrationStep >= 7) {
      if (orientationSamples.length < 8)
        throw new Error("Hold the orientation with both hands visible.");
      const mean = orientationSamples[0].map(
          (_, i) =>
            orientationSamples.reduce((s, f) => s + f[i], 0) /
            orientationSamples.length,
        ),
        l = Math.hypot(...mean) || 1;
      camera.calibration.orientations ??= {};
      camera.calibration.orientations[calibrationStep === 7 ? "down" : "side"] =
        mean.map((x) => x / l);
      camera.save();
    }
    if (calibrationStep === 1) {
      if (reachSamples.length < 8)
        throw new Error("Reach gently in a few directions before continuing.");
      reachSamples.sort((a, b) => a - b);
      camera.calibration.reach = clamp(
        reachSamples[Math.floor(reachSamples.length * 0.95)],
        0.12,
        0.8,
      );
      const observed = camera.observation;
      if (observed) {
        const reference =
          (camera.mapper.referencePixels.left +
            camera.mapper.referencePixels.right) /
          2;
        if (reference > 0)
          camera.calibration.motionGain = clamp(
            reference / observed.width / camera.calibration.reach,
            0.8,
            1.5,
          );
      }
      camera.save();
    }
    if (++calibrationStep < calibrationSteps.length) showCalibration();
    else {
      calibrating = false;
      closeModal();
      el("camera-preview").append(camera.video);
      camera.save();
      sim.pause(
        "Calibration saved. Click Begin climb once, then put the mouse down.",
      );
      lastState = "";
    }
  } catch (e) {
    calibrationGate.cancel();
    text("capture-countdown", "");
    text("calibration-action-status", (e as Error).message);
    text("capture-step", "Set up capture");
  }
}
function updateCalibration(now: number) {
  if (!calibrating) return;
  const ready = rawHandsReady(now);
  if (calibrationCaptureStart !== null) {
    if (!ready) {
      calibrationCaptureStart = null;
      clearCalibrationSamples();
      calibrationGate.arm(now);
      text("capture-countdown", "—");
      text(
        "calibration-action-status",
        "Hands left view. Return both hands; the countdown will restart before sampling again.",
      );
      return;
    }
    const duration = calibrationStep === 1 ? 4000 : 1500;
    const elapsed = now - calibrationCaptureStart;
    text("capture-countdown", "●");
    text(
      "calibration-action-status",
      calibrationStep === 1
        ? "Measuring now: move both hands gently around your comfortable reach."
        : "Capturing now: keep both hands steady in this shape.",
    );
    if (
      elapsed >= duration &&
      hands.every((side) => calibrationCounts[side] >= 8)
    )
      finishCalibrationStep();
    else if (elapsed > 6000) {
      calibrationCaptureStart = null;
      text("capture-countdown", "");
      text(
        "calibration-action-status",
        "Too few fresh camera frames. Check the camera, then set up capture again.",
      );
      text("capture-step", "Set up capture");
    }
    return;
  }
  if (!calibrationGate.active) return;
  const view = calibrationGate.update(
    now,
    camera.observation?.sequence ?? -1,
    ready,
  );
  text(
    "capture-countdown",
    view.phase === "countdown" ? String(view.seconds) : "—",
  );
  text(
    "calibration-action-status",
    view.phase === "countdown"
      ? `Capture in ${view.seconds}. Get into the pose now.`
      : !camera.ready
        ? "Waiting for the camera to be ready. Your capture is armed."
        : "Put the mouse down. Keep shoulders and both hands in view; unclear grip labels do not block calibration.",
  );
  if (view.phase === "complete") {
    if (calibrationStep === 0) finishCalibrationStep();
    else {
      clearCalibrationSamples();
      calibrationCaptureStart = now;
    }
  }
}
el("calibrate-button").onclick = calibrate;
el("retry").onclick = () => {
  retryRoute(index);
};
function retryRoute(i: number) {
  loadRoute(i);
  if (mode === "camera") armCameraStart();
}
function armCameraStart() {
  if (sim.state !== "ready" && sim.state !== "paused") return;
  if (
    testIsPreparing(
      testRecorder.active,
      testRecorder.started,
      performance.now(),
    )
  )
    return;
  recoveryGate.cancel();
  startGate.arm(performance.now());
  camera.mapper.unlock();
  audio.unlock();
  overlay();
}
function recoverCamera(reason: string) {
  if (mode !== "camera" || isReview) return;
  sim.pause(reason);
  if (sim.state !== "paused") return;
  if (!(sim.rig instanceof AnchorRig)) {
    armCameraStart();
    return;
  }
  startGate.cancel();
  recoveryGate.arm(reason);
  // Keep the calibrated scale locked while the user relocates. Returning hands
  // are not new arm-length calibration samples and never enter the simulation.
  overlay();
}
function recenterClimb() {
  if (mode !== "camera" || review) return;
  if (sim.state === "playing" || sim.state === "paused") {
    recoverCamera("Recenter hands");
    return;
  }
  if (sim.state === "ready") armCameraStart();
}
function togglePause() {
  if (sim.state === "playing") {
    cancelHandsFree();
    sim.pause();
  } else if (sim.state === "ready" || sim.state === "paused") {
    if (mode === "camera" && !isReview) {
      if (recoveryGate.active) {
        recoveryGate.cancel();
        overlay();
      } else if (startGate.active) {
        startGate.cancel();
        overlay();
      } else armCameraStart();
      return;
    }
    sim.start();
    audio.unlock();
  }
}
function cameraStartReadiness(now: number) {
  const fresh =
    camera.ready &&
    !!camera.observation &&
    now - camera.observation.t <= camera.maxFrameAgeMs;
  const checks = {} as Record<Hand, { ready: boolean; message: string }>;
  for (const side of hands) {
    const intent = camera.currentInput?.[side];
    const held = sim.contacts[side]?.hold;
    const required = held
      ? held.direction.y < -0.5
        ? "Undercling"
        : gripNames[held.kind]
      : "a clear grip";
    let message = "Ready";
    let ready = false;
    if (!camera.ready) message = "Waiting for camera";
    else if (!fresh) message = "Waiting for a fresh frame";
    else if (camera.frameEdge[side])
      message = "Move hand down or inward, away from the image edge";
    else if (!intent?.quality) message = camera.recognition[side].reason;
    else if (sim.rig instanceof AnchorRig && !camera.resetSafe[side])
      message = "Bring your hand into the guide, near your chest";
    else if (
      intent.grip === "unknown" ||
      intent.grip !== camera.recognition[side].candidate
    )
      message = "Hold your shape steady";
    else if (
      held &&
      (!gripFits(intent.grip, held.kind) ||
        (held.direction.y < -0.5 && intent.orientation !== "down") ||
        (Math.abs(held.direction.x) > 0.5 && intent.orientation !== "side"))
    )
      message = `Show ${required}${held.direction.y < -0.5 ? " · palm up" : ""}`;
    else {
      ready = true;
      message = `Ready · ${held ? required : gripNames[intent.grip]}`;
    }
    checks[side] = { ready, message };
  }
  return { checks, ready: hands.every((side) => checks[side].ready) };
}
function renderCameraStart(now: number) {
  if (!el("start-heading")) return;
  if (recoveryGate.active) {
    const { checks } = cameraStartReadiness(now);
    text("start-heading", "Bring your hands back comfortably.");
    text(
      "start-instruction",
      "Your climb is frozen. Lower both hands into the guide, match your held grips and settle briefly. Resume is automatic; no clicking.",
    );
    text(
      "start-countdown",
      recoveryGate.progress > 0
        ? `${Math.round(recoveryGate.progress * 100)}%`
        : "↘",
    );
    text("resume", "Stay paused");
    el<HTMLButtonElement>("resume").disabled = false;
    for (const side of hands) {
      const safe = camera.resetSafe[side],
        settled = camera.positionSpeed[side] < 0.35;
      text(
        `start-${side}`,
        `${side === "left" ? "Left" : "Right"}: ${!safe ? "Return into the guide" : !checks[side].ready ? checks[side].message : !settled ? "Settle your hand" : "Ready"}`,
      );
      el(`start-${side}`).dataset.ready = String(
        safe && settled && checks[side].ready,
      );
    }
    el("start-camera-settings").classList.toggle("hidden", camera.ready);
    return;
  }
  const preparing = testIsPreparing(
    testRecorder.active,
    testRecorder.started,
    now,
  );
  el<HTMLButtonElement>("resume").disabled = preparing;
  const { checks } = cameraStartReadiness(now);
  const armed = startGate.active;
  text(
    "start-heading",
    preparing
      ? "Camera check. Climb starts automatically."
      : armed
        ? startGate.view.phase === "countdown"
          ? "Starting your climb…"
          : "Start armed. Hands back in view."
        : sim.state === "ready"
          ? "Ready when you are."
          : "A moment to reset.",
  );
  text(
    "start-instruction",
    preparing
      ? "Follow the recording banner. The avatar waits safely until the grip check ends."
      : armed
        ? "Relax both hands comfortably in view and match your held grips. We will center this pose, then start after 3 seconds. You can recenter again at any time."
        : `${sim.pauseReason ? sim.pauseReason + ". " : ""}Click once to arm ${sim.state === "ready" ? "the start" : "resume"}, then put the mouse down. You do not need both hands in view while clicking.`,
  );
  text(
    "start-countdown",
    preparing
      ? ""
      : armed
        ? startGate.view.phase === "countdown"
          ? String(startGate.view.seconds)
          : "—"
        : "",
  );
  text(
    "resume",
    preparing
      ? "Grip check in progress…"
      : armed
        ? "Cancel start"
        : sim.state === "ready"
          ? "Begin climb →"
          : "Resume climb →",
  );
  for (const side of hands) {
    text(
      `start-${side}`,
      `${side === "left" ? "Left" : "Right"}: ${checks[side].message}`,
    );
    el(`start-${side}`).dataset.ready = String(checks[side].ready);
  }
  el("start-camera-settings").classList.toggle("hidden", camera.ready);
}
function updateCameraStart(now: number) {
  if (
    mode !== "camera" ||
    isReview ||
    el<HTMLDialogElement>("modal").open ||
    (sim.state !== "ready" && sim.state !== "paused")
  )
    return;
  if (recoveryGate.active) {
    const ready =
      cameraStartReadiness(now).ready &&
      hands.every(
        (side) => camera.resetSafe[side] && camera.positionSpeed[side] < 0.35,
      );
    if (recoveryGate.update(now, camera.observation?.sequence ?? -1, ready)) {
      recoveryGate.cancel();
      centerAndResume(now);
      return;
    }
    renderCameraStart(now);
    return;
  }
  if (startGate.active) {
    if (testIsPreparing(testRecorder.active, testRecorder.started, now)) {
      startGate.cancel();
      renderCameraStart(now);
      return;
    }
    const view = startGate.update(
      now,
      camera.observation?.sequence ?? -1,
      cameraStartReadiness(now).ready,
    );
    if (view.phase === "complete") {
      centerAndResume(now);
      return;
    }
  }
  renderCameraStart(now);
}
function centerAndResume(now: number) {
  const anchors = {
    left: sub(sim.rig.hand("left"), sim.rig.shoulder("left")),
    right: sub(sim.rig.hand("right"), sim.rig.shoulder("right")),
  };
  camera.recenter(anchors, {
    left: sim.rig.pose("left", true),
    right: sim.rig.pose("right", true),
  });
  if (sim.rig instanceof AnchorRig) sim.rig.rebase();
  inputs = structuredClone(camera.currentInput!);
  for (const side of hands)
    if (!inputs[side].arm) inputs[side].target = { ...anchors[side] };
  inputProtection.reset();
  inputProtection.accept(inputs, now);
  sim.setInput(inputs);
  accumulator = 0;
  sim.start();
  lastState = "";
  overlay();
}
el("pause").onclick = togglePause;
document.querySelectorAll<HTMLButtonElement>("[data-hand]").forEach(
  (b) =>
    (b.onclick = () => {
      selected = b.dataset.hand as Hand;
      updateSelection();
    }),
);
function chooseGrip(g: Grip) {
  grip = g;
  inputs[selected].grip = g;
  inputs[selected].ready = true;
  updateSelection();
}
function updateSelection() {
  document
    .querySelectorAll<HTMLElement>("[data-hand]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.hand === selected)),
    );
  document
    .querySelectorAll<HTMLElement>("[data-grip]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.grip === grip)),
    );
  if (document.getElementById("orientation"))
    orientationButton.textContent = `Palm: ${inputs[selected].orientation === "down" ? "scoop" : inputs[selected].orientation === "side" ? "sidepull" : "upright"} · O to turn`;
  document
    .querySelectorAll("[data-hand]")
    .forEach((b) =>
      b.classList.toggle(
        "selected",
        (b as HTMLElement).dataset.hand === selected,
      ),
    );
  document
    .querySelectorAll("[data-grip]")
    .forEach((b) =>
      b.classList.toggle("active", (b as HTMLElement).dataset.grip === grip),
    );
}
document
  .querySelectorAll<HTMLButtonElement>("[data-grip]")
  .forEach((b) => (b.onclick = () => chooseGrip(b.dataset.grip as Grip)));
function release(side: Hand) {
  inputs[side].grip = "release";
  inputs[side].ready = false;
}
el("release-hand").onclick = () => release(selected);
canvas.addEventListener("pointerdown", (e) => {
  if (mode !== "practice" || review || el<HTMLDialogElement>("modal").open)
    return;
  const r = canvas.getBoundingClientRect(),
    p = v(e.clientX - r.left, e.clientY - r.top),
    world = renderer.toWorld(p);
  selected =
    dist(world, sim.rig.hand("left")) < dist(world, sim.rig.hand("right"))
      ? "left"
      : "right";
  dragging = true;
  pointer = world;
  release(selected);
  canvas.setPointerCapture(e.pointerId);
  updateSelection();
  if (sim.state === "ready") sim.start();
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    const r = canvas.getBoundingClientRect();
    pointer = renderer.toWorld(v(e.clientX - r.left, e.clientY - r.top));
  }
});
canvas.addEventListener("pointerup", () => {
  if (dragging) {
    dragging = false;
    inputs[selected].grip = grip;
    inputs[selected].ready = true;
  }
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
  sim.pause("Input interrupted");
});
window.addEventListener("keydown", (e) => {
  if (
    el<HTMLDialogElement>("modal").open ||
    mode === "intro" ||
    (e.target as HTMLElement)?.tagName === "SELECT"
  )
    return;
  if (e.code === "Escape") {
    cancelHandsFree();
    sim.pause();
    overlay();
    return;
  }
  if (e.code === "KeyC" && mode === "camera" && !e.repeat) {
    e.preventDefault();
    recenterClimb();
    return;
  }
  if ((e.target as HTMLElement)?.closest("button,input,select,a,dialog"))
    return;
  if (
    mode === "practice" &&
    ["Space", "ArrowLeft", "ArrowRight"].includes(e.code)
  )
    e.preventDefault();
  if (e.code === "KeyR" && !e.repeat) retryRoute(index);
  if (e.code === "KeyP" && !e.repeat) togglePause();
  if (mode !== "practice" || review) return;
  if (e.code === "KeyX" && !e.repeat) {
    selected = selected === "left" ? "right" : "left";
    updateSelection();
  }
  if (e.code === "KeyQ") release("left");
  if (e.code === "KeyE") release("right");
  if (e.code === "KeyO" && !e.repeat) turnPalm();
  if (e.code === "Space") pull = true;
  if (e.code.startsWith("Shift")) extend = true;
  const g = Number(e.key);
  if (g >= 1 && g <= 4)
    chooseGrip((["jug", "crimp", "sloper", "pinch"] as Grip[])[g - 1]);
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") pull = false;
  if (e.code.startsWith("Shift")) extend = false;
});
window.addEventListener("blur", () => {
  cancelHandsFree();
  text(
    "calibration-action-status",
    "Capture canceled because the window lost focus. Click to set it up again.",
  );
  text("capture-step", "Set up capture");
  text("capture-countdown", "");
  pull = extend = dragging = false;
  if (mode !== "intro") sim.pause("Window inactive");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (testRecorder.active) void testRecorder.stop("Tab hidden");
    cancelHandsFree();
    text(
      "calibration-action-status",
      "Capture canceled because the tab was hidden. Click to set it up again.",
    );
    text("capture-step", "Set up capture");
    text("capture-countdown", "");
    if (mode !== "intro") sim.pause("Tab hidden");
  }
});
document.querySelector(".wordmark")!.addEventListener("click", (e) => {
  e.preventDefault();
  if (testRecorder.active) void testRecorder.stop("Returned home");
  camera.stop();
  closeModal();
  mode = "intro";
  document.body.classList.remove("playing");
  el("intro").classList.remove("hidden");
  el("play-panel").classList.add("hidden");
  loadRoute(0);
  sim.fatigue = false;
  sim.start();
});
function routeMenu() {
  showModal(
    `<div class="eyebrow">TWELVE WAYS UP</div><h2>Find your next problem.</h2><p>Start with the foundations, or try any route as practice.</p><div class="route-grid">${routes.map((r, i) => `<button class="route-card" data-route="${i}"><span>${String(i + 1).padStart(2, "0")} <i>${save.cleared.includes(`${mode}:${r.id}`) ? "✓" : i === index ? "●" : "↗"}</i></span><strong>${r.name}</strong><small>${r.difficulty}${save.best[`${mode}:${r.id}`] ? " · " + save.best[`${mode}:${r.id}`].toFixed(1) + "s" : ""}</small></button>`).join("")}</div>`,
  );
  document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach(
    (b) =>
      (b.onclick = () => {
        loadRoute(Number(b.dataset.route));
        closeModal();
      }),
  );
}
el("routes-button").onclick = routeMenu;
const betaButton = document.createElement("button");
const orientationButton = document.createElement("button");
orientationButton.id = "orientation";
orientationButton.className = "release-button";
orientationButton.textContent = "Palm: upright · O to turn";
el("release-hand").after(orientationButton);
function turnPalm() {
  const list = ["up", "down", "side"] as const;
  inputs[selected].orientation =
    list[(list.indexOf(inputs[selected].orientation) + 1) % 3];
  orientationButton.textContent = `Palm: ${inputs[selected].orientation === "down" ? "scoop" : inputs[selected].orientation === "side" ? "sidepull" : "upright"} · O to turn`;
}
orientationButton.onclick = turnPalm;
betaButton.textContent = "Watch beta";
betaButton.id = "watch-beta";
document.querySelector(".session-tools")!.prepend(betaButton);
betaButton.onclick = async () => {
  cancelHandsFree();
  sim.pause();
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}solutions/${routes[index].id}.json`,
    );
    if (!response.ok) throw new Error("Demo is unavailable in this build.");
    const recorded = validateReplay(await response.json());
    playReplay(recorded);
  } catch (e) {
    el("camera-status").textContent = (e as Error).message;
  }
};
function playReplay(recorded: Replay) {
  cancelHandsFree();
  const i = routes.findIndex((r) => r.id === recorded.route);
  if (i < 0) throw new Error("Unknown replay route");
  index = i;
  replay = recorded;
  sim = new Simulation(routes[i], "review", recorded.controller ?? "motors");
  sim.start();
  review = isReview = true;
  replayIndex = 0;
  lastSeen = 0;
  lastState = "";
  renderer.reset();
  audio.reset();
  accumulator = 0;
  updateLabels();
}
function settings() {
  showModal(
    `<div class="eyebrow">MAKE IT YOURS</div><h2>A comfortable reach.</h2><div class="setting-row"><span>Sound effects</span><button id="sound-toggle">${save.muted ? "Off" : "On"}</button></div><div class="setting-row"><span>Reduced decorative motion</span><button id="motion-toggle">${save.reduced ? "On" : "Off"}</button></div><div class="setting-row"><label for="provider">Camera provider</label><select id="provider"><option value="paired">Pose + hands</option><option value="holistic">Holistic</option></select></div><div class="setting-row"><label for="device">Camera</label><select id="device"><option value="">System default</option></select></div><button class="secondary" id="restart-camera">Apply camera settings ↗</button><button class="secondary" id="practice-mode">Practice controls →</button><button class="secondary" id="download-replay">Save semantic replay ↓</button><p class="fine-print">Camera processing stays local. GPU acceleration falls back to CPU when unavailable. Replays contain controls, never camera video. Changing climbing controls restarts the route.</p>`,
  );
  const reachRow = document.createElement("div");
  reachRow.className = "setting-row";
  reachRow.innerHTML = `<label for="motion-gain">Comfortable movement range</label><select id="motion-gain"><option value="1.2">Wide movements</option><option value="1.8">Compact · recommended</option><option value="2.2">Small movements</option><option value="2.5">Very small movements</option></select>`;
  el("restart-camera").before(reachRow);
  const armRow = document.createElement("div");
  armRow.className = "setting-row";
  armRow.innerHTML = `<label for="arm-mode">Climbing controls</label><select id="arm-mode"><option value="anchors">Hand anchors · recommended</option><option value="mirror">Joint motors · previous experiment</option><option value="reach">Wrist reach · previous experiment</option></select>`;
  reachRow.before(armRow);
  const armSelect = el<HTMLSelectElement>("arm-mode");
  armSelect.value = camera.calibration.armMode ?? "anchors";
  const mirrorGainRow = document.createElement("div");
  mirrorGainRow.className = "setting-row";
  mirrorGainRow.innerHTML = `<label for="arm-gain">Mirrored movement range</label><select id="arm-gain"><option value="1.2">Wide movements</option><option value="1.8">Compact · recommended</option><option value="2.2">Small movements</option></select>`;
  armRow.after(mirrorGainRow);
  const armGain = el<HTMLSelectElement>("arm-gain");
  armGain.value = String(camera.calibration.armGain ?? 1.8);
  const showArmSettings = () => {
    reachRow.classList.toggle("hidden", armSelect.value === "mirror");
    mirrorGainRow.classList.toggle("hidden", armSelect.value !== "mirror");
  };
  showArmSettings();
  armSelect.onchange = () => {
    camera.calibration.armMode = armSelect.value as
      | "anchors"
      | "mirror"
      | "reach";
    camera.save();
    loadRoute(index);
    showArmSettings();
  };
  armGain.onchange = () => {
    camera.calibration.armGain = Number(armGain.value);
    camera.save();
  };
  const gainSelect = el<HTMLSelectElement>("motion-gain");
  const currentGain = camera.calibration.comfortGain ?? 1.8;
  const closestGain = [1.2, 1.8, 2.2, 2.5].sort(
    (a, b) => Math.abs(a - currentGain) - Math.abs(b - currentGain),
  )[0];
  gainSelect.value = String(closestGain);
  gainSelect.onchange = () => {
    camera.calibration.comfortGain = Number(gainSelect.value);
    camera.save();
  };
  const gripRow = document.createElement("div");
  gripRow.className = "setting-row";
  const savedShapes = Object.keys(camera.calibration.prototypes).length;
  gripRow.innerHTML = `<label for="grip-tuning">Grip recognition</label><select id="grip-tuning"><option value="automatic">Automatic shapes</option><option value="personal">My saved shapes (${savedShapes})</option></select>`;
  reachRow.after(gripRow);
  const gripSelect = el<HTMLSelectElement>("grip-tuning");
  gripSelect.value =
    camera.calibration.usePersonalGrips === false || !savedShapes
      ? "automatic"
      : "personal";
  gripSelect.onchange = () => {
    camera.calibration.usePersonalGrips = gripSelect.value === "personal";
    camera.save();
    camera.resetFilters();
  };
  el<HTMLSelectElement>("provider").value = camera.provider;
  void navigator.mediaDevices
    ?.enumerateDevices()
    .then((devices) => {
      const select = el<HTMLSelectElement>("device");
      for (const d of devices.filter((d) => d.kind === "videoinput")) {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${select.length}`;
        select.append(opt);
      }
    })
    .catch(() => {});
  el("sound-toggle").onclick = () => {
    save.muted = !save.muted;
    audio.muted = save.muted;
    persist();
    el("sound-toggle").textContent = save.muted ? "Off" : "On";
    audio.unlock();
  };
  el("motion-toggle").onclick = () => {
    save.reduced = !save.reduced;
    renderer.reduced = save.reduced;
    persist();
    el("motion-toggle").textContent = save.reduced ? "On" : "Off";
  };
  el("practice-mode").onclick = () => {
    camera.stop();
    closeModal();
    enter("practice");
  };
  el("restart-camera").onclick = () => {
    const provider = el<HTMLSelectElement>("provider").value,
      device = el<HTMLSelectElement>("device").value;
    closeModal();
    enter("camera");
    el("camera-preview").append(camera.video);
    void camera
      .start(provider, device)
      .then(() => {
        lastState = "";
      })
      .catch(() => {});
  };
  el("download-replay").onclick = () => download(sim.replay());
}
el("settings-button").onclick = settings;
const recenterButton = document.createElement("button");
recenterButton.id = "recenter-hands";
recenterButton.className = "secondary record-test-button";
recenterButton.textContent = "Recenter hands · C";
recenterButton.onclick = recenterClimb;
el("camera-status").before(recenterButton);
const motionFeedback = document.createElement("div");
motionFeedback.className = "motion-feedback hidden";
motionFeedback.innerHTML =
  '<span id="motion-label">HAND ANCHORS</span><strong id="motion-speed">0.0 m/s</strong><div class="meter"><i id="motion-energy"></i></div><p id="motion-cue">Sweep your arms to build a swing.</p>';
el("camera-status").before(motionFeedback);
let shownVelocity = { x: 0, y: 0 };
let motionTick = -1;
const recordButton = document.createElement("button");
recordButton.id = "record-test";
recordButton.className = "secondary record-test-button";
recordButton.textContent = "Record a local play test";
el("camera-status").before(recordButton);
const recordingBanner = document.createElement("div");
recordingBanner.id = "recording-banner";
recordingBanner.className = "recording-banner hidden";
recordingBanner.innerHTML =
  '<div><strong id="recording-clock">● RECORDING</strong><p id="recording-prompt"></p></div><button id="stop-recording">Stop & save</button>';
document.body.append(recordingBanner);
el("stop-recording").onclick = () => void testRecorder.stop();
recordButton.onclick = () => {
  showModal(
    '<div class="eyebrow">LOCAL CAMERA + GAMEPLAY TEST</div><h2>Let’s see the whole move.</h2><p>Record a 60-second split-screen video of your camera and the game, plus synchronized tracking diagnostics. Game sound is included; your microphone is not recorded.</p><label for="test-scenario">Test to record</label><select id="test-scenario"><option value="reach">Jug Ladder · reach and grips</option><option value="cross">Cross Current · crossed arms</option><option value="dyno">First Flight · dyno</option></select><p>The first 15 seconds guide the setup. The climb then arms automatically. Recording stops and saves after 60 seconds, or use Stop & save sooner.</p><p class="fine-print">Saved only on this computer in crux-motion/personal-recordings. Nothing is sent to an external service.</p><button class="primary" id="start-test-recording">Start recording test →</button>',
  );
  const swingOption = document.createElement("option");
  swingOption.value = "swing";
  swingOption.textContent = "Hand anchors · swing and momentum";
  el<HTMLSelectElement>("test-scenario").prepend(swingOption);
  const centeringOption = document.createElement("option");
  centeringOption.value = "centering";
  centeringOption.textContent = "Centering · follow and reset";
  el<HTMLSelectElement>("test-scenario").prepend(centeringOption);
  el<HTMLSelectElement>("test-scenario").value = "centering";
  el("start-test-recording").onclick = () => {
    const scenario = el<HTMLSelectElement>("test-scenario")
      .value as TestScenario;
    closeModal();
    void beginRecordedTest(scenario);
  };
};
async function beginRecordedTest(scenario: TestScenario) {
  try {
    if (!camera.ready) await useCamera();
    if (!camera.ready)
      throw new Error("Connect your camera before recording the test.");
    mode = "camera";
    if (scenario === "swing" || scenario === "centering") {
      camera.calibration.armMode = "anchors";
      camera.save();
    }
    loadRoute(scenario === "cross" ? 1 : scenario === "dyno" ? 8 : 0);
    if (reviewVideoUrl) {
      URL.revokeObjectURL(reviewVideoUrl);
      reviewVideoUrl = "";
    }
    const build = await fetch("build-info.json")
      .then((r) => r.json())
      .catch(() => null);
    let sound: MediaStream | undefined;
    try {
      sound = audio.recordingStream();
    } catch {}
    recordedSim = null;
    recordedEvent = 0;
    testStartQueued = false;
    testRecorder.start(
      scenario,
      {
        build,
        provider: camera.provider,
        delegate: camera.delegate,
        calibration: structuredClone(camera.calibration),
        camera: camera.stream?.getVideoTracks()[0]?.getSettings(),
        browser: navigator.userAgent,
        baselineFps: camera.fps,
        baselineInferenceMs: camera.inferenceMs,
        microphone: false,
      },
      sound,
    );
  } catch (e) {
    showModal(
      '<div class="eyebrow">RECORDING SETUP</div><h2>Recording could not start.</h2><p id="recording-error"></p>',
    );
    text("recording-error", e instanceof Error ? e.message : String(e));
  }
}
testRecorder.onChange = () => {
  recordingBanner.classList.toggle(
    "hidden",
    !testRecorder.active && !testRecorder.saving,
  );
  el<HTMLButtonElement>("stop-recording").disabled = testRecorder.saving;
  recordButton.disabled = testRecorder.active || testRecorder.saving;
  if (testRecorder.saving) {
    text("recording-clock", "Saving locally…");
    text(
      "recording-prompt",
      "Keep this tab open while the video and diagnostics are saved.",
    );
  }
};
testRecorder.onFinished = (result) => {
  sim.pause("Recorded test ended");
  reviewVideoUrl = URL.createObjectURL(result.video);
  showModal(
    '<div class="eyebrow">RECORDED PLAY TEST</div><h2>Now we can inspect it.</h2><video id="test-review-video" class="test-review-video" controls playsinline></video><p id="test-save-location"></p><p id="test-summary"></p><div id="test-findings"></div><p class="fine-print">Flags are observations to review in the video, not confirmed diagnoses.</p><button class="secondary" id="download-test-video">Download video</button><button class="secondary" id="download-test-data">Download diagnostics</button><button class="primary" id="repeat-recorded-test">Record another test →</button>',
  );
  el<HTMLVideoElement>("test-review-video").src = reviewVideoUrl;
  text(
    "test-save-location",
    result.saved
      ? `Saved locally: ${result.saved}`
      : "Automatic save was unavailable. Use the download buttons to keep both files.",
  );
  text(
    "test-summary",
    `${result.analysis.duration.toFixed(1)} seconds · ${result.analysis.catches} catches · ${result.analysis.slips} slips · camera frame age p95 ${Math.round(result.analysis.frameAgeP95)} ms`,
  );
  for (const finding of result.analysis.findings) {
    const p = document.createElement("p");
    p.textContent = `${finding.firstTime.toFixed(1)}s · ${finding.title} (${finding.seconds}s total). ${finding.detail}`;
    el("test-findings").append(p);
  }
  if (!result.analysis.findings.length)
    text(
      "test-findings",
      "No threshold-based issue flags. We still need to review the visible movement.",
    );
  el("download-test-video").onclick = () =>
    downloadBlob(result.video, "crux-motion-camera-gameplay.webm");
  el("download-test-data").onclick = () =>
    downloadBlob(
      new Blob([JSON.stringify(result.data)], { type: "application/json" }),
      "crux-motion-diagnostics.json",
    );
  el("repeat-recorded-test").onclick = () => {
    closeModal();
    void beginRecordedTest(testRecorder.scenario);
  };
};
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const rounded = (n: number) =>
  Number.isFinite(n) ? Math.round(n * 100000) / 100000 : 0;
const point = (p: { x: number; y: number }) => ({
  x: rounded(p.x),
  y: rounded(p.y),
});
const landmarks = (
  p: { x: number; y: number; z?: number; visibility?: number }[],
) => p.map((a) => [a.x, a.y, a.z ?? 0, a.visibility ?? 1].map(rounded));
function recordingFrame(now: number): TestFrame {
  if (recordedSim !== sim) {
    recordedSim = sim;
    recordedEvent = 0;
  }
  const next =
    (hands.some((side) => sim.contacts[side]?.hold.finish)
      ? sim.route.holds.find((h) => h.finish)
      : undefined) ??
    sim.route.holds.find((h) => h.checkpoint && !sim.visited.has(h.id)) ??
    sim.route.holds.find((h) => h.finish);
  const frameAge = camera.observation ? now - camera.observation.t : 99999;
  const handData = {} as Record<Hand, TestHand>;
  for (const side of hands) {
    const intent = inputs[side],
      h = sim.rig.hand(side),
      s = sim.rig.shoulder(side),
      aim = sim.rig.aim(side, inputs),
      r = camera.recognition[side];
    const poseSide = camera.calibration.mirrorLabels
      ? side === "left"
        ? "right"
        : "left"
      : side;
    const poseS = camera.observation?.pose[poseSide === "left" ? 11 : 12],
      wrist =
        camera.assigned[side]?.points[0] ??
        camera.observation?.pose[poseSide === "left" ? 15 : 16];
    const reference = camera.mapper.referencePixels[poseSide];
    const raw =
      poseS && wrist && camera.observation && reference
        ? Math.hypot(
            (wrist.x - poseS.x) * camera.observation.width,
            (wrist.y - poseS.y) * camera.observation.height,
          ) / reference
        : 0;
    handData[side] = {
      tracked: intent.quality && frameAge <= camera.maxFrameAgeMs,
      ready: intent.ready,
      grip: intent.grip,
      candidate: r.candidate,
      score: rounded(r.score),
      reason: r.reason,
      orientation: intent.orientation,
      reach: rounded(Math.hypot(intent.target.x, intent.target.y) / ARM_REACH),
      physicalReach: rounded(dist(s, h) / ARM_REACH),
      rawExtension: rounded(raw),
      aimError: rounded(dist(aim, h)),
      nextDistance: rounded(next ? dist(next.p, h) : 0),
      nextFromShoulder: rounded(next ? dist(next.p, s) : 0),
      contact: sim.contacts[side]?.hold.id ?? null,
      reserve: rounded(sim.reserve[side]),
      target: point(aim),
      hand: point(h),
      shoulder: point(s),
      features: (camera.currentFeatures[side] ?? []).map(rounded),
      landmarks: landmarks(camera.assigned[side]?.points ?? []),
      nearFrameEdge: camera.frameEdge[side],
      gripScores: camera.gripScores[side],
      worldLandmarks: landmarks(camera.assigned[side]?.world ?? []),
      arm: {
        source: camera.arms[side].source,
        requested: intent.arm ?? null,
        actual: sim.rig.pose(side, true),
        load: rounded(sim.contacts[side]?.load ?? 0),
        drift: rounded(sim.contacts[side]?.drift ?? 0),
      },
    };
  }
  const events = sim.events
    .filter((e) => e.id > recordedEvent)
    .map((e) => ({
      id: e.id,
      tick: e.tick,
      kind: e.kind,
      message: e.message,
      hand: e.hand,
    }));
  if (events.length) recordedEvent = events.at(-1)!.id;
  return {
    time: 0,
    phase: "",
    route: sim.route.id,
    state: sim.state,
    pauseReason: sim.pauseReason,
    tick: sim.tick,
    frameAge: rounded(frameAge),
    inferenceMs: rounded(camera.inferenceMs),
    fps: rounded(camera.fps),
    cameraSequence: camera.observation?.sequence ?? 0,
    cameraSampleTime: rounded(camera.observation?.t ?? 0),
    cameraVideoTime: rounded(camera.video.currentTime),
    controlCenter: camera.comfort.snapshot,
    recovery: {
      active: recoveryGate.active,
      reason: recoveryGate.reason,
      progress: rounded(recoveryGate.progress),
      safe: { ...camera.resetSafe },
      positionSpeed: { ...camera.positionSpeed },
    },
    view: {
      center: point(renderer.view.center),
      scale: rounded(renderer.scale),
    },
    armControl: {
      mode: camera.calibration.armMode ?? "anchors",
      gain: camera.calibration.armGain ?? 1.8,
      centers: {
        left: camera.arms.left.snapshot,
        right: camera.arms.right.snapshot,
      },
    },
    body: {
      position: point(sim.rig.com()),
      velocity: point(sim.rig.velocity()),
      angle: rounded(sim.rig.torso.getAngle()),
      angularVelocity: rounded(sim.rig.torso.getAngularVelocity()),
    },
    next: next ? { id: next.id, kind: next.kind, radius: next.radius } : null,
    hands: handData,
    pose: landmarks(camera.observation?.pose ?? []),
    events,
  };
}
window.addEventListener("beforeunload", (e) => {
  if (testRecorder.active || testRecorder.saving) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function download(r: Replay) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(r)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `crux-motion-${r.route}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
el("lab-button").onclick = () => {
  loadRoute(0);
  lab = true;
  sim.fatigue = false;
  sim.route = {
    ...sim.route,
    name: "Grip lab",
    subtitle: "Get to know your hands",
    hint: "Practice every shape. Watch the recognized grip, then catch its matching hold.",
    holds: [
      ...sim.route.holds.slice(0, 2),
      {
        id: "lab-edge",
        p: v(-0.38, 1.48),
        kind: "crimp",
        radius: 0.13,
        direction: v(0, 1),
      },
      {
        id: "lab-slope",
        p: v(0.36, 1.5),
        kind: "sloper",
        radius: 0.22,
        direction: v(0, 1),
      },
      {
        id: "lab-pinch",
        p: v(0, 1.87),
        kind: "pinch",
        radius: 0.16,
        direction: v(0, 1),
      },
    ],
  };
  updateLabels();
};
el("about-button").onclick = () =>
  showModal(
    `<div class="eyebrow">THE CAMPUS EXPERIMENT</div><h2>Move with intention.</h2><p>Begin with relaxed Jug fists near your chest. The countdown centers this comfortable pose. Small movements reach with a free hand; lowering a supporting fist pulls the body up. Spread your fingers to release.</p><div class="how-grid"><div><b>01 / REACH</b><p>Keep shoulders and both hands in frame. Crossing your arms crosses the climber’s arms. Recenter hands · C pauses safely so you can reset your pose.</p></div><div><b>02 / HOLD</b><p>Jug: relaxed fist. Crimp: hooked fingers. Sloper: rounded palm. Pinch: opposing thumb and fingers. Undercling: palm up with the shown grip.</p></div><div><b>03 / FLY</b><p>Build momentum while holding. Release, reach and catch. The body carries its real simulated velocity.</p></div></div><p class="fine-print">This is a game about feel. It doesn’t measure grip force or predict real climbing ability.</p>`,
  );
function startReview() {
  cancelHandsFree();
  replay = sim.replay();
  sim = new Simulation(routes[index], "review", replay.controller ?? "motors");
  sim.start();
  review = true;
  isReview = true;
  replayIndex = 0;
  lastSeen = 0;
  renderer.reset();
  audio.reset();
  lastState = "";
  updateLabels();
}
function checkpoint() {
  cancelHandsFree();
  const r = sim.replay(),
    to = lastCheckpoint;
  if (!to) return;
  const copy = new Simulation(
    routes[index],
    "checkpoint practice",
    r.controller ?? "motors",
  );
  copy.start();
  let n = 0;
  for (let t = 0; t < to; t++) {
    if (r.frames[n]?.tick === t) copy.setInput(r.frames[n++].input);
    copy.step();
  }
  copy.reserve = { left: 1, right: 1 };
  copy.energy = 1;
  copy.pause("Checkpoint practice · resources restored");
  sim = copy;
  checkpointPractice = true;
  el("session-mode").textContent = "CHECKPOINT PRACTICE";
  inputs = structuredClone(copy.input);
  renderer.reset();
  audio.reset();
  lastState = "";
}
function overlay() {
  const out = el("game-overlay");
  if (mode === "intro") {
    out.classList.add("hidden");
    return;
  }
  if (sim.state === "playing") {
    out.classList.add("hidden");
    return;
  }
  out.classList.remove("hidden");
  if (sim.state === "finished" || sim.state === "fallen") {
    if (sim.state === "finished" && !isReview && !lab) {
      const key = `${mode}${checkpointPractice ? ":checkpoint" : ""}:${sim.route.id}`;
      if (!save.cleared.includes(key)) save.cleared.push(key);
      save.best[key] = Math.min(save.best[key] || Infinity, sim.time);
      persist();
    }
    out.innerHTML = `<div class="overlay-card"><span class="eyebrow">${isReview ? "ROUTE REVIEW" : sim.state === "finished" ? "NICELY HELD." : "ONE MORE TRY."}</span><h2>${sim.state === "finished" ? "You found your flow." : "The next catch is yours."}</h2><p>${sim.state === "finished" ? `${sim.catchCount} catches · ${sim.time.toFixed(1)} seconds` : sim.lastCause || "Reach, pull, release. Timing makes the difference."}${isReview ? " · Review does not change your progress." : ""}</p><button class="primary" id="result-main">${isReview ? "Back to your climb" : sim.state === "finished" && index < 11 ? "Next route →" : "Try again ↻"}</button><div class="result-links"><button id="review">Review attempt</button>${lastCheckpoint && !isReview ? '<button id="checkpoint">Practice last catch</button>' : ""}<button id="save-replay">Save replay</button></div></div>`;
    el("result-main").onclick = () =>
      retryRoute(
        !isReview && sim.state === "finished" ? Math.min(index + 1, 11) : index,
      );
    el("review").onclick = startReview;
    el("save-replay").onclick = () => download(sim.replay());
    if (lastCheckpoint && !isReview) el("checkpoint").onclick = checkpoint;
  } else if (mode === "camera" && !isReview) {
    out.innerHTML = `<div class="overlay-card camera-start-card"><span class="eyebrow">HANDS-FREE START</span><h2 id="start-heading">Ready when you are.</h2><p id="start-instruction"></p><div class="start-checks"><span id="start-left"></span><span id="start-right"></span></div><div id="start-countdown" class="start-countdown" role="status" aria-live="polite"></div><button class="primary" id="resume">Begin climb →</button><button class="secondary" id="start-camera-settings">Open camera settings</button></div>`;
    el("resume").onclick = togglePause;
    el("start-camera-settings").onclick = settings;
    renderCameraStart(performance.now());
  } else {
    out.innerHTML = `<div class="overlay-card small"><span class="eyebrow">${sim.state === "ready" ? "FIND YOUR START" : "TAKE YOUR TIME"}</span><h2>${sim.state === "ready" ? "Ready when you are." : "A moment to reset."}</h2><p>${sim.pauseReason || (mode === "camera" ? "Match the start grips. Keep both hands visible, then begin." : "Drag a wrist to reach. Hold Space to pull upward. Your first hold is marked 1.")}</p><button class="primary" id="resume">${sim.state === "ready" ? "Begin climb" : "Resume climb"} <span>→</span></button></div>`;
    el("resume").onclick = togglePause;
  }
}
function hud() {
  motionFeedback.classList.toggle(
    "hidden",
    mode !== "camera" || camera.calibration.armMode === "reach",
  );
  if (sim.tick !== motionTick) {
    const velocity = sim.rig.velocity();
    const changed = sim.tick < motionTick;
    shownVelocity = changed
      ? { ...velocity }
      : {
          x: shownVelocity.x + 0.12 * (velocity.x - shownVelocity.x),
          y: shownVelocity.y + 0.12 * (velocity.y - shownVelocity.y),
        };
    motionTick = sim.tick;
  }
  const moving = Math.hypot(shownVelocity.x, shownVelocity.y);
  text(
    "motion-label",
    sim.flight > 0
      ? "IN FLIGHT"
      : `${sim.controller === "anchors" ? "HAND ANCHORS" : "JOINT MOTORS"} · MOMENTUM`,
  );
  text(
    "motion-speed",
    `${Math.abs(shownVelocity.x) > 0.12 ? (shownVelocity.x < 0 ? "← " : "→ ") : ""}${moving.toFixed(1)} m/s`,
  );
  el("motion-energy").style.width = `${Math.min(100, (moving / 2.4) * 100)}%`;
  text(
    "motion-cue",
    sim.flight > 0
      ? "Reach and close to catch."
      : shownVelocity.y > 0.4
        ? "Rising. Spread both hands to fly."
        : "Sweep side to side to swing. Tuck the supporting arm to pull.",
  );
  recenterButton.classList.toggle("hidden", mode !== "camera");
  recordButton.classList.toggle("hidden", mode !== "camera");
  const displayInput = isReview ? sim.input : inputs;
  orientationButton.classList.toggle("hidden", mode !== "practice");
  const total = sim.route.holds.filter((h) => h.checkpoint).length;
  const done = sim.route.holds.filter(
    (h) => h.checkpoint && sim.visited.has(h.id),
  ).length;
  el("progress-label").textContent =
    `${done} holds used · Match TOP${sim.route.goal === "flight" ? (sim.flew ? " · FLIGHT ✓" : " · FLIGHT") : sim.route.goal === "cross" ? (sim.crossed ? " · CROSS ✓" : " · CROSS") : ""}`;
  el("progress-fill").style.width =
    `${sim.state === "finished" ? 100 : (100 * done) / Math.max(1, total)}%`;
  el("clock").textContent =
    `${String(Math.floor(sim.time / 60)).padStart(2, "0")}:${String(Math.floor(sim.time % 60)).padStart(2, "0")}`;
  if (!lab && !isReview && mode === "camera") {
    const atTop = hands.some((side) => sim.contacts[side]?.hold.finish);
    const next =
      (atTop ? sim.route.holds.find((h) => h.finish) : undefined) ??
      sim.route.holds.find((h) => h.checkpoint && !sim.visited.has(h.id)) ??
      sim.route.holds.find((h) => h.finish);
    if (next) {
      const free = hands.find((side) => !sim.contacts[side]);
      const support = hands.find((side) => sim.contacts[side]);
      text(
        "hint",
        atTop
          ? "TOP reached. Match the other hand on TOP to finish. Intermediate holds may be skipped."
          : !free
            ? `Next: ${next.label === "TOP" ? "TOP · match both hands" : `hold ${next.label}`} · ${next.direction.y < -0.5 ? "Undercling" : gripNames[next.kind]}. Open one hand, reach a little and close. Lower the supporting fist a few centimetres to pull up. Recenter · C keeps grips safe.`
            : `Move your ${free} hand a little toward ${next.label === "TOP" ? "TOP" : `hold ${next.label}`} and form ${next.direction.y < -0.5 ? "Undercling" : gripNames[next.kind]}. ${support ? `Lower your ${support} fist a few centimetres to pull. Stay within the camera view.` : "Reach and close to catch."}`,
      );
    }
  }
  for (const side of hands) {
    const liveCamera = mode === "camera" && !isReview;
    const fresh =
      !!camera.observation &&
      performance.now() - camera.observation.t <= camera.maxFrameAgeMs;
    const shownGrip = liveCamera
      ? fresh
        ? camera.grips[side]
        : "unknown"
      : displayInput[side].grip;
    let cue = document.getElementById(`${side}-gesture-cue`);
    if (!cue) {
      cue = document.createElement("small");
      cue.id = `${side}-gesture-cue`;
      cue.className = "gesture-cue";
      el(`${side}-grip`).after(cue);
    }
    const orientation = liveCamera
      ? camera.currentInput?.[side].orientation
      : displayInput[side].orientation;
    const isUndercling = shownGrip === "jug" && orientation === "down";
    el(`${side}-grip`).textContent = isUndercling
      ? "Undercling"
      : gripNames[shownGrip];
    cue.textContent = isUndercling
      ? "Curled fingers with your palm up"
      : gripCues[shownGrip];
    if (liveCamera && camera.currentInput?.[side].quality) {
      const p = camera.currentInput[side].target;
      cue.textContent += ` · reach ${Math.round((Math.hypot(p.x, p.y) / ARM_REACH) * 100)}%`;
    }
    el(`${side}-reserve`).style.width = `${sim.reserve[side] * 100}%`;
    el(`${side}-contact`).textContent = sim.contacts[side]
      ? `${sim.contacts[side]!.hold.direction.y < -0.5 ? "Undercling" : gripNames[sim.contacts[side]!.hold.kind]} · held`
      : displayInput[side].target.y < 0.2
        ? "Unloaded · recovering"
        : "Free · reach";
  }
  if (mode === "camera" && camera.ready && !calibrating) {
    const fresh =
      !!camera.observation &&
      performance.now() - camera.observation.t <= camera.maxFrameAgeMs;
    const tracked =
      hands.every((s) => camera.currentInput?.[s].quality) && fresh;
    el("camera-status").textContent =
      `${camera.delegate} · ${Math.round(camera.fps)} fps · inference ${Math.round(camera.inferenceMs)} ms · ${tracked ? "Both arms tracked" : fresh ? "Brief position protection — check each hand" : "Waiting for a fresh camera frame"}`;
    let diagnostic = document.getElementById("recognition-status");
    if (!diagnostic) {
      diagnostic = document.createElement("p");
      diagnostic.id = "recognition-status";
      diagnostic.className = "recognition-status";
      el("camera-status").after(diagnostic);
    }
    diagnostic.textContent = hands
      .map((side) => {
        const r = camera.recognition[side];
        const name =
          r.candidate === "jug" &&
          camera.currentInput?.[side].orientation === "down"
            ? "Undercling"
            : gripNames[r.candidate];
        return `${side === "left" ? "L" : "R"}: ${fresh ? r.reason : "Frame delayed"} · ${name} · match ${Math.round(r.score * 100)}%`;
      })
      .join("\n");
  }
  el("recognition-status")?.classList.toggle("hidden", mode !== "camera");
  if (lastState !== sim.state) {
    lastState = sim.state;
    overlay();
  }
}
function frame(t: number) {
  if (t - last > 250 && sim.state === "playing" && mode !== "intro" && !review) {
    if (mode === "camera") recoverCamera("Game frames delayed");
    else sim.pause("Processing paused. Resume when you are ready.");
  }
  const dt = Math.min((t - last) / 1000, 0.1);
  last = t;
  if (
    mode === "camera" &&
    !review &&
    sim.state === "playing" &&
    (!camera.observation || t - camera.observation.t > camera.maxFrameAgeMs)
  ) {
    recoverCamera("Camera frames delayed");
  }
  if (mode === "practice" && !review) {
    for (const side of hands) {
      if (pull || extend) {
        inputs[side].target.y = pull ? 0.27 : 0.71;
        inputs[side].target.x = side === "left" ? -0.12 : 0.12;
      }
      if (
        inputs[side].grip === "release" &&
        side !== selected &&
        !dragging &&
        sim.cooldown[side] === 0
      ) {
        /* Deliberate release stays released until the player curls. */
      }
    }
    if (dragging) {
      inputs[selected].target = sub(pointer, sim.rig.shoulder(selected));
      inputs[selected].grip = "release";
      inputs[selected].ready = false;
    }
  }
  updateCalibration(t);
  updateCameraStart(t);
  if (!review) sim.setInput(inputs);
  accumulator += dt;
  while (accumulator >= sim.dt) {
    if (review && replay) {
      while (replay.frames[replayIndex]?.tick <= sim.tick) {
        sim.setInput(replay.frames[replayIndex++].input);
      }
      if (sim.tick >= replay.duration) {
        sim.pause("Review complete");
        review = false;
      }
    }
    sim.step();
    accumulator -= sim.dt;
  }
  for (const e of sim.events)
    if (e.id > lastSeen) {
      lastSeen = e.id;
      if (e.kind === "catch" && sim.visited.size > seenVisited) {
        seenVisited = sim.visited.size;
        lastCheckpoint = sim.tick;
      }
    }
  audio.play(sim.events);
  renderer.render(sim, selected, mode !== "intro", dt);
  if (testRecorder.active) {
    const elapsed = (t - testRecorder.started) / 1000;
    text("recording-clock", `● RECORDING ${Math.floor(elapsed)} / 60s`);
    text(
      "recording-prompt",
      recoveryGate.active
        ? "Return hands into the guide, match held grips and settle. Resume is automatic."
        : testPrompt(testRecorder.scenario, elapsed),
    );
    if (elapsed >= 15 && !testStartQueued) {
      testStartQueued = true;
      armCameraStart();
    }
    testRecorder.update(
      t,
      canvas,
      camera.video,
      camera.video.parentElement?.querySelector("canvas") ?? null,
      () => recordingFrame(t),
    );
  }
  if (t - lastHud > 100) {
    lastHud = t;
    hud();
  }
  requestAnimationFrame(frame);
}
sim.fatigue = false;
sim.start();
requestAnimationFrame(frame);
// Read-only diagnostics for integration tests and local troubleshooting.
Object.defineProperty(window, "cruxMotion", {
  value: {
    get snapshot() {
      return sim.summary();
    },
    get route() {
      return index;
    },
    get camera() {
      return {
        ready: camera.ready,
        provider: camera.provider,
        frames: camera.sequence,
        inferenceMs: camera.inferenceMs,
        tracks: camera.stream?.getTracks().length || 0,
      };
    },
  },
  writable: false,
});
