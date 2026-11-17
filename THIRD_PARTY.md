# Third party notices

Crux Motion uses Planck 1.5.0 under the MIT license. The complete notice is bundled at `game/public/notices/planck-license.txt` and copied into the production build. The project-owned `GripConstraint` adapter extends Planck's MotorJoint and projects its accumulated impulses inside the solver. [Planck source](https://github.com/piqnt/planck.js).

The default camera controller adapts planted-hand correction and simultaneous-support averaging from **Another-Axiom/GorillaLocomotion**, commit `bc42e959cf3e69178f9147d89bd3ffeab1c432c4`, MIT, copyright 2021 Another-Axiom. Displacement/time history and release handling are adapted from **GodotVR/godot-xr-tools**, commit `6c6189bdfcdf855052ef1aeb9f3e0ec4c7a7eb60`, MIT. Notices: `game/public/licenses/GorillaLocomotion-MIT.txt` and `Godot-XR-Tools-MIT.txt`. The port is in `src/vendor/climbing/HandAnchors.ts`; it uses native Planck constraints rather than the upstream engines.

The original TypeScript **OneEuroFilter** by Alix Goguey and Géry Casiez, copyright 2019 Inria, is vendored from `casiez/OneEuroFilter` at `d78925584245597f2aa9c4c01a802eb0f0b77fb9` under BSD-3-Clause. Its complete notice is retained in source and at `game/public/licenses/OneEuroFilter-BSD.txt`.

Feature extraction, pose scoring and types are vendored from **abouchedidxcode/open-source-hands** at `dd79fb7b3a9d2e9868e433611e6b8737dfca3936`, MIT. The worker's GPU/CPU lifecycle is also adapted from that project's tracker. Notice: `game/public/licenses/Open-Source-Hands-MIT.txt`. Original files live under `src/vendor/open-source-hands/`; integration remains separate. [Port manifest](research/PORT_MANIFEST.json) records source hashes and destinations. All four notices ship in the production build and are checked by HTTP tests.

MediaPipe Tasks Vision 0.10.32 is distributed under Apache 2.0. The complete license is bundled at `game/public/notices/mediapipe-license.txt` and ships in the build. The inference worker and WASM runtime are bundled locally. Hand Landmarker, Pose Landmarker Lite, and Holistic model sources, versions, byte lengths, and SHA-256 hashes are recorded in `game/public/models/manifest.json`. [MediaPipe source and license](https://github.com/google-ai-edge/mediapipe), [model documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).

Barlow Condensed Regular and ExtraBold are reused from the local Crux project's bundled fonts under the SIL Open Font License. The complete font notice is at `game/public/fonts/OFL-barlowcondensed.txt` and ships in the build.

Walls, holds, climber, particles, and overlays are drawn by this project. Audio is synthesized with Web Audio. No Roblox artwork, route data, character assets, or game code were extracted or copied. New application source licensing remains controlled by the workspace owner; this notice grants no new license to that source.
