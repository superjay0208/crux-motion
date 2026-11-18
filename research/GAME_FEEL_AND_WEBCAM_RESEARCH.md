# Game Feel, Webcam Tracking & Forensic Telemetry Research

**Date:** November 17, 2026  
**Scope:** Quantitative forensic telemetry audit across all 6 local user sessions (`personal-recordings/*/telemetry.json`), browser MediaPipe Tasks Vision latency optimization, and 2D physics climbing game-feel/accessibility architecture for `crux-motion`.  
**Privacy Notice:** All raw videos and extracted images remain strictly untouched in ignored `personal-recordings/`. Only aggregate distributions, kinematic offsets, and event timestamps are reported here.

---

## Executive Summary

Across **6 recorded personal sessions** on `motion-01` (*Jug Ladder*) totaling **261.1 s** of capture (**151.5 s** active play, **5,581** recorder samples, **3,411** unique camera inference observations), five compounding root causes made camera climbing feel inconsistent or unplayable:

1. **Seated Framing Rejection (`44.03%` two-hand active rejection):** At a normal desk setup, the player's shoulders sit two-thirds down the webcam frame (`shoulderY` median **`0.6587`**, p05–p95 `0.5941–0.7106`), placing comfortable chest-level Jug fists at `wristY ≈ 0.80–0.88` (Clips 4–5 median `0.8099` / `0.8044`, Clip 5 p95 `0.8847`). Current `Camera.ts` `resetSafe` (`wrist.y < 0.82`) rejects **`28.18%`** (`1,031 / 3,659`) of comfortable per-hand active observations and **`44.03%`** (`767 / 1,742`) of comfortable two-hand active frames, while `frameEdge` (`wrist.y > 0.90`) triggers **`832`** times (`13.66%`), freezing mid-pull.
2. **Closed-Fist `HandLandmarker` Dropouts (`839` frames / `496` unique observations):** `PoseLandmarker` maintained valid shoulder + wrist tracking while 21-point `HandLandmarker` output dropped out (`Arm tracked · show fingers to catch`) across **80 streaks** (**20** immediately following a confirmed `ready: true` grip; **304** raw hand-frames / **171** unique observations in Recording 6 alone). At ~12–13 Hz (`1280×720` bitmap copy, inference p50 `70.6–73.2 ms`, frame age p95 `144.7–157.4 ms`), **9 of 20 (`45%`)** post-ready dropouts are single-frame blips (`73.1–125.5 ms <= 140 ms`) that force `ready: false` mid-reach.
3. **Gesture Classifier Clobbering & Foreshortened Release Failures:** On an all-Jug route (`5,592` 21-landmark observations), **`7.01%`** of latched grips (`392` observations) and **`8.53%`** of raw candidates (`477` observations) misclassified into `pinch` (`116`), `unknown` (`111`), `sloper` (`96`), or `crimp` (`69`). Furthermore, `scores.fist > 0.72` in `upstream.ts` clobbers **`45.86%` (`61 / 133`)** of geometric `crimp` frames into `"jug"`, `world` coordinates are erroneously mirrored with `1 - p.x` instead of `-p.x`, and **`91.7%` (`11 / 12`)** of foreshortened open hands (`0.78 < scores.open <= 0.86`) fail `geometricGrip`'s strict `compact > 1.75` check, contributing to **734** active observations where a hand remained attached with `aimError > 0.25 m`.
4. **Free-Hand Hip Pinning on Recenter (Recording 6 at `48.70s`):** When the free left hand exited the bottom of the frame at `44.095s` (`wristY = 0.983`), its shoulder-relative offset dropped to **`y = -0.560 m`** (down by the hip). When the player returned their physical hand to chest height (`wristY = 0.502`) and resumed at **`48.698s` (`48.70s`)**, `centerAndResume` rebased `wristY = 0.502` directly to that `-0.560 m` hip offset—requiring an impossible `+1.30 m` virtual upward travel (`0.969` normalized arm lengths) before hitting the top of the frame (`wristY = 0`), stranding the climb (`nextFromShoulder = 1.046–1.170 m` through `52.85s`).
5. **Accidental Lower Start-Hold Re-Catches (`20.5%` of all catches):** Across **39** dynamic catches, **8 (`20.5%`)**—including **7 in Recordings 3–5**—occurred when a free hand sweeping upward toward `move-1` or `top` (`aim.y = 1.501–2.455 m`, up to **`1.388 m`** above `start-l`) closed early and snagged `start-l` / `start-r` (`y = 1.10 m`) in passing while the opposite hand already held `move-0` (`1.34 m`) or `move-1` (`1.58 m`).

