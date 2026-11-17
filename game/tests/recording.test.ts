import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  analyzeTest,
  type TestFrame,
  type TestHand,
} from "../src/debug/analysis";
import {
  testPrompt,
  testIsPreparing,
  TestRecorder,
} from "../src/debug/Recorder";
import { AudioFeedback } from "../src/render/Audio";

const hand = (): TestHand => ({
  tracked: true,
  ready: true,
  grip: "jug",
  candidate: "jug",
  score: 0.9,
  reason: "Recognized",
  orientation: "up",
  reach: 0.8,
  physicalReach: 0.8,
  rawExtension: 0.7,
  aimError: 0.03,
  nextDistance: 0.5,
  nextFromShoulder: 0.6,
  contact: "start",
  reserve: 1,
  target: { x: 0, y: 1 },
  hand: { x: 0, y: 1 },
  shoulder: { x: 0, y: 0.4 },
  features: [],
  landmarks: [],
});
const frame = (time: number): TestFrame => ({
  time,
  phase: "reach",
  route: "motion-01",
  state: "playing",
  pauseReason: "",
  tick: Math.round(time * 120),
  frameAge: 75,
  inferenceMs: 50,
  fps: 15,
  cameraSequence: Math.round(time * 15),
  cameraSampleTime: time * 1000,
  cameraVideoTime: time,
  next: { id: "move-0", kind: "jug", radius: 0.18 },
  hands: { left: hand(), right: hand() },
  pose: [],
  events: [],
});
describe("recorded-test analysis", () => {
  it("blocks starting during the entire recording preparation period", () => {
    expect(testIsPreparing(true, 1000, 1000)).toBe(true);
    expect(testIsPreparing(true, 1000, 15999)).toBe(true);
    expect(testIsPreparing(true, 1000, 16000)).toBe(false);
    expect(testIsPreparing(false, 1000, 2000)).toBe(false);
  });
  it("guides a separate mirror/swing test without asking for an early grip release", () => {
    expect(testPrompt("swing", 7)).toContain("automatically");
    expect(testPrompt("swing", 20)).toContain("side to side");
    expect(testPrompt("swing", 35)).toContain("hold 1");
    expect(testPrompt("swing", 50)).toContain("while rising");
  });
  it("guides boundary recovery without requiring a mouse or a deliberate release", () => {
    expect(testPrompt("centering", 8)).toContain("chest");
    expect(testPrompt("centering", 20)).toContain("wall follows");
    expect(testPrompt("centering", 30)).toContain("freeze");
    expect(testPrompt("centering", 40)).toContain("automatically");
    expect(testPrompt("centering", 50)).toContain("holds 1 and 2");
  });
  it("distinguishes short mapping from a physical hand behind a correctly extended aim", () => {
    const frames = Array.from({ length: 30 }, (_, i) => frame(i * 0.1));
    for (const f of frames) {
      f.hands.left.contact = null;
      f.hands.left.rawExtension = 0.98;
      f.hands.left.reach = 0.55;
      f.hands.left.aimError = 0.02;
      f.hands.right.contact = null;
      f.hands.right.reach = 1;
      f.hands.right.aimError = 0.3;
    }
    const a = analyzeTest(frames);
    expect(
      a.findings.some((f) => f.title === "Left real extension mapped short"),
    ).toBe(true);
    expect(
      a.findings.some(
        (f) => f.title === "Left aim reached farther than the physical hand",
      ),
    ).toBe(false);
    expect(
      a.findings.some(
        (f) => f.title === "Right aim reached farther than the physical hand",
      ),
    ).toBe(true);
  });
  it("flags a near-hold wrong grip without declaring model accuracy", () => {
    const frames = Array.from({ length: 20 }, (_, i) => frame(i * 0.1));
    for (const f of frames) {
      f.hands.left.contact = null;
      f.hands.left.grip = "pinch";
      f.hands.left.nextDistance = 0.15;
    }
    const a = analyzeTest(frames);
    expect(a.findings.some((f) => f.title.includes("incompatible grip"))).toBe(
      true,
    );
    expect(a.limitation).toContain("not verified root causes");
  });
  it("does not call a paused setup an active physical reach failure", () => {
    const frames = Array.from({ length: 20 }, (_, i) => frame(i * 0.1));
    for (const f of frames) {
      f.state = "ready";
      f.hands.left.contact = null;
      f.hands.left.aimError = 0.7;
    }
    expect(
      analyzeTest(frames).findings.some((f) =>
        f.title.includes("physical hand"),
      ),
    ).toBe(false);
  });
  it("keeps preparation and active prompts separate", () => {
    expect(testPrompt("reach", 2)).toContain("mouse down");
    expect(testPrompt("reach", 7)).toContain("LEFT");
    expect(testPrompt("reach", 12)).toContain("RIGHT");
    expect(testPrompt("reach", 20)).toContain("Climb holds");
    expect(testPrompt("cross", 10)).toContain("cross and uncross");
    expect(testPrompt("dyno", 20)).toContain("flight");
  });
});

