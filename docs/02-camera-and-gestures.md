# Camera tracking and gestures

## Tracking decision

Start with two interchangeable browser providers: **Pose Landmarker plus Hand Landmarker** and **Holistic Landmarker** from MediaPipe Tasks Vision. Benchmark them against the same captured test sequences before choosing the default. Pose plus hands is the provisional default because it avoids unused face output and permits separate quality settings; Holistic is a serious candidate for synchronized body/hand association. Do not choose from published mobile inference numbers alone.

The current official guides document 21 landmarks per hand, 33 pose landmarks, and a Web Holistic task. Hand-local and pose-world coordinate origins differ. These outputs are estimates, and they do not form a shared calibrated room-space skeleton merely because both are called world landmarks. [Hands](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Web), [Pose](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web), [Holistic](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker?tab=Web)

The built-in Gesture Recognizer vocabulary contains generic poses such as fist/open palm, not climbing grip classes. Use landmark features and calibration first. A trained custom classifier is a later response to measured confusion, not a prerequisite or an assumed capability. [Gesture Recognizer](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer)

## Camera and inference pipeline

1. Request video without audio after the player presses Use camera. Start at an ideal 1280×720, 30 fps, then inspect actual settings. Try 640×480 as a measured fallback. Do not force an unsupported exact resolution.
2. Use an unmirrored frame as the canonical inference input. Mirror the preview through a separate display transform. Persist the mirroring convention and verify it by asking the player to raise a named hand.
3. Schedule work from `requestVideoFrameCallback` when supported; fall back to animation frames gated on a changed video timestamp. Allow one inference job in flight and one replaceable newest pending frame. Drop backlog.
4. Transfer frame data to an inference worker where the chosen backend supports it. Run both pose and hands on the same source frame for the paired provider. Keep the main thread free for input, drawing, and fixed physics.
5. Return a timestamped observation, canonicalize it, associate identities, compute features, filter movement, and publish a semantic input sample.
6. The simulation consumes ordered input samples at tick boundaries. The renderer interpolates physics snapshots and draws a separate current intent outline.

