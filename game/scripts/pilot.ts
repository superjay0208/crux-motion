import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands, type Inputs, type Hand, type Hold } from "../src/core/types";
import { v, sub, dist, clamp } from "../src/core/math";
export type PilotOptions = {
  controller?: "anchors" | "motors";
  y?: number;
  settle?: number;
  offset?: number;
  near?: number;
  first?: number;
  releaseTick?: number;
  finishInside?: boolean;
};
export function pilot(index: number, opts: PilotOptions = {}) {
  const sim = new Simulation(
    routes[index],
    "scripted practice",
    opts.controller ?? "motors",
  );
  sim.start();
  let input = structuredClone(sim.input);
  const advance = (ticks: number, fn?: () => void) => {
    for (let i = 0; i < ticks && sim.state === "playing"; i++) {
      fn?.();
      sim.setInput(input);
      sim.step();
    }
  };
  const support = (side: Hand, y = 0.34) => {
    const c = sim.contacts[side];
    if (c) {
      input[side] = {
        target: v((side === "left" ? -0.1 : 0.1) * (c.hold.match ? -1 : 1), y),
        grip: c.hold.kind,
        ready: true,
        orientation:
          c.hold.direction.y < 0
            ? "down"
            : Math.abs(c.hold.direction.x) > 0.5
              ? "side"
              : "up",
        quality: true,
        bend:
          (side === "left" ? -1 : 1) *
          (opts.finishInside && c.hold.finish ? -1 : 1),
      };
    }
  };
  advance(90, () => {
    support("left");
    support("right");
  });
  if (index === 8 || index === 9) {
    advance(150, () => {
      support("left", 0.69);
      support("right", 0.69);
    });
    advance(opts.releaseTick ?? 30, () => {
      support("left", 0.18);
      support("right", 0.18);
    });
    const landing = sim.route.holds.find((h) => h.checkpoint)!;
    for (let t = 0; t < 180 && sim.state === "playing"; t++) {
      for (const side of hands) {
        input[side].target = sub(
          addPatch(landing, side),
          sim.rig.shoulder(side),
        );
        input[side].grip = t < 12 ? "release" : landing.kind;
        input[side].ready = t >= 12;
      }
      sim.setInput(input);
      sim.step();
      if (
        sim.contacts.left?.hold.id === landing.id &&
        sim.contacts.right?.hold.id === landing.id
      )
        break;
    }
  }
  const targets = sim.route.holds.filter((h) => h.checkpoint || h.finish);
  let n = 0;
  for (const hold of targets) {
    const move = (side: Hand, target = hold) => {
      input[side].grip = "release";
      input[side].ready = false;
      let caught = false;
      for (let t = 0; t < 600 && sim.state === "playing"; t++) {
        const other = side === "left" ? "right" : "left";
        support(
          other,
          index === 9 && opts.controller !== "anchors" ? 0.24 : (opts.y ?? 0.34),
        );
        const anchor = sim.contacts[other]?.anchor;
        if (anchor)
          input[other].target.x = clamp(
            (anchor.x - target.p.x - (other === "left" ? -0.19 : 0.19)) *
              (opts.offset ?? 0.6),
            opts.controller === "anchors" ? -0.68 : -0.48,
            opts.controller === "anchors" ? 0.68 : 0.48,
          );
        const aimPoint = target.match ? addPatch(target, side) : target.p;
        const relative = sub(aimPoint, sim.rig.shoulder(side));
        input[side].target = relative;
        const near =
          dist(sim.rig.hand(side), aimPoint) <
          target.radius * (opts.near ?? 0.85);
        input[side].grip = t > 14 && near ? target.kind : "release";
        input[side].ready = t > 14 && near;
        input[side].orientation =
          target.direction.y < 0
            ? "down"
            : Math.abs(target.direction.x) > 0.5
              ? "side"
              : "up";
        input[side].bend =
          (side === "left" ? -1 : 1) *
          (opts.finishInside && target.finish ? -1 : 1);
        sim.setInput(input);
        sim.step();
        if (sim.contacts[side]?.hold.id === target.id) {
          caught = true;
          break;
        }
      }
      return caught;
    };
    if (
      (hold.finish || index === 9) &&
      sim.route.goal === "flight" &&
      !sim.flew
    ) {
      const launch = hands
        .map((s) => sim.contacts[s]?.hold)
        .filter((h): h is Hold => !!h && !!h.match)
        .sort((a, b) => b.p.y - a.p.y)[0];
      if (launch) {
        for (const side of hands)
          if (sim.contacts[side]?.hold.id !== launch.id) {
            move(side, launch);
            advance(30, () => {
              support("left", 0.4);
              support("right", 0.4);
            });
          }
        advance(150, () => {
          support("left", 0.62);
          support("right", 0.62);
        });
        advance(opts.releaseTick ?? 20, () => {
          support("left", 0.18);
          support("right", 0.18);
        });
        for (let t = 0; t < 180 && sim.state === "playing"; t++) {
          for (const side of hands) {
            input[side].target = sub(
              addPatch(hold, side),
              sim.rig.shoulder(side),
            );
            input[side].grip = t < 12 ? "release" : "jug";
            input[side].ready = t >= 12;
          }
          sim.setInput(input);
          sim.step();
          if (
            hold.match
              ? sim.contacts.left?.hold.id === hold.id &&
                sim.contacts.right?.hold.id === hold.id
              : hands.some((s) => sim.contacts[s]?.hold.id === hold.id)
          )
            break;
        }
      }
    }
    if (hands.some((s) => sim.contacts[s]?.hold.id === hold.id) && !hold.finish)
      continue;
    const under = hands.find(
      (s) => sim.contacts[s] && sim.contacts[s]!.hold.direction.y < 0,
    );
    const lower: Hand =
      (sim.contacts.left?.hold.p.y ?? -100) <
      (sim.contacts.right?.hold.p.y ?? -100)
        ? "left"
        : "right";
    const equal = sim.contacts.left?.hold.p.y === sim.contacts.right?.hold.p.y;
    const side: Hand =
      under ??
      (hold.finish
        ? sim.contacts.left?.hold.id === "top"
          ? "right"
          : sim.contacts.right?.hold.id === "top"
            ? "left"
            : lower
        : equal
          ? index === 0
            ? hold.p.x < 0
              ? "left"
              : "right"
            : hold.p.x < 0
              ? "right"
              : "left"
          : lower);
    n++;
    if (!move(side)) break;
    advance(opts.settle ?? 20, () => {
      support("left", 0.4);
      support("right", 0.4);
    });
    if (hold.finish) {
      for (let attempt = 0; attempt < 3 && sim.state === "playing"; attempt++) {
        for (const side of hands)
          if (sim.contacts[side]?.hold.id !== "top") move(side);
        advance(60, () => {
          support("left", 0.5);
          support("right", 0.5);
        });
      }
    }
  }
  advance(180, () => {
    support("left", 0.45);
    support("right", 0.45);
  });
  return sim;
}
function addPatch(h: Hold, side: Hand) {
  return { x: h.p.x + (side === "left" ? -0.08 : 0.08), y: h.p.y };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/pilot.ts"))
  for (let i = 0; i < routes.length; i++) {
    const s = pilot(i);
    console.log(i + 1, JSON.stringify(s.summary()));
  }
