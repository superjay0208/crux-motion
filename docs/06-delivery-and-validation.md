# Implementation sequence and acceptance

This is the original acceptance plan. Current measured results and remaining gates are recorded in [the validation report](../validation/REPORT.md).

## Execution policy

Build in this new folder. Keep the analyzer, 3D sandbox, and local 2D game as read-only references. The goal is a camera-playable campus game; a convincing mouse demo is necessary for isolated physics testing but insufficient for completion. Work through the dependency gates below and record decisions when a spike changes the plan.

All numeric gates below were proposed acceptance targets when the plan was written. Consult the validation report for actual measurements; implementation alone does not pass a human acceptance gate.

## Dependency order

| Stage | Deliverable | Exit gate |
|---|---|---|
| P0 Baseline and setup | Independent project, licensed selected reuse, new storage namespace, reference inventory | Existing projects unchanged; clean type/build command; model assets pinned. |
| P1 Camera feasibility | Paired-task and Holistic comparison, calibration, identity display, gesture lab, frame-age telemetry | Live two-hand input works, crossing/gesture confusion is measured, provider choice written down. |
| P2 Campus physics | Eight-body rig, torque-limited arms, finite directional grip, fatigue-free test scenes | Analytic and physical fixtures pass; no airborne external lift or impossible undercling support. |
| P3 Camera integration | Camera semantic input drives the same rig; grip/release, crossing, resource model, tracking pause | Jug/edge/sloper/pinch/undercling lab behavior works with camera and has failure evidence. |
| P4 Dyno slice | Routes 01, 02, 09, physical release/catch, first complete feedback pass | Human camera completions plus fresh semantic replays; satisfying swing and catch review. |
| P5 Full campaign | Remaining routes, fatigue tuning, rest choices, matched finish, progression/practice | All twelve routes pass replay and human camera completion; no foot-dependent rules. |
| P6 Robustness and polish | Performance tiers, lifecycle, accessibility, audio, failure review, local launcher | Production browser tests, manual camera matrix, visual inspection, and privacy checks pass. |
| P7 Handoff | Reproducible build, source/license notices, validation report, known limitations | Report only verified results; give straightforward local launch steps. |

Do P1 before investing in full route art. P2 can use a deterministic practice input source, but do not proceed to P5 while P1/P3 camera usability remains unresolved. Do not stop at P4 and label the full game complete.

## Feasibility gates and alternatives

| Risk | Required experiment | If it fails |
|---|---|---|
| Crossed hands exchange identity | Repeated slow/fast cross, contact behind forearm, same-height overlapping wrists | Compare Holistic; improve pose association and ambiguity handling. Preserve protective pause rather than guess. |
| Fingers too small at useful reach | Test 720p and lower resolution at several comfortable distances | Improve framing, use calibrated compact reach, then evaluate pose-guided hand crops with correct coordinate reconstruction. |
| Sloper looks like release | Confusion test with deliberate cupping, splaying, and incidental hand shapes | Recalibrate or use an explicit alternate release in Assisted mode. Do not ship mandatory sloper routes with unreliable controls. |
| Crimp or undercling orientation unreliable | Test across hand sizes, camera angles, and motion | Widen calibrated gesture/orientation classes; a symbolic substitute is an honest Assisted option. Require baseline gesture gates for Standard. |
| Worker/GPU setup unstable | Production asset load and sustained inference on target browser | Compare CPU worker and resolution tiers; choose measured stability over a nominal GPU label. |
| Finite contact solver unstable | Static/dynamic constraints and drift tests | Tune softness/substeps, isolate engine adapter. Document an engine change only after evidence; never hide infinite pinning. |
| Dynos feel weak | Compare measured motor work, launch velocity, and achievable gap | Tune bounded strength/control mapping and shorten gaps before adding assistance. |
| Physically correct but exhausting interaction | Seated/compact reach session with actual users | Improve calibration gain, shorten routes, add between-attempt breaks and low-motion mode. Do not reward larger real arm exertion. |

## Camera test corpus

Use at least five consenting testers for the release gate, with varied hand sizes, skin tones, dominant hands, clothing, and seated/standing setups. Include at least three practical lighting/background conditions and two webcam classes if available. Record exact coverage; do not claim population-wide accuracy from this sample.

For each tester, capture or annotate at least 20 deliberate entries for each required gesture, 20 releases, 20 crossings, and negative transitions that resemble each grip. Test hands near face, torso, frame edge, and each other; moderate motion blur; one hidden hand; camera disconnect; and another person entering. Label intended gestures manually. Separate calibration samples from evaluation samples, including at least one recalibration/new-session test.

If privacy prevents storing video, record consented landmark traces and manual event annotations, noting that these do not independently validate the model's image inference afterward. Keep a small openly shareable synthetic semantic corpus for deterministic logic tests. Never describe semantic mocks as real-camera accuracy evidence.

## Input acceptance targets

| Metric | Initial release gate |
|---|---|
| Steady position jitter | p95 target displacement under 2% of calibrated arm reach during a 10-second stationary hold. |
| Identity continuity | Zero silent left/right swaps over 100 labeled cross/uncross sequences; ambiguous cases may pause but must be counted. |
| Gesture entries | At least 95% precision and 90% recall per required gesture on held-out calibrated sessions; publish the confusion matrix and per-tester breakdown. |
| Unwanted release | No more than one false release in a 10-minute mixed gesture/hold trial; investigate every event. |
| Negative acquisition | Zero wrong-class acquisitions in at least 100 labeled incompatible-grip attempts. |
| Ordinary crossing usability | At least 95% of clear, fully visible crossings complete without protective pause. |
| Brief occlusion | A 100 ms dropout never becomes a release or a new catch. A longer dropout invokes the documented pause. |
| Reacquisition | Stable tracking can resume without contact exchange, body teleport, resource change, or an unintended dyno. |
| Latency | Meet the separate software and externally measured motion-to-intent targets in the camera document. |