let server: Server | undefined,
  folder = "";
afterEach(async () => {
  vi.unstubAllGlobals();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolveClose) =>
      server!.close(() => resolveClose()),
    );
    server = undefined;
  }
  if (folder) {
    const root = resolve(tmpdir());
    if (
      dirname(folder) !== root ||
      !basename(folder).startsWith("crux-recording-test-")
    )
      throw new Error("Unsafe test cleanup path");
    await rm(folder, { recursive: true });
    folder = "";
  }
});
describe("recorder lifecycle", () => {
  it("feeds continuous silence so the video encoder does not wait for the first game sound", () => {
    const source = { offset: { value: 1 }, connect: vi.fn(), start: vi.fn() };
    const dest = { stream: {} };
    const make = vi.fn(() => source);
    class Context {
      resume() {
        return Promise.resolve();
      }
      createMediaStreamDestination() {
        return dest;
      }
      createConstantSource = make;
    }
    vi.stubGlobal("AudioContext", Context);
    const sound = new AudioFeedback();
    expect(sound.recordingStream()).toBe(dest.stream);
    sound.recordingStream();
    expect(make).toHaveBeenCalledOnce();
    expect(source.offset.value).toBe(0);
    expect(source.start).toHaveBeenCalledOnce();
    expect(source.connect).toHaveBeenCalledWith(dest);
  });
  it("retains downloadable output when local saving fails and stops only its own tracks", async () => {
    const outputStop = vi.fn(),
      cloneStop = vi.fn(),
      sourceStop = vi.fn();
    const outputTracks: { stop: () => void }[] = [{ stop: outputStop }];
    const stream = {
      getTracks: () => outputTracks,
      addTrack: (t: { stop: () => void }) => outputTracks.push(t),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}),
      captureStream: () => stream,
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    class Encoder {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "video/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])]),
          });
          this.onstop?.();
        });
      }
    }
    vi.stubGlobal("MediaRecorder", Encoder);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = new TestRecorder();
    r.start("reach", { microphone: false }, {
      getAudioTracks: () => [
        { stop: sourceStop, clone: () => ({ stop: cloneStop }) },
      ],
    } as unknown as MediaStream);
    expect(r.active).toBe(true);
    const result = await r.stop();
    expect(r.active).toBe(false);
    expect(r.saving).toBe(false);
    expect(result!.video.size).toBe(4);
    expect(result!.saved).toBe(null);
    expect(outputStop).toHaveBeenCalledOnce();
    expect(cloneStop).toHaveBeenCalledOnce();
    expect(sourceStop).not.toHaveBeenCalled();
  });
});
async function localServer() {
  folder = await mkdtemp(join(resolve(tmpdir()), "crux-recording-test-"));
  const modulePath = "../scripts/recordings.mjs";
  const { createRecordingHandler } = await import(modulePath);
  const handle = createRecordingHandler(folder);
  server = createServer(async (req, res) => {
    if (
      !(await handle(req, res, new URL(req.url!, "http://localhost").pathname))
    ) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}
describe("private local recording storage", () => {
  it("rejects a foreign origin and does not serve personal videos", async () => {
    const base = await localServer();
    expect(
      (
        await fetch(`${base}/api/recordings/start`, {
          method: "POST",
          headers: { Origin: "https://example.com" },
        })
      ).status,
    ).toBe(403);
    expect((await fetch(`${base}/api/recordings/private/video`)).status).toBe(
      403,
    );
    expect(await readdir(folder)).toEqual([]);
  });
  it("saves matching video and diagnostics into a new local folder with a token", async () => {
    const base = await localServer();
    const start = await fetch(`${base}/api/recordings/start`, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "reach" }),
    });
    expect(start.status).toBe(201);
    const { id, token } = await start.json();
    const video = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]); // Storage envelope fixture, not an encoded-video claim.
    expect(
      (
        await fetch(`${base}/api/recordings/${id}/video`, {
          method: "POST",
          headers: { Origin: base },
          body: video,
        })
      ).status,
    ).toBe(403);
    const headers = { Origin: base, "X-Recording-Token": token };
    expect(
      (
        await fetch(`${base}/api/recordings/${id}/video`, {
          method: "POST",
          headers,
          body: video,
        })
      ).status,
    ).toBe(201);
    const data = {
      version: 1,
      scenario: "reach",
      frames: [],
      analysis: analyzeTest([]),
    };
    const saved = await fetch(`${base}/api/recordings/${id}/telemetry`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    expect(saved.status).toBe(201);
    expect((await saved.json()).complete).toBe(true);
    expect(await readFile(join(folder, id, "camera-gameplay.webm"))).toEqual(
      video,
    );
    expect(
      JSON.parse(await readFile(join(folder, id, "telemetry.json"), "utf8"))
        .scenario,
    ).toBe("reach");
    expect(await readFile(join(folder, id, "analysis.md"), "utf8")).toContain(
      "not verified root causes",
    );
  });
});
