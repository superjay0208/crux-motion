# Existing foundations for camera climbing

Research and integration: November 11, 2026, Pacific time. The latest personal recording and inspected GitHub revisions are preserved locally; imported runtime files and their original hashes are listed in [PORT_MANIFEST.json](PORT_MANIFEST.json). This is a source review and implemented port, not a claim that another project has already solved this exact webcam climbing game.

## Why the last approach failed

The newest 60-second swing recording runs build `69a19e49…`. Only 21.3 seconds are active play, interrupted by two protective pauses and a retry. It records five catches and four slips; inference p95 is 90.9 ms and frame age p95 is 149.1 ms. The first three catch counts include recovery/regrabs, so total catches are not a reliable measure of progress.

At about 22 seconds, the right elbow command is positive. At 27.98 seconds it is about −2.49 radians, while the video still shows a Jug fist near the same comfortable area. The physical elbow remains bent the other way, and aim error reaches 0.38 m. At 29.5 seconds the character is visibly upside down; the supporting Jug overloads at 29.88 seconds. This was the refreshed mirrored-controls build, with the recording preparation fix active.

The code converted a projected shoulder/elbow/wrist triangle into a bend sign and then commanded large opposing joint motions. A nearly folded arm moving in depth makes that sign ambiguous in the camera image. Filtering the resulting angle cannot make its interpretation correct. In addition, wrist position, joint angles and motors each introduced another response stage. The earlier synthetic fixtures had clean, planar elbows, so they missed this input ambiguity.

The changes below remove that ambiguous angle from the locomotion path. They also separate the visible arm from the body movement controller, so an uncertain elbow cannot turn a normal transfer into a somersault.

## Source review and selection

