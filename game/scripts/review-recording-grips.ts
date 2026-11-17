import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classify, features } from "../src/tracking/gestures";
const folder = resolve(
  import.meta.dirname,
  "../../personal-recordings/2026-11-10T07-31-21-797Z-ea0c8fbd",
);
const data = JSON.parse(
  await readFile(resolve(folder, "telemetry.json"), "utf8"),
);
// Small manual review set from the synchronized camera image. Not a held-out accuracy benchmark.
const labels: [
  [number, "left" | "right", string],
  ...[number, "left" | "right", string][],
] = [
  [5.1, "left", "jug"],
  [5.1, "right", "jug"],
  [11.1, "left", "jug"],
  [11.1, "right", "jug"],
  [16.1, "right", "release"],
  [18.6, "right", "crimp"],
  [25.3, "right", "release"],
  [32.9, "left", "jug"],
  [32.9, "right", "jug"],
  [33.8, "right", "release"],
];
const results = labels.map(([time, side, manual]) => {
  const f = data.frames.reduce((a: any, b: any) =>
    Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b,
  );
  const points = f.hands[side].landmarks.map(
    ([x, y, z, visibility]: number[]) => ({ x, y, z, visibility }),
  );
  const found = classify(
    features(points, data.camera.width, data.camera.height),
  );
  return {
    time: f.time,
    side,
    manual,
    original: f.hands[side].candidate,
    current: found.grip,
    match: manual === found.grip,
  };
});
await writeFile(
  resolve(folder, "grip-review.json"),
  JSON.stringify(
    {
      kind: "Ten manually reviewed poses from one recorded test, inspected after tuning; not population accuracy or held-out validation",
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
