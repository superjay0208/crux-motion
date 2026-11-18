# Crux Motion

Crux Motion is a local and browser-hosted camera-controlled 2D campus climbing game. Reach, cross arms, form grip gestures, pull, swing, release, and catch through twelve authored routes. It builds on local Crux, Chalk Sandbox movement lessons, and CruxScope tracking discipline.

- **Play in browser (GitHub Pages):** [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/) (deep-link any route via `?route=motion-01`..`motion-12`, e.g. [`?route=motion-09`](https://superjay0208.github.io/crux-motion/?route=motion-09))
- **Personal website portfolio:** [https://superjay0208.github.io/](https://superjay0208.github.io/)

**Implementation candidate 0.1.0, updated November 17, 2026** (`sourceHash` `d93a923799bf11bc075e95d926e7c2e59b4a78a97b28c252c91f0f95032dcd85`). Forensic telemetry analysis across six local play recordings plus production web-performance profiling drove comprehensive upgrades to webcam capture latency, seated framing, gesture continuity, planted-hand physics, dyno release windows, batched 2D Canvas rendering, zero-JSON 120 Hz simulation hot paths, autonomous landing physics showcases, visual/audio feedback, and motor accessibility. See [forensic telemetry & game-feel research](research/GAME_FEEL_AND_WEBCAM_RESEARCH.md), [control foundations and ports](research/CONTROL_FOUNDATIONS.md), and [validation report](validation/REPORT.md). Live human webcam acceptance on this build remains open.

## Play in browser or locally

Open [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/) in a current desktop Chromium browser (verified in Microsoft Edge), or double-click [run.bat](run.bat) to play locally at `http://127.0.0.1:4318/` (keeping its server window open while playing). All webcam inference runs 100% locally in your browser via WebAssembly/WebGL workers—heavy MediaPipe `.task`/`.wasm` assets load lazily only when entering Camera mode or `/diagnostics.html`, keeping the initial landing transfer to ~`150 KB` compressed. For local play, the prebuilt release is in `game/dist/` and requires Node 24 or newer.

Choose **Use your camera**. Start with relaxed Jug fists near your chest, with shoulders, elbows, and both hands visible. Camera frames are scheduled via `requestVideoFrameCallback` and downscaled to aspect-exact `640×360` bitmaps before worker transfer to reduce pixel-copy latency while preserving GPU acceleration (with automatic CPU fallback). Use small movements: open the free hand, reach toward the next hold, and close to catch; lower the supporting fist a few centimetres to pull the body up. Form hooked fingers for a Crimp, a rounded palm with fingers together for a Sloper, and opposing thumb/fingers for a Pinch. Spread fingers to release. A curled Crimp grasp also works on a Jug, and a `140 ms` post-ready continuity buffer bridges single-frame closed-fist landmark dropouts without masking genuine releases. **Calibrate** optionally records personal shapes and Undercling/sidepull orientations; its first step can swap L/R labels.

**Hand anchors** is the default controller. A free hand follows your mapped wrist; moving a planted fist pulls the body in the opposite direction, weighting the upper pulling hand smoothly on split-height holds (`|Δy| > 0.20 m`) and guarding against accidental upward-sweep snags on lower start/visited holds. Sweep both hands to build lateral momentum, pull down to rise, and spread both hands while moving to carry peak pull velocity (`0.18 s` window) into a dyno. The torso uses bounded postural lean (`±0.20 rad`, zero inversions) with a damped lower-body pendulum, while the wall camera leads velocity smoothly to keep landing holds framed. Match both hands on TOP (`L`/`R` patches) to finish; route-specific cross and flight objectives still apply.

**Recenter during a climb:** approaching the outer frame edge (`x < 0.045 / > 0.955`, `y < 0.06 / > 0.965`), sustained position loss, or delayed frames freezes the climb automatically. Bring both hands into the seated-friendly chest guide (`x ∈ 0.11..0.89`, `y ∈ 0.16..0.90`), match your held grips, and settle for about 0.7 seconds. Hand anchors rebases held hands on their contacts while resetting any dropped free hand to a comfortable chest-ready offset (`±0.18, 0.42 m`) so upward reach is never stranded. **Recenter hands · C** triggers the same flow manually.

**Starting and resuming:** click **Begin climb** or **Resume climb** once, put the mouse down, then return both hands to view. Once held grips match, a visible 3–2–1 countdown centers your pose and starts the simulation. **Cancel start**, Escape, opening a menu, or leaving the window cancels a pending start.

**Assisted mode & Personal Best Ghosts:** Settings include **Assisted climb (aim + grip forgiveness)**, which accepts any clear non-release grasp on non-undercling holds, prevents wrong-grip slip accumulation, and adds a subtle reachable-hold aim bias while badging the HUD (`· ASSISTED`) and storing Assisted route completions/records separately from Standard play. Full-route completions also record a compact **Personal Best Ghost** silhouette (`crux-motion:ghost:<route>`) that paces future attempts when enabled.

**Practice controls:** drag a wrist on the wall to reach and release the pointer to catch with the selected grip. Hold `W` / `Space` / `↑` to pull, `S` / `Shift` / `↓` to extend, and `A` / `D` or `←` / `→` to sweep horizontally (`±0.28 m`) for swings and dynos. `Q` / `E` releases left/right, `X` switches the selected hand, `1–4` selects a grip, `O` turns the palm (`upright`, `scoop`, `sidepull`), `P` pauses, and `R` retries when the wall has focus. Settings also let practice sessions switch between classic **Joint motors** and **Hand anchors · swing**. **Watch beta** plays a verified physical demonstration (`ATTEMPT REVIEW`) without awarding progress; **Grip lab**, attempt review, semantic replay export, and checkpoint practice are available at any time.

**Visual & procedural audio feedback:** sculpted holds display 3D bevels, chalk wear on visited holds, inward double-chevrons on Underclings and sidepulls, and `L`/`R` match arcs on finish/dyno holds. The climber renders with a warm slate shadow pass, dynamic front/back arm depth sorting on cross-throughs, gaze tracking, non-displacing wrist grip glyphs, and amber/coral strain warning arcs (`· straining!` in the HUD) before overload slips. Layered procedural Web Audio synthesizes weighted catch thuds, rock taps, dyno harmonic pings, release brushes, chalk scrapes, launch air rush, and a resolving finish chime—routed to both speakers and local test recordings with zero external audio files.

Ordinary play processes camera frames locally without saving video. **Record a local play test** explicitly records a 60-second split-screen WebM with camera, game, game sound, and diagnostics (never microphone audio): when running via the local server (`127.0.0.1`), it writes to Git-ignored `personal-recordings/<session>/`; when hosted statically on GitHub Pages, it skips `/api/recordings/*` cleanly (`0` HTTP errors) and provides instant in-browser video + JSON diagnostic downloads. See [recorded test instructions](validation/RECORDED_TESTS.md).

## Develop and verify

From `game/`:

```powershell
npm ci
npm run assets:prepare
npm run check
npm run campaign:check
npx tsx scripts/benchmark-perf.ts
npm run build
npm run web:check
node scripts/validate-web.mjs
```

- `assets:prepare` verifies pinned official `@mediapipe/tasks-vision@0.10.32` models (`pose`, `hand`, `holistic`) and matching SIMD/fallback WASM binaries.
- `check` runs `tsc --noEmit` and **113** Vitest unit, physics, tracking, centering, playability, and recording-isolation tests across 10 files.
- `campaign:check` solves all **12** routes under both `anchors` and legacy `motors` (**24/24** climbs) and verifies 100% identical fresh replays.
- `benchmark-perf.ts` benchmarks **72,000** 120 Hz simulation steps (`600 s` simulated across `AnchorRig` + `Rig` in `1.62 s` wall, **`369.6×` realtime**, combined **`p95 = 0.0316 ms`** vs `< 1.0 ms` budget; [validation/perf-benchmark.json](validation/perf-benchmark.json)).
- `web:check` launches the standalone server (`127.0.0.1:4318`) and runs **14** Playwright E2E and HTTP asset checks in Microsoft Edge—covering asset hashes, offline-only network guards, zero 4xx/5xx responses, practice gameplay, Grip Lab, Watch Beta, Assisted & Practice-Anchor settings, `1280×720` (DPR 1 & 1.25) and `1024×640` responsive bounds, and real GPU worker inference across both `paired` and `holistic` providers on `/diagnostics.html`.
- `validate-web.mjs` verifies `game/dist/` under the `/crux-motion/` subpath (or live `--url=https://superjay0208.github.io/crux-motion/`), enforcing lazy camera model loading (`0` `.task`/`.wasm` fetched on landing), 180-frame continuous simulation/render profiling (**`153–164 FPS`**, **`0.73–0.96 ms` mean frame work**, `0` long tasks), `?route=motion-09` deep-linking, reload persistence, and GPU worker execution ([validation/web-subpath-perf.json](validation/web-subpath-perf.json), [validation/web-live-perf.json](validation/web-live-perf.json)).

Automated tests, pilot solutions, and counterfactual landmark replays verify implementation correctness and mechanics, not live human playability. Dependency notices: [THIRD_PARTY.md](THIRD_PARTY.md). Current verification evidence: [validation/REPORT.md](validation/REPORT.md) and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Original design handoff

1. [Goal and completion criteria](GOAL.md)
2. [Existing projects and reuse decisions](docs/00-existing-projects.md)
3. [Game design and controls](docs/01-game-design.md)
4. [Camera tracking and gestures](docs/02-camera-and-gestures.md)
5. [Physics and dynos](docs/03-physics-and-dynos.md)
6. [Levels and presentation](docs/04-levels-and-feedback.md)
7. [Architecture and data contracts](docs/05-architecture-and-contracts.md)
8. [Implementation sequence and acceptance](docs/06-delivery-and-validation.md)
9. [Research sources and decision record](research/SOURCES.md)
10. [Forensic webcam telemetry & game-feel research](research/GAME_FEEL_AND_WEBCAM_RESEARCH.md)

[CODING_AGENT_PROMPT.md](CODING_AGENT_PROMPT.md) is the original assignment prompt.

## Important distinctions

**Local Crux** means `D:/Climbing/crux`. **Roblox CRUX** means the user's reference, *CRUX: Rock Climbing* by SKR Studio ([Roblox experience 74351664806300](https://www.roblox.com/games/74351664806300/CRUX-Rock-Climbing)). They are separate projects. All Crux Motion implementation stays inside `D:/Climbing/crux-motion/`.
