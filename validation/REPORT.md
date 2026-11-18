# Crux Motion candidate validation

Updated November 17, 2026, Pacific time. Version **0.1.0**, local Windows & GitHub Pages build. Forensic analysis across all six local user play recordings plus production web-performance profiling drove Milestones 1–5 upgrades across camera worker latency, `HolisticLandmarker` 2D unwrapping, closed-fist continuity, seated `resetSafe` framing, free-hand neutral recentering, immediate catch capacity, split-hold pull weighting, bounded postural sway, dyno release velocity, batched 2D Canvas rendering, zero-JSON 120 Hz simulation hot paths, autonomous landing physics showcases, sculpted visual/audio craft, **Assisted climb mode**, and **Personal Best Ghosts**. See [forensic telemetry & game-feel research](../research/GAME_FEEL_AND_WEBCAM_RESEARCH.md), [centering acceptance](CENTERING.md), and [control foundations & ports](../research/CONTROL_FOUNDATIONS.md).

## Build & Live Deployment

- **Live GitHub Pages URL:** [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/)
- **Personal Website Portfolio:** [https://superjay0208.github.io/](https://superjay0208.github.io/) (`superjay0208/superjay0208.github.io` commit `656ca0a27ae3a7116cc08f82c9a301d3a66c6a0b`)
- Source hash: `d93a923799bf11bc075e95d926e7c2e59b4a78a97b28c252c91f0f95032dcd85` (Ubuntu 24.04 GitHub Actions LF build: `81125abe9c6231de26dfc6a630c6631c8e58b2808dcb48b12db2ecba7ddc4669`).
- Built at `2026-11-18T01:52:00.483Z` (November 17, 2026 in Pacific time).
- Node 24.19.0 / npm 11.17.0; TypeScript 5.7.2, Vite 6.0.3, Planck 1.5.0, MediaPipe Tasks Vision 0.10.32, Playwright 1.56.1 (Microsoft Edge `157.0.0.0`).
- Standalone local server serves `game/dist/` at `http://127.0.0.1:4318/`. Double-click `run.bat` to launch locally.

## Current checks

| Check | Result | Scope |
|---|---|---|
| TypeScript & Vitest | **113/113 pass** (`10` files) | [Unit results](unit-results.json); tracking, centering, anchors, physics, playability, mirror, motion, hands-free, replay, recording isolation |
| 120 Hz simulation benchmark | **Pass (`p95 = 0.0316 ms` < `1.0 ms`)** | [Perf benchmark](perf-benchmark.json); `72,000` steps (`600 s` simulated in `1.62 s`, **`369.6×` realtime**) |
| Production build | **Pass** | Classic bundled worker (`tracking.worker.js`), pinned local models/WASM, inline SVG favicons, build provenance |
| Hand-anchor campaign | **12/12 solve; 12/12 identical fresh replays** | [Anchor results](campaign-results.json); default `controller: "anchors"` demos |
| Legacy motor campaign | **12/12 solve; 12/12 identical fresh replays** | [Motor results](motor-campaign-results.json); comparison regression suite (`24/24` total climbs) |
| Live MS Edge E2E & HTTP suite | **14/14 pass** (`17.2s`) | [Web results](web-results.json); `assets.spec.ts` (`7/7`) + `gameplay.spec.ts` (`7/7`), zero 4xx/5xx, zero external requests |
| Local `/crux-motion/` subpath gate | **Pass (`153–164 FPS`, `0.73–0.96 ms` work)** | [Subpath perf](web-subpath-perf.json); `0` landing `.task`/`.wasm` fetches, `?route=motion-09` deep-link, reload persistence |
| Live GitHub Pages HTTPS gate | **Pass (`162–164 FPS`, `149.5 KB` landing)** | [Live perf](web-live-perf.json), [Live screenshot](screenshots/live-crux-motion.jpg); `paired` GPU `17.55 ms`, `holistic` GPU `9.40 ms` |
| Live personal website portfolio | **Pass (`0` errors, live click-through)** | [Portfolio screenshot](screenshots/portfolio-live.jpg); 3-card row aligned, `Crux` SVG, `CS 184`, and `6` `CS 180` links verified |
| Live MS Edge GPU worker smoke | **Pass (`GPU` delegate on both)** | [Model smoke](model-smoke.json); `paired` steady-state `17.55–18.27 ms`, `holistic` steady-state `9.40–10.25 ms` on 5 blank frames |
| Rendered desktop screenshots | **Captured & visually inspected** | [Landing](screenshots/landing-desktop.jpg), [Practice](screenshots/game-desktop.jpg), [Grip Lab](screenshots/grip-lab-desktop.jpg), [Cross Current Beta](screenshots/cross-current-beta.jpg) |
| Counterfactual 6-clip replay | **Evaluated locally** | `scripts/review-recorded-anchors.ts`; raw private media/landmarks remain inside Git-ignored `personal-recordings/` |
| Live human webcam playthrough | **Pending player session** | Automated suites and counterfactual replays do not substitute for fresh human comfort/completion testing |

## Campaign results

All twelve shipped demonstrations use `controller: "anchors"`, normal semantic inputs, finite grip capacity/reserve rules, and `match` dual-patch finish targets:

| Route | Hand-anchor ticks at 120 Hz | Seconds | Fresh replay |
|---|---:|---:|---|
| Jug Ladder (`motion-01`) | 211 | 1.76s | Pass |
| Cross Current (`motion-02`) | 229 | 1.91s | Pass |
| Edge Etiquette (`motion-03`) | 230 | 1.92s | Pass |
| Pendulum Bay (`motion-04`) | 239 | 1.99s | Pass |
| Soft Landing (`motion-05`) | 230 | 1.92s | Pass |
| Under the Lip (`motion-06`) | 211 | 1.76s | Pass |
| Pinch Point (`motion-07`) | 224 | 1.87s | Pass |
| Quiet Apex (`motion-08`) | 240 | 2.00s | Pass |
| First Flight (`motion-09`) | 349 | 2.91s | Pass |
| Catch and Carry (`motion-10`) | 365 | 3.04s | Pass |
| Crosswind (`motion-11`) | 575 | 4.79s | Pass |
| Campus Circuit (`motion-12`) | 441 | 3.68s | Pass |

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

- **120 Hz simulation benchmark ([perf-benchmark.json](perf-benchmark.json)):** `72,000` steps (`600 s` simulated across `AnchorRig` + `Rig`) completed in **`1,623.5 ms` wall (`369.6×` realtime)**; combined **`mean = 0.02223 ms`**, `p50 = 0.0208 ms`, **`p95 = 0.0316 ms`** (`AnchorRig` `p95 = 0.0282 ms`, `Rig` `p95 = 0.0356 ms`), `p99 = 0.0456 ms`, `heapDelta = 24.29 MB`.
- **Live HTTPS load & lazy asset budget ([web-live-perf.json](web-live-perf.json), [live-crux-motion.jpg](screenshots/live-crux-motion.jpg)):** `5` initial requests totaling **`153,071 bytes` (`149.5 KB` compressed)**, `domContentLoadedMs = 349 ms`, `loadEventMs = 472.1 ms`, `"Display"` font verified, and **`0` `.task`/`.wasm` camera model assets fetched on landing** (lazy-loaded strictly for Camera mode and `/diagnostics.html`).
- **Continuous 180-frame simulation + Canvas 2D frame-time gate:**
  - **Live GitHub Pages (`https://superjay0208.github.io/crux-motion/`):** Intro Showcase **`161.97 FPS`** (`frameDeltaP50 = 6.1 ms`, `frameDeltaP95 = 6.2 ms`, **`frameWorkMean = 0.73 ms`**, `frameWorkP95 = 1.1 ms`, `0` long tasks); Practice Climb **`164.38 FPS`** (`frameDeltaP50 = 6.1 ms`, `frameDeltaP95 = 6.1 ms`, **`frameWorkMean = 0.93 ms`**, `frameWorkP95 = 1.3 ms`, `0` long tasks).
  - **Local `/crux-motion/` subpath ([web-subpath-perf.json](web-subpath-perf.json)):** `domContentLoadedMs = 78.9 ms`, `fcpMs = 320 ms`; Intro Showcase **`153.19 FPS`** (`frameWorkMean = 0.73 ms`, `frameWorkP95 = 1.0 ms`, `0` long tasks); Practice Climb **`164.38 FPS`** (`frameWorkMean = 0.96 ms`, `frameWorkP95 = 1.2 ms`, `0` long tasks).
- **Zero runtime/network anomalies:** zero `pageerror` events, zero `console.error` messages, zero HTTP 4xx/5xx responses, and zero third-party/external requests across both local loopback and live `superjay0208.github.io`.
- **Offline & live HTTPS GPU worker inference (`/diagnostics.html`):** both `paired` (`PoseLandmarker` + `HandLandmarker`) and `holistic` (`HolisticLandmarker`) initialized with **`delegate: "GPU"`** and completed 5 blank frames (`paired` steady-state **`17.55 ms`** live / `18.27 ms` local; `holistic` steady-state **`9.40 ms`** live / `10.25 ms` local; [model-smoke.json](model-smoke.json)). Blank-frame GPU timings verify WebGL/WASM worker execution, not live webcam person-tracking throughput.
- **Visual, responsive & live portfolio verification:** responsive bounds passed at `1280×720` (DPR `1` and `1.25`) and `1024×640` (DPR `1`). Inspected screenshots confirm crisp display typography ([landing-desktop.jpg](screenshots/landing-desktop.jpg), [live-crux-motion.jpg](screenshots/live-crux-motion.jpg)), sculpted faceted/domed holds ([grip-lab-desktop.jpg](screenshots/grip-lab-desktop.jpg)), unobstructed practice HUD and aim reticles ([game-desktop.jpg](screenshots/game-desktop.jpg)), crossed-arm depth sorting + coral `· straining!` warnings ([cross-current-beta.jpg](screenshots/cross-current-beta.jpg)), and live 3-card portfolio alignment + click-through on `https://superjay0208.github.io/` ([portfolio-live.jpg](screenshots/portfolio-live.jpg)).

## Sources and local data

Imported BSD OneEuroFilter, MIT open-source-hands, MIT GorillaLocomotion, and MIT Godot XR Tools notices ship in `game/dist/licenses/` and are verified over HTTP ([port manifest](../research/PORT_MANIFEST.json), [THIRD_PARTY.md](../THIRD_PARTY.md)). Normal play records no media; explicit test recordings stay under Git-ignored `personal-recordings/`, and `/api/recordings/*` rejects foreign origins and direct reads (`403`).
