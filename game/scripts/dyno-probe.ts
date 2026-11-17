import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { sub, v } from "../src/core/math";
for (const release of [10, 15, 20, 25, 30, 35, 40, 50, 60]) {
  const s = new Simulation(routes[8]);
  s.start();
  const input = structuredClone(s.input);
  for (let t = 0; t < 150; t++) {
    for (const side of hands)
      input[side].target = v(side === "left" ? -0.1 : 0.1, 0.69);
    s.setInput(input);
    s.step();
  }
  for (let t = 0; t < release; t++) {
    for (const side of hands)
      input[side].target = v(side === "left" ? -0.1 : 0.1, 0.18);
    s.setInput(input);
    s.step();
  }
  const takeoff = {
    com: s.rig.com(),
    velocity: s.rig.velocity(),
    contacts: hands.map((a) => !!s.contacts[a]),
  };
  let high = 0;
  for (let t = 0; t < 150; t++) {
    for (const side of hands) {
      input[side].target = sub(
        { x: side === "left" ? -0.08 : 0.08, y: 2.03 },
        s.rig.shoulder(side),
      );
      input[side].grip = t < 12 ? "release" : "jug";
      input[side].ready = t >= 12;
    }
    s.setInput(input);
    s.step();
    high = Math.max(high, s.rig.hand("left").y, s.rig.hand("right").y);
  }
  console.log(
    release,
    JSON.stringify({ takeoff, high, visited: [...s.visited], state: s.state }),
  );
}
