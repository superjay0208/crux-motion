# Crux Motion

Crux Motion is a local camera-controlled 2D campus climbing game. Reach, cross arms, form grip gestures, pull, swing, release, and catch through twelve authored routes. It builds on local Crux, Chalk Sandbox movement lessons, and CruxScope tracking discipline.

**Implementation candidate 0.1.0, updated November 12, 2026.** Six personal recordings exposed repeated control failures. The default camera controller adapts existing GorillaLocomotion/Godot XR climbing operations, with imported hand-feature and filtering code. This candidate adds a following wall camera, responsive reversal at full reach and quick hands-free centering. Older saved motor settings migrate to Hand anchors once, preserving personal grip calibration. [Research and ports](research/CONTROL_FOUNDATIONS.md), [centering changes and evidence](validation/CENTERING.md). Personal acceptance remains open.

## Play locally

Double-click [run.bat](run.bat). Keep its server window open while playing; it opens `http://127.0.0.1:4318/` in your browser. The prebuilt release is in `game/dist/`. Use a current desktop Chromium browser and Node 24 or newer. The launcher uses the installed Node runtime, with the existing workspace runtime as a fallback.

Choose **Use your camera**. Start with relaxed Jug fists near your chest, with shoulders, elbows and both hands visible. The countdown centers this comfortable pose on the avatar's current arms. Use small movements: open the free hand, reach a little and close to catch; lower the supporting fist a few centimetres to pull the body up. Form hooked fingers for a Crimp, a rounded palm with fingers together for a Sloper, and opposing thumb/fingers for a Pinch. Spread fingers to release. A curled Crimp grasp also works on a Jug. **Calibrate** optionally records personal shapes and Undercling/sidepull orientations. Its first step can swap L/R labels.

**Hand anchors** is the default. A free hand follows your mapped wrist; moving a planted fist pulls the body in the opposite direction. Sweep both hands to move the body sideways, pull down to rise, then open both while moving to carry that velocity into flight. The body stays upright and its lower mass remains passive. The visible arms use IK; uncertain elbow angles do not drive locomotion. Settings retain the old motor experiments for comparison and offer compact/small movement ranges. Hand cards show grip and reach, while the momentum meter shows body movement. Match both hands on TOP to finish; explicit route objectives still apply.

**Recenter during a climb:** approaching the image edge, sustained position loss or delayed camera/game frames freezes the climb automatically. Bring both hands into the preview guide near your chest, match your held grips and settle for about 0.7 seconds. Hand anchors then centers and resumes without another click or full start countdown. The game preserves contacts, physical velocity, body position and resources during the pause; repositioning is excluded from launch history. **Recenter hands · C** requests the same flow manually. Old motor modes retain their previous countdown. The wall camera follows the avatar smoothly; it does not change what the physical webcam can see.

**Starting and resuming:** click **Begin climb** or **Resume climb** once, put the mouse down, then return both hands to view. The wall immediately acknowledges that start is armed and shows what each hand needs. Once the held grips match, a visible 3–2–1 countdown starts the simulation. A missing hand pauses the countdown; sustained tracking loss restarts it. **Cancel start**, Escape, opening a menu, or leaving the window cancels the pending start. Camera retries arm this same flow automatically.

**Calibration:** click **Set up capture** first, then form the pose during the countdown. Only the following capture window supplies calibration samples, so moving a hand to the mouse cannot contaminate the recorded shape. Each hand must supply at least eight fresh samples. Comfortable reach gets a four-second measurement window; grip and orientation samples use at least 1.5 seconds. You never need both hands in view at the instant of clicking.

**Practice controls:** drag a wrist to reach; release the pointer to try the selected grip. Hold Space to pull and Shift to extend. Q/E releases left/right, X changes selected hand, 1–4 selects a grip, and O turns the palm. R retries and P pauses when the wall has keyboard focus. Tab navigates interface controls normally. **Watch beta** plays a verified physical solution without changing your progress. **Grip lab**, attempt review, saved semantic replays, and checkpoint practice are available during play. Camera, practice, and checkpoint records are separate.

