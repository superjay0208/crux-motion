# Research sources and decisions

November 11 follow-up: [Existing control foundations and implemented ports](CONTROL_FOUNDATIONS.md) records the six-repository review, primary documentation, newest recorded failure and source choices. [PORT_MANIFEST.json](PORT_MANIFEST.json) identifies exact imported revisions. The original design research below remains historical context.

Research date: November 9, 2026. Links below identify the evidence behind technical choices. Game equations, gesture thresholds, performance budgets, and route designs in this handoff are proposals to validate; none is a measured result from the new game.

## Tracking and camera sources

| Source | What it establishes | Consequence for this game |
|---|---|---|
| [S01 MediaPipe Hand Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web) | Browser hand landmark inference, handedness output, image coordinates, and hand-centered world coordinates. | Use per-hand shape features; do not merge separately centered hand/world outputs into room coordinates. Verify installed API field names. |
| [S02 MediaPipe Pose Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web) | Body landmarks include shoulders, elbows, wrists, and quality fields; pose coordinates use their own origin. | Anchor anatomical identity and reach to the upper-body track. Lower-body visibility is not a game-control requirement but must be tested for model reliability. |
| [S03 MediaPipe Holistic Landmarker Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker?tab=Web) | The current Web task offers combined pose and separate left/right hand outputs. | Benchmark it as an alternative to separate tasks. Its availability is current documentation evidence, not a performance guarantee. |
| [S04 MediaPipe Gesture Recognizer guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer) | Built-in classes are generic gestures; custom classification is a separate capability. | A crimp/sloper/undercling vocabulary must be designed and evaluated. Do not relabel a canned classifier as climbing recognition. |
| [S05 Zhang et al. MediaPipe Hands paper](https://arxiv.org/abs/2006.10214) | A palm detector plus landmark model enables on-device hand tracking from RGB images. | Supports the feasibility direction. It does not prove this game's crossing, finger-pose accuracy, or latency on the user's webcam. |
| [S06 Original Holistic architecture](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md?plain=1) | Pose context guides hand regions and helps preserve body/hand semantic consistency. | Motivates body-aware association. This is historical architecture documentation, not a claim that all current models behave identically. |
| [S07 Moryossef 2024 hand-region study](https://arxiv.org/abs/2405.03545) | The study identifies hand-region failures at non-ideal orientations and evaluates an improved method. | Underclings, side-on hands, and crossed arms need explicit test coverage. No assumption that stock Holistic solves them perfectly. |
| [S08 One Euro filter authors' page](https://gery.casiez.net/1euro/) | Speed-adaptive smoothing exposes a jitter/lag tradeoff and requires tuning for the data units. | Tune wrist movement in calibrated units and measure latency separately. Filtering cannot recover occluded fingers. |
| [S09 MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | Camera capture is permission-gated and requires a suitable secure context; errors and constraints need handling. | Explicit Use camera flow, localhost/HTTPS delivery, video-only capture, and tested lifecycle. |
| [S10 MDN requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) | Frame callbacks and metadata support scheduling; capture timing metadata is conditional. | Process fresh frames without backlog. Do not call inference duration end-to-end input latency. |

The guides' live-camera examples use synchronous video inference calls. Moving them into a worker and selecting a delegate are implementation choices that require a browser spike. The published per-model mobile timings are not combined pose-plus-hands desktop latency and are intentionally not used as product promises.

## Physics and interaction sources

| Source | What it establishes | Consequence for this game |
|---|---|---|
| [S11 Planck revolute joint documentation](https://piqnt.dev/planck.js/docs/joint/revolute-joint.html) | Hinge constraints, angular limits, motor speed, and torque limits. | Start with articulated arms and bounded joint actuation. |
| [S12 Planck motor joint documentation](https://piqnt.dev/planck.js/docs/joint/motor-joint.html) | Target offsets with finite maximum force and torque. | Useful for an initial jug constraint comparison; an isotropic cap alone does not enforce hold direction. |
| [S13 Planck mouse joint documentation](https://piqnt.dev/planck.js/docs/joint/mouse-joint.html) | A force-limited spring-like point target and practical limitations for precise positioning. | Do not use a ground-driven free-hand mouse joint as the final campus control model. |
| [S14 Box2D simulation documentation](https://box2d.org/documentation/md_simulation.html) | Fixed stepping, body dynamics, contact/joint behavior, and the consequences of transform teleportation. | Preserve simulation authority and release momentum. Current Box2D C APIs are not copied into Planck code. |
| [S15 Erin Catto Solver2D](https://box2d.org/posts/2024/02/solver2d/) | Accumulated impulse clamping, warm starts, soft constraints, and solver tradeoffs. | Enforce grip bounds inside the solver, including warm-start impulses. This source does not supply our climbing contact regions. |
| [S16 Naderi et al. humanoid climbing research](https://research.aalto.fi/en/publications/discovering-and-synthesizing-humanoid-climbing-movements/) | Separates route/path planning from lower-level movement optimization in simulated climbing. | Keep route/contact intent separate from physical movement. Do not import an offline optimizer into a real-time camera prototype. |
| [S17 REI hold guide](https://www.rei.com/learn/expert-advice/climbing-holds.html) | Qualitative distinctions among positive holds, edges, slopers, pinches, and underclings. | Use readable shape/direction differences. The no-feet undercling behavior is our force-balance inference; gesture mappings and capacities are game design. |
| [S18 W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) | A mechanism for respecting preference against decorative interaction motion. | Remove decorative pulses/shake/trails when requested; keep essential gameplay understandable. |
| [S19 MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) | Audio interaction and usability considerations, including user activation. | Start/resume audio from intentional interaction, expose volume, and keep audio failures independent of gameplay. |

The local `crux/game/node_modules/planck/src/dynamics/Joint.ts` and `dynamics/joint/MotorJoint.ts` were also inspected. They expose solver hooks and demonstrate a `dt × maxForce` accumulated impulse cap. This confirms a concrete source path for the proposed adapter in the installed 1.5.0 tree; extension packaging and behavior still need the implementation spike. Retain the applicable Planck license for any adapted source.

## Roblox CRUX reference

The user clarified **CRUX**. Search located *CRUX: Rock Climbing* by SKR Studio and this [Roblox experience link](https://www.roblox.com/games/74351664806300/CRUX-Rock-Climbing). [RoVitals' indexed experience description](https://rovitals.com/game/74351664806300) and [Medal's experience listing](https://medal.tv/games/roblox/experiences/1beqpY_TUS3PLu/crux-rock-climbing) reproduce a description centered on manual limb placement, grip management, and dynos.

These secondary listings identify the likely reference and its advertised interaction. Direct Roblox retrieval failed, and Medal showed no gameplay clips in the inspected listing. No reference gameplay was played or timed. Therefore the plan uses the user's stated swing/momentum ambition and makes no claim about Roblox CRUX's solver, specific input mapping, force model, frame rate, catch timing, or current balance. Future gameplay observation is a useful tuning comparison, not a prerequisite for the independent implementation.

The user's local `crux/` is a different browser project. Its appearance and source are available locally and are the stronger evidence for the requested 2D style continuity.

## Alternatives considered

| Approach | Decision and reason |
|---|---|
| Hands only | Reject as default. It omits shoulder/elbow context needed for arm crossing, pull intent, and a stable reach frame. |
| Pose only | Keep as brief coarse-position fallback. It cannot distinguish detailed grip shapes. |
| Paired Pose plus Hand tasks | Provisional default. It offers modular performance/quality tuning, with explicit same-frame fusion and identity association required. |
| Holistic task | Benchmark alongside paired tasks. Combined semantic output may help crossing; extra face processing and actual performance must be measured. |
| Legacy RTMPose Python analyzer | Reuse concepts and contracts. Do not assume its recorded-video pipeline meets browser latency or deployment needs. |
| Pretrained generic gesture labels only | Insufficient for the requested holds. Use calibrated features, then collect evidence before considering training. |
| Full learned gesture model first | Defer. It introduces data collection and evaluation complexity before control usability is known. |
| Existing endpoint/rope rig unchanged | Reject for the final design. Kinematic attachments and rendered-only elbows would hide catch impulses and bypass articulated pull behavior. |
| Entire 3D MuJoCo application | Keep as research reference. It adds a native stack and depth/control complexity outside this 2D browser goal. |
| Finite directional Planck joint | Chosen physics spike. It preserves the local stack while providing explicit load limits and directional contacts. |
| Pure animation with a jump trigger | Reject. It cannot deliver the requested consequences of swinging, crossing, and release timing. |
| Cloud inference | Defer. Network latency and camera upload are unnecessary for the initial local-control objective. |

These comparisons are architectural judgments based on requirements and available APIs, not head-to-head performance benchmarks.

## Claims that remain to be validated

- Required grip classes can be separated at the same camera distance that comfortably captures both arms.
- Fast crossings preserve identity without frequent protective pauses.
- The selected model/delegate/worker combination meets real end-to-end latency targets.
- Finite directional contacts remain stable during fast catches and fatigue changes.
- Campus-only undercling opposition creates enjoyable route choices.
- Comfortable small arm motion can produce a satisfying dyno through bounded actuation.
- Twelve authored routes are solvable with camera control across the supported calibration profiles.

Each uncertainty has a specific early gate in [delivery and validation](../docs/06-delivery-and-validation.md). None should be silently converted into a claim that the new game is already feasible at the proposed quality level.
