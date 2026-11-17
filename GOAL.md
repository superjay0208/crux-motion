# Crux Motion goal

Build a satisfying, camera-controlled 2D climbing game in which a person can sit or stand in front of an ordinary webcam, move both arms independently, make readable grip gestures, and complete campus routes through reach, timing, momentum, and fatigue management.

The central experience is: **I cross my arms and the climber crosses theirs; I pull and the body rises or swings; I release at the right moment and fly; I form the right grip and feel the catch.**

## Required player outcomes

| Requirement | Observable completion evidence |
|---|---|
| Camera interaction | A first-time player calibrates and completes the first route using the camera for all climbing actions. Mouse/keyboard can operate menus. |
| Detailed holds | Jug, crimp, sloper, pinch, and undercling-oriented holds have distinct shapes, readable gesture cues, and different physical behavior. A wrong known gesture cannot secure them. |
| Crossed arms | Left and right identities survive crossings, including a cross-and-catch route, without swapping contacts, stamina, or arm colors. |
| Dynos | The player builds momentum through arm motion, releases into real unsupported flight, and catches a reachable hold. Mistimed releases produce meaningfully different trajectories. |
| Swinging | One-hand pendulums, momentum transfer, catch recoil, and passive leg follow-through are visible and influence the next move. |
| Satisfying feedback | Every contact, slip warning, release, launch, catch, rest, and finish has coherent visual and audio feedback tied to a simulation event. |
| Stamina | Separate hand reserves and an overall attempt reserve influence choices. Unloading one hand can recover that hand while making the supporting hand work harder. |
| Campus scope | There is no foot input, foot anchoring, hidden foot support, or foot-dependent finish. |
| Complete campaign | Twelve original routes have verified solutions, progressive teaching, accessible practice, reliable retry, and a stable two-hand finish. |
| Robustness | Camera denial, poor tracking, occlusion, hidden tabs, resize, device changes, and repeated restarts have explicit tested behavior. |

## First playable milestone

A local browser build with calibration, a gesture lab, and three polished routes: Jug Ladder, Cross Current, and First Flight. It must include real camera identity tracking, limited grip, a physical swing, a two-hand dyno, and one complete feedback pass. Crimp/sloper/undercling recognition can be validated in the lab before their campaign routes arrive. Passing a mouse-controlled demo alone does not pass this milestone.

## Full completion

The coding agent must meet the objective and the measured gates in [delivery and validation](docs/06-delivery-and-validation.md), record the actual tested devices and results, and provide a local launcher and reproducible build instructions. Camera accuracy and perceived feel need human trials in addition to automated checks. If those trials cannot be performed, report the exact remaining gate rather than claiming the game complete.

The game runs locally on Windows in a current Chromium browser first. A hosted HTTPS build is a later delivery option; this planning request does not ask to publish anything. A browser frontend, TypeScript, Canvas, and Planck are the proposed baseline. The tracking backend is selected by a measured spike.

## Scope boundaries

Defer multiplayer, accounts, cloud video, learned climbing policies, arbitrary video-to-route reconstruction, real climbing grades, true wall-depth simulation, and lower-body controls. Preserve hooks for later expansion without implementing those systems in the first release. The game is an expressive physical approximation, not a finger-strength test or a prediction of real-world climbing ability.