---

## 1. Forensic Telemetry Analysis (6 Personal Recordings)

### 1.1 Session Corpus & Latency Baseline

All 6 clips ran `paired` (`PoseLandmarker` + `HandLandmarker`) at `1280×720` video resolution on `motion-01`:

| Clip | Recording ID | Controller | Duration / Active | Uniq Obs | FPS (p50) | Inference p50 / p95 | Frame Age p50 / p95 | `shoulderY` p50 | `wristY` p50 / p95 | Missing-21 (Raw / Uniq) |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `fe933f90` | `raw-reach` | 54.3 s / 32.0 s | 751 | 13.39 | 70.8 / 77.6 ms | 105.2 / 144.7 ms | 0.6676 | 0.6170 / 0.9808 | 57 / 41 |
| 2 | `d968cb60` | `raw-reach` | 30.9 s / 18.6 s | 402 | 13.09 | 73.2 / 96.6 ms | 111.5 / 157.4 ms | 0.6909 | 0.7427 / 1.0993 | 231 / 137 |
| 3 | `ea0c8fbd` | `raw-reach` | 36.5 s / 28.0 s | 488 | 13.22 | 71.5 / 80.2 ms | 107.7 / 144.7 ms | 0.6655 | 0.6865 / 0.8465 | 43 / 28 |
| 4 | `31872ed4` | `centered-reach` | 35.6 s / 23.8 s | 472 | 13.33 | 71.5 / 92.3 ms | 110.9 / 149.1 ms | 0.6567 | 0.8099 / 1.1173 | 151 / 87 |
| 5 | `c765d68e` | `centered-reach` | 43.8 s / 27.8 s | 585 | 13.31 | 71.5 / 84.1 ms | 107.7 / 148.5 ms | 0.6752 | 0.8044 / 0.8847 | 53 / 32 |
| 6 | `6c0b341d` | `mirror` | 60.0 s / 21.3 s | 713 | 11.99 | 70.6 / 90.6 ms | 116.0 / 149.1 ms | 0.6267 | 0.5986 / 1.0635 | 304 / 171 |

### 1.2 Seated Framing Quantiles vs `resetSafe` and `frameEdge`

Deduplicated by `cameraSequence` across all 6 clips:

| Coordinate Metric (Normalized `[0,1]` Unmirrored Camera Space) | Sample Count (`n`) | `p05` | `p50` (Median) | `p95` |
|---|---:|---:|---:|---:|
| `shoulderY` (all tracked, visibility `> 0.5`) | 6,822 | `0.5941` | **`0.6587`** | `0.7106` |
| `shoulderY` (active `playing` state) | 3,896 | `0.5869` | **`0.6503`** | `0.6946` |
| `wristX` (all tracked, both hands pooled) | 6,092 | `0.2299` | `0.5328` | `0.7036` |
| `wristX` — Left / Right anatomical hand | 3,040 / 3,052 | `0.5756` / `0.2123` | `0.6485` / `0.2975` | `0.7180` / `0.4857` |
| `wristY` (all tracked, both hands pooled) | 6,092 | `0.2440` | **`0.6946`** | `1.0187` |
| `wristY` (active `playing` state, both hands) | 3,896 | `0.1990` | **`0.6550`** | `0.9322` |
| `wristY` — Centered comfortable play (Clips 4 / 5) | 1,057 seqs | — | **`0.8099` / `0.8044`** | `1.1173` / **`0.8847`** |

