# Existing projects and reuse decisions

This audit was made from local documentation and selected source files on November 9, 2026. The prior games were not rebuilt or retested for this planning task. Existing validation counts in their READMEs remain historical reports.

## Local Crux

The current 2D game uses TypeScript, Canvas/DOM, Vite, and Planck **1.5.0**. Its source runs physics at **120 Hz** with `world.step(dt, 8, 3)`. It has twelve Standard routes and twelve Realism variants, grip reserves, checkpoint requirements, authored replays, and a two-hand finish dwell. These facts were checked in its README, package file, schema, and simulation source.

| Source relative to `D:/Climbing` | Reuse decision |
|---|---|
| `crux/game/src/render/WallRenderer.ts`, `HoldRenderer.ts`, `EffectsRenderer.ts` | Reuse the visual vocabulary and bounded event-effect architecture; extend silhouettes and load feedback. |
| `crux/game/src/render/ClimberRenderer.ts`, `Camera.ts` | Adapt clothing, framing, and camera conventions. Replace rendered arm IK with actual articulated joint positions. |
| `crux/game/src/ui/screens/PlayHud.ts`, `MenuCrux.ts` | Adapt route cards and unobtrusive controls; remove foot-swap UI. Add camera status and paired hand reserves. |
| `crux/game/src/core/sim/Climber.ts` | Rebuild. It uses a torso plus four endpoint bodies, maximum-distance ropes, and kinematic attached endpoints. `attach` moves the endpoint to the anchor and zeroes its velocity. |
| `crux/game/src/core/ik.ts` | Reuse numerical safeguards and two-link target solving as controller math; do not let visual IK manufacture a physical reach. |
| `crux/game/src/core/sim/Simulation.ts` | Reuse fixed-step ownership, commands, snapshots, lifecycle, events, and finish concepts. Replace the old contact/controller assumptions. |
| `crux/game/src/core/sim/SupportModel.ts`, `FootSupportModel.ts` | Do not carry foot-count gains, leg push, compressive foot support, or residual torso support into campus physics. |
| `crux/game/src/core/rules/GripRules.ts` | Adapt hold polygon queries, occupancy, and finish logic. Replace the no-hands grace rule: unsupported flight is a valid dyno state. |
| `crux/game/src/core/rules/CrimpModel.ts`, `StaminaModel.ts` | Reuse resource/state concepts and warning presentation. Replace key-driven crimp engagement, idle refill, and foot-supported recovery rules. |
| `crux/game/src/core/data/schema.ts` | Its hold grip union is only jug/crimp. Create a versioned schema separating hold shape, orientation, and gesture requirements. |
| `crux/game/src/persist/SaveStore.ts` and campaign scripts | Adapt storage isolation, validation, solutions, and replay infrastructure. Use a new namespace and new routes. |

The inspected screenshot `crux/validation/web-polish-2026-10-09/live-crux.png` shows the intended slate wall, mint jugs, orange edges, turquoise shirt, uncluttered framing, and small corner controls. Preserve that continuity while making arm articulation and contact states clearer. This was a stored screenshot inspection, not a fresh rendering test.

## Chalk Sandbox

The 3D prototype uses Python, MuJoCo, GLFW, and Dear ImGui. Its documented engine/scope pivots are in `chalk-sandbox/docs/08-adr-engine-pivot.md` and `09-simplification-pivot.md`. The later diagnosis records problems with mass accounting, elbow branches, collision masks, generated hold placement, silent input saturation, and feedback that existed in state but never rendered.

Use `chalk-sandbox/game/chalk/control/ik.py`, `simulation/rig_spec.py`, `simulation/rig_runtime.py`, and `contact/grasp.py` as conceptual references. Do not port its runtime or historical tuning directly into the browser. Its 3D constraints are not interchangeable with a 2D game rig.

Carry forward these lessons:

- Verify total mass, segment lengths, and physical versus painted endpoints.
- Judge controllers by visible repeated movement, not a successful first pull.
- Keep actual contact anchors separate from user intent targets.
- Author a route first and test its solution. Do not define the route as wherever a flawed actuator happened to land.
- Check feedback on screen, not only in logs or internal state.

The September 10 diagnosis is historical evidence, not a claim that those defects remain in the current 3D build.

## CruxScope legacy

`cruxscope-legacy/cruxscope/pose.py` uses RTMPose wholebody through rtmlib/ONNX Runtime, with YOLOX detection and continuity-based person selection. Its 133-keypoint layout includes 42 hand keypoints. The analyzer pipeline is designed for recorded clips; it is not a drop-in low-latency browser input layer.

Reuse the separation of observations, derived quantities, and simulation from `cruxscope-legacy/cruxscope/v2_analysis/common.py`. In particular, a model score is not a calibrated probability. Reuse angle calculations and temporal-analysis ideas after checking units and axis conventions. Do not feed its static equilibrium force estimates into gameplay as measured player effort.

The existing climbing videos mainly show people on walls. They do not establish performance for a front-facing webcam user making unweighted hand gestures. Create purpose-specific tracking fixtures with consent rather than claiming the old corpus validates this interaction.

## Roblox CRUX

The user explicitly identified **CRUX** as the Roblox reference. Search discovery identifies *CRUX: Rock Climbing* by SKR Studio, experience `74351664806300`. Its indexed description emphasizes individually controlled limbs, grip management, and dynos. Direct Roblox page retrieval failed in this research pass, and no interactive gameplay was observed. [Reference discovery and limits](../research/SOURCES.md#roblox-crux-reference)

Translate the user's requested feel into concrete targets: a suspended body with weight, a delayed lower-body swing, contact forces that change after a catch, momentum-preserving release, and a recoverable near miss. Do not claim a particular integrator, force equation, animation method, or exact timing is copied from Roblox CRUX.

## Separation rules

Create an independent future `crux-motion/game/` project. Copy only selected reusable material after checking `crux/THIRD_PARTY.md`; retain notices for fonts and dependencies. Do not import sibling source folders at runtime, migrate existing saves, alter the earlier games, extract Roblox assets, or reuse external route layouts. The next agent should verify the old baseline only if it elects to modify shared files; the intended implementation has no such dependency.
