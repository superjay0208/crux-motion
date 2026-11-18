# Crux Motion implementation status

Updated November 17, 2026 (`sourceHash` `451fc91b2b346276f883676339af15a8abd7e7c1aa31c3529994fe63cfd28401`). The original design remains in `docs/`; this file distinguishes verified implementation and counterfactual telemetry evaluation from live human acceptance.

## Current implementation

The local TypeScript/Vite/Canvas game includes twelve authored routes, hold-specific grip and palm-orientation recognition, anatomical hand association across crossed arms, local MediaPipe `paired` (`Pose + Hands`) and `holistic` providers, personal calibration, hands-free start and auto-recenter gates, **Assisted climb mode**, **Personal Best Ghosts**, practice **Hand anchors** + `WASD`/arrow swing controls, layered procedural Web Audio, semantic replays, route demonstrations, checkpoint practice, and an opt-in local camera/gameplay diagnostic recorder. Sibling `crux`, `chalk-sandbox`, and `cruxscope-legacy` projects remain separate.

### Milestone 1–3 engineering upgrades

1. **Low-latency camera pipeline, Holistic 2D fix & seated framing (`Camera.ts`, `inference.worker.ts`, `upstream.ts`, `gestures.ts`):**
   - Schedules frame capture via `video.requestVideoFrameCallback` (with `requestAnimationFrame` fallback) and downscales `> 640 px` video frames to aspect-preserving `640×360` bitmaps (`resizeQuality: "low"`), cutting `1280×720` pixel copy/upload `4×`.
   - Unwraps `@mediapipe/tasks-vision@0.10.32` 2D per-person arrays (`poseLandmarks?.[0]`, `leftHandLandmarks?.[0]`, `rightHandLandmarks?.[0]`) in `normalizeHolisticResult()`.
   - Lowers `HandLandmarker` confidence thresholds to `0.45 / 0.45 / 0.45` and adds a `140 ms` post-ready grip/orientation continuity buffer across transient closed-fist landmark dropouts (`quality === true`, cleared immediately on `"release"`, `!quality`, `recenter()`, or `stop()`).
   - Fixes metric 3D `world` mirroring (`x: -p.x`), gates `scores.fist > 0.72` so calibrated/geometric `crimp`/`pinch`/`sloper` shapes are never clobbered into `"jug"`, and rescues foreshortened splayed open-hand releases (`scores.open > 0.78 && openness > 0.58`).
   - Widens seated `resetSafe` to `x ∈ (0.11, 0.89), y ∈ (0.16, 0.90)` (fingertips `0.025..0.975`), tightens `frameEdge` to `x < 0.045 / > 0.955, y < 0.06 / > 0.965` (`>= 0.065` hysteresis), and resets dropped free-hand offsets (`!held[side]`) on `recenter()` to chest-ready `v(±0.18, 0.42)`.
2. **Planted-hand physics, anti-snag & dyno release window (`Simulation.ts`, `AnchorRig.ts`, `HandAnchors.ts`):**
   - Computes hold-scaled `capacities()` immediately inside `attach()` and re-syncs `AnchorRig.updateSupport()` when substep `0` acquires a hold.
   - Blocks accidental upward-sweep re-catches on lower `start`/`visited` holds unless `dist(aim, center) <= 0.85 * radius`, and smoothly weights `inverseHandCorrection` toward the upper pulling hand (`up to 0.78 / 0.22`) on vertical splits (`|Δy| > 0.20 m`).
   - Adds bounded spring-damped postural torso sway (`±0.20 rad`, `0` at rest/rebase, zero inversions) with damped leg pendulum (`angularDamping = 1.4`), extends `ReleaseVelocity` to a `0.18 s` peak-preserving pull window (`maxSpeed = 4.2 m/s`), and exposes `sim.strain(side)` (`0..1`) and `sim.assisted`.