**Exact Boundary Rejection Audit (`Camera.ts` lines 355–375):**
- **Per-hand comfortable active frames (`n = 3,659`, `state === "playing"` and inside true frame exit):**
  - Current `resetSafe` (`x ∈ (0.15, 0.85)`, `y ∈ (0.27, 0.82)`, tips `0.04..0.96`) **rejects `1,031 / 3,659` (`28.18%`)** of comfortable active hand observations—with **`742 / 3,659` (`20.28%`)** rejected specifically because `wrist.y >= 0.82` (sternum/lower-chest pull height when seated!).
  - Across all `6,092` tracked hand observations, `curSafe` fails on `1,871` (`30.71%`): `1,441` (`23.65%`) for `wrist.y >= 0.82`, `374` (`6.14%`) for `wrist.y <= 0.27`, `363` (`5.96%`) for `0.04..0.96` fingertip margin, and `21` (`0.34%`) for `wrist.x`.
- **Two-hand simultaneous `resetSafe` (`n = 1,742` comfortable active two-hand frames):**
  - Because `HandsFreeGate` and `RecoveryGate` require `resetSafe.left && resetSafe.right` simultaneously, current bounds **reject `767 / 1,742` (`44.03%`)** of active climbing frames.
  - Widening `resetSafe` to **`x ∈ (0.11, 0.89)`, `y ∈ (0.16, 0.90)`** (fingertips `0.025..0.975`) cuts per-hand active rejections from **`28.18%` → `8.14%`** (`298 / 3,659`) and cuts two-hand active rejections from **`44.03%` → `12.34%`** (`215 / 1,742`).
- **`frameEdge` false freezes & hysteresis:**
  - Current `frameEdge` (`0.09..0.91 × 0.16..0.90`) triggers on **`832 / 6,092` (`13.66%`)** tracked observations—including overhead reaches (`0.06 <= wrist.y < 0.16`) and chest pulls (`0.90 < wrist.y <= 0.965`).
  - Tightening `frameEdge` to true near-exit boundaries (**`x < 0.045 || x > 0.955 || y < 0.06 || y > 0.965`**, or `>= 5` landmarks `< 0.012 / > 0.988`) reduces triggers to **`558 / 6,092` (`9.16%`)**, eliminating **274** premature freezes while guaranteeing a **`>= 0.065` normalized hysteresis band** (`0.065` horizontal, `0.065–0.100` vertical) against `resetSafe`.

### 1.3 Closed-Fist Dropouts & Ready-Intent Continuity Buffer

- Across all 6 recordings, `Arm tracked · show fingers to catch` (`tracked === true` via `poseWrist` visibility `> 0.65`, `landmarks.length === 0`) occurred on **839 recorder hand-frames** (**496 unique camera hand-observations** across **80 contiguous streaks**). Recording 6 suffered **304** recorder hand-frames (**171** unique camera observations).
- **20 streaks** occurred immediately after a confirmed `ready: true` non-release grip (`13` after `jug`, `3` after `pinch`, `3` after `sloper`, `1` after `crimp`):
  - **9 / 20 (`45.0%`)** lasted exactly **1 camera observation** with timestamp span **`73.1–125.5 ms`** (`100% <= 140 ms` from the last confirmed grip sample to the dropout observation; `152.0–208.3 ms` inter-sample recovery gap at ~12 Hz).
  - **3 / 20 (`15.0%`)** lasted **2 camera observations** (`150.5–179.1 ms` at 12 Hz, which compresses to **`65–90 ms <= 140 ms`** once worker frame rate doubles to ~24 Hz via `640×360` resize).
  - **8 / 20 (`40.0%`)** were genuine multi-frame off-screen or self-occluded exits (`425.4–2,793.9 ms`, `6–31` frames), including Recording 2 at `20.00s` where the free right hand swept within **`0.148 m`** of `move-0` (`radius = 0.19 m`) while missing finger landmarks and failed to catch.
- **Engineering impact:** Lowering `HandLandmarker` confidence thresholds from `0.60 / 0.50 / 0.50` to **`0.45 / 0.45 / 0.45`** reduces closed-fist detector rejection at the source, while a **`140 ms` ready-intent continuity buffer** (preserving `ready: true` and the latched `grip` when `quality === true` and no `"release"` or identity loss occurs) bridges **100% of transient 1-frame dropouts at 12 Hz** and **1–3 frame motion-blur dropouts at 24–30 Hz** (`60%` of all post-ready streaks) without masking real tracking losses (`> 350 ms` `InputProtection` pause).

### 1.4 Gesture Confusion, World-Space Mirroring & Foreshortened Releases

