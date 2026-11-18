# Crux Motion

Crux Motion is a local and browser-hosted camera-controlled 2D bouldering game. Chalk up, reach, cross arms, form real grip gestures, manage forearm pump, swing, and launch two-hand dynos across twelve open-selection boulder problems (`B1`–`B6`). It builds on local Crux, Chalk Sandbox movement lessons, and CruxScope tracking discipline.

- **Play in browser (GitHub Pages):** [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/) (all 12 boulders unlocked on landing; deep-link any boulder via `?route=motion-01`..`motion-12`, e.g. [`?route=motion-07`](https://superjay0208.github.io/crux-motion/?route=motion-07) for `Launchpad`)
- **Personal website portfolio:** [https://superjay0208.github.io/](https://superjay0208.github.io/)

**Implementation candidate 0.1.0, updated November 17, 2026** (`sourceHash` `32b1a80662371ac990aa1e624e850b7e3af23bcc779d8b9e1642fc492ccce9f1`). Milestone 1–8 engineering and art-direction upgrades delivered a tactile warm-limestone bouldering topo UI (`Fredoka` + `Bebas Neue` + `BarlowCondensed`), a handcrafted polygon-sculpted 2D climber and 3D holds, a high-margin **3-grip + Release** gesture engine (`Jug`, `Crimp`, `Pinch`, `Open` with live 4-class confidence meters), a dual **Stamina & Forearm Pump** system (*Jusant*-inspired diegetic climber rig + HUD stamina panel), **12 open-selection boulders (`B1`–`B6`)** under a pure **Match Top to Win** rule, simultaneous two-hand dynos with swing/push-up momentum, apex deadpoints, impact frames & micro hit-stop, batched 2D Canvas rendering, and zero-JSON 120 Hz hot paths. See [UI & art direction research](research/UI_AND_ART_DIRECTION.md), [forensic telemetry & game-feel research](research/GAME_FEEL_AND_WEBCAM_RESEARCH.md), [control foundations and ports](research/CONTROL_FOUNDATIONS.md), and [validation report](validation/REPORT.md). Live human webcam acceptance on this build remains open.

## Play in browser or locally

Open [https://superjay0208.github.io/crux-motion/](https://superjay0208.github.io/crux-motion/) in a current desktop Chromium browser (verified in Microsoft Edge), or double-click [run.bat](run.bat) to play locally at `http://127.0.0.1:4318/` (keeping its server window open while playing). All 12 boulders (`01 Warmup Buckets` through `12 The King Line`) are unlocked directly on the landing topo grid—click any problem card to preview its live 120 Hz physical beta on the wall or jump straight in. All webcam inference runs 100% locally in your browser via WebAssembly/WebGL workers—heavy MediaPipe `.task`/`.wasm` assets load lazily only when entering Camera mode or `/diagnostics.html`. For local play, the prebuilt release is in `game/dist/` and requires Node 24 or newer.

Choose **Climb with webcam**. Start with relaxed Jug fists near your chest, with shoulders, elbows, and both hands visible. Camera frames are scheduled via `requestVideoFrameCallback` and downscaled to aspect-exact `640×360` bitmaps before worker transfer to reduce pixel-copy latency while preserving GPU acceleration (with automatic CPU fallback). Crux Motion uses **three distinct climbing grips plus Open release** with strict 1-to-1 hold matching in Standard mode and live 4-class confidence bars (`JUG`, `CRIMP`, `PINCH`, `OPEN`):
- **Jug (`✊` emerald `#2fb370`):** relaxed closed fist.
- **Crimp (`⌐` ochre `#eb9c28`):** arched claw hook (finger joints bent sharply, palm open).
- **Pinch (`⊂` vermilion `#e55938`):** thumb and index fingertips pinched out in front (beak / O-pinch clamp; rolled closed fists are guarded against misclassifying as Pinch).
- **Release (Open):** all five fingers extended straight and spread wide (`140 ms` post-ready continuity bridges single-frame closed-fist landmark dropouts without masking genuine releases).
**Calibrate** optionally records personal grip prototypes and Undercling (`scoop`) / `sidepull` palm orientations; its first step can swap L/R labels.

**Hand anchors, pure Match-Top rule & simultaneous two-hand dynos:** **Hand anchors** is the default controller. A free hand follows your mapped wrist; moving a planted fist pulls the body in the opposite direction, weighting the upper pulling hand smoothly on split-height holds (`|Δy| > 0.20 m`) and guarding against accidental upward-sweep snags on lower start/visited holds. While both hands hold, building real upward **Push-Up** velocity (`vy >= 0.48 m/s`) or horizontal **Swing** speed (`|vx| >= 0.50 m/s`) charges `dynoReady` over a zero-allocation `17`-tick (`~140 ms`) rolling peak window (`0` artificial boost from stationary dead-hangs) and previews a **7-dot ballistic launch arc** (`t = 0.05..0.35 s`) toward the landing hold. Spreading **both** hands intentionally within `<= 16` ticks (`~133 ms`) launches a true two-hand ballistic dyno (`<= 4.2 m/s`, pure `-9.81 m/s²` airborne flight); catching near the apex (`|vy| < 0.95 m/s`) awards an **Apex Deadpoint bonus** (35% lower catch shock + `APEX DYNO!` callout) alongside physical leg-whip and bounded postural catch recoil (`±0.20 rad`, zero inversions). Every boulder follows a pure **Match Top to Win** rule: match both hands on the sandstone `TOP` volume (`0.35 s`) to send—skipping intermediate holds is legal, while dynos and cross-throughs earn `· DYNO ★` and `· CROSS ★` style badges.

**Strategic Stamina & Forearm Pump:** stamina is rendered both diegetically on the climber (a curved *Jusant*-style Core Stamina arc flanked by Left/Right forearm wing arcs) and in the prominent HUD **Stamina & Pump** panel (`#stamina-panel`). Forearm `reserve` drains by hold intensity (`1.0×` Jug, `1.7×` Pinch, `2.8×` Crimp) and load, triggering forearm tremor and `PUMPED!` warnings below `35%`; lowering a free hand below shoulder height (`SHAKING OUT`) recovers forearm pump (`+0.085/s`), while matching or resting on `REST` jugs recovers Core Stamina (`+0.012/s`).

**Recenter during a climb:** approaching the outer frame edge (`x < 0.045 / > 0.955`, `y < 0.06 / > 0.965`), sustained position loss, or delayed frames freezes the climb automatically. Bring both hands into the seated-friendly chest guide (`x ∈ 0.11..0.89`, `y ∈ 0.16..0.90`), match your held grips, and settle for about 0.7 seconds. Hand anchors rebases held hands on their contacts while resetting any dropped free hand to a comfortable chest-ready offset (`±0.18, 0.42 m`) so upward reach is never stranded. **Recenter hands · C** triggers the same flow manually.

**Starting and resuming:** click **Begin climb** or **Resume climb** once, put the mouse down, then return both hands to view. Once held grips match, a visible 3–2–1 countdown centers your pose and starts the simulation. **Cancel start**, Escape, opening a menu, or leaving the window cancels a pending start.

**Assisted mode & Personal Best Ghosts:** Settings include **Assisted climb (aim + grip forgiveness)**, which accepts any clear non-release grasp on non-undercling holds, prevents wrong-grip slip accumulation, and adds a subtle reachable-hold aim bias while badging the HUD (`· ASSISTED`) and storing Assisted route completions/records separately from Standard play. Full-route completions also record a compact **Personal Best Ghost** silhouette (`crux-motion:ghost:<route>`) that paces future attempts when enabled.

**Practice controls:** drag a wrist on the wall to reach and release the pointer to catch with the selected grip. Hold `W` / `Space` / `↑` to pull down (`0.16 m`), `S` / `Shift` / `↓` to extend, and `A` / `D` or `←` / `→` to sweep horizontally (`±0.42 m`) to charge swing or push-up dynos. Press `V` (or click **Release both hands (Dyno) · V**) to release both hands simultaneously into flight; while airborne, moving the pointer aims both hands symmetrically (`±0.085 m`) and clicking or pressing `G` arms both hands to catch. `Q` / `E` releases left/right individually, `X` switches the selected hand, `1–3` selects a grip (`1` Jug, `2` Crimp, `3` Pinch), `O` turns the palm (`upright`, `scoop`, `sidepull`), `P` pauses, and `R` retries when the wall has focus. Settings also let practice sessions switch between classic **Joint motors** and **Hand anchors · swing**. **Watch beta** plays a verified physical demonstration (`ATTEMPT REVIEW`) without awarding progress; **Grip lab** (with live 4-class gesture bars), attempt review, semantic replay export, and checkpoint practice are available at any time.

**Anatomical climber, architectural wall & procedural audio feedback:** the charcoal-limestone wall (`#292421` → `#191614`) features sunlit low-poly plywood macro-volumes, batched bevel seams and recessed T-nut bolts, and a stitched crash-pad mat. Sculpted holds render distinct 3D silhouettes (emerald Jug buckets with deep grab pockets, ochre beveled Crimp rails, vermilion vertical Pinch tufas, and sandstone TOP volumes with V-tape tags and `L`/`R` match arcs), paired with a polygon-sculpted 2D climber in a terracotta (`#d96b43`) raglan top, fluttering ochre headband, swaying chalk bag, downturned climbing shoes, and grip-accurate hand poses (`4`-knuckle fist, arched PIP claw, opposed C-clamp, `5`-finger splayed release). Heavy dyno and apex catches trigger **Impact Frames** (`45–70 ms` radial contrast flash, batched double shockwave rings + 12 radial speed lines, rim highlights, directional chalk cones, and `DYNO LAUNCH!` / `DYNO CAUGHT!` / `APEX DYNO!` callouts) plus a **Micro Hit-Stop** (`24 ms` in live Camera mode, `42 ms` in Practice/Review; `0 ms` under `prefers-reduced-motion`) and layered procedural Web Audio.

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
- `check` runs `tsc --noEmit` and **117** Vitest unit, physics, dyno-momentum, 4-class gesture-margin, stamina, centering, playability, and recording-isolation tests across 10 files.
- `campaign:check` solves all **12** sloper-free boulders (`B1`–`B6`) under both `anchors` and legacy `motors` (**24/24** climbs) and verifies 100% identical fresh replays.
- `benchmark-perf.ts` benchmarks **72,000** 120 Hz simulation steps (`600 s` simulated across `AnchorRig` + `Rig` in `1.69 s` wall, **`354.6×` realtime**, combined **`p95 = 0.0317 ms`** vs `< 1.0 ms` budget; [validation/perf-benchmark.json](validation/perf-benchmark.json)).
- `web:check` launches the standalone server (`127.0.0.1:4318`) and runs **15** Playwright E2E and HTTP asset checks in Microsoft Edge—covering asset hashes, self-hosted TrueType fonts (`Fredoka`, `Bebas Neue`, `BarlowCondensed`), offline-only network guards, zero 4xx/5xx responses, 12-boulder open landing grid, Practice stamina HUD + 3 grips, Grip Lab 4-class gesture meter, Watch Beta (`Warmup Buckets` & `Cross-Body`), `Launchpad` (`?route=motion-07`) dyno charge + simultaneous `KeyV`/`#release-both` launch + catch impact frames, Assisted & Practice-Anchor settings, `1280×720` (DPR 1 & 1.25) and `1024×640` responsive bounds (including `#stamina-panel`), and real GPU worker inference across both `paired` and `holistic` providers on `/diagnostics.html`.
- `validate-web.mjs` verifies `game/dist/` under the `/crux-motion/` subpath (or live `--url=https://superjay0208.github.io/crux-motion/`), enforcing self-hosted font loading (`Fredoka`, `Bebas Neue`, `Display`), 12 open landing boulders, lazy camera model loading (`0` `.task`/`.wasm` fetched on landing), 180-frame continuous simulation/render profiling (**`59.1–59.7 FPS`** vsync, **`1.03–1.34 ms` mean frame work**, `0` long tasks), `?route=motion-09` (`Split Decision`) deep-linking, reload persistence, and GPU worker execution ([validation/web-subpath-perf.json](validation/web-subpath-perf.json), [validation/web-live-perf.json](validation/web-live-perf.json)).

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
11. [UI, typography, anatomical climber & art direction research](research/UI_AND_ART_DIRECTION.md)

[CODING_AGENT_PROMPT.md](CODING_AGENT_PROMPT.md) is the original assignment prompt.

## Important distinctions

**Local Crux** means `D:/Climbing/crux`. **Roblox CRUX** means the user's reference, *CRUX: Rock Climbing* by SKR Studio ([Roblox experience 74351664806300](https://www.roblox.com/games/74351664806300/CRUX-Rock-Climbing)). They are separate projects. All Crux Motion implementation stays inside `D:/Climbing/crux-motion/`.
