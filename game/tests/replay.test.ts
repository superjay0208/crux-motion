import { it, expect } from "vitest";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { validateReplay } from "../src/core/replay";
it("validates a real semantic recording and rejects malformed, nonfinite and reordered input", () => {
  const s = new Simulation(routes[0]);
  s.start();
  s.step();
  const r = s.replay();
  expect(validateReplay(r)).toBe(r);
  const bad = structuredClone(r);
  bad.frames[0].input.left.target.x = NaN;
  expect(() => validateReplay(bad)).toThrow();
  const unordered = structuredClone(r);
  unordered.frames.push(unordered.frames[0]);
  expect(() => validateReplay(unordered)).toThrow();
  expect(() => validateReplay({ version: 1, duration: Infinity })).toThrow();
});