Across **5,592** unique 21-landmark hand observations on `motion-01` (*Jug Ladder*):

| Class | All Unique Latched `grip` | All Unique `candidate` | Active `playing` `grip` | Active `playing` `candidate` |
|---|---:|---:|---:|---:|
| `jug` | 3,973 (`71.05%`) | 3,933 (`70.33%`) | 2,583 (`68.66%`) | 2,538 (`67.46%`) |
| `release` | 1,227 (`21.94%`) | 1,182 (`21.14%`) | 947 (`25.17%`) | 929 (`24.69%`) |
| `pinch` | **116 (`2.07%`)** | **132 (`2.36%`)** | **89 (`2.37%`)** | **99 (`2.63%`)** |
| `unknown` | **111 (`1.99%`)** | **121 (`2.16%`)** | **47 (`1.25%`)** | **74 (`1.97%`)** |
| `sloper` | **96 (`1.72%`)** | **128 (`2.29%`)** | **54 (`1.44%`)** | **69 (`1.83%`)** |
| `crimp` | **69 (`1.23%`)** | **96 (`1.72%`)** | **42 (`1.12%`)** | **53 (`1.41%`)** |

Three specific code-level bugs explain these confusions:
1. **`scores.fist > 0.72` clobbers `crimp` (`upstream.ts:69`):** Re-running `cameraGrip` across all `5,592` observations shows `geometricGrip` classified **133** frames as hooked `crimp`, of which **`61 / 133` (`45.86%`)** had `scores.fist > 0.72` (and `56 / 133` had `scores.fist > 0.82`), unconditionally overwriting `fallback` (including personal calibrated prototypes!) to `"jug"`. `scores.fist` must only select `"jug"` when `fallback.grip === "unknown" || fallback.grip === "jug"`.
2. **Metric `world` coordinate mirroring bug (`upstream.ts:41–53`):** `d.world` is metric 3D meters centered at the hand origin `(0,0,0)`, not normalized `[0,1]` screen coordinates. Applying `x: 1 - p.x` shifts metric coordinates by `+1.0 m`; `world` points must be mirrored via **`x: -p.x`**.
3. **Foreshortened open-hand `release` rejections (`upstream.ts:67`, `gestures.ts:156`):** In **734** active observations, a held hand stayed attached while `aimError > 0.25 m`. Across **12** observations where `0.78 < scores.open <= 0.86` (palm tilted slightly toward the webcam or pinky slightly relaxed), **`11 / 12` (`91.7%`)** failed `geometricGrip`'s `compact > 1.75 && max(bends) < 0.22` gate (`5` became `jug`, `4` `unknown`, `2` `sloper`). Lowering the open-hand override to **`scores.open > 0.78`** when finger spread is clear (`spread[0] + spread[1] + spread[2] > 0.32` and `openness > 0.62`, excluding cupped `sloper`) cleanly recognizes foreshortened releases while preventing half-closed `release -> jug` transitions from latching onto `sloper`/`pinch`.

### 1.5 Recording 6 (`48.70s`) Free-Hand Hip Pinning & Recordings 3–5 Lower Re-Catches

- **Recording 6 (`2026-11-12T04-04-39-828Z-6c0b341d`) at `48.70s`:**
  - At `44.095s`, with right hand holding `start-r` (`wristY = 0.602`) and left hand free (`contact: null`, `grip: "release"`), the player's left wrist dropped to `wristY = 0.983`, pausing play (`"Hands left view..."`). At that frame, the mapped left-hand target (`y = 0.043 m`) relative to left shoulder (`y = 0.603 m`) was **`y = -0.560 m`** (`x = -0.269 m`).
  - At `48.648s`, the player returned their left hand to chest height (`wristY = 0.502`, `grip: "jug"`).
  - At **`48.698s` (`48.70s`)**, `centerAndResume` computed `anchors.left = sub(sim.rig.hand("left"), sim.rig.shoulder("left"))`. Under `AnchorRig`, a free hand sits directly at its last pre-pause aim (`y ≈ -0.56 m`), so `ComfortFrame.rebase` anchored the chest-height physical hand (`wristY = 0.502`) to **`y = -0.56 m`** down by the avatar's hip. Even lifting `wristY` to `0.328` (`52.752s`) could not elevate the virtual hand near `move-1` (`nextFromShoulder = 1.046–1.170 m`).
  - **Fix:** Pass `held: { left: !!sim.contacts.left, right: !!sim.contacts.right }` to `Camera.recenter(anchors, poses, held)`. When `held[side] === false` in `anchors` mode and the free-hand offset is dropped/extreme (`anchors[side].y < 0.15 || len(anchors[side]) > 0.62`), reset `anchors[side]` to chest-ready neutral **`v(side === "left" ? -0.18 : 0.18, 0.42)`**.

