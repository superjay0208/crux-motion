import { describe, it, expect } from "vitest";
import { World, Vec2, Circle, RevoluteJoint } from "planck";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { GripConstraint, projectGrip } from "../src/core/GripConstraint";
import { v, len, dist, ik } from "../src/core/math";
describe("bounded directional contacts", () => {
  it("projects outside impulses into a finite one-way region", () => {
    for (let x = -4; x <= 4; x += 0.2)
      for (let y = -4; y <= 4; y += 0.2) {
        const p = projectGrip(v(x, y), v(0, 1), 2, 1, 0.5);
        expect(p.y).toBeGreaterThanOrEqual(-1e-8);
        expect(p.y).toBeLessThanOrEqual(2 + 1e-8);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 * p.y + 1e-8);
      }
  });
  it("supports a mass on a jug but cannot hang it on an undercling", () => {
    const fixture = (up: number) => {
      const w = new World(Vec2(0, -9.81)),
        g = w.createBody(),
        b = w.createDynamicBody(Vec2(0, 0));
      b.createFixture(Circle(0.1), { density: 10 / (Math.PI * 0.01) });
      const j = new GripConstraint(g, b, v(), v(0, up));
      j.normal = 200;
      j.tangent = 100;
      w.createJoint(j);
      for (let i = 0; i < 240; i++) w.step(1 / 240, 12, 4);
      return b.getPosition().y;
    };
    expect(Math.abs(fixture(1))).toBeLessThan(0.025);
    expect(fixture(-1)).toBeLessThan(-3);
  });
  it("never exceeds capacity, including a sudden capacity reduction", () => {
    const w = new World(Vec2(0, -9.81)),
      g = w.createBody(),
      b = w.createDynamicBody(Vec2(0, 0));
    b.createFixture(Circle(0.1), { density: 60 / (Math.PI * 0.01) });
    const j = new GripConstraint(g, b, v(), v(0, 1));
    j.normal = 1000;
    j.tangent = 200;
    w.createJoint(j);
    for (let i = 0; i < 120; i++) {
      if (i === 60) j.normal = 100;
      w.step(1 / 120, 12, 4);
      expect(len(j.getReactionForce(120))).toBeLessThan(
        Math.hypot(j.normal, j.tangent) + 1e-5,
      );
      expect(j.getReactionForce(120).y).toBeLessThan(j.normal + 1e-5);
    }
  });
});
describe("campus rig", () => {
  it("supports repeated pull and extend cycles without saturating", () => {
    const s = new Simulation(routes[0]);
    s.fatigue = false;
    s.start();
    const input = structuredClone(s.input);
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const side of ["left", "right"] as const)
        input[side].target.y = 0.69;
      s.setInput(input);
      for (let n = 0; n < 150; n++) s.step();
      const low = s.rig.com().y;
      for (const side of ["left", "right"] as const) input[side].target.y = 0.3;
      s.setInput(input);
      for (let n = 0; n < 100; n++) s.step();
      expect(s.rig.com().y - low).toBeGreaterThan(0.15);
      expect(s.contacts.left && s.contacts.right).toBeTruthy();
    }
  });
  it("matches an independent small-angle pendulum period", () => {
    const w = new World(Vec2(0, -9.81)),
      ground = w.createBody(),
      b = w.createDynamicBody(Vec2(Math.sin(0.1), -Math.cos(0.1)));
    b.createFixture(Circle(0.01), { density: 1 / (Math.PI * 0.0001) });
    w.createJoint(new RevoluteJoint({}, ground, b, Vec2(0, 0)));
    let last = b.getPosition().x;
    const crossings: number[] = [];
    for (let t = 0; t < 1300; t++) {
      w.step(1 / 240, 12, 4);
      const x = b.getPosition().x;
      if (last > 0 && x <= 0) crossings.push(t / 240);
      last = x;
    }
    expect(crossings[1] - crossings[0]).toBeCloseTo(
      2 * Math.PI * Math.sqrt(1 / 9.81),
      1,
    );
  });
  it("keeps every body finite over 600 simulated seconds of varied attempts", () => {
    let s = new Simulation(routes[0]);
    s.start();
    let seed = 123,
      attempts = 1;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let t = 0; t < 72000; t++) {
      if (s.state !== "playing") {
        s = new Simulation(routes[0]);
        s.start();
        attempts++;
      }
      if (t % 30 === 0) {
        const input = structuredClone(s.input);
        for (const side of ["left", "right"] as const) {
          input[side].target = v((random() - 0.5) * 1.4, random() * 0.9 - 0.15);
          input[side].grip = random() < 0.1 ? "release" : "jug";
          if (attempts % 2 === 0) {
            const solved = ik(
              v(),
              input[side].target,
              0.36,
              0.39,
              side === "left" ? -1 : 1,
            );
            input[side].arm = {
              upper: solved.upper,
              elbow: Math.max(-2.65, Math.min(2.65, solved.elbow)),
              upperVelocity: 0,
              elbowVelocity: 0,
            };
          }
        }
        s.setInput(input);
      }
      s.step();
      if (t % 120 === 0)
        for (const b of s.rig.bodies) {
          expect(
            Number.isFinite(
              b.getPosition().x + b.getPosition().y + b.getAngle(),
            ),
          ).toBe(true);
          expect(len(b.getLinearVelocity())).toBeLessThan(100);
        }
      expect(s.energy).toBeGreaterThanOrEqual(0);
    }
    expect(attempts).toBeGreaterThan(1);
  });
  it("conserves total mass and uses eight dynamic bodies", () => {
    const s = new Simulation(routes[0]);
    expect(s.rig.bodies).toHaveLength(8);
    expect(s.rig.bodies.reduce((m, b) => m + b.getMass(), 0)).toBeCloseTo(
      60,
      5,
    );
  });
  it("retains velocity when releasing and falls ballistically despite moving arms", () => {
    const s = new Simulation(routes[0]);
    s.fatigue = false;
    s.release("left");
    s.release("right");
    const before = s.rig.velocity();
    s.start();
    const input = structuredClone(s.input);
    input.left.grip = input.right.grip = "release";
    s.setInput(input);
    for (let i = 0; i < 30; i++) {
      input.left.target = v(0.5, Math.sin(i) * 0.6);
      s.setInput(input);
      s.step();
    }
    const after = s.rig.velocity();
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y - 9.81 * 0.25, 3);
  });
  it("freezes time, stamina, and momentum on pause", () => {
    const s = new Simulation(routes[0]);
    s.start();
    for (let i = 0; i < 30; i++) s.step();
    s.pause();
    const before = JSON.stringify(s.summary());
    for (let i = 0; i < 100; i++) s.step();
    expect(JSON.stringify(s.summary())).toBe(before);
  });
  it("can hang from two finite jugs without contact drift", () => {
    const s = new Simulation(routes[0]);
    s.fatigue = false;
    s.start();
    for (let i = 0; i < 1200; i++) s.step();
    expect(s.state).toBe("playing");
    expect(s.contacts.left).not.toBeNull();
    expect(s.contacts.right).not.toBeNull();
    for (const side of ["left", "right"] as const)
      expect(dist(s.rig.hand(side), s.contacts[side]!.anchor)).toBeLessThan(
        0.025,
      );
  });
  it("runs a deterministic fresh replay", () => {
    const s = new Simulation(routes[0]);
    s.start();
    for (let i = 0; i < 120; i++) s.step();
    const r = s.replay(),
      copy = new Simulation(routes[0]);
    copy.start();
    let j = 0;
    for (let i = 0; i < r.duration; i++) {
      if (r.frames[j]?.tick === i) copy.setInput(r.frames[j++].input);
      copy.step();
    }
    expect(copy.summary()).toEqual(s.summary());
  });
});
