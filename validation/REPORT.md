# Crux Motion candidate validation

Updated November 17, 2026, Pacific time. Version **0.1.0**, local Windows & GitHub Pages build. Milestones 1–8 combined forensic analysis across six local play recordings, production web-performance profiling, and a full art/UX/mechanics overhaul: low-latency `640×360` camera worker capture, `HolisticLandmarker` 2D unwrapping, closed-fist continuity, seated `resetSafe` framing, free-hand neutral recentering, a high-margin **3-grip + Release** gesture engine (`Jug`, `Crimp`, `Pinch`, `Open` with live 4-class confidence meters and zero `sloper` ambiguity), warm limestone/terracotta bouldering topo UI (`Fredoka` + `Bebas Neue` + `BarlowCondensed`), polygon-sculpted 2D climber & 3D holds, dual **Stamina & Forearm Pump** (diegetic *Jusant*-style climber rig + HUD `#stamina-panel`), **12 open-selection boulders (`B1`–`B6`)** under a pure **Match Top to Win** rule, simultaneous two-hand dynos with swing/push-up momentum, apex deadpoints, impact frames & micro hit-stop, batched 2D Canvas rendering, zero-JSON 120 Hz simulation hot paths, **Assisted climb mode**, and **Personal Best Ghosts**. See [UI & art direction research](../research/UI_AND_ART_DIRECTION.md), [forensic telemetry & game-feel research](../research/GAME_FEEL_AND_WEBCAM_RESEARCH.md), [centering acceptance](CENTERING.md), and [control foundations & ports](../research/CONTROL_FOUNDATIONS.md).

## Build & Live Deployment