- **Accidental Lower Start-Hold Re-Catches (Recordings 1, 3, 4, 5):**

| Clip | Time | Free Hand | Snagged Hold (`y`) | Supporting Hold (`y`) | Player `aim` `(x, y)` | `dist(aim, snaggedHold)` |
|---:|---:|---|---|---|---|---:|
| 1 | `24.85s` | Right | `start-r` (`1.10`) | `move-0` (`1.34`) | `(0.566, 2.674)` | **`1.593 m`** |
| 3 | `17.40s` | Right | `start-l` (`1.10`) | `move-0` (`1.34`) | `(-0.145, 1.956)` | **`0.874 m`** |
| 3 | `19.60s` | Right | `start-l` (`1.10`) | `move-0` (`1.34`) | `(-0.176, 2.064)` | **`0.975 m`** |
| 3 | `28.88s` | Left | `start-l` (`1.10`) | `move-1` (`1.58`) | `(-0.841, 2.258)` | **`1.270 m`** |
| 3 | `29.25s` | Left | `start-l` (`1.10`) | `move-1` (`1.58`) | `(-0.623, 2.455)` | **`1.388 m`** |
| 4 | `31.69s` | Right | `start-l` (`1.10`) | `move-0` (`1.34`) | `(-0.339, 1.174)` | `0.076 m` |
| 5 | `38.68s` | Right | `start-r` (`1.10`) | `move-0` (`1.34`) | `(0.492, 1.169)` | **`0.185 m`** |
| 5 | `39.19s` | Right | `start-r` (`1.10`) | `move-0` (`1.34`) | `(0.586, 1.501)` | **`0.481 m`** |

  - **Fix:** In `Simulation.acquire`, when the opposite hand holds a higher hold (`other.hold.p.y > hold.p.y + 0.18`) and `hold` is a `start` or `visited` lower hold while `requested.y > hold.p.y + radius * 0.55`, require `dist(requested, center) <= radius * 0.85` (`0.1615 m` for Jugs), eliminating **7 of 8 (`87.5%`)** passing upward snags while keeping deliberate down-climbs (`dist = 0.076 m`) intact.

---

## 2. Browser MediaPipe Latency & Worker Pipeline Research

1. **Frame-Accurate Capture via `requestVideoFrameCallback`:**
   - Polling `video.currentTime` inside a 60–120 Hz `requestAnimationFrame` loop introduces up to `16.7 ms` of phase aliasing against a 30 fps webcam. Scheduling capture via `video.requestVideoFrameCallback` (with clean fallback to `requestAnimationFrame` when unavailable in headless/older environments) dispatches immediately on hardware frame arrival while preserving single-in-flight backpressure (`this.busy`).
2. **Aspect-Preserving `640×360` `createImageBitmap` Downscaling:**
   - MediaPipe `PoseLandmarker` (`256×256` internal tensor) and `HandLandmarker` (`224×224` palm/hand crop) downsample internally. Copying full `1280×720` frames (`921,600 px`) across main-thread memory and worker WebGL/WASM upload wastes ~30–40 ms per frame (`inferenceMs` p50 `71.5 ms`, p95 `90.9 ms`, capping throughput at `12.0–13.4 Hz`).
   - Calling `createImageBitmap(video, { resizeWidth: 640, resizeHeight: Math.round(videoHeight * (640 / videoWidth)), resizeQuality: "low" })` when `videoWidth > 640`, transferring `[frame]` zero-copy, passing the resized `width`/`height` for exact `16:9` aspect correction, and calling `frame.close()` in `finally` cuts pixel volume by **`4×` (`230,400 px`)**, targeting `24–30 Hz` inference and `< 90 ms` p95 frame age.
