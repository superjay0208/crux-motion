import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Camera, type Observation } from "../src/tracking/Camera";
import { AnchorRig } from "../src/core/AnchorRig";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { sub } from "../src/core/math";

const recordingsRoot = resolve(import.meta.dirname, "../../personal-recordings");
const landmarks = (a: number[][]) =>
  a.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));

async function evaluateSession(name: string) {
  const folder = resolve(recordingsRoot, name);
  const d = JSON.parse(
    await readFile(resolve(folder, "telemetry.json"), "utf8"),
  );
  let c = new Camera({} as HTMLVideoElement),
    s = new Simulation(routes[0], "camera"),
    sequence = -1,
    originalTick = 0,
    center = "",
    started = false;
  const attempts: unknown[] = [];
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
    const legacyStart = !f.controlCenter && !started && f.state === "playing";
    if ((f.controlCenter && next !== center) || legacyStart) {
      c.recenter(
        {
          left: sub(s.rig.hand("left"), s.rig.shoulder("left")),
          right: sub(s.rig.hand("right"), s.rig.shoulder("right")),
        },
        undefined,
        { left: !!s.contacts.left, right: !!s.contacts.right },
      );
      if (s.rig instanceof AnchorRig) s.rig.rebase();
      center = f.controlCenter ? next : "legacy-start";
      s.start();
      started = true;
    }
    if (started && c.currentInput) {
      s.setInput(c.currentInput);
      const serial = s.events.at(-1)?.id ?? 0;
      for (let t = 0; t < Math.max(0, Math.min(12, f.tick - originalTick)); t++) {
        s.step();
        maxAngle = Math.max(maxAngle, Math.abs(s.rig.torso.getAngle()));
        maxSpeed = Math.max(
          maxSpeed,
          Math.hypot(s.rig.velocity().x, s.rig.velocity().y),
        );
      }
      slips += s.events.filter((e) => e.id > serial && e.kind === "slip").length;
      for (const id of s.visited) unique.add(id);
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
  return { session: name, ...result };
}

const arg = process.argv[2];
if (arg && arg !== "--all") {
  const single = await evaluateSession(arg);
  console.log(JSON.stringify({ kind: single.kind, attempts: single.attempts }, null, 2));
} else {
  const entries = (await readdir(recordingsRoot)).sort();
  const sessions = [];
  for (const entry of entries) {
    try {
      await stat(resolve(recordingsRoot, entry, "telemetry.json"));
      sessions.push(await evaluateSession(entry));
    } catch {}
  }
  console.log(JSON.stringify({ sessions }, null, 2));
}