- **Live GitHub Pages URL:** [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/)
- **Personal Website Portfolio:** [https://superjay0208.github.io/](https://superjay0208.github.io/)
- Source hash: `32b1a80662371ac990aa1e624e850b7e3af23bcc779d8b9e1642fc492ccce9f1`.
- Built at `2026-11-18T05:35:54.923Z` locally (November 17, 2026 in Pacific time).
- Node 24.19.0 / npm 11.17.0; TypeScript 5.7.2, Vite 6.0.3, Planck 1.5.0, MediaPipe Tasks Vision 0.10.32, Playwright 1.56.1 (Microsoft Edge `157.0.0.0`).
- Standalone local server serves `game/dist/` at `http://127.0.0.1:4318/`. Double-click `run.bat` to launch locally.

## Current checks

| Check | Result | Scope |
|---|---|---|
| TypeScript & Vitest | **117/117 pass** (`10` files) | [Unit results](unit-results.json); 4-class gesture margin (`>= 0.25`) + rolled-fist guard, centering, anchors + simultaneous two-hand dynos, stamina/pump, pure Match-Top, physics, playability, mirror, motion, hands-free, replay, recording isolation |
| 120 Hz simulation benchmark | **Pass (`p95 = 0.0317 ms` < `1.0 ms`)** | [Perf benchmark](perf-benchmark.json); `72,000` steps (`600 s` simulated in `1.69 s`, **`354.6×` realtime**) |
| Production build | **Pass** | Classic bundled worker (`tracking.worker.js`), 4 self-hosted OFL `.ttf` fonts, pinned local models/WASM, inline SVG favicons, build provenance |
| Hand-anchor campaign | **12/12 solve; 12/12 identical fresh replays** | [Anchor results](campaign-results.json); all 12 sloper-free `B1`–`B6` boulders (`268–562` ticks) |
| Legacy motor campaign | **12/12 solve; 12/12 identical fresh replays** | [Motor results](motor-campaign-results.json); comparison regression suite (`316–1226` ticks, `24/24` total climbs) |
| Live MS Edge E2E & HTTP suite | **15/15 pass** (`22.8s`) | [Web results](web-results.json); `assets.spec.ts` (`7/7`) + `gameplay.spec.ts` (`8/8` incl. 12-boulder landing grid, stamina HUD, Grip Lab 4-class bars, `Cross-Body` beta, `Launchpad` dyno charge + `KeyV`/`#release-both` + impact frame), zero 4xx/5xx, zero external requests |
| Local `/crux-motion/` subpath gate | **Pass (`59.1–59.7 FPS` vsync, `1.03–1.34 ms` work)** | [Subpath perf](web-subpath-perf.json); `Fredoka`/`Bebas Neue`/`Display` verified, `12` open boulders, `0` landing `.task`/`.wasm` fetches, `?route=motion-09` (`Split Decision`) deep-link, reload persistence |
| Live GitHub Pages HTTPS gate | **Pass (`59–60 FPS` vsync, `0` landing `.task`/`.wasm`)** | [Live perf](web-live-perf.json), [Live screenshot](screenshots/live-crux-motion.jpg); `paired` & `holistic` GPU workers verified over HTTPS |
| Live personal website portfolio | **Pass (`0` errors, live click-through)** | [Portfolio screenshot](screenshots/portfolio-live.jpg); 3-card row aligned with Milestone 8 warm limestone/terracotta card SVG, `Crux` SVG, `CS 184`, and `6` `CS 180` links verified |
| Live MS Edge GPU worker smoke | **Pass (`GPU` delegate on both)** | [Model smoke](model-smoke.json); `paired` steady-state `~16.15 ms`, `holistic` steady-state `~9.23 ms` on 5 blank frames |
| Rendered desktop screenshots | **Captured & visually inspected** | [Landing](screenshots/landing-desktop.jpg), [Practice](screenshots/game-desktop.jpg), [Grip Lab](screenshots/grip-lab-desktop.jpg), [Cross-Body Beta](screenshots/cross-current-beta.jpg), [Dyno Impact](screenshots/dyno-impact.jpg) |
| Counterfactual 6-clip replay | **Evaluated locally** | `scripts/review-recorded-anchors.ts`; raw private media/landmarks remain inside Git-ignored `personal-recordings/` |
| Live human webcam playthrough | **Pending player session** | Automated suites and counterfactual replays do not substitute for fresh human comfort/completion testing |

## Campaign results

All twelve open-selection boulders (`B1`–`B6`) use only high-margin `jug`, `crimp`, and `pinch` holds (`0` slopers), `controller: "anchors"`, normal semantic inputs, strategic forearm/core stamina rules, simultaneous two-hand dyno launches on dyno boulders (`Launchpad`, `Ricochet`, `The King Line`), and pure dual-hand `TOP` matching (`0.35 s`):

| Boulder | Grade & Style | Hand-anchor ticks at 120 Hz | Seconds | Style telemetry | Fresh replay |
|---|---|---:|---:|---|---|
| Warmup Buckets (`motion-01`) | `B1 · Jugs` | 268 | 2.23s | — | Pass |
| Campus Rungs (`motion-02`) | `B1 · Jug Ladder` | 302 | 2.52s | — | Pass |
| Razor Edges (`motion-03`) | `B2 · Crimps & Rest` | 268 | 2.23s | — | Pass |
| Twin Fins (`motion-04`) | `B2 · Pinch Pillar` | 302 | 2.52s | — | Pass |
| Pendulum Traverse (`motion-05`) | `B3 · Swing Line` | 302 | 2.52s | `crossed` | Pass |
| Cross-Body (`motion-06`) | `B3 · Twist & Reach` | 268 | 2.23s | `crossed` | Pass |
| Launchpad (`motion-07`) | `B3 · Double Dyno` | 322 | 2.68s | `flew` | Pass |
| Under the Roof (`motion-08`) | `B4 · Undercling Lip` | 302 | 2.52s | `undercling` | Pass |
| Split Decision (`motion-09`) | `B4 · Dual Beta` | 302 | 2.52s | — | Pass |
| Ricochet (`motion-10`) | `B5 · Swing Dyno` | 437 | 3.64s | `flew` | Pass |
| Vice Grip (`motion-11`) | `B5 · Crimp + Sidepull Pinch` | 302 | 2.52s | — | Pass |
| The King Line (`motion-12`) | `B6 · Full Boulder` | 562 | 4.68s | `flew` | Pass |

Pilot solutions run faster than human tempo and establish mechanical feasibility and replay determinism rather than human webcam difficulty. Watching demonstrations never awards route progress.

## Counterfactual evaluation across 6 personal recordings

Replaying all 6 preserved local sessions (`261.1 s` total, `151.5 s` active play, `3,411` unique camera observations) through the Milestone 1+2 `Camera` and `Simulation` pipeline (`scripts/review-recorded-anchors.ts`):

- **Seated `resetSafe` framing pass rate:**
  - Comfortable active per-hand observations (`n = 3,659`): **`71.82%` (`2,628 / 3,659`) → `91.86%` (`3,361 / 3,659`)** (`+20.04 pp`; rejections cut `28.18% → 8.14%`).
  - Comfortable active two-hand simultaneous frames (`n = 1,742`, gating `HandsFreeGate` and `RecoveryGate`): **`55.97%` (`975 / 1,742`) → `87.66%` (`1,527 / 1,742`)** (`+31.69 pp`; seated centered Clip 5 `c765d68e` rose **`40.61% → 99.72%`**, Clip 4 `31872ed4` **`65.26% → 97.08%`**).
  - All tracked observations: per-hand **`69.29% → 85.37%`** (`n = 6,092`); two-hand **`52.77% → 78.23%`** (`n = 3,000`).
- **Postural stability (`maxTorsoAngle` & inversions):**
  - Global max **`0.1551 rad`** across all 7 attempts (`0.0365, 0.1551, 0.0598, 0.1192, 0.0518, 0.0807, 0.0310 rad`), strictly **`<= 0.20 rad`** with **`0` inversions** (compared to `7.4428 rad` and `153` inverted frames in original Clip 6).
- **Overload slips:**
  - Reduced **`25 → 4` (`-84.0%`)** across all 6 recordings, with **`0` overload slips across all 3 centered sessions (`31872ed4`, `c765d68e`, `6c0b341d` — `11 → 0`)**.
- **Clip 6 (`6c0b341d`) Attempt 2 (`48.70s` free-hand recenter):**
  - Passing `held` resets the dropped free left-hand offset (`held = { left: false, right: true }`) from hip-pinned `(-0.1903, -0.7193)` (`-0.560 m` in original telemetry) to chest-ready **`(-0.18, 0.42)`**, restoring upward reach (`maxLeftOffsetY = +0.7447 m`, `maxLeftHandY = 1.2148 m`, `minMove0Dist = 0.1279 m`), achieving **2 catches** (including `move-0` `"Secure catch"` at `50.80s` / `tick 830`), and remaining `playing` through `tick 1934` (`0` slips) instead of falling at `tick 1125`.

*Scope caveat:* Counterfactual replay feeds recorded landmarks from earlier builds into updated control/physics code without closed-loop human visual reaction; it validates specific regression fixes rather than claiming human route completions.

## Live browser rendering, 60+ FPS performance & GitHub Pages verification

Executed locally against `http://127.0.0.1:4318` (`npm run web:check`), under an ephemeral `/crux-motion/` subpath (`node scripts/validate-web.mjs`), and live over HTTPS against `https://superjay0208.github.io/crux-motion/` and `https://superjay0208.github.io/` in Microsoft Edge (`Edg/157.0.0.0`):

- **120 Hz simulation benchmark ([perf-benchmark.json](perf-benchmark.json)):** `72,000` steps (`600 s` simulated across `AnchorRig` + `Rig`) completed in **`1,692.0 ms` wall (`354.6×` realtime)**; combined **`mean = 0.02323 ms`**, `p50 = 0.0214 ms`, **`p95 = 0.0317 ms`** (`AnchorRig` `p95 = 0.0289 ms`, `Rig` `p95 = 0.0335 ms`), `p99 = 0.0435 ms`, `heapDelta = 23.14 MB`.
- **Live HTTPS load & lazy asset budget ([web-live-perf.json](web-live-perf.json), [live-crux-motion.jpg](screenshots/live-crux-motion.jpg)):** self-hosted `"Fredoka"`, `"Bebas Neue"`, and `"Display"` TrueType fonts verified, `12` open boulders on `#front-boulder-grid`, and **`0` `.task`/`.wasm` camera model assets fetched on landing** (lazy-loaded strictly for Camera mode and `/diagnostics.html`).
- **Continuous 180-frame simulation + Canvas 2D frame-time gate:**
  - **Local `/crux-motion/` subpath ([web-subpath-perf.json](web-subpath-perf.json)):** `domContentLoadedMs = 69.3 ms`, `loadEventMs = 162.1 ms`; Intro Showcase **`59.08 FPS`** vsync (`frameDeltaP50 = 16.7 ms`, `frameDeltaP95 = 16.8 ms`, **`frameWorkMean = 1.03 ms`**, `frameWorkP95 = 1.3 ms`, `0` long tasks); Practice Climb **`59.66 FPS`** vsync (`frameDeltaP50 = 16.7 ms`, `frameDeltaP95 = 16.8 ms`, **`frameWorkMean = 1.34 ms`**, `frameWorkP95 = 1.6 ms`, `0` long tasks).
  - **Live GitHub Pages (`https://superjay0208.github.io/crux-motion/`):** verified post-deploy over HTTPS with `node scripts/validate-web.mjs --url=https://superjay0208.github.io/crux-motion/` (`0` long tasks, `< 1.6 ms` `frameWorkP95`, see [web-live-perf.json](web-live-perf.json)).
- **Zero runtime/network anomalies:** zero `pageerror` events, zero `console.error` messages, zero HTTP 4xx/5xx responses, and zero third-party/external requests across both local loopback and live `superjay0208.github.io`.
- **Offline & live HTTPS GPU worker inference (`/diagnostics.html`):** both `paired` (`PoseLandmarker` + `HandLandmarker`) and `holistic` (`HolisticLandmarker`) initialized with **`delegate: "GPU"`** and completed 5 blank frames (`paired` steady-state **`~16.15 ms`** local; `holistic` steady-state **`~9.23 ms`** local; [model-smoke.json](model-smoke.json)). Blank-frame GPU timings verify WebGL/WASM worker execution, not live webcam person-tracking throughput.
- **Visual, responsive, dyno impact & live portfolio verification:** responsive bounds (including `#stamina-panel`) passed at `1280×720` (DPR `1` and `1.25`) and `1024×640` (DPR `1`). Inspected screenshots confirm warm limestone topo typography & 12-boulder landing grid ([landing-desktop.jpg](screenshots/landing-desktop.jpg), [live-crux-motion.jpg](screenshots/live-crux-motion.jpg)), sculpted Jug/Crimp/Pinch holds + live 4-class gesture bars ([grip-lab-desktop.jpg](screenshots/grip-lab-desktop.jpg)), anatomical terracotta climber + diegetic stamina arcs + `#stamina-panel` ([game-desktop.jpg](screenshots/game-desktop.jpg)), crossed-arm depth sorting on `Cross-Body` + `· straining!` warnings ([cross-current-beta.jpg](screenshots/cross-current-beta.jpg)), `Launchpad` two-hand dyno impact shockwaves + radial speed lines + `DYNO CAUGHT!` / `DYNO LAUNCH!` callouts ([dyno-impact.jpg](screenshots/dyno-impact.jpg)), and live 3-card portfolio alignment + click-through on `https://superjay0208.github.io/` ([portfolio-live.jpg](screenshots/portfolio-live.jpg)).

## Sources and local data

Imported BSD OneEuroFilter, MIT open-source-hands, MIT GorillaLocomotion, and MIT Godot XR Tools notices ship in `game/dist/licenses/` and are verified over HTTP ([port manifest](../research/PORT_MANIFEST.json), [THIRD_PARTY.md](../THIRD_PARTY.md)). Normal play records no media; explicit test recordings stay under Git-ignored `personal-recordings/`, and `/api/recordings/*` rejects foreign origins and direct reads (`403`).
