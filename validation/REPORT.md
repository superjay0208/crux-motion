# Crux Motion candidate validation

Updated November 12, 2026, Pacific time. Version **0.1.0**, local Windows build. Six personal recordings exposed continued failures in the previous controls. The current default is the researched and adapted **Hand anchors** controller. This candidate adds wall following, quick centering and saved-setting migration. [Centering regressions and acceptance](CENTERING.md), [research, exact ports and limitations](../research/CONTROL_FOUNDATIONS.md).

## Build

- Source hash: `1ffed8b2f9b6a16d09a68dd8baa671bdf914cf8e7f66f6eae23cdfde49593f6c`.
- Built at `2026-11-12T09:28:57.333Z`, November 12 in Pacific time.
- Node 24.19.0 / npm 11.17.0; TypeScript 5.7.2, Vite 6.0.3, Planck 1.5.0, MediaPipe Tasks Vision 0.10.32.
- The standalone launcher serves `game/dist/` at `http://127.0.0.1:4318/`. Double-click `run.bat` if needed. Refresh an open game to load this build.

No remote publication was performed. The existing analyzer, 3D sandbox and original 2D game remain separate.

## Current checks

| Check | Result | Scope |
|---|---|---|
| TypeScript and Vitest | **100/100 pass** | [Unit results](unit-results.json); full suite includes local recording endpoint tests |
| Production build | Pass | Bundled worker, pinned local assets, current provenance |
| Hand-anchor campaign | **12/12 solve; 12/12 identical fresh replays** | [Current results](campaign-results.json); controller marked `anchors` |
| Previous motor campaign | **12/12 solve; 12/12 identical fresh replays** | [Motor results](motor-campaign-results.json); separate comparison evidence |
| Production HTTP/package checks | **7/7 pass** | [HTTP results](web-results.json); includes upstream notices and new demo metadata |
| Latest actual recording | Inspected locally | Original video, timestamps, landmarks and events retained privately |
| Current browser rendering, GPU execution and human comfort | **Not verified** | Browser inspection fails during tool startup |

New checks cover simultaneous supports, irregular-interval velocity history, direct one-arm pulls, stationary stability, sweeps and ballistic release, pause/recenter reset, finite/wrong/exhausted holds, lone Undercling failure, elbow-sign independence, hidden elbows and world-space finger measurement. Both the legacy and hand-anchor paths have separate 600-second varied-input stability checks. These are accelerated checks, not long real-camera sessions.

The default Hand anchors camera pipeline has authored starter-route completions at 10/15 Hz and multiple gains with both hands inside the return guide. Thirty repeated centering cycles stay within 1 cm of the original settled body position with no slips or stored launch velocity. Additional tests cover reachable reversal without an overshoot buffer, inner/outer boundary hysteresis, fresh settled-frame recovery, old-setting migration and wall following through ascent/fast flight. Current body actuation uses mapped wrist positions without the ambiguous elbow command. Synthetic landmarks test application logic after inference, not image-model accuracy.

## Campaign results

Current demonstrations carry `controller: anchors`. They use normal semantic controls, finite contact/reserve rules and the same simulation as camera play; no script marks routes complete or remotely attaches a hand. Legacy motor results remain separate.

| Route | Hand-anchor ticks at 120 Hz | Fresh replay |
|---|---:|---|
| Jug Ladder | 211 | Pass |
| Cross Current | 238 | Pass |
| Edge Etiquette | 237 | Pass |
| Pendulum Bay | 256 | Pass |
| Soft Landing | 237 | Pass |
| Under the Lip | 211 | Pass |
| Pinch Point | 229 | Pass |
| Quiet Apex | 259 | Pass |
| First Flight | 349 | Pass |
| Catch and Carry | 368 | Pass |
| Crosswind | 577 | Pass |
| Campus Circuit | 448 | Pass |

The pilot moves much faster than a person. These results establish feasibility and determinism, not comfortable camera completion. Demonstrations/reviews do not award progress.

## Latest recorded failure and diagnostic replay

The newest 60-second swing test used build `69a19e49…` and had 21.3 seconds of active play, five catches and four slips. Frame-age p95 was 149.1 ms; inference p95 was 90.9 ms. Two protective pauses and a retry occurred. Preparation correctly blocked early play.

Near 27.98 seconds, the right elbow command reverses to approximately −2.49 radians while its physical elbow remains bent the other way; aim error reaches 0.38 m. The video shows an upside-down character at 29.5 seconds, then a supporting Jug overload at 29.88 seconds. This identifies a specific failure of the previous elbow-to-motor path. [Detailed source-informed analysis](../research/CONTROL_FOUNDATIONS.md).

Retained landmarks were run through the changed controller. The first segment catches hold 1 without overload; the second still falls after releases. Neither has torso inversion or overload slips. This is counterfactual playback under different feedback, not a new human attempt or completed level. Raw data and review output remain private.

## Model and rendering limits

GPU-first initialization/CPU fallback and world-point shape scoring are built/type checked, but fresh browser execution remains pending. No measured GPU speedup or improved personal gesture accuracy is claimed.

Earlier CPU/WASM blank-frame tests and screenshots belong to earlier candidates: [provider smoke](model-smoke.json), [historical playbacks](browser-playbacks.json), [historical desktop](screenshots/game-desktop.jpg). They establish past compatibility, not current GPU behavior or rendered verification. Browser use fails during startup in this session; current Work browser settings were not observed.

The new torso stays upright and arms are retargeted graphics. Body translation/lower-body motion remain physical, and release follows measured motion. This is a gameplay control model, not unrestricted active-ragdoll physics or validated human biomechanics. A continuing free pendulum after stationary hands is not established.

## Sources and local data

Four reviewed TypeScript files are vendored and two climbing operations are adapted at pinned commits. [Port manifest](../research/PORT_MANIFEST.json), [notices](../THIRD_PARTY.md). Imported notices ship in the production build and are checked over HTTP. The reference cache is ignored and excluded from the game build.

Processing stays local. Normal play saves no video. Explicit recorded tests include game sound without microphone input and save under ignored `personal-recordings/`; the loopback server rejects foreign origins and direct reads. Original clips are preserved privately.

## Next acceptance check

Use **Centering · follow and reset** after refresh. Expected behavior is a smoothly following wall view, a frozen climb before the real hand leaves frame, automatic resumption after returning into the guide and settling, and then small transfers to holds 1 and 2. This preset selects Hand anchors. Old motor settings migrate once while preserving personal grip calibration. New recordings identify controller, delegate, world-point availability, frame age, moving input centers and recovery/view state. Human comfort, crossing continuity, precise holds, airborne catches and complete camera routes remain open.