| Existing implementation | What was inspected | Decision and reason |
|---|---|---|
| [Another-Axiom/GorillaLocomotion](https://github.com/Another-Axiom/GorillaLocomotion), MIT, `bc42e959…` | Original `Player.cs`, initialization, planted-hand corrections, simultaneous supports, velocity history and release logic | **Adapted** inverse hand correction and two-hand averaging into TypeScript. Its motion model fits manually moving while a hand remains planted. Unity sphere casts, floor pushing and jump amplification are outside this 2D hold system. |
| [Godot XR Tools](https://github.com/GodotVR/godot-xr-tools), MIT, `6c6189bd…` | `movement_climb.gd`, `velocity_averager_linear.gd`, official [climbing documentation](https://godotvr.github.io/godot-xr-tools/docs/climbing/) | **Adapted** distance/time averaging and velocity transfer on release. Its dominant-hand strategy was considered; this implementation uses Gorilla's averaging when both hands support. No outward release push is applied. |
| [casiez/OneEuroFilter](https://github.com/casiez/OneEuroFilter), BSD-3-Clause in the TypeScript source, `d7892558…` | Original TypeScript filter and the authors' [algorithm/tuning guidance](https://gery.casiez.net/1euro/) | **Vendored** the original implementation. A small adapter converts millisecond timestamps to seconds and handles duplicate samples/gaps. Camera position has one application-level filtering stage; it no longer passes through a second angle filter in the default mode. |
| [open-source-hands](https://github.com/abouchedidxcode/open-source-hands), MIT, `dd79fb7b…` | Feature extraction, pose scoring, tracker lifecycle, shared types and the game-making playbook | **Vendored** feature extraction and pose scoring; **adapted** GPU-first/CPU-fallback behavior. Clear open/fist states use reusable per-finger scores, with world landmarks when available. This recent library is reusable code, not evidence of measured accuracy on this user. |
| [Kalidokit](https://github.com/yeemachine/kalidokit), MIT, `6437947d…` | `calcArms.ts`, pose solver and vector utilities | **Evaluated, not imported.** It solves rotations for a 3D avatar and applies rig-specific scaling/limits. It does not supply contact locomotion or momentum. Copying its 3D rotation output into the 2D motor rig would leave the core body-control problem unresolved. |
| [OpenClimber](https://github.com/Forsidia/openclimber), `97bfab23…` | Climbing and procedural-climber scripts, repository structure and README | **Reference only.** It is a 3D climbing project with different input/environment assumptions. No explicit license was found in the inspected revision, so no runtime code was imported. |

These are upstream owners' repositories, not copied versions of proprietary game assemblies. Full reviewed source is cached locally under ignored `research/upstream/`; only the selected licensed components enter the runtime.

## Additional primary references

1. [Unity XR Interaction Toolkit: Climb Provider](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/climb-provider.html) independently documents counter-movement of the player origin from the selected hand. It supports the architecture choice; Unity package code was not ported.
2. [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web) exposes image landmarks, world landmarks, handedness and video tracking. The old worker discarded the world output. It now forwards it for finger-shape measurement. World hand coordinates are not used as global body positions.
3. [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web) supplies body landmarks in both spaces and shows GPU/video configurations. Existing Pose + Hands remains the default model pipeline; changing an application controller does not establish a new detector's accuracy.
4. [MediaPipe Holistic Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker) supplies a combined pipeline and remains selectable. There is no current real-person benchmark showing it is superior here. Earlier blank-image measurements are insufficient to choose it as the universal replacement.
5. [Planck MouseJoint API](https://piqnt.com/planck.js/docs/api/classes/MouseJoint.html) describes a native soft constraint with a maximum force. The new body actuator uses that existing solver primitive instead of another custom joint-motor control loop.
6. [Box2D Solver2D](https://box2d.org/posts/2024/02/solver2d/) and [simulation documentation](https://github.com/erincatto/box2d/blob/main/docs/simulation.md) discuss constraint stability, softness, damping and stepping. Current Box2D APIs differ from pinned Planck 1.5.0; the implementation uses the installed Planck API, not copied current Box2D function names.

## What actually changed

### Planted hands determine body motion

For each supporting hand, compute the difference between its fixed hold anchor and the requested hand position. Average the two corrections when both hands support. This is the adapted Gorilla locomotion operation. One native, force-limited Planck spring follows the resulting body target; two incompatible arm motors no longer fight each other through the torso.

The character has a physical torso and passive lower body totaling 60 kg. The torso remains upright; visible arms are retargeted with two-link IK and do not inject physical work. Free hands follow the mapped wrist target, and closed hands attach only when that path intersects a compatible hold. Hold kinds, directions, finite reserves, wrong-grip consequences, crossing objectives and two-hand finishes remain active. The older motor rig remains selectable in Settings and is identified separately in replays.

This is an intentional model change: the default is an accessible climbing controller with physical body translation, not an eight-body active ragdoll or a biomechanical simulation. A continuous hand sweep produces a controlled body sweep; it does not guarantee a free pendulum oscillation after the hands stop. The passive lower body can swing, and release produces ballistic movement. Reintroducing unrestricted torso rotation is deferred until the reliable input/controller path passes human trials.

### Motion supplies release velocity

The release-history port totals actual body displacement over a short time window and divides by elapsed time. It handles uneven intervals without treating every camera frame as equal duration. On an intentional final-hand release, the spring is removed and the body receives that measured velocity, capped at 4 m/s. There is no unconditional upward boost or jump multiplier. Holding still therefore cannot charge a dyno.

An overloaded grip does not receive an intentional launch. Airborne catches caused by slipping also no longer count as deliberate dyno completion. Pause/recenter clears the release-history window without moving the body or refilling resources.

### Grip shape and position are separate

The imported hand-feature code measures 3D finger bend and soft pose scores. Clear open/closed states can override uncertain image-plane classification. Crimp, Sloper, Pinch and personal-shape handling retain the climbing-specific classifier. This is a partial integration, not adoption of every gesture or the entire upstream application.

Hand position no longer depends on whether a finger-shape feature vector is valid. Elbow visibility and projected bend sign do not gate default locomotion. Existing anatomical hand association and pose-guided identity are retained, including the calibration label swap. The upstream library and current MediaPipe documentation use conventions that must not be copied blindly; the integration mirrors coordinates once and supplies its already-associated anatomical side.

The worker attempts GPU initialization, falls back to CPU when creation fails, and rebuilds on CPU after repeated GPU inference failures. Assets stay pinned/local and inference stays in a worker. The selected delegate is visible and recorded. This behavior follows the inspected tracker lifecycle; live GPU startup, throughput and fallback still need browser execution in this environment.

## Port map and reproducibility

| Runtime file | Origin |
|---|---|
| `src/vendor/one-euro/OneEuroFilter.ts` | Original TypeScript source, retained with its BSD notice |
| `src/vendor/open-source-hands/features.ts`, `poses.ts`, `types.ts` | Original MIT sources, plus provenance headers |
| `src/vendor/climbing/HandAnchors.ts` | 2D TypeScript adaptations of the selected Gorilla/Godot operations |
| `src/core/AnchorRig.ts` | Project integration using native Planck spring and existing rendering contracts |
| `src/tracking/upstream.ts` | Project adapter for time units, score selection and climbing gestures |
| `src/tracking/inference.worker.ts` | Existing local inference with adapted delegate fallback and forwarded world points |

[PORT_MANIFEST.json](PORT_MANIFEST.json) records full commits, original content hashes and destinations. `game/scripts/fetch-upstream.mjs` retrieves review sources; `vendor-upstream.mjs` reproduces the vendored TypeScript and notice files. Redistribution notices ship under `game/public/licenses/` and are checked over HTTP. There are no runtime GitHub/CDN dependencies and no external video uploads.

## Validation and remaining uncertainty

- TypeScript/build and **85 tests pass**. New coverage checks stationary anchors, each one-arm pull, simultaneous-support averaging, irregular-time velocity history, ballistic release, protected pause/recenter, valid finite grips, elbow-sign independence, missing elbows, world-space shapes, replay identity and 600 simulated seconds of varied anchor attempts.
- All 12 routes solve and replay identically with the new controller. The previous motor controller also retains 12 passing solutions. Current demonstration assets use hand anchors and explicitly store the controller type. These are semantic feasibility tests, not human completions.
- Seven HTTP/package checks pass, including upstream notices and private recording isolation.
- Counterfactual playback of the latest recording's retained landmarks produces no torso inversion or overload slips. Its first segment catches hold 1; its second segment still falls after releases. It is not a successful live playtest and must not be reported as one.
- Browser inspection fails during tool startup in the current session. The previous session also encountered disabled browser control, but the current settings state was not rechecked. There is no fresh rendered screenshot, live GPU inference measurement, held-out gesture score or human acceptance for this build.

The next trial should compare visible hand direction, a planted-fist pull and deliberate release. If those still fail, record the selected controller/delegate and inspect wrist/hold coordinates before changing physics parameters. Reuse the retained raw trace and the existing port contracts; do not add another angle-to-motor layer or replace both models and the controller in one unmeasured step.
