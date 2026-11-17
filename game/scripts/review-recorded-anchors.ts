import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Camera, type Observation } from "../src/tracking/Camera";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { sub } from "../src/core/math";
const folder = resolve(
  import.meta.dirname,
  "../../personal-recordings",
  process.argv[2],
);
const d = JSON.parse(await readFile(resolve(folder, "telemetry.json"), "utf8"));
const landmarks = (a: number[][]) =>
  a.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
let c = new Camera({} as HTMLVideoElement),
  s = new Simulation(routes[0], "camera"),
  sequence = -1,
  originalTick = 0,
  center = "",
  started = false;
const attempts: any[] = [];
let maxAngle = 0,
  slips = 0,
  unique = new Set<string>(),
  maxSpeed = 0;
const finish = () => {
  if (started)
    attempts.push({
      summary: s.summary(),
      maxTorsoAngle: maxAngle,
      overloadSlips: slips,
      uniqueProgress: [...unique],
      maxSpeed,
    });
};
for (const f of d.frames) {
  if (f.tick < originalTick) {
    finish();
    c = new Camera({} as HTMLVideoElement);
    s = new Simulation(routes[0], "camera");
    sequence = -1;
    center = "";
    started = false;
    maxAngle = slips = maxSpeed = 0;
    unique = new Set();
  }
  if (f.cameraSequence !== sequence) {
    sequence = f.cameraSequence;
    const o: Observation = {
      kind: "result",
      pose: landmarks(f.pose),
      detections: hands
        .filter((side) => f.hands[side].landmarks.length === 21)
        .map((side) => ({
          points: landmarks(f.hands[side].landmarks),
          world:
            f.hands[side].worldLandmarks?.length === 21
              ? landmarks(f.hands[side].worldLandmarks)
              : undefined,
          label: side,
          score: 0.99,
        })),
      t: f.cameraSampleTime,
      sequence,
      width: d.camera.width,
      height: d.camera.height,
      inferenceMs: f.inferenceMs,
    };
    c.process(o);
  }
  const next = JSON.stringify(f.controlCenter);
  if (f.controlCenter && next !== center) {
    c.recenter({
      left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
      right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
    });
    center = next;
    s.start();
    started = true;
  }
  if (started && c.currentInput) {
    s.setInput(c.currentInput);
    const serial = s.events.at(-1)?.id ?? 0;
    for (let t = 0; t < Math.max(0, Math.min(12, f.tick - originalTick)); t++)
      s.step();
    slips += s.events.filter((e) => e.id > serial && e.kind === "slip").length;
    for (const id of s.visited) unique.add(id);
    maxAngle = Math.max(maxAngle, Math.abs(s.rig.torso.getAngle()));
    maxSpeed = Math.max(
      maxSpeed,
      Math.hypot(s.rig.velocity().x, s.rig.velocity().y),
    );
  }
  originalTick = f.tick;
}
finish();
const result = {
  kind: "Counterfactual: original landmarks replayed against changed controls. Not a human attempt, ground truth, or a completion claim.",
  attempts,
};
await writeFile(
  resolve(folder, "anchor-replay-review.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