3. **Visual craft, procedural Web Audio, Assisted mode & Personal Best Ghosts (`FollowCamera.ts`, `Renderer.ts`, `Audio.ts`, `main.ts`, `style.css`):**
   - Adds bounded velocity lookahead in `FollowCamera`, sculpted 3D hold bevels, visited chalk wear, `L`/`R` match arcs, Undercling/sidepull double-chevrons, climber drop shadow, crossed-arm front/back depth sorting, gaze tracking, wrist grip glyphs, and amber/coral strain warning arcs + HUD `· straining!` cues.
   - Synthesizes zero-asset procedural Web Audio (`catch` triangle thud + rock tap + `"Dyno"`/`"Clean"` fifth ping, `release` brush, `slip` chalk scrape, `launch` air rush, `checkpoint` tick, `fall` glide, `finish` `C5–G5–C6` chime) routed to both `destination` and `capture`.
   - Ships **Assisted climb mode** (badged `· ASSISTED`, stored under separate save keys), **Personal Best Ghost** recording/interpolation (`crux-motion:ghost:<route>`), responsive `1280×720` / `1024×640` layout, and inline SVG favicons.

## Verified

- **TypeScript & Vitest (`113/113` pass across 10 files):** covers `HolisticLandmarker` 2D unwrapping, `140 ms` continuity buffer, `640×360` downscaling, foreshortened release & crimp preservation, seated `resetSafe`/`frameEdge` hysteresis, free-hand neutral recenter, substep-0 catch capacity, `80 ms` finger-open dyno launch, lower-hold snag guard, split-hold pull weighting, bounded `<= 0.20 rad` sway, `strain()`, `assisted` mode, recording isolation, and 600-second stability runs ([unit-results.json](validation/unit-results.json)).
- **Campaign feasibility (`24/24` climbs solved, `100%` identical fresh replays):** all 12 routes solve and replay deterministically under both `anchors` ([campaign-results.json](validation/campaign-results.json)) and legacy `motors` ([motor-campaign-results.json](validation/motor-campaign-results.json)).
- **Live Microsoft Edge Playwright E2E & GPU worker suite (`14/14` pass):** verifies asset SHA-256 hashes, redistribution notices, zero `pageerror` / `console.error` / 4xx–5xx responses, zero external network requests, practice wrist drag + keyboard controls (`1–4`, `O`, `P`, `R`, `WASD`), Grip Lab → Watch Beta (`ATTEMPT REVIEW`), Assisted & Practice-Anchor settings, `1280×720` (DPR `1` & `1.25`) and `1024×640` viewport bounds, visually inspected desktop screenshots, and offline GPU worker inference on `/diagnostics.html` (`paired` GPU `17.0–19.6 ms`, `holistic` GPU `9.2–11.5 ms`; [web-results.json](validation/web-results.json), [model-smoke.json](validation/model-smoke.json)).
- **Counterfactual evaluation across all 6 personal recordings (`review-recorded-anchors.ts`):** comfortable active `resetSafe` pass rate rose **`71.82% → 91.86%`** per-hand and **`55.97% → 87.66%`** two-hand (`40.61% → 99.72%` on Clip 5); `maxTorsoAngle` stayed **`<= 0.1551 rad`** (**`0` inversions** vs `153` inverted frames in Clip 6); overload slips dropped **`25 → 4` (`-84.0%`, `0` across all 3 centered sessions)**; and Clip 6 Attempt 2 (`48.70s` free-hand recenter) rebased to `(-0.18, 0.42)`, caught `move-0`, and stayed `playing` (`tick 1934`) instead of falling at `tick 1125`.

## Human acceptance and current limits

Counterfactual replays feed fixed historical landmarks into updated controls without live visual feedback, and pilot/Playwright checks use synthetic or blank-frame inputs. Fresh live human webcam sessions on this build are still required to confirm real-world comfort, end-to-end `640×360` webcam frame-age improvement, gesture naturalness, dyno feel, and human route completions across the 12-route campaign. A local route editor remains future scope. See [validation/REPORT.md](validation/REPORT.md).
