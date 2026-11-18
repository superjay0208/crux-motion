import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pilot, type PilotOptions } from "./pilot";
import { routes } from "../src/core/levels";
import { Simulation, cloneInputs } from "../src/core/Simulation";
import type { Replay } from "../src/core/types";

const motorConfigs: PilotOptions[] = [
  { y: 0.35, offset: 0, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 20, finishInside: true, near: 0.65 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0, releaseTick: 20 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 20 },
  { y: 0.25, offset: 0.8, settle: 90 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 30 },
];

const anchorConfigs: PilotOptions[] = [
  { y: 0.35, offset: 0, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 1, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 1, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0, releaseTick: 20 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 20 },
  { y: 0.25, offset: 0.8, settle: 90 },
  { y: 0.25, offset: 0.8, settle: 0, releaseTick: 30 },
];

const round5 = (n: number) => Math.round(n * 100000) / 100000;

function summarizeSamples(samples: Float64Array) {
  const sorted = Float64Array.from(samples).sort();
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    steps: sorted.length,
    simulatedSeconds: Math.round((sorted.length / 120) * 100) / 100,
    meanMs: round5(sum / sorted.length),
    p50Ms: round5(at(0.5)),
    p95Ms: round5(at(0.95)),
    p99Ms: round5(at(0.99)),
    maxMs: round5(sorted[sorted.length - 1]),
  };
}

function buildReplays(
  controller: "anchors" | "motors",
  configs: PilotOptions[],
): Replay[] {
  return routes.map((_, i) =>
    pilot(i, { ...configs[i], controller }).replay(),
  );
}

function runSteps(
  controller: "anchors" | "motors",
  replays: Replay[],
  targetSteps: number,
  out?: Float64Array,
) {
  let routeCursor = 0;
  let sim: Simulation | null = null;
  let replay: Replay = replays[0];
  let frameIdx = 0;
  let activeInput = cloneInputs(replay.frames[0].input);

  for (let i = 0; i < targetSteps; i++) {
    if (!sim || sim.state !== "playing" || sim.tick >= replay.duration) {
      const idx = routeCursor % routes.length;
      routeCursor++;
      replay = replays[idx];
      sim = new Simulation(routes[idx], "benchmark", controller);
      sim.start();
      frameIdx = 0;
      activeInput = cloneInputs(replay.frames[0].input);
    }

    const t0 = performance.now();
    let changed = false;
    while (replay.frames[frameIdx]?.tick <= sim.tick) {
      activeInput = replay.frames[frameIdx++].input;
      changed = true;
    }
    if (changed || (sim.tick & 1) === 0) {
      sim.setInput(activeInput);
    }
    sim.step();
    const t1 = performance.now();
    if (out) out[i] = t1 - t0;
  }
}

const anchorReplays = buildReplays("anchors", anchorConfigs);
const motorReplays = buildReplays("motors", motorConfigs);

// JIT warm-up before timed measurement
runSteps("anchors", anchorReplays, 1200);
runSteps("motors", motorReplays, 1200);

const stepsPerController = 36000;
const totalSteps = stepsPerController * 2; // 72,000 steps = 600 simulated seconds at 120 Hz
const anchorSamples = new Float64Array(stepsPerController);
const motorSamples = new Float64Array(stepsPerController);
const combinedSamples = new Float64Array(totalSteps);

(globalThis as { gc?: () => void }).gc?.();
const heapBeforeBytes = process.memoryUsage().heapUsed;
const wallStart = performance.now();

runSteps("anchors", anchorReplays, stepsPerController, anchorSamples);
runSteps("motors", motorReplays, stepsPerController, motorSamples);

const totalWallMs = round5(performance.now() - wallStart);
const heapAfterBytes = process.memoryUsage().heapUsed;
const heapDeltaBytes = heapAfterBytes - heapBeforeBytes;
const heapDeltaMb = Math.round((heapDeltaBytes / (1024 * 1024)) * 1000) / 1000;

combinedSamples.set(anchorSamples, 0);
combinedSamples.set(motorSamples, stepsPerController);

const combined = summarizeSamples(combinedSamples);
const anchors = summarizeSamples(anchorSamples);
const motors = summarizeSamples(motorSamples);

if (combined.p95Ms >= 1.0 || anchors.p95Ms >= 1.0 || motors.p95Ms >= 1.0) {
  throw new Error(
    `Step latency p95 exceeded 1.0 ms gate: combined=${combined.p95Ms}ms anchors=${anchors.p95Ms}ms motors=${motors.p95Ms}ms`,
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  hz: 120,
  budgetP95Ms: 1.0,
  pass: true,
  totalWallMs,
  realtimeSpeedup: Math.round((combined.simulatedSeconds / (totalWallMs / 1000)) * 10) / 10,
  memory: {
    heapBeforeBytes,
    heapAfterBytes,
    heapDeltaBytes,
    heapDeltaMb,
  },
  combined,
  controllers: {
    anchors,
    motors,
  },
};

const outPath = resolve(import.meta.dirname, "../../validation/perf-benchmark.json");
await mkdir(resolve(import.meta.dirname, "../../validation"), { recursive: true });
await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");

console.log(
  `PASS 72,000 steps (${combined.simulatedSeconds}s @ 120 Hz) in ${totalWallMs.toFixed(1)}ms (${report.realtimeSpeedup}x realtime) · mean ${combined.meanMs}ms · p50 ${combined.p50Ms}ms · p95 ${combined.p95Ms}ms · p99 ${combined.p99Ms}ms · heap delta ${heapDeltaMb} MB`,
);