3. **`HolisticLandmarker` 2D Array Unwrapping (`@mediapipe/tasks-vision@0.10.32`):**
   - In Tasks Vision `0.10.32`, `HolisticLandmarkerResult` returns per-person 2D arrays (`poseLandmarks: NormalizedLandmark[][]`, `leftHandLandmarks: NormalizedLandmark[][]`). Passing `r.leftHandLandmarks` directly makes `points.length === 21` evaluate `1 === 21` (`false`), silently dropping 100% of holistic detections whenever a person is present. Unwrapping `r.poseLandmarks?.[0] ?? []` and `r.leftHandLandmarks?.[0] ?? []` restores holistic parity.
4. **1-Euro Filter Tuning (`Casiez et al., CHI 2012`):**
   - Single-stage position filtering in `PositionSignal` (`minCutoff = 2.5 Hz`, `beta = 1.8`, `dCutoff = 1.0 Hz`, reset on gaps `> 300 ms` or `recenter()`) suppresses sub-centimeter landmark jitter when holding steady while adapting cutoff above `6 Hz` during rapid pulls (`|dx/dt| > 2 m/s`) so dyno launches incur `< 20 ms` filter lag without double-filtering angles.

---

## 3. Climbing Game Feel, Sibling `Crux` Craft & Accessibility Research

