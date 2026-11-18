import type { Hold, Route, Grip } from "./types";
import { v } from "./math";
const hold = (
  id: string,
  x: number,
  y: number,
  kind: Hold["kind"] = "jug",
  opts: Partial<Hold> = {},
): Hold => ({
  id,
  p: v(x, y),
  kind,
  direction: v(0, 1),
  radius: kind === "crimp" ? 0.115 : kind === "pinch" ? 0.14 : 0.19,
  ...opts,
});
const names = [
  "Warmup Buckets",
  "Campus Rungs",
  "Razor Edges",
  "Twin Fins",
  "Pendulum Traverse",
  "Cross-Body",
  "Launchpad",
  "Under the Roof",
  "Split Decision",
  "Ricochet",
  "Vice Grip",
  "The King Line",
];
const hints = [
  "Start with relaxed Jug fists near your chest. Lower the supporting fist a little to pull up. Open the other hand, reach toward the glowing hold, then close into a Jug.",
  "Pull up and reach each symmetric campus rung in turn — or skip a rung straight to the next bucket.",
  "Claw hook · bend finger joints, palm open. Shake out a lowered free hand or detour to the side REST jug.",
  "Touch thumb & index tips out in front (beak/O-pinch). Squeeze opposing left and right pinch tufas up the pillar.",
  "Release one hand and ride your lateral pendulum swing across the wide traverse jugs.",
  "Cross one arm past your centerline onto the offset Jug & Pinch sequence, then uncross to TOP.",
  "Pull down hard on the launch jugs, open both hands together to dyno across the gap, and catch the big match bucket.",
  "Turn your palm up to scoop the inverted roof hold while your high hand opposes around the lip.",
  "Pick your beta: 2 fast high-drain Crimps up the left rail, or the 4-Jug endurance arc with a REST on the right.",
  "Match the offset launch bucket, build lateral swing, and launch a two-hand dyno across the wall.",
  "Alternate sharp crimps with angled sidepull pinches — tilt your hand sideways on PULL holds.",
  "Six-move king line: pinch off the ground, breathe on the REST jug, dyno the gap, and crimp to TOP.",
];
const beats = [
  "B1 · Jugs",
  "B1 · Jug Ladder",
  "B2 · Crimps & Rest",
  "B2 · Pinch Pillar",
  "B3 · Swing Line",
  "B3 · Twist & Reach",
  "B3 · Double Dyno",
  "B4 · Undercling Lip",
  "B4 · Dual Beta",
  "B5 · Swing Dyno",
  "B5 · Crimp + Sidepull Pinch",
  "B6 · Full Boulder",
];
const difficulties = [
  "B1",
  "B1",
  "B2",
  "B2",
  "B3",
  "B3",
  "B3",
  "B4",
  "B4",
  "B5",
  "B5",
  "B6",
];
export const routes: Route[] = names.map((name, i) => {
  const h: Hold[] = [
    hold("start-l", -0.32, 1.1, "jug", { label: "START" }),
    hold("start-r", 0.32, 1.1, "jug", { label: "START" }),
  ];
  let topOffset = 0.32;
  switch (i) {
    case 0: // 1. Warmup Buckets (B1 · Jugs) — generous alternating jugs to TOP
      h.push(hold("move-0", -0.22, 1.36, "jug", { checkpoint: true, label: "1", radius: 0.19 }));
      h.push(hold("move-1", 0.18, 1.62, "jug", { checkpoint: true, label: "2", radius: 0.19 }));
      h.push(hold("move-2", -0.14, 1.88, "jug", { checkpoint: true, label: "3", radius: 0.19 }));
      break;
    case 1: // 2. Campus Rungs (B1 · Jug Ladder) — symmetric center/offset campus rungs
      h.push(hold("move-0", 0.0, 1.38, "jug", { checkpoint: true, label: "1", match: true }));
      h.push(hold("move-1", -0.20, 1.64, "jug", { checkpoint: true, label: "2" }));
      h.push(hold("move-2", 0.20, 1.90, "jug", { checkpoint: true, label: "3" }));
      h.push(hold("move-3", 0.0, 2.16, "jug", { checkpoint: true, label: "4", match: true }));
      break;
    case 2: // 3. Razor Edges (B2 · Crimps & Rest) — sharp crimp rails + optional side REST jug
      h.push(hold("move-0", -0.28, 1.42, "crimp", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", 0.24, 1.68, "crimp", { checkpoint: true, label: "2" }));
      h.push(hold("rest", 0.48, 1.66, "jug", { match: true, label: "REST", radius: 0.18 }));
      h.push(hold("move-2", -0.18, 1.94, "crimp", { checkpoint: true, label: "3" }));
      break;
    case 3: // 4. Twin Fins (B2 · Pinch Pillar) — opposing left/right pinch tufas
      h.push(hold("move-0", -0.36, 1.40, "pinch", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", 0.30, 1.66, "pinch", { checkpoint: true, label: "2" }));
      h.push(hold("move-2", -0.26, 1.92, "pinch", { checkpoint: true, label: "3" }));
      h.push(hold("move-3", 0.22, 2.18, "pinch", { checkpoint: true, label: "4" }));
      break;
    case 4: // 5. Pendulum Traverse (B3 · Swing Line) — wide sweeping lateral traverse
      h.push(hold("move-0", -0.54, 1.36, "jug", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", -0.16, 1.60, "jug", { checkpoint: true, label: "2" }));
      h.push(hold("move-2", 0.44, 1.54, "jug", { checkpoint: true, label: "3" }));
      h.push(hold("move-3", 0.14, 1.86, "jug", { checkpoint: true, label: "4" }));
      break;
    case 5: // 6. Cross-Body (B3 · Twist & Reach) — tight centerline-crossing Jug & Pinch offsets
      h.push(hold("move-0", 0.28, 1.40, "jug", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", -0.26, 1.68, "pinch", { checkpoint: true, label: "2" }));
      h.push(hold("move-2", 0.22, 1.96, "pinch", { checkpoint: true, label: "3" }));
      break;
    case 6: // 7. Launchpad (B3 · Double Dyno) — open dyno gap to big match catch jug, then TOP
      h.push(hold("move-0", 0, 1.68, "jug", { checkpoint: true, label: "CATCH", match: true, radius: 0.24 }));
      topOffset = 0.32;
      break;
    case 7: // 8. Under the Roof (B4 · Undercling Lip) — inverted SCOOP opposing high lip pinch
      h.push(hold("move-0", -0.26, 1.48, "jug", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", 0.12, 1.20, "jug", { checkpoint: true, label: "SCOOP", direction: v(0, -1), radius: 0.17 }));
      h.push(hold("move-2", 0.24, 1.80, "pinch", { checkpoint: true, label: "LIP" }));
      h.push(hold("move-3", -0.14, 2.06, "jug", { checkpoint: true, label: "4" }));
      break;
    case 8: // 9. Split Decision (B4 · Dual Beta) — Left: 2 fast Crimps; Right: 4-Jug arc with REST
      h.push(hold("move-0", -0.38, 1.48, "crimp", { checkpoint: true, label: "L1" }));
      h.push(hold("move-1", -0.24, 1.92, "crimp", { checkpoint: true, label: "L2" }));
      h.push(hold("move-2", 0.34, 1.36, "jug", { checkpoint: true, label: "R1" }));
      h.push(hold("move-3", 0.42, 1.62, "jug", { checkpoint: true, match: true, label: "REST", radius: 0.19 }));
      h.push(hold("move-4", 0.32, 1.88, "jug", { checkpoint: true, label: "R3" }));
      h.push(hold("move-5", 0.18, 2.12, "jug", { checkpoint: true, label: "R4" }));
      topOffset = 0.28;
      break;
    case 9: // 10. Ricochet (B5 · Swing Dyno) — offset launch jug + lateral swing dyno across wall
      h.push(hold("move-0", -0.28, 1.40, "jug", { checkpoint: true, label: "LAUNCH", match: true, radius: 0.21 }));
      h.push(hold("move-1", 0.24, 1.84, "jug", { checkpoint: true, label: "CATCH", match: true, radius: 0.24 }));
      topOffset = 0.34;
      break;
    case 10: // 11. Vice Grip (B5 · Crimp + Sidepull Pinch) — mixed crimps & angled sidepull pinches
      h.push(hold("move-0", -0.20, 1.38, "crimp", { checkpoint: true, label: "1" }));
      h.push(hold("move-1", 0.22, 1.64, "pinch", { checkpoint: true, label: "PULL", direction: v(0.6, 0.8), radius: 0.16 }));
      h.push(hold("move-2", -0.22, 1.90, "pinch", { checkpoint: true, label: "PULL", direction: v(-0.6, 0.8), radius: 0.16 }));
      h.push(hold("move-3", 0.18, 2.16, "crimp", { checkpoint: true, label: "4" }));
      break;
    case 11: // 12. The King Line (B6 · Full Boulder) — pinch start, REST jug, dyno gap, crimp top-out
      h.push(hold("move-0", -0.30, 1.38, "pinch", { checkpoint: true, label: "1", radius: 0.15 }));
      h.push(hold("move-1", 0.12, 1.62, "jug", { checkpoint: true, match: true, label: "REST", radius: 0.21 }));
      h.push(hold("move-2", -0.04, 2.14, "jug", { checkpoint: true, match: true, label: "CATCH", radius: 0.24 }));
      h.push(hold("move-3", 0.18, 2.34, "crimp", { checkpoint: true, label: "4" }));
      h.push(hold("move-4", -0.16, 2.56, "crimp", { checkpoint: true, label: "5" }));
      topOffset = 0.28;
      break;
  }
  const topY = Math.max(...h.map((a) => a.p.y)) + topOffset;
  h.push(
    hold("top", 0, topY, "jug", {
      radius: 0.27,
      match: true,
      finish: true,
      label: "TOP",
    }),
  );
  return {
    id: `motion-${String(i + 1).padStart(2, "0")}`,
    name,
    subtitle: beats[i],
    hint: hints[i],
    difficulty: difficulties[i],
    holds: h,
    start: ["start-l", "start-r"],
    goal: "none",
    theme: ["#7ce3c6", "#f3ba77", "#a3bbed"][i % 3],
    fallY: -1.6,
  };
});
export const gripNames: Record<Grip, string> = {
  jug: "Jug",
  crimp: "Crimp",
  pinch: "Pinch",
  release: "Release",
  unknown: "Uncertain",
};
export const gripCues: Record<Grip, string> = {
  jug: "Relaxed fist",
  crimp: "Claw hook · bend finger joints, palm open",
  pinch: "Touch thumb & index tips out in front (beak/O-pinch)",
  release: "Let go · fingers straight and spread",
  unknown: "Hold a clear shape in view",
};