Ordinary play processes camera frames locally without saving video. **Record a local play test** explicitly records a 60-second split-screen WebM with camera, game, game sound and diagnostics, without microphone audio. **Centering · follow and reset** is the default focused test; **Hand anchors · swing and momentum** remains available. Both select Hand anchors explicitly. The first 15 seconds hold the avatar safely during preparation; the climb then arms automatically. Stop & save ends early. The launcher saves `camera-gameplay.webm`, `telemetry.json` and `analysis.md` under `personal-recordings/<session>/`. These files are ignored by Git and are not served publicly. If saving fails, downloads remain available. See [recorded test instructions](validation/RECORDED_TESTS.md).

Settings let you switch between paired Pose/Hand tasks and Holistic, choose a camera, mute effects, and reduce decorative motion. Returning home stops camera capture and finishes an active test recording. Semantic replays contain game controls rather than video. No external upload or cloud service is used by the recorder.

## Develop and verify

From `game/`:

```powershell
npm ci
npm run assets:prepare
npm run check
npm run campaign:check
npm run build
npm run web:check
npm run dev
```

`assets:prepare` downloads pinned official models if missing and copies the matching WASM. The release includes them. `check` runs type checking and 100 unit/physics/control/recording tests. `campaign:check` solves all twelve routes with both hand-anchor and legacy motor controls and confirms identical fresh replays. Default demonstration files use hand anchors. `web:check` runs seven HTTP/package checks, including imported license notices. These checks do not establish human playability. `/diagnostics.html` executes the providers on generated blank frames without opening a webcam. GPU acceleration with CPU fallback is implemented; current live performance still needs measurement.

The interface names grips **Jug, Crimp, Sloper, Pinch, and Undercling**. Short hand-shape cues appear underneath. The live cards show uncertainty separately from the last protected physical contact. See [the current camera session](validation/LIVE_CAMERA_SESSION.md) for the camera-source issue encountered during personal testing.

The earlier reach changes are documented in [the playability record](validation/REACH_PLAYABILITY.md). The latest changes follow [actual recorded play](validation/RECORDED_FINDINGS.md), including neutral-pose mismatch, closed-grip overload and a Crimp/Pinch confusion.

The worker is bundled as a **classic worker** because the pinned MediaPipe runtime uses `importScripts`; an ES module worker fails in Chromium. The build includes model hashes and source provenance. Dependency notices: [THIRD_PARTY.md](THIRD_PARTY.md). Current evidence: [validation report](validation/REPORT.md).

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

[CODING_AGENT_PROMPT.md](CODING_AGENT_PROMPT.md) is the ready-to-use assignment for the implementing agent.

## Design decisions

- Keep the dark slate wall, readable colored holds, clothed character, compact interface, short routes, and two-hand finish of local Crux.
- Make upper-body camera control the primary interaction. Feet never attach, push off, or complete objectives. Passive lower-body mass makes swings legible.
- Track anatomical hand identities through crossing. Render the requested pose immediately as subtle intent markers; the physical limbs follow with bounded joint actuation.
- Require hold-specific gestures, but treat them as game inputs. A webcam does not measure squeezing force or establish exact finger biomechanics.
- Use an articulated 2D body with finite directional grip capacity. Build dynos from supported arm work and retained momentum. Do not teleport the body or launch it with an unconditional jump impulse.
- Preserve a fair attempt when tracking becomes uncertain. A lost landmark is not a deliberate release.
- Ship three polished camera-playable routes first, then the complete twelve-route campaign. The first slice is an integration gate, not completion of the full assignment.

## Important distinctions

**Local Crux** means `D:/Climbing/crux`. **Roblox CRUX** means the user's reference, *CRUX: Rock Climbing* by SKR Studio, discovered as [Roblox experience 74351664806300](https://www.roblox.com/games/74351664806300/CRUX-Rock-Climbing). They are separate projects. The reference review supports the intended manual movement, grip, and dyno experience; it does not establish Roblox CRUX's internal physics implementation. See the source ledger for access limitations.

The design documents retain the original goals and proposed targets. Final implementation choices and tested limits are recorded in the implementation status and validation report. All new implementation stays in this folder.