Report both false positives and false negatives. Passing an average must not conceal a persistently failing tester. A low-confidence system that pauses on every crossing is identity-safe but has failed usability.

## Physics acceptance fixtures

| Fixture | Evidence and target |
|---|---|
| Mass and geometry | Total body mass matches configuration within 0.1%; arm lengths and anchors remain constant. |
| Static two-jug hang | With fatigue disabled, 10 seconds without slip; anchor drift below 0.025 m after settling; finite bounded reactions. |
| Insufficient capacity | Reduce combined upward capacity below body weight; body cannot remain at rest indefinitely. |
| Passive pendulum | In a simplified point-mass fixture, period within 5% of `2π√(L/g)` for a small angle; full rig judged against its own expected inertia, not the point-mass formula. |
| No free energy | With motors disabled and dissipative settings, no sustained increase in total energy beyond numerical tolerance after settling. Document the tolerance. |
| Pulling | Supported contraction raises or rotates the body observably; four consecutive pull/extend cycles work without hidden saturation. |
| Airborne motion | With contacts removed, moving arms changes pose but center-of-mass acceleration remains gravity within a stated numerical tolerance. |
| Release | Body velocities are continuous across constraint removal; no zeroing or launch impulse. |
| Directional support | Slopers slip in wrong load directions; a sole ordinary undercling cannot hang the body; a suitable jug/undercling pair behaves consistently. |
| Catch | A swept physical hand can catch a generous patch; velocity is redirected through a bounded impulse, and excessive demand slips. |
| Grip load | Solved accumulated impulse never exceeds its current feasible region, including warm start after reserve reduction. |
| Crossing | Hands retain identity and resources; projected arm crossing does not explode the solver or exchange anchors. |
| Resource integration | Drain/recovery match the same simulated duration across 30/60/144 Hz rendering; no recovery or dwell progress during pause. |
| Long run | Ten minutes of varied scripted intents remain finite, with no unbounded energy/particle growth or orphaned constraints. |

Use independent expected values where possible. Do not construct both test input and expected result from the same flawed route generator. A drawing of a hand at a hold is not evidence that the physical hand made contact.

## Browser and lifecycle tests

Run production builds from localhost. Test camera permission success/denial/ignored prompt, no device, device busy, stale model load, failed WASM fetch, camera switch, track ended, resized viewport, DPR 1 and 1.25, muted audio, blocked AudioContext, hidden tab, focus loss, retry, route navigation, and repeated menu visits. Confirm one active camera session, one inference worker, and one effective input handler after repeated transitions.

Use deterministic prerecorded camera streams for browser integration where feasible, plus real-device sessions. Fake landmark providers are useful for edge cases but cannot replace the production camera/inference path. Browser tests may inspect state; they must not attach hands or mark routes complete through test-only shortcuts when reporting gameplay completion.

Inspect rendered captures for crossed arms, sloper versus release cues, undercling force cues, low-reserve warning, flight framing, heavy catch, pause overlay, matched finish, and reduced-motion mode. Check that the next hold, all limbs, and essential controls remain readable at 1280×720 and a smaller laptop viewport. Menu and retry controls need keyboard focus and descriptive labels.

## Performance and privacy checks

Document CPU/GPU, RAM, camera model/resolution/fps, OS, browser version, model hashes, delegate, and power mode. Record a sustained ten-minute session, not just a warm single frame. Measure inference throughput, p50/p95 frame age, main-thread frame time, physics time, memory growth, dropped frames, and pause frequency. Aim for p95 main-thread work below 12 ms at 60 Hz and p95 physics below 2 ms per 120 Hz tick on the chosen reference machine; tune after measurement.

Show fallback behavior on a weaker machine. Reducing particles is acceptable; hiding tracking backlog is not. Use network inspection to confirm that camera frames and landmarks are not transmitted. Verify Stop camera releases media tracks and that model disposal/retry does not leak memory.

## Human feel review

For each first-time tester, observe calibration, route 01, cross tutorial, and First Flight without developer coaching beyond the in-game prompts. Target at least four of five completing route 01 within three minutes after calibration. Ask whether the hands felt like their hands, whether the catch felt heavy and controllable, and whether a failure reason was understandable. Record findings, not just a numerical satisfaction score.

For dynos, compare three release timings from similar initial states and retain the resulting trajectories. Demonstrate at least one successful camera-driven double-release catch. Inspect the body motion at normal speed; slow-motion debug footage alone cannot establish satisfying real-time play.

The Roblox CRUX reference can be reviewed interactively later if access becomes available. Record reproducible observations of swing, release, catch recoil, and grip readability. Do not block the independent prototype on that access or invent exact reference measurements.

## Completion evidence

The final validation report should contain build ID, commands run, actual pass/fail counts, twelve route replay results, camera-provider comparison, held-out gesture confusion matrix, crossing outcomes, latency method/results, tested hardware, representative captures, privacy check, and remaining limitations. Keep claims such as “camera verified,” “route playable,” and “production ready” tied to that evidence.

The future project should expose straightforward commands for type/unit checks, physics checks, route checks, browser checks, and production build. Define their actual names in the new package file and README rather than copying commands that do not exist. Provide a Windows launcher after the production build is verified. Publication and remote CI are outside this planning task; if later requested, verify the deployed camera permissions, model paths, and HTTPS behavior before claiming hosting works.
