# Crux Motion candidate validation

Updated November 17, 2026, Pacific time. Version **0.1.0**, local Windows build. Forensic analysis across all six local user play recordings drove Milestones 1–3 upgrades across camera worker latency, `HolisticLandmarker` 2D unwrapping, closed-fist continuity, seated `resetSafe` framing, free-hand neutral recentering, immediate catch capacity, split-hold pull weighting, bounded postural sway, dyno release velocity, sculpted visual/audio craft, **Assisted climb mode**, and **Personal Best Ghosts**. See [forensic telemetry & game-feel research](../research/GAME_FEEL_AND_WEBCAM_RESEARCH.md), [centering acceptance](CENTERING.md), and [control foundations & ports](../research/CONTROL_FOUNDATIONS.md).

## Build

- Source hash: `451fc91b2b346276f883676339af15a8abd7e7c1aa31c3529994fe63cfd28401`.
- Built at `2026-11-18T01:00:32.020Z` (November 17, 2026 in Pacific time).
- Node 24.19.0 / npm 11.17.0; TypeScript 5.7.2, Vite 6.0.3, Planck 1.5.0, MediaPipe Tasks Vision 0.10.32, Playwright 1.56.1 (Microsoft Edge `157.0.0.0`).
- Standalone local server serves `game/dist/` at `http://127.0.0.1:4318/`. Double-click `run.bat` to launch locally.

## Current checks

| Check | Result | Scope |
|---|---|---|
| TypeScript & Vitest | **113/113 pass** (`10` files) | [Unit results](unit-results.json); tracking, centering, anchors, physics, playability, mirror, motion, hands-free, replay, recording isolation |
| Production build | **Pass** | Classic bundled worker (`tracking.worker.js`), pinned local models/WASM, inline SVG favicons, build provenance |
| Hand-anchor campaign | **12/12 solve; 12/12 identical fresh replays** | [Anchor results](campaign-results.json); default `controller: "anchors"` demos |
| Legacy motor campaign | **12/12 solve; 12/12 identical fresh replays** | [Motor results](motor-campaign-results.json); comparison regression suite (`24/24` total climbs) |
| Live MS Edge E2E & HTTP suite | **14/14 pass** (`17.7s`) | [Web results](web-results.json); `assets.spec.ts` (`7/7`) + `gameplay.spec.ts` (`7/7`), zero 4xx/5xx, zero external requests |
| Live MS Edge GPU worker smoke | **Pass (`GPU` delegate on both)** | [Model smoke](model-smoke.json); `paired` steady-state `17.0–19.6 ms`, `holistic` steady-state `9.2–11.5 ms` on 5 blank frames |
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

## Live browser rendering & offline GPU worker execution

Executed against `http://127.0.0.1:4318` in Microsoft Edge (`Edg/157.0.0.0`) via `npm run web:check`:

- **Zero runtime/network anomalies:** zero `pageerror` events, zero `console.error` messages, zero HTTP 4xx/5xx responses (including inline SVG favicons), and zero non-loopback requests.
- **Offline GPU worker inference (`/diagnostics.html`):** both `paired` (`PoseLandmarker` + `HandLandmarker`) and `holistic` (`HolisticLandmarker`) initialized with **`delegate: "GPU"`** and completed 5 blank frames offline (`paired`: shader warmup `4,448.2 ms`, steady-state **`17.0–19.6 ms`**; `holistic`: shader warmup `2,189.7 ms`, steady-state **`9.2–11.5 ms`**; [model-smoke.json](model-smoke.json)). Blank-frame GPU timings verify local WebGL/WASM worker execution, not live webcam person-tracking throughput.
- **Visual & responsive verification:** responsive bounds passed at `1280×720` (DPR `1` and `1.25`) and `1024×640` (DPR `1`). Inspected screenshots confirm crisp display typography ([landing-desktop.jpg](screenshots/landing-desktop.jpg)), sculpted faceted/domed holds across Jug/Crimp/Sloper/Pinch ([grip-lab-desktop.jpg](screenshots/grip-lab-desktop.jpg)), unobstructed practice HUD and aim reticles ([game-desktop.jpg](screenshots/game-desktop.jpg)), and crossed-arm front/back depth sorting with `Release` wrist rays and coral `· straining!` limb/HUD warnings ([cross-current-beta.jpg](screenshots/cross-current-beta.jpg)).

## Sources and local data

Imported BSD OneEuroFilter, MIT open-source-hands, MIT GorillaLocomotion, and MIT Godot XR Tools notices ship in `game/dist/licenses/` and are verified over HTTP ([port manifest](../research/PORT_MANIFEST.json), [THIRD_PARTY.md](../THIRD_PARTY.md)). Normal play records no media; explicit test recordings stay under Git-ignored `personal-recordings/`, and `/api/recordings/*` rejects foreign origins and direct reads (`403`).
