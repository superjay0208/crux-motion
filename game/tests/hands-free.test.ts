import { describe, expect, it } from "vitest";
import { HandsFreeGate } from "../src/tracking/HandsFreeGate";

const advance = (
  gate: HandsFreeGate,
  from: number,
  to: number,
  ready = true,
) => {
  for (let t = from; t <= to; t += 50)
    gate.update(t, Math.floor(t / 100), ready);
};
describe("hands-free action", () => {
  it("accepts a click with hands on the mouse, then starts after returning and counting down", () => {
    const g = new HandsFreeGate();
    g.arm(0);
    advance(g, 50, 3000, false);
    expect(g.active).toBe(true);
    expect(g.view.phase).toBe("waiting");
    advance(g, 3050, 3550);
    expect(g.view.seconds).toBe(3);
    advance(g, 3600, 6450);
    expect(g.active).toBe(true);
    advance(g, 6500, 6700);
    expect(g.view.phase).toBe("complete");
  });
  it("cannot finish on one repeated frame", () => {
    const g = new HandsFreeGate();
    g.arm(0);
    for (let t = 50; t <= 10000; t += 50) g.update(t, 1, true);
    expect(g.active).toBe(true);
    expect(g.view.seconds).toBe(3);
  });
  it("freezes on a brief uncertain hand and restarts after a longer loss", () => {
    const g = new HandsFreeGate();
    g.arm(0);
    advance(g, 50, 1600);
    const seconds = g.view.seconds;
    advance(g, 1650, 1750, false);
    expect(g.view.seconds).toBe(seconds);
    advance(g, 1800, 1900);
    expect(g.view.phase).toBe("countdown");
    advance(g, 1950, 2300, false);
    expect(g.view.seconds).toBe(3);
    expect(g.active).toBe(true);
  });
  it("cancel prevents a late start, and retry arms a new full countdown", () => {
    const g = new HandsFreeGate();
    g.arm(0);
    advance(g, 50, 3300);
    g.cancel();
    advance(g, 3350, 6000);
    expect(g.view.phase).toBe("idle");
    g.arm(6050);
    advance(g, 6100, 6650);
    expect(g.view.seconds).toBe(3);
    expect(g.active).toBe(true);
  });
  it("a suspended page cannot jump from a ready check to a completed start", () => {
    const g = new HandsFreeGate();
    g.arm(0);
    advance(g, 50, 1000);
    g.update(60000, 100, true);
    expect(g.view.phase).toBe("countdown");
    expect(g.active).toBe(true);
  });
});
