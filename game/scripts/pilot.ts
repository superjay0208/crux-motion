import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands, type Hand, type Hold } from "../src/core/types";
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
  const controller = opts.controller ?? "motors";
  const sim = new Simulation(routes[index], "scripted practice", controller);
  sim.start();
  const input = structuredClone(sim.input);
  const orientFor = (h: Hold) =>
    h.direction.y < 0
      ? ("down" as const)
      : Math.abs(h.direction.x) > 0.5
        ? ("side" as const)
        : ("up" as const);
  const advance = (ticks: number, fn?: () => void) => {
    for (let i = 0; i < ticks && sim.state === "playing"; i++) {
      fn?.();
      sim.setInput(input);
      sim.step();
    }
  };
  const support = (side: Hand, y = 0.3, xShift = 0) => {
    const c = sim.contacts[side];
    if (c) {
      input[side] = {
        target: v(
          (side === "left" ? -0.1 : 0.1) * (c.hold.match ? -1 : 1) + xShift,
          y,
        ),
        grip: c.hold.kind,
        ready: true,
        orientation: orientFor(c.hold),
        quality: true,
        bend:
          (side === "left" ? -1 : 1) *
          (opts.finishInside && c.hold.finish ? -1 : 1),
      };
    }
  };
  const move = (side: Hand, target: Hold) => {
    input[side].grip = "release";
    input[side].ready = false;
    const effRadius = target.match ? target.radius * 0.75 : target.radius;
    for (let t = 0; t < 540 && sim.state === "playing"; t++) {
      const other = side === "left" ? "right" : "left";
      const pullY =
        opts.y ??
        (t > 120 ? (controller === "anchors" ? 0.18 : 0.24) : 0.26);
      support(other, pullY);
      const anchor = sim.contacts[other]?.anchor;
      if (anchor) {
        const lim = controller === "anchors" ? 0.68 : t > 180 ? 0.18 : 0.28;
        input[other].target.x = clamp(
          (anchor.x - target.p.x - (other === "left" ? -0.19 : 0.19)) *
            (opts.offset ?? 0.7),
          -lim,
          lim,
        );
      }
      const aimPoint = target.match ? addPatch(target, side) : target.p;
      input[side].target = sub(aimPoint, sim.rig.shoulder(side));
      const near =
        dist(sim.rig.hand(side), aimPoint) < effRadius * (opts.near ?? 0.82);
      input[side].grip = t > 14 && near ? target.kind : "release";
      input[side].ready = t > 14 && near;
      input[side].orientation = orientFor(target);
      input[side].bend =
        (side === "left" ? -1 : 1) *
        (opts.finishInside && target.finish ? -1 : 1);
      sim.setInput(input);
      sim.step();
      if (sim.contacts[side]?.hold.id === target.id) return true;
    }
    return false;
  };
  const matchHold = (target: Hold) => {
    for (const side of hands) {
      if (sim.contacts[side]?.hold.id !== target.id) {
        move(side, target);
        advance(28, () => {
          support("left", 0.34);
          support("right", 0.34);
        });
      }
    }
  };
  const cushionCatch = () => {
    advance(20, () => {
      support("left", 0.52);
      support("right", 0.52);
    });
    advance(40, () => {
      support("left", 0.35);
      support("right", 0.35);
    });
  };
  const pushDyno = (target: Hold) => {
    const onMatch =
      !!sim.contacts.left &&
      sim.contacts.left.hold.id === sim.contacts.right?.hold.id;
    const dx = clamp(target.p.x - sim.rig.com().x, -0.35, 0.35);
    const crouchY = onMatch && controller === "motors" ? 0.6 : 0.69;
    const crouchX = onMatch && controller === "motors" ? 0 : dx * 0.25;
    advance(controller === "anchors" ? 90 : 140, () => {
      support("left", crouchY, crouchX);
      support("right", crouchY, crouchX);
    });
    const maxPush =
      opts.releaseTick ?? (controller === "anchors" ? 20 : onMatch ? 21 : 23);
    const pullToY = controller === "anchors" ? 0.16 : onMatch ? 0.22 : 0.16;
    for (let t = 0; t < maxPush && sim.state === "playing"; t++) {
      support("left", pullToY, -dx * 0.4);
      support("right", pullToY, -dx * 0.4);
      sim.setInput(input);
      sim.step();
    }
    for (let t = 0; t < 180 && sim.state === "playing"; t++) {
      for (const side of hands) {
        if (sim.contacts[side]?.hold.id === target.id) {
          support(side, onMatch ? 0.52 : 0.34);
          continue;
        }
        const aim = target.match ? addPatch(target, side) : target.p;
        input[side].target = sub(aim, sim.rig.shoulder(side));
        input[side].grip = t < 12 ? "release" : target.kind;
        input[side].ready = t >= 12;
        input[side].orientation = orientFor(target);
      }
      sim.setInput(input);
      sim.step();
      if (
        target.match
          ? sim.contacts.left?.hold.id === target.id &&
            sim.contacts.right?.hold.id === target.id
          : hands.some((s) => sim.contacts[s]?.hold.id === target.id)
      )
        break;
    }
    if (hands.some((s) => sim.contacts[s]?.hold.id === target.id)) {
      if (onMatch) cushionCatch();
      if (target.match) matchHold(target);
      return true;
    }
    return false;
  };
  const swingDyno = (target: Hold) => {
    const onMatch = true;
    const dir = Math.sign(target.p.x - sim.rig.com().x) || 1;
    if (controller === "anchors") {
      advance(45, () => {
        support("left", 0.56);
        support("right", 0.56);
      });
      for (let t = 0; t < 24 && sim.state === "playing"; t++) {
        const shift = dir * 0.26 * ((t + 1) / 24);
        support("left", 0.58, shift);
        support("right", 0.58, shift);
        sim.setInput(input);
        sim.step();
      }
      for (let t = 0; t < 18 && sim.state === "playing"; t++) {
        const u = (t + 1) / 18;
        const shift = dir * (0.26 - 0.64 * u);
        const y = 0.58 - 0.42 * u;
        support("left", y, shift);
        support("right", y, shift);
        sim.setInput(input);
        sim.step();
      }
    } else {
      // Motor rig on match hold: settle low without fighting hands, then whip up & across
      advance(130, () => {
        support("left", 0.59, dir * 0.08);
        support("right", 0.59, dir * 0.08);
      });
      const swingTicks = opts.releaseTick ?? 21;
      for (let t = 0; t < swingTicks && sim.state === "playing"; t++) {
        support("left", 0.24, -dir * 0.28);
        support("right", 0.24, -dir * 0.28);
        sim.setInput(input);
        sim.step();
      }
    }
    for (let t = 0; t < 180 && sim.state === "playing"; t++) {
      for (const side of hands) {
        if (sim.contacts[side]?.hold.id === target.id) {
          support(side, onMatch ? 0.52 : 0.34);
          continue;
        }
        const aim = target.match ? addPatch(target, side) : target.p;
        input[side].target = sub(aim, sim.rig.shoulder(side));
        input[side].grip = t < 12 ? "release" : target.kind;
        input[side].ready = t >= 12;
        input[side].orientation = orientFor(target);
      }
      sim.setInput(input);
      sim.step();
      if (
        target.match
          ? sim.contacts.left?.hold.id === target.id &&
            sim.contacts.right?.hold.id === target.id
          : hands.some((s) => sim.contacts[s]?.hold.id === target.id)
      )
        break;
    }
    if (hands.some((s) => sim.contacts[s]?.hold.id === target.id)) {
      cushionCatch();
      if (target.match) matchHold(target);
      return true;
    }
    return false;
  };

  advance(75, () => {
    support("left", 0.34);
    support("right", 0.34);
  });

  const allTargets = sim.route.holds.filter((h) => h.checkpoint || h.finish);
  const targets =
    index === 8
      ? allTargets.filter((h) =>
          ["move-2", "move-3", "move-4", "move-5", "top"].includes(h.id),
        )
      : allTargets;

  for (const hold of targets) {
    if (hands.some((s) => sim.contacts[s]?.hold.id === hold.id) && !hold.finish)
      continue;

    if (index === 6 && hold.id === "move-0") {
      pushDyno(hold);
      advance(30, () => {
        support("left", 0.35);
        support("right", 0.35);
      });
      continue;
    }
    if (index === 9 && hold.id === "move-1") {
      const launch = sim.route.holds.find((h) => h.id === "move-0")!;
      matchHold(launch);
      swingDyno(hold);
      advance(30, () => {
        support("left", 0.35);
        support("right", 0.35);
      });
      continue;
    }
    if (index === 11 && hold.id === "move-2") {
      const rest = sim.route.holds.find((h) => h.id === "move-1")!;
      matchHold(rest);
      pushDyno(hold);
      advance(30, () => {
        support("left", 0.35);
        support("right", 0.35);
      });
      continue;
    }

    const under = hands.find(
      (s) => sim.contacts[s] && sim.contacts[s]!.hold.direction.y < 0,
    );
    const leftY = sim.contacts.left?.hold.p.y ?? -100;
    const rightY = sim.contacts.right?.hold.p.y ?? -100;
    const lower: Hand = leftY < rightY ? "left" : "right";
    const equal = leftY === rightY;
    const side: Hand =
      under ??
      (hold.finish
        ? sim.contacts.left?.hold.id === "top"
          ? "right"
          : sim.contacts.right?.hold.id === "top"
            ? "left"
            : lower
        : equal
          ? index === 5 && controller === "anchors"
            ? hold.p.x >= 0
              ? "left"
              : "right"
            : hold.p.x < 0
              ? "left"
              : "right"
          : lower);

    if (!move(side, hold)) break;
    advance(opts.settle ?? 18, () => {
      support("left", 0.34);
      support("right", 0.34);
    });
    if (hold.finish) {
      for (let attempt = 0; attempt < 3 && sim.state === "playing"; attempt++) {
        for (const s of hands)
          if (sim.contacts[s]?.hold.id !== "top") move(s, hold);
        advance(60, () => {
          support("left", 0.42);
          support("right", 0.42);
        });
      }
    }
  }
  advance(180, () => {
    support("left", 0.42);
    support("right", 0.42);
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
