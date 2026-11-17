import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Camera, type Observation } from "../src/tracking/Camera";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { dist, sub } from "../src/core/math";
const folder = resolve(
  import.meta.dirname,
  "../../personal-recordings",
  process.argv[2],
);
const d = JSON.parse(await readFile(resolve(folder, "telemetry.json"), "utf8"));
const landmarks = (a: number[][]) =>
  a.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
const c = new Camera({} as HTMLVideoElement),
  s = new Simulation(routes[0], "camera");
let sequence = -1,
  lastCenter = "",
  started = false,
  originalTick = 0;
const stats = {
  minDistance: Object.fromEntries(
    s.route.holds
      .filter((h) => h.checkpoint || h.finish)
      .map((h) => [h.id, 99]),
  ),
  states: [] as unknown[],
  maxJointError: 0,
  errors: [] as unknown[],
};
for (const f of d.frames) {
  if (f.cameraSequence !== sequence) {
    sequence = f.cameraSequence;
    const obs: Observation = {
      kind: "result",
      pose: landmarks(f.pose),
      detections: hands
        .filter((side) => f.hands[side].landmarks.length === 21)
        .map((side) => ({
          points: landmarks(f.hands[side].landmarks),
          label: side,
          score: 0.99,
        })),
      t: f.cameraSampleTime,
      sequence,
      width: d.camera.width,
      height: d.camera.height,
      inferenceMs: f.inferenceMs,
    };
    c.process(obs);
  }
  const center = JSON.stringify(f.controlCenter);
  if (f.controlCenter && center !== lastCenter) {
    c.recenter(
      {
        left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
        right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
      },
      { left: s.rig.pose("left", true), right: s.rig.pose("right", true) },
    );
    lastCenter = center;
    s.start();
    started = true;
  }
  if (started && c.currentInput) {
    s.setInput(c.currentInput);
    const ticks = Math.max(0, Math.min(12, f.tick - originalTick));
    for (let n = 0; n < ticks; n++) s.step();
    for (const h of s.route.holds.filter((h) => h.checkpoint || h.finish))
      for (const side of hands)
        stats.minDistance[h.id] = Math.min(
          stats.minDistance[h.id],
          dist(h.p, s.rig.hand(side)),
        );
    for (const side of hands) {
      const wanted = c.currentInput[side].arm,
        actual = s.rig.pose(side, true);
      if (wanted) {
        const error = Math.abs(
          Math.atan2(
            Math.sin(wanted.upper - actual.upper),
            Math.cos(wanted.upper - actual.upper),
          ),
        );
        stats.maxJointError = Math.max(stats.maxJointError, error);
        if (error > 1 && stats.errors.length < 8)
          stats.errors.push({
            time: f.time,
            side,
            wanted,
            actual,
            unwrapped:
              s.rig.arms[side].upper.getAngle() - s.rig.torso.getAngle(),
            torso: s.rig.torso.getAngle(),
            contact: s.contacts[side]?.hold.id,
            load: s.contacts[side]?.load,
          });
      }
    }
  }
  originalTick = f.tick;
}
const result = {
  kind: "Counterfactual replay of movements recorded under different controls. Not a human completion or a held-out benchmark.",
  summary: s.summary(),
  stats,
  events: s.events.map((e) => ({
    kind: e.kind,
    tick: e.tick,
    message: e.message,
    hand: e.hand,
  })),
};
await writeFile(
  resolve(folder, "mirror-replay-review.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
