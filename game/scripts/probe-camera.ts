import { Camera } from "../src/tracking/Camera";
import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { initialInputs } from "../src/core/types";
import { observation } from "../tests/fixtures/hands";
import { InputProtection } from "../src/tracking/motion";
for (const sy of [0.18, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
  const camera = new Camera({} as HTMLVideoElement);
  camera.calibration.motionGain = 1;
  const sim = new Simulation(routes[0], "camera");
  const guard = new InputProtection();
  let seq = 0;
  const input = initialInputs();
  camera.onInput = (x) =>
    sim.setInput(guard.accept(x, (sim.tick * 1000) / 120).input);
  sim.start();
  const step = () => {
    if (sim.tick % 8 === 0)
      camera.process(observation(input, ++seq, (sim.tick * 1000) / 120));
    sim.step();
  };
  input.left.target = { x: -0.1, y: sy };
  input.right.target = { x: 0.1, y: sy };
  for (let t = 0; t < 120; t++) step();
  for (const [id, side] of [
    ["move-0", "left"],
    ["move-1", "right"],
    ["move-2", "left"],
    ["top", "right"],
    ["top", "left"],
  ] as const) {
    const hold = sim.route.holds.find((h) => h.id === id)!;
    const other = side === "left" ? "right" : "left";
    input[other].target = { x: other === "left" ? -0.1 : 0.1, y: sy };
    for (let t = 0; t < 450 && sim.state === "playing"; t++) {
      const s = sim.rig.shoulder(side);
      input[side].target = {
        x: hold.p.x + (hold.match ? (side === "left" ? -0.09 : 0.09) : 0) - s.x,
        y: hold.p.y - s.y,
      };
      input[side].grip = t > 35 ? "jug" : "release";
      step();
      if (sim.contacts[side]?.hold.id === id) break;
    }
    if (!sim.visited.has(id)) break;
    for (let t = 0; t < 50 && sim.state === "playing"; t++) step();
  }
  console.log(
    sy,
    JSON.stringify({
      ...sim.summary(),
      shoulders: [sim.rig.shoulder("left"), sim.rig.shoulder("right")],
      angle: sim.rig.torso.getAngle(),
    }),
  );
}
