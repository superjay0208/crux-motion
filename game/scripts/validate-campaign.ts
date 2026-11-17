import { mkdir, writeFile } from "node:fs/promises";
import { pilot, type PilotOptions } from "./pilot";
import { routes } from "../src/core/levels";
import { Simulation } from "../src/core/Simulation";
const motorConfigs: PilotOptions[] = [
  { y: 0.35, offset: 0, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 20, finishInside: true, near: 0.65 },
  { y: 0.35, offset: 0.6, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0, releaseTick: 20 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 20 },
  { y: 0.25, offset: 0.8, settle: 90 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 30 },
];
const anchorConfigs: PilotOptions[] = [
  { y: 0.35, offset: 0, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 1, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 0.8, settle: 0 },
  { y: 0.25, offset: 1, settle: 0 },
  { y: 0.35, offset: 0.8, settle: 0, releaseTick: 20 },
  { y: 0.35, offset: 0.6, settle: 0, releaseTick: 20 },
  { y: 0.25, offset: 0.8, settle: 90 },
  { y: 0.25, offset: 0.8, settle: 0, releaseTick: 30 },
];
await mkdir("../validation/solutions", { recursive: true });
await mkdir("public/solutions", { recursive: true });
for (const controller of ["motors", "anchors"] as const) {
  const configs = (controller === "anchors" ? anchorConfigs : motorConfigs).map(
    (c) => ({ ...c, controller }),
  );
  const results = [];
  for (let i = 0; i < routes.length; i++) {
    const s = pilot(i, configs[i]);
    if (s.state !== "finished")
      throw new Error(
        `Route ${i + 1} pilot ${s.state}: ${JSON.stringify(s.summary())}`,
      );
    const replay = s.replay(),
      fresh = new Simulation(routes[i], "scripted practice", controller);
    fresh.start();
    let k = 0;
    for (let t = 0; t < replay.duration; t++) {
      while (replay.frames[k]?.tick <= t)
        fresh.setInput(replay.frames[k++].input);
      fresh.step();
    }
    if (JSON.stringify(fresh.summary()) !== JSON.stringify(s.summary()))
      throw new Error(`Route ${i + 1} fresh replay diverged`);
    if (controller === "anchors")
      await writeFile(
        `../validation/solutions/${routes[i].id}.json`,
        JSON.stringify(replay),
      );
    if (controller === "anchors")
      await writeFile(
        `public/solutions/${routes[i].id}.json`,
        JSON.stringify(replay),
      );
    const result = {
      route: routes[i].id,
      name: routes[i].name,
      pass: true,
      freshReplay: true,
      ticks: s.tick,
      seconds: s.time,
      catches: s.catchCount,
      crossed: s.crossed,
      flew: s.flew,
      longestFlight: s.longestFlight,
      undercling: s.undercling,
      remainingReserve: s.reserve,
      overallReserve: s.energy,
      config: configs[i],
      controller,
    };
    results.push(result);
    console.log(
      `PASS ${controller} ${i + 1}. ${routes[i].name} · ${s.tick} ticks · fresh replay identical`,
    );
  }
  await writeFile(
    controller === "anchors"
      ? "../validation/campaign-results.json"
      : "../validation/motor-campaign-results.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        kind: "synthetic semantic controls through real physics; not real-camera validation",
        results,
      },
      null,
      2,
    ),
  );
}
