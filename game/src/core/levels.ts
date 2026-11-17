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
  "Jug Ladder",
  "Cross Current",
  "Edge Etiquette",
  "Pendulum Bay",
  "Soft Landing",
  "Under the Lip",
  "Pinch Point",
  "Quiet Apex",
  "First Flight",
  "Catch and Carry",
  "Crosswind",
  "Campus Circuit",
];
const hints = [
  "Start with relaxed Jug fists near your chest. Lower the supporting fist a little to pull up. Open the other hand, reach a little toward the glowing hold, then close it into a Jug.",
  "Cross your left arm over your right, catch the marked hold, then uncross.",
  "Hook your fingers on the amber edge. Rest the free hand low to recover.",
  "Release one hand and use the swing to reach across.",
  "Cup your fingers together. Settle underneath the rounded hold.",
  "Scoop under the inverted lip while your other hand supports your weight.",
  "Oppose thumb and fingers for a pinch. Turn your hand for the sidepull.",
  "Use the top of the swing to catch the edge softly.",
  "Pull down, spread both hands to release, then reach and curl onto the landing.",
  "Carry the catch into your next swing.",
  "Choose a rest or keep the rhythm through the crossing.",
  "Link the gestures, cross, and commit to the final flight.",
];
const beats = [
  "Reach · Catch · Match",
  "Cross · Catch · Uncross",
  "Hook · Move · Recover",
  "Load · Swing · Reach",
  "Cup · Align · Settle",
  "Support · Scoop · Transfer",
  "Pinch · Oppose · Move",
  "Swing · Float · Catch",
  "Load · Pull · Fly",
  "Catch · Recoil · Flow",
  "Read · Rest · Commit",
  "Everything comes together",
];
export const routes: Route[] = names.map((name, i) => {
  const h: Hold[] = [
    hold("start-l", -0.32, 1.1, "jug", { label: "START" }),
    hold("start-r", 0.32, 1.1, "jug", { label: "START" }),
  ];
  const layouts: [number, number, Hold["kind"]][][] = [
    [
      [-0.22, 1.34, "jug"],
      [0.14, 1.58, "jug"],
      [-0.1, 1.82, "jug"],
    ],
    [
      [0.48, 1.45, "jug"],
      [-0.34, 1.83, "jug"],
      [0.3, 2.2, "jug"],
    ],
    [
      [-0.36, 1.45, "crimp"],
      [0.35, 1.82, "jug"],
      [-0.25, 2.18, "crimp"],
    ],
    [
      [-0.73, 1.35, "jug"],
      [-0.14, 1.84, "jug"],
      [0.56, 2.13, "jug"],
    ],
    [
      [-0.37, 1.43, "sloper"],
      [0.26, 1.79, "jug"],
      [-0.21, 2.14, "sloper"],
    ],
    [
      [-0.32, 1.48, "jug"],
      [0.1, 1.15, "jug"],
      [0.33, 1.94, "jug"],
    ],
    [
      [-0.4, 1.42, "pinch"],
      [0.3, 1.8, "pinch"],
      [0.12, 2.12, "jug"],
    ],
    [
      [-0.55, 1.42, "jug"],
      [0.2, 1.92, "crimp"],
      [-0.2, 2.28, "jug"],
    ],
    [[0, 1.7, "jug"]],
    [
      [0, 1.7, "jug"],
      [-0.38, 2.08, "jug"],
    ],
    [
      [0.46, 1.42, "pinch"],
      [-0.1, 1.68, "sloper"],
      [0.36, 2.04, "jug"],
    ],
    [
      [-0.35, 1.44, "crimp"],
      [0.32, 1.82, "pinch"],
      [-0.27, 2.19, "jug"],
      [0.17, 2.45, "jug"],
    ],
  ];
  layouts[i].forEach(([x, y, kind], j) =>
    h.push(
      hold(`move-${j}`, x, y, kind, {
        ...(i === 0 ? { radius: 0.18 } : {}),
        checkpoint: true,
        label: String(j + 1),
        match: ((i === 8 || i === 9) && j === 0) || (i === 11 && j === 3),
      }),
    ),
  );
  if (i === 5) {
    h[3].direction = v(0, -1);
    h[3].label = "SCOOP";
    h[3].radius = 0.16;
  }
  if (i === 6) {
    h[3].direction = v(-0.6, 0.8);
    h[3].label = "PULL";
  }
  if (i === 10) h.push(hold("rest", -0.64, 2.0, "jug", { label: "REST" }));
  if (i === 11) {
    h.push(hold("slope-option", -0.6, 2.18, "sloper", { label: "CUP" }));
    h.push(
      hold("scoop-option", 0.42, 1.4, "jug", {
        direction: v(0, -1),
        label: "SCOOP",
      }),
    );
  }
  const topY = Math.max(...h.map((a) => a.p.y)) + 0.32;
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
    difficulty: i < 3 ? "FOUNDATIONS" : i < 8 ? "TECHNIQUE" : "MOMENTUM",
    holds: h,
    start: ["start-l", "start-r"],
    goal:
      i === 1
        ? "cross"
        : i === 8 || i === 9 || i === 11
          ? "flight"
          : i === 5
            ? "undercling"
            : "none",
    theme: ["#7ce3c6", "#f3ba77", "#a3bbed"][i % 3],
    fallY: -1.6,
  };
});
export const gripNames: Record<Grip, string> = {
  jug: "Jug",
  crimp: "Crimp",
  sloper: "Sloper",
  pinch: "Pinch",
  release: "Release",
  unknown: "Uncertain",
};
export const gripCues: Record<Grip, string> = {
  jug: "Relaxed fist",
  crimp: "Hook your fingers over an edge",
  sloper: "Round your palm; fingers together",
  pinch: "Oppose thumb and fingers",
  release: "Let go · fingers straight and spread",
  unknown: "Hold a clear shape in view",
};
