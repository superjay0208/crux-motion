import { analyzeTest, type TestFrame } from "./analysis";
export type TestScenario = "reach" | "cross" | "dyno" | "swing" | "centering";
export const testIsPreparing = (
  active: boolean,
  started: number,
  now: number,
) => active && now - started < 15000;
export function testPrompt(scenario: TestScenario, seconds: number) {
  if (seconds < 5)
    return "Put the mouse down. Keep shoulders, elbows and both hands visible.";
  if (scenario === "centering") {
    if (seconds < 15)
      return "Relax both Jug fists near your chest. The climb starts automatically after the check.";
    if (seconds < 25)
      return "Both Jugs attached. Sweep gently sideways; the wall follows the climber.";
    if (seconds < 35)
      return "Slowly raise one fist toward the camera edge. The game should freeze before the hand leaves view.";
    if (seconds < 45)
      return "Bring both fists back near your chest, inside the guide. Settle; play resumes automatically.";
    return "Climb holds 1 and 2 with small reaches. Lower the supporting fist to pull up.";
  }
  if (scenario === "swing") {
    if (seconds < 15)
      return "Both relaxed Jug fists in view. Stay comfortable; the climb starts automatically after this check.";
    if (seconds < 30)
      return "Keep both Jugs attached. Sweep both hands gently side to side and watch the momentum meter.";
    if (seconds < 45)
      return "Open one hand, reach a little and catch hold 1. Tuck the supporting fist to pull.";
    return "Optional: build an upward pull, open both hands while rising, then reach and close to catch.";
  }
  if (scenario === "reach") {
    if (seconds < 10)
      return "Both Jug fists. Open LEFT fingers clearly, then close into Jug.";
    if (seconds < 15)
      return "Open RIGHT fingers clearly, then close. Return both hands to Jug.";
    return "Climb holds 1 and 2. Pull with the supporting fist; open, reach and close the free hand.";
  }
  if (scenario === "cross") {
    if (seconds < 15)
      return "One Jug and one open hand: slowly cross and uncross twice. Watch L and R.";
    return "Both Jug grips to start. Try the crossing route; keep each anatomical hand's identity.";
  }
  if (seconds < 15)
    return "Both Jug grips. Prepare to extend, pull down, release both, then reach and catch.";
  return "Build a pull, open both hands into flight, then reach and form Jug to catch. Retry as needed.";
}
const fit = (
  c: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  mirror = false,
) => {
  if (!sw || !sh) return;
  const scale = Math.min(w / sw, h / sh),
    dw = sw * scale,
    dh = sh * scale,
    dx = x + (w - dw) / 2,
    dy = y + (h - dh) / 2;
  c.save();
  if (mirror) {
    c.translate(dx + dw, dy);
    c.scale(-1, 1);
    c.drawImage(source, 0, 0, dw, dh);
  } else c.drawImage(source, dx, dy, dw, dh);
  c.restore();
};
export class TestRecorder {
  active = false;
  saving = false;
  scenario: TestScenario = "reach";
  started = 0;
  result: {
    video: Blob;
    data: Record<string, unknown>;
    analysis: ReturnType<typeof analyzeTest>;
    saved: string | null;
  } | null = null;
  canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private frames: TestFrame[] = [];
  private lastDraw = 0;
  private finishing = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private stopResolve:
    | ((value: NonNullable<TestRecorder["result"]>) => void)
    | null = null;
  private ending: Promise<NonNullable<TestRecorder["result"]>> | null = null;
  private metadata: Record<string, unknown> = {};
  onChange = () => {};
  onFinished: (result: NonNullable<TestRecorder["result"]>) => void = () => {};
  constructor() {
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.context = this.canvas.getContext("2d", { alpha: false })!;
  }
  start(
    scenario: TestScenario,
    metadata: Record<string, unknown>,
    audio?: MediaStream,
  ) {
    if (this.active || this.saving)
      throw new Error("A recording is already running or saving.");
    if (typeof MediaRecorder === "undefined" || !this.canvas.captureStream)
      throw new Error(
        "This browser does not support local video recording. Use desktop Chrome or Edge.",
      );
    this.scenario = scenario;
    this.metadata = metadata;
    this.result = null;
    this.frames = [];
    this.chunks = [];
    this.ending = null;
    this.lastDraw = 0;
    this.finishing = false;
    const supported = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!supported)
      throw new Error("WebM recording is unavailable in this browser.");
    this.stream = this.canvas.captureStream(20);
    for (const track of audio?.getAudioTracks() ?? [])
      this.stream.addTrack(track.clone());
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, {
        mimeType: supported,
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 64000,
      });
    } catch (e) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      throw e;
    }
    this.recorder = rec;
    const invoked = performance.now();
    rec.onstart = () => {
      this.metadata.encoderStartDelayMs = Math.round(
        performance.now() - invoked,
      );
    };
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    rec.onstop = () => void this.finish(rec.mimeType);
    rec.onerror = () =>
      void this.stop("Encoder error; partial recording retained");
    try {
      rec.start(1000);
    } catch (e) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.recorder = null;
      throw e;
    }
    this.started = performance.now();
    this.active = true;
    this.timeout = setTimeout(
      () => void this.stop("60-second test complete"),
      60000,
    );
    this.onChange();
  }
  update(
    now: number,
    wall: HTMLCanvasElement,
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement | null,
    snapshot: () => TestFrame,
  ) {
    if (!this.active || now - this.lastDraw < 45) return;
    this.lastDraw = now;
    const frame = snapshot();
    frame.time = Math.max(0, (now - this.started) / 1000);
    frame.phase = testPrompt(this.scenario, frame.time);
    if (frame.recovery?.active)
      frame.phase =
        "Climb frozen. Return hands into the guide, match held grips and settle. Resume is automatic.";
    this.frames.push(frame);
    const c = this.context;
    c.fillStyle = "#0e1d24";
    c.fillRect(0, 0, 1280, 720);
    c.fillStyle = "#e3f4ec";
    c.font = "bold 20px sans-serif";
    c.fillText(`CRUX MOTION · ${this.scenario.toUpperCase()} TEST`, 20, 28);
    c.font = "16px monospace";
    c.fillText(
      `${frame.time.toFixed(1)}s · ${frame.route} · ${frame.state} · tick ${frame.tick}`,
      660,
      28,
    );
    c.fillStyle = "#182d34";
    c.fillRect(16, 50, 720, 612);
    c.fillRect(752, 50, 512, 288);
    fit(c, wall, wall.width, wall.height, 16, 50, 720, 612);
    if (video.readyState >= 2) {
      fit(
        c,
        video,
        video.videoWidth,
        video.videoHeight,
        752,
        50,
        512,
        288,
        true,
      );
      if (overlay)
        fit(c, overlay, overlay.width, overlay.height, 752, 50, 512, 288);
    }
    c.fillStyle = "#e6d4ab";
    c.font = "15px monospace";
    c.fillText(
      `CAMERA age ${Math.round(frame.frameAge)}ms · infer ${Math.round(frame.inferenceMs)}ms · ${Math.round(frame.fps)}fps`,
      760,
      366,
    );
    let y = 400;
    for (const side of ["left", "right"] as const) {
      const h = frame.hands[side];
      c.fillStyle = side === "left" ? "#93e7cf" : "#edbd8d";
      c.font = "bold 20px sans-serif";
      c.fillText(
        `${side.toUpperCase()} · ${h.grip} · ${h.tracked ? "POSITION OK" : "POSITION LOST"}`,
        760,
        y,
      );
      y += 28;
      c.font = "14px monospace";
      for (const line of [
        `candidate ${h.candidate} (${Math.round(h.score * 100)}%) · ${h.ready ? "catch ready" : "no new catch"}`,
        `aim reach ${Math.round(h.reach * 100)}% · actual ${Math.round(h.physicalReach * 100)}% · error ${h.aimError.toFixed(2)}m`,
        `contact ${h.contact ?? "FREE"} · reserve ${Math.round(h.reserve * 100)}%`,
        `next distance ${h.nextDistance.toFixed(2)}m · ${h.reason}`,
      ]) {
        c.fillText(line.slice(0, 67), 760, y);
        y += 22;
      }
      y += 20;
    }
    c.fillStyle = "#9ce5ce";
    c.font = "15px sans-serif";
    c.fillText(frame.phase.slice(0, 145), 20, 697);
    if (frame.state !== "playing") {
      c.fillStyle = "#edbd8d";
      c.font = "bold 16px sans-serif";
      c.fillText(
        `${frame.state.toUpperCase()}: ${frame.pauseReason || "Waiting for hands-free start"}`.slice(
          0,
          95,
        ),
        30,
        646,
      );
    }
  }
  stop(reason = "Stopped by player") {
    if (this.ending) return this.ending;
    if (!this.active) return Promise.resolve(this.result);
    this.metadata.stopReason = reason;
    this.active = false;
    this.saving = true;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.ending = new Promise((resolve) => {
      this.stopResolve = resolve;
    });
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    else void this.finish(this.recorder.mimeType);
    this.onChange();
    return this.ending;
  }
  private async finish(mime: string) {
    if (this.finishing) return;
    this.finishing = true;
    const analysis = analyzeTest(this.frames),
      video = new Blob(this.chunks, { type: mime });
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    const data = {
      version: 1,
      kind: "Personal camera and gameplay diagnostic recording",
      createdAt: new Date().toISOString(),
      ...this.metadata,
      scenario: this.scenario,
      video: {
        mime,
        bytes: video.size,
        width: 1280,
        height: 720,
        targetFps: 20,
      },
      analysis,
      frames: this.frames,
    };
    let saved: string | null = null;
    try {
      const start = await fetch("api/recordings/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: this.scenario }),
        signal: AbortSignal.timeout(15000),
      });
      if (!start.ok) throw new Error("Local saving unavailable");
      const { id, token } = await start.json();
      const headers = { "X-Recording-Token": token };
      const v = await fetch(`api/recordings/${id}/video`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "video/webm" },
        body: video,
        signal: AbortSignal.timeout(30000),
      });
      if (!v.ok) throw new Error("Video could not save");
      const t = await fetch(`api/recordings/${id}/telemetry`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15000),
      });
      if (!t.ok) throw new Error("Telemetry could not save");
      saved = (await t.json()).folder;
    } catch {
      /* Keep both blobs available for explicit downloads in the review. */
    }
    this.chunks = [];
    this.frames = [];
    this.result = { video, data, analysis, saved };
    this.saving = false;
    this.onChange();
    this.stopResolve?.(this.result);
    this.onFinished(this.result);
  }
}
