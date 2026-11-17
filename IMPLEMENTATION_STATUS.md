# Crux Motion implementation status

Updated November 12, 2026. The original design remains in `docs/`; this file distinguishes the current implementation from human acceptance.

## Current implementation

The local TypeScript/Vite/Canvas game includes twelve routes, climbing-specific holds and grip recognition, anatomical hand association, local Pose + Hands and Holistic providers, optional personal calibration, tracking protection and hands-free start/recenter, per-hand reserves, fatigue, effects/audio, semantic replays, route demonstrations, checkpoint practice and an opt-in local camera/gameplay recorder. Existing analyzer/3D/original 2D projects remain separate.

The default **Hand anchors** camera controller adapts planted-hand correction and averaging from GorillaLocomotion and release history from Godot XR Tools. Native Planck soft constraints move the physical body; the torso stays upright and the lower body is passive. Visible arms use IK. This replaces the failing default active-ragdoll control path. The previous eight-body motor experiments remain selectable, and replays identify their controller explicitly.

The original BSD OneEuroFilter and MIT open-source-hands feature/pose code are vendored with pinned provenance and notices. Hand world points are forwarded for shape scoring. The worker attempts GPU execution with CPU fallback. Default movement depends on wrist/shoulder position, not projected elbow bend. [Research and implementation decisions](research/CONTROL_FOUNDATIONS.md), [port manifest](research/PORT_MANIFEST.json), [licenses](THIRD_PARTY.md).

The latest candidate adds a following wall camera, moving input origins at the virtual reach limit, and automatic fast boundary recovery. Returning hands into a guide and settling for 700 ms resumes the frozen climb without a mouse or full start countdown. A gravity-deflection fix prevents repeated recentering from sinking the body; failed anchor grips cannot repeatedly recatch without a fresh attempt. Old saved motor selection migrates once while retaining personal calibration. [Behavior, regressions and acceptance procedure](validation/CENTERING.md).

## Verified

- TypeScript and production build pass; **100 tests pass**. Current checks include repeated centering without drift, boundary/settled-frame gates, wall following, saved-setting migration, default camera-pipeline starter completions at 10/15 Hz, direct planted-fist pulls, support averaging, stationary stability, measured release momentum, gravity in flight, finite/wrong/exhausted grips, elbow-sign independence, world-space finger shapes, replay identity, recording storage and separate 600-second varied-input stability checks for the legacy and hand-anchor paths.
- All **12 routes solve and replay identically through each controller**, 24 feasibility solutions total. Current demonstration assets use hand anchors. These are scripted semantic inputs, not human camera completions.
- **Seven HTTP/package checks pass**, including all four imported control-component notices, local model hashes, semantic demonstration metadata and private-recording isolation.
- Six actual user recordings have been inspected. The latest runs the mirrored-control build and exposes a projected elbow-sign reversal before an upside-down transfer and overload. Its raw landmarks can be replayed locally through the new controller. That counterfactual removes inversion/overload in the inspected segments but does not complete the level and is not human acceptance.
- Earlier provider smoke tests executed real local CPU/WASM inference on blank images. Current GPU/fallback behavior is built and type checked, but has not been executed in a fresh browser test.

## Human acceptance and current limits

The user has rejected the previous controls as unplayable. Passing synthetic tests did not override those reports. Human comfort, recognition accuracy, crossing continuity, dyno feel and all twelve camera completions remain open for the new foundation.

The new model prioritizes reliable manual control over unrestricted ragdoll rotation. It is not an eight-body biomechanical simulation or a free pendulum after the hands stop moving. Gesture recognition estimates shapes, not grip force. The measured pre-change recording frame-age p95 of about 149 ms remains a baseline; no current GPU latency improvement is claimed.

Browser inspection fails during tool startup in the current session. Earlier sessions also encountered disabled browser control, but current settings were not rechecked. The new interface, GPU initialization and actual personal play have no fresh rendered verification. [Current validation report](validation/REPORT.md).

## History and scope

The user personally confirmed the hands-free countdown after identifying the infeasible mouse-and-two-hands start design. Later recordings rejected both absolute reach and comfortable-pose centering as sufficient solutions. [Start flow](validation/HANDS_FREE_START.md), [earlier reach work](validation/REACH_PLAYABILITY.md), [first recorded findings](validation/RECORDED_FINDINGS.md), [superseded mirror iteration](validation/MIRROR_ARMS.md).

The expanded design's assisted gesture substitution, personal best ghosts and local route editor remain future work. No external publication or video upload has occurred.
