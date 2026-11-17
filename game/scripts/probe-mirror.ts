import { Simulation } from "../src/core/Simulation";
import { routes } from "../src/core/levels";
import { hands } from "../src/core/types";
import { ik, v } from "../src/core/math";
for (const delta of [0, 0.3, 0.6, 0.9]) {
  const s = new Simulation(routes[0], "mirror probe");
  s.fatigue = false;
  const input = structuredClone(s.input);
  for (const side of hands)
    input[side].arm = {
      ...s.rig.pose(side, true),
      upperVelocity: 0,
      elbowVelocity: 0,
    };
  s.setInput(input);
  s.start();
  for (let t = 0; t < 180; t++) s.step();
  input.right.grip = "release";
  input.right.ready = false;
  s.setInput(input);
  for (let t = 0; t < 120; t++) s.step();
  const before = { ...s.rig.com() };
  input.left.arm!.elbow -= delta;
  s.setInput(input);
  for (let t = 0; t < 120; t++) s.step();
  console.log(
    JSON.stringify({
      delta,
      before,
      after: s.rig.com(),
      contact: s.contacts.left?.hold.id,
      load: s.contacts.left?.load,
      state: s.state,
      pose: s.rig.pose("left"),
      requested: input.left.arm,
      events: s.events.map((e) => e.kind),
    }),
  );
}
for (const amplitude of [0, 0.1, 0.2, 0.3]) {
  const s = new Simulation(routes[0], "mirror swing");
  s.fatigue = false;
  const input = structuredClone(s.input);
  s.start();
  let peakSpeed = 0,
    peakX = 0;
  for (let t = 0; t < 600; t++) {
    for (const side of hands) {
      const x =
        (side === "left" ? -0.13 : 0.13) + amplitude * Math.sin((t / 120) * 4);
      const p = ik(v(), v(x, 0.5), 0.36, 0.39, side === "left" ? -1 : 1);
      input[side].arm = {
        upper: p.upper,
        elbow: p.elbow,
        upperVelocity: 0,
        elbowVelocity: 0,
      };
    }
    s.setInput(input);
    s.step();
    peakSpeed = Math.max(peakSpeed, Math.abs(s.rig.velocity().x));
    peakX = Math.max(peakX, Math.abs(s.rig.com().x));
  }
  console.log(
    JSON.stringify({
      amplitude,
      peakSpeed,
      peakX,
      state: s.state,
      contacts: [s.contacts.left?.hold.id, s.contacts.right?.hold.id],
      events: s.events.map((e) => e.kind),
    }),
  );
}
{
  const s = new Simulation(routes[0], "mirror rest");
  s.fatigue = false;
  const input = structuredClone(s.input);
  for (const side of hands)
    input[side].arm = {
      ...s.rig.pose(side, true),
      upperVelocity: 0,
      elbowVelocity: 0,
    };
  s.setInput(input);
  s.start();
  for (let t = 0; t < 1000; t++) {
    s.step();
    if (t % 100 === 0)
      console.log(
        JSON.stringify({
          rest: t,
          com: s.rig.com(),
          v: s.rig.velocity(),
          body: s.rig.torso.getAngle(),
          av: s.rig.torso.getAngularVelocity(),
          pose: s.rig.pose("left", true),
          loads: [s.contacts.left?.load, s.contacts.right?.load],
        }),
      );
  }
}
{
  const s = new Simulation(routes[0], "mirror reserve");
  const input = structuredClone(s.input);
  for (const side of hands)
    input[side].arm = {
      ...s.rig.pose(side, true),
      upperVelocity: 0,
      elbowVelocity: 0,
    };
  s.setInput(input);
  s.start();
  for (let t = 0; t < 3600; t++) s.step();
  console.log(
    JSON.stringify({
      rest30: s.summary(),
      slips: s.events.filter((e) => e.kind === "slip").length,
    }),
  );
}
