import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { v } from "../src/core/math";
const s = new Simulation(routes[0]);
s.start();
const input = structuredClone(s.input);
for (let t = 0; t < 240; t++) {
  for (const side of hands)
    input[side].target = v(side === "left" ? -0.1 : 0.1, 0.34);
  if (t > 90) {
    input.left.grip = "release";
    input.left.target = { x: -0.2, y: 0.7 };
  }
  s.setInput(input);
  s.step();
  if (t % 15 === 0)
    console.log(
      t,
      JSON.stringify({
        torso: s.rig.torso.getPosition(),
        angle: s.rig.torso.getAngle(),
        shoulder: s.rig.shoulder("left"),
        hand: s.rig.hand("left"),
        contact: s.contacts.right?.load,
        events: s.events.slice(-2),
      }),
    );
}
