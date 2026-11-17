import { pilot, type PilotOptions } from "./pilot";
import { routes } from "../src/core/levels";
const options: PilotOptions[] = [];
for (const y of process.argv.includes("--anchors")
  ? [0.25, 0.15, 0.35, 0.45]
  : [0.35, 0.45, 0.25, 0.55, 0.65])
  for (const offset of process.argv.includes("--anchors")
    ? [0.8, 1, 1.3, 1.6, 0, 0.4]
    : [0, 0.2, 0.4, 0.6, 0.8, 1])
    for (const settle of [0, 20, 90]) options.push({ y, offset, settle });
for (const i of process.argv[2]
  ? process.argv[2].split(",").map(Number)
  : Array.from({ length: 12 }, (_, i) => i)) {
  let best = 0,
    bestResult = null;
  let finished = false;
  for (const o of options) {
    for (const releaseTick of i === 8 || i === 9
      ? [15, 20, 25, 30, 35, 45]
      : [30]) {
      const config = {
        ...o,
        releaseTick,
        controller: process.argv.includes("--anchors")
          ? ("anchors" as const)
          : ("motors" as const),
      };
      const s = pilot(i, config);
      if (s.visited.size >= best) {
        best = s.visited.size;
        bestResult = { config, summary: s.summary() };
      }
      if (s.state === "finished") {
        console.log(JSON.stringify({ index: i, config, summary: s.summary() }));
        finished = true;
        break;
      }
    }
    if (finished) break;
  }
  if (!finished) console.log(JSON.stringify({ FAILED: i, bestResult }));
}
