# Recorded camera and gameplay tests

Added November 9, 2026 at the user's request; updated November 12 after inspecting six saved personal attempts. [Current research and ports](../research/CONTROL_FOUNDATIONS.md) follows the failed mirrored-control iteration. [Current centering behavior](CENTERING.md) adds fast recovery and a following view. Browser inspection currently fails during tool startup; the user can operate recording directly.

## Start the test

1. Refresh `http://127.0.0.1:4318/` and choose Use your camera.
2. Select **Record a local play test → Centering · follow and reset** (the default), or choose the swing, reach, crossing or dyno preset. Centering and swing explicitly select Hand anchors. Old saved controls migrate once without deleting personal grip calibration.
3. Click **Start recording test** once. Put the mouse down and follow the fixed banner.
4. The first 15 seconds hold the avatar safely during preparation. Begin/Resume is disabled with an explanatory label, so grip-check prompts cannot overlap active hanging. At fifteen seconds, the hands-free start arms automatically. Relax both Jug fists near your chest for the countdown. In the centering preset, sweep gently, slowly approach the frame edge with one fist, and return both hands into the guide when the game freezes. Match held grips and settle for about 700 ms to resume automatically, then try holds 1 and 2. Recenter hands / C requests the same fast recovery manually. In the swing preset, sweep both hands gently while holding, then try a transfer and an optional dyno.
5. Recording stops and saves at sixty seconds. **Stop & save** ends it sooner. Hiding the tab or returning home also ends the recording.

Cross Current and First Flight presets provide separate crossing and dyno tests with the same sixty-second limit. The initial prompts are guides, not automatically labeled gesture ground truth.

## Files and review

The standalone launcher writes `crux-motion/personal-recordings/<unique-session>/`:

- `camera-gameplay.webm`: 1280×720 composite, targeting twenty frames per second, with the full game canvas, mirrored camera feed and existing tracking overlay, recording time, route/tick/state, recognized grips, aim/actual reach, contact state, and game sound. Microphone audio is never requested.
- `telemetry.json`: recording/build/provider/calibration metadata, video clock, image observation timestamps/age, recognition candidates/scores, position quality, targets, actual hands/shoulders, next-hold distances, landmarks/features and catch/slip/release events. Current captures also include arm mode/gain, observed/retargeted/actual arm angles, contact load/drift, body velocity/angular motion, center anchors, edge flags, recovery progress/reason/return-zone/movement checks, following-view center/scale and encoder-start delay.
- `analysis.md`: initial diagnostic flags with timestamps and sampled durations.

The review dialog plays the video and exposes explicit video/diagnostic download buttons. These remain available if local saving fails. Recording-owned canvas/audio tracks stop at the end; the original camera and game-audio source remain available for normal play. Video and telemetry remain local, are excluded from Git, and are not exposed by the static server. The recorder uses no external upload service.

## How to diagnose

Compare the video with the synchronized metrics at a failed move:

| Evidence | What to investigate |
|---|---|
| Real extension near full, aim reach below 75% | Camera-to-avatar scaling or arm-length estimate |
| Aim reaches far enough, free physical hand stays over 18 cm behind | Controller response, body position, momentum, or joint pose |
| Next patch is outside the shoulder's full physical reach | Supporting-hand pull or swing required before reaching |
| Physical hand reaches the patch but confirmed grip differs | Grip classification or hold-specific acquisition gate |
| Hand stays attached while aim moves away | Intended pull versus release gesture not recognized; video is essential |
| Position quality disappears or image age rises | Framing, occlusion, inference performance or recording overhead |

Flags identify review points. They do not independently establish root causes, identity swaps, or gesture precision/recall. Intended actions must be checked against the person in the video. Calibration samples cannot serve as a held-out recognition test.

## Verification and current limitation

The build/type check, 100 unit/physics/control/recording tests and seven production HTTP checks pass. Storage fixtures use a temporary folder and synthetic bytes; encoder fixtures mock MediaRecorder. Actual encoding is separately established by decoding saved clips. Current telemetry also records delegate, imported pose scores and world hand points when available. Current GPU execution and human camera acceptance remain unverified.

The three original clips begin their encoded picture about 5.1 seconds after the diagnostic clock; match those using the printed overlay. The two subsequent clips no longer show that large gap at inspected seeks after continuous silent capture audio was added. Encoder-start events report 69/109 ms. This does not measure external camera-to-display latency. All originals remain private and excluded from distributable validation artifacts.