Synthesizing *GorillaLocomotion*, *Jusant* (DON'T NOD), *Cairn* (The Game Bakers), and sibling `D:/Climbing/crux`:

1. **Planted-Hand Weight, Vertical-Separation Support & Bounded Sway:**
   - *GorillaLocomotion*'s planted-hand inverse correction prevents joint-motor fighting, and locking torso rotation (`setFixedRotation(true)`) guarantees zero upside-down somersaults. However, pure `0.00 rad` rigid translation feels wooden on lateral swings, and strict 50/50 two-hand support averaging causes a low trailing hold to fight an upper-hand pull when `|a.y - b.y| > 0.20 m`.
   - **Solution:** (a) Keep `maxTorsoAngle <= 0.22 rad` via a bounded, spring-damped postural lean driven by horizontal acceleration/support offset that settles strictly to `0` at rest while allowing the passive `legs` body to pendulum naturally on catches and releases; (b) weight `inverseHandCorrection` smoothly toward the higher/actively pulling hand when vertical hold separation exceeds `0.20 m` and the lower arm approaches `0.74 m` extension; (c) initialize `capacities()` immediately inside `attach()` and re-sync `updateSupport()` if substep 0 acquires a hold so dyno catches never face raw `1000 N` unscaled impulses or 1-tick support delay.
2. **Dyno Launch Forgiveness (`ReleaseVelocity` Window):**
   - On a webcam, spreading fingers from `jug` to `release` takes `65–100 ms` (`GestureLatch` `65 ms` + 1 camera interval). Over a short `0.14 s` sliding average, the final `80 ms` of stationary finger-opening dilutes the preceding pull velocity by ~50%. Extending the window to **`0.18 s`** and taking the peak-preserving displacement velocity across the recent pull sub-window (still 100% derived from actual physical torso displacement—`0 m/s` when stationary, zero artificial jump impulse) makes pull-then-spread dynos crisp and repeatable.
3. **Tactile Visual & Procedural Audio Layering (*Jusant*, *Cairn*, Sibling `Crux`):**
   - **Camera Lookahead:** Add bounded velocity lookahead (`velocity * 0.16`, clamped so `FollowCamera` stays strictly isolated from input/physics) so dyno landing holds remain framed throughout flight.
   - **Body & Hold Readability:** Adopt sibling `Crux`'s `ClimberRenderer` warm-slate shadow pass (`rgba(70, 50, 30, 0.18)`, offset `(3/72, 4/72) * scale`), dynamic front/back arm depth sorting on cross-throughs (`left.x > right.x`), gaze tracking toward active reach / `NEXT` hold, wrist finger-shape silhouettes (without shifting physics contact points), sculpted hold lips/chalk wear, and amber/coral `strain(side)` (`0..1`) warning rings + chalk flecks before overload (`load > 0.85` or `drift > 0.025`), mirroring *Cairn*'s pre-slip limb tension cues.
   - **Zero-Asset Web Audio (`Audio.ts`):** Layer procedural Web Audio routed to both `destination` and `capture`: weighted low triangle thud (`140 -> 45 Hz` scaled by `e.power`) + crisp rock tap + harmonic ping on `"Dyno"`/`"Clean"` catches, soft filtered-noise brush on `release` (never a failure buzz), gritty scrape on `slip`, air rush on `launch`, and a resolving `C5 -> G5 -> C6` chime on `finish`.
4. **Motor & Sensory Accessibility (*Jusant* Assist Benchmarks):**
   - Players with limited finger isolation or webcam angle constraints benefit from an explicit **Assisted Mode** (`calibration.assistedGrips` + `sim.assisted`): any ready closed/cupped grasp (`jug`/`crimp`/`sloper`/`pinch`) satisfies non-undercling holds, and `aim` receives a gentle **`0.045 m`** bias toward the nearest reachable eligible patch while keeping Assisted completions badged separately from Standard. Respect `prefers-reduced-motion` by disabling decorative pulses, trails, and shake while preserving physical climber motion.

---

## 4. Recommended Engineering Constants by Milestone

### Milestone 1 — Camera Tracking, Worker Latency & Gesture Continuity

| Parameter / Component | File | Baseline | Recommended Value | Quantitative Basis |
|---|---|---|---|---|
| Bitmap transfer size | `Camera.ts` | `1280×720` (`921k px`) | **`640×360`** (`resizeWidth: 640`, aspect-exact, `resizeQuality: "low"`) | `4×` pixel reduction; cuts `~71 ms` inference to target `24–30 Hz` |
| Frame scheduling | `Camera.ts` | `requestAnimationFrame` | **`requestVideoFrameCallback`** (fallback `rAF`) | Eliminates `0–16.7 ms` frame polling jitter |
| `HandLandmarker` confidences | `inference.worker.ts` | `0.60 / 0.50 / 0.50` | **`0.45 / 0.45 / 0.45`** (detect / presence / track) | Reduces `839` raw (`496` uniq) closed-fist dropouts |
| `HolisticLandmarker` unwrap | `inference.worker.ts` | `r.poseLandmarks` (bug) | **`r.poseLandmarks?.[0] ?? []`** (and `[0]` on hands) | Fixes `1 !== 21` holistic hand drop in `0.10.32` |
| Ready-intent continuity | `Camera.ts` / `gestures.ts` | `0 ms` (instant drop) | **`140 ms`** (`quality === true`, cleared on `"release"`) | Bridges 100% of 1-frame dropouts (`73–126 ms`) |
| `world` mirror transform | `upstream.ts` | `x: 1 - p.x` (bug) | **`x: -p.x, y: p.y, z: p.z ?? 0`** | Metric 3D origin is `(0,0,0)` meters |
| `scores.fist` override | `upstream.ts` | `scores.fist > 0.72` | **`scores.fist > 0.72` only if `fallback` is `"unknown"` or `"jug"`** | Stops clobbering `45.9%` (`61/133`) of Crimps |
| `scores.open` release | `upstream.ts` | `scores.open > 0.86` | **`scores.open > 0.78`** (with spread & non-sloper check) | Rescues `91.7%` (`11/12`) foreshortened releases |
| `resetSafe` bounds | `Camera.ts` | `x: 0.15..0.85, y: 0.27..0.82` | **`x: 0.11..0.89, y: 0.16..0.90`** (tips `0.025..0.975`) | Cuts two-hand active rejections `44.03% -> 12.34%` |
| `frameEdge` bounds | `Camera.ts` | `x < 0.09, y < 0.16 / > 0.90` | **`x < 0.045 / > 0.955, y < 0.06 / > 0.965`** (`>= 5` tips `< 0.012`) | Cuts edge triggers `832 -> 558`; `>= 0.065` hysteresis |
| Free-hand `recenter` neutral | `Camera.ts` | Raw `hand - shoulder` | **`v(±0.18, 0.42)`** when `held[side] === false` & dropped | Fixes Rec 6 `48.70s` hip-pinning (`y = -0.56 m`) |

### Milestone 2 — Locomotion Physics, Anti-Snag & Dyno Feel

| Parameter / Component | File | Baseline | Recommended Value | Quantitative Basis |
|---|---|---|---|---|
| Attach capacity & substep sync | `Simulation.ts` | Next-tick `capacities()` | **Compute `capacities()` in `attach()` + sync substep 0** | Eliminates 1-tick `1000 N` raw joint spike on dynos |
| Lower-hold re-catch guard | `Simulation.ts` | `openedHold` `0.7r` only | **If `other.y > hold.y + 0.18` & lower start/visited & `aim.y > hold.y + 0.55r`, require `dist(aim, center) <= 0.85r`** | Eliminates `7 / 8` upward-sweep start-hold snags (`dist = 0.185–1.593 m`) |
| Vertical-split support weight | `HandAnchors.ts` / `AnchorRig.ts` | Fixed `50 / 50` average | **Favor upper pulling support when `|Δy| > 0.20 m` & lower arm `> 0.72 m`** | Prevents lower hold dragging into `"Grip overloaded"` |
| Bounded postural torso sway | `AnchorRig.ts` | `0.00 rad` rigid | **Spring-damped lean clamped to `±0.22 rad`** (`0` at rest) | Expressive swing/recoil with `0%` inversion risk (`<= 0.25 rad`) |
| Dyno `ReleaseVelocity` window | `HandAnchors.ts` | `0.14 s` mean | **`0.18 s` peak-preserving pull momentum window** (`max 4.0 m/s`) | Absorbs `65–100 ms` finger-spread latency without free boost |
| Grip strain telemetry | `Simulation.ts` | Internal `load` / `drift` | **`sim.strain(side): 0..1`** (`max(load/cap, drift/limit)`) | Drives pre-slip HUD/ring cues before `0.30 s` overload |
| `sim.assisted` aim & grip | `Simulation.ts` | None | **`0.045 m` aim bias + any ready grasp (except undercling palm)** | Accessible webcam play without altering Standard replays |

### Milestone 3 — Presentation, Camera Lookahead, Audio & UX

| Parameter / Component | File | Baseline | Recommended Value | Design & Benchmark Basis |
|---|---|---|---|---|
| `FollowCamera` velocity lead | `FollowCamera.ts` | Static `next` nudge only | **`+ clamp(velocity * 0.16, ...)`** within body safety bounds | Keeps dyno landing holds visible mid-flight |
| Climber shadow & cross depth | `Renderer.ts` | Flat single-layer strokes | **`rgba(70, 50, 30, 0.18)` shadow pass + `left.x > right.x` arm sort** | Matches `Crux` `ClimberRenderer` depth & cross clarity |
| Strain warning threshold | `Renderer.ts` | Post-slip message only | **Amber/coral ring + chalk flecks at `strain > 0.75` (`load > 0.85` or `drift > 0.025`)** | *Cairn* / *Jusant* pre-failure tactile readability |
| Procedural Web Audio | `Audio.ts` | Single `150–523 Hz` osc | **Layered thud (`140->45 Hz`) + rock tap + noise brush + `C5-G5-C6` chime** | Zero-asset tactile audio routed to `destination` + `capture` |
| Responsive `.play-panel` & Ghost | `style.css` / `main.ts` | Fixed panel, no ghost | **Scrollable panel at `1280×720` & `1024×640` + Personal Best Ghost + Assisted badge** | Preserves `.camera-preview` aspect and self-paced mastery |

---

## References

1. Casiez, G., Roussel, N., & Vogel, D. (2012). *1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems*. ACM CHI '12 (`https://gery.casiez.net/1euro/`).
2. Google AI Edge MediaPipe Tasks Vision Web Documentation — *Pose Landmarker*, *Hand Landmarker*, and *Holistic Landmarker* (`@mediapipe/tasks-vision@0.10.32`).
3. W3C / MDN — *HTMLVideoElement.requestVideoFrameCallback()* & *createImageBitmap()* Resize Options Specification.
4. Another Axiom — *GorillaLocomotion* (`Player.cs`, MIT License) & Godot XR Tools (`movement_climb.gd`, `velocity_averager_linear.gd`, MIT License).
5. DON'T NOD (*Jusant* Accessibility & Stamina/Input Design Notes) & The Game Bakers (*Cairn* Limb Tension & Breathing Readability Notes).