Camera access requires a secure context and user permission; use localhost during development and HTTPS for hosting. Handle denied permission, missing camera, device in use, track ended, and changed device distinctly. [Camera API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

Pin the tested `@mediapipe/tasks-vision` version, WASM files, and model assets together. Store hashes and licenses. Do not ship `@latest` URLs from documentation examples. Prefer same-origin model assets for reliable loading; local inference does not mean the initial model download is offline. Never create a backend camera upload endpoint.

Worker/GPU support is a spike requirement, not a promise. If GPU inference in a worker fails, compare CPU/WASM in a worker with reduced resolution before accepting main-thread inference. A main-thread fallback must meet the same frame-age budget. Close transferred image resources, dispose model tasks, stop media tracks when leaving camera mode, and cancel stale jobs on session change.

## Coordinates and calibration

Maintain four named spaces: raw camera pixels; calibrated body coordinates; 2D simulation meters; rendered CSS pixels. Never calculate finger angles directly from uncorrected normalized x/y coordinates: image width and height differ.

Calibration records:

- Camera dimensions, orientation, mirroring convention, provider/model version, and selected device token kept locally.
- Anatomical left and right, verified through a named-hand movement; detector labels are supporting evidence.
- Median shoulder midpoint and shoulder span in pixels, with a lower bound against degeneracy.
- Comfortable left/right reach envelopes, sampled above, beside, and across the torso; full overhead extension is unnecessary.
- Neutral and flexed elbow poses, with valid visibility and multiple samples.
- Relaxed examples of release, jug, crimp, sloper, pinch, and undercling orientation when those features are introduced.
- A negative example for each confused pair, especially fist versus crimp and sloper versus release.

Compute wrist offsets from the corresponding shoulder in aspect-corrected image coordinates, scaled by the calibrated reach envelope. Map these onto avatar arm reach in screen-aligned world axes: x right, y up. Add the current physical shoulder position. The anatomical hand key remains unchanged by the x mirror transform. Do not mirror a second time in the renderer.

Resolve the wrist-to-palm offset explicitly: the pose wrist is the association landmark, while the game target is the hand's palm/contact reference point. Estimate the camera palm center from wrist and finger-base landmarks, then map its offset using avatar hand dimensions. When only the pose wrist is reliable, retain the last valid orientation for coarse intent and disable acquisition. Do not let the rendered fingertips, simulated palm, and acquisition sweep use three different untracked positions.

Do not dynamically rescale reach every frame from noisy shoulder width. Use a slow bounded scale correction only during a safe neutral state; a substantial camera movement pauses and recalibrates. Screen camera zoom or pan never changes the control mapping. Clamp targets to the avatar's real reach and show the unclamped request subtly when it exceeds reach.

For a held arm, use calibrated elbow flexion and hand-to-shoulder contraction as motor intent. Keep the hold anchor fixed. Blend controller targets at attachment over roughly 100 ms so the change of mode cannot create an impulse. In free motion, solve a continuous two-link target using observed elbow position to choose the bend branch. Near a straight arm, retain the prior branch rather than allowing frame-to-frame inversion.

## Anatomical identity through crossing

Never sort hands by horizontal position. Never use detector array index as persistent identity. Maintain exactly two gameplay tracks, `left` and `right`, owned by the calibrated person.

For each frame evaluate both possible two-hand assignments. A candidate cost combines wrist distance to the corresponding pose wrist, distance to the predicted prior hand track, elbow/forearm continuity, plausible speed, and detector handedness. Use robust capped terms and explicit missing-data penalties. Reject an assignment if the best and second-best costs are too close; low confidence is preferable to exchanging hands.

Use a short constant-velocity prediction only for association. Do not use an extrapolated hand to acquire a hold. At a crossing, retain anatomical identity even if the hands reverse horizontal order. Holistic's separate left/right outputs still pass continuity checks. The original Holistic architecture uses pose context for semantic consistency, while published work also reports problems with hand crops at unusual orientations; neither establishes perfect occlusion handling. [Architecture](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md?plain=1), [Orientation study](https://arxiv.org/abs/2405.03545)

When a hand disappears behind the other arm, the pose wrist may preserve coarse reach intent but must not substitute invented finger landmarks. For rendering order, use reliable pose elbow/wrist relative depth, then retain the last stable overlap order. Hand-local z from two separate hand models cannot determine which hand is closer to the camera. Depth ordering is a visual cue only; this remains 2D physics.

If a second person enters, retain the calibrated body track using shoulder/torso continuity. If association is ambiguous, pause instead of automatically choosing the largest person. Reacquisition must preserve hand resources and existing contact ownership.

## Gesture features

Extract finger bend angles, fingertip-to-palm distances normalized by palm size, thumb opposition, finger spread, palm-axis orientation, and temporal stability. Use hand-local 3D estimates for within-hand shape where useful; rely on calibrated image features when depth becomes inconsistent. Reject degenerate palm geometry and impossible landmark jumps.

Build a feature prototype for each user's gesture from multiple valid frames. Normalize by that user's feature spread and retain an explicit unknown class. Compare the winner's score with the runner-up; a high winning score without separation is still ambiguous. Scores are classifier similarities, not measured strength or calibrated probabilities.

Require independent grip identity and orientation scores. Undercling and sidepull prompts use a broad, calibrated orientation sector, never a fragile single palm-normal sign. A poorly observed edge-on hand returns unknown orientation. Provide a lab view that shows what the recognizer believes before requiring the gesture in a route.

Initial temporal values to tune:

| Signal | Initial rule |
|---|---|
| Grip ready | Compatible score above 0.75 for at least 60 ms and at least two independent camera frames |
| Maintain recognized grip | Retain the current class down to 0.55; a new class needs a margin of 0.15 |
| Deliberate release | Splayed release score above 0.80 for 60–90 ms and two fresh frames |
| Known wrong shape while holding | Warning immediately; reduce compatibility over 150 ms, then release if still wrong |
| Acquisition | Ready intent plus actual patch intersection; no additional 100 ms contact dwell during a dyno |
| Rearm after release | New compatible grip on two fresh frames; 100 ms minimum same-patch cooldown |

All durations use observation timestamps, not number of render frames. Do not count duplicated video frames twice. Preserve a short ready-intent buffer, initially 120 ms, for a catch whose contact falls between inference samples. This buffer cannot survive loss of identity or an explicit release.

## Filtering without hiding lag

Use a speed-adaptive One Euro filter for wrist/elbow targets, with separate parameters for positions and gesture features. Tune in calibrated units. Reset derivative history on discontinuity, device change, or resume. The method trades low-speed jitter against fast-motion lag; it cannot restore hidden observations. [Author's explanation](https://gery.casiez.net/1euro/)

Use two bounded paths: smooth positions for target presentation and robust velocity estimates over timestamped recent samples for movement classification. Do not differentiate repeatedly smoothed display coordinates or raw jitter. Dyno strength comes from actual simulated motor work, so a velocity-estimator spike cannot create a launch.

## Tracking interruption policy

Tracking health is independent of contact state. Confidence is assembled from frame freshness, identity separation, pose visibility, hand presence, landmark geometry, and gesture certainty. Do not invent per-finger confidence fields absent from the actual task output.

| Condition | Response |
|---|---|
| Position/gesture uncertain for up to 120 ms | Preserve prior contact intent; prohibit new acquisition or launch decisions from the uncertain hand. Hold motor targets with bounded damping; continue real load and fatigue. |
| Identity ambiguous at a crossing | Freeze identity assignment. Show a ghost outline, never swap left/right. Apply the same 120 ms continuity limit. |
| Critical upper-body input stale/uncertain beyond 120 ms | Freeze the entire simulation, resources, route clock, and finish dwell. Keep the camera running for reacquisition. |
| Hand leaves the calibrated frame | Show the missing side; enter the same protective pause if not promptly restored. |
| Hidden tab, focus loss, camera ended | Pause immediately; clear pending grip transitions and dyno intent. No wall-clock catch-up on return. |
| Tracking becomes stable | Require 300 ms of consistent observations and explicit resume. Preserve world/contact state, clear velocities of input filters only, and ramp control targets. Never zero physical body velocities. |

Allow coarse reach updates from a trusted pose wrist while finger data is briefly missing, but never interpret missing fingers as an open hand. Once protected pause begins, the attempt gains no resource refill, finish progress, or score. Mark assisted pauses in the replay. Competitive ranking is out of scope; do not pretend this makes camera-based leaderboard cheating impossible.

## Performance targets and measurement

On the documented reference Windows laptop: aim for 60 Hz rendering, at least 24 fresh paired observations per second, median software frame-to-intent latency under 65 ms and p95 under 100 ms. Aim for measured motion-to-visible-intent median under 100 ms and p95 under 150 ms. These are targets, not verified performance.

Log frame acquisition, inference start/end, semantic publication, simulation consumption, and render submission in one monotonic clock domain. A video frame callback does not guarantee access to sensor exposure time; label software latency honestly. Use a high-frame-rate external recording of the person and screen to measure actual end-to-end delay. [Frame callback metadata](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)

Report physical hand lag separately from input lag: a loaded hand intentionally does not follow the target. If frame age persistently exceeds 150 ms, reduce quality or pause with an actionable notice. Do not keep adding prediction to conceal a growing queue.

## Privacy and local data

Live frames stay in memory and are processed locally. Do not record or transmit them by default. Save calibration and progress locally with a reset option. Store semantic replay only when the player chooses to save a replay; use a bounded in-memory buffer for immediate review. Raw fixture video requires a separate deliberate capture action and should be excluded from source control unless explicitly cleared for that purpose. Network inspection must verify the implementation matches these claims.
