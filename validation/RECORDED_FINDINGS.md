# Recorded play: control failures and corrections

This describes the first three recordings and the centered-controls iteration. Two subsequent recordings showed continued failure. See [the latest evidence and mirrored arm controller](MIRROR_ARMS.md) for the current implementation and trial.

Reviewed November 10, 2026. Three user-recorded Jug Ladder attempts were decoded and inspected locally alongside their original telemetry. The user reported inconsistent movement, insufficient reach, and leaving the camera frame. The failures below support changing the controller rather than asking the player to keep stretching farther.

## Captures inspected

| Attempt | Diagnostic duration | Active play | Catches / slips | Frame age p95 | Inference p95 |
|---|---:|---:|---:|---:|---:|
| A | 54.3 s | 32.0 s | 7 / 4 | 144.7 ms | 77.9 ms |
| B | 30.9 s | 18.6 s | 1 / 3 | 157.3 ms | 97.0 ms |
| C | 36.5 s | 28.0 s | 13 / 7 | 144.7 ms | 79.9 ms |

These are original, pre-fix captures using Pose + Hands and 1280×720 camera input configured at 30 fps. Recognition ran substantially slower, around 13–17 updates per second in inspected sections. Catches include regrabbing lower holds and overload-driven regrabs. They do not count unique moves or prove intentional dynos. These recordings do not isolate recording overhead from normal camera latency.

Personal video, extracted frames, and landmarks remain in the ignored `personal-recordings/` folder. This report contains aggregate measurements and observations only.

## Confirmed failures

Times below use the clock printed inside the composite video and the matching telemetry, rather than the player's seek bar.

1. **Relaxed hands commanded a large pull before play began.** In C at 5.1 s, the player has relaxed Jug fists near the shoulders. The requested arm extension is only 22% / 18%, while both physical arms begin at 96%. The aim-to-hand errors are 0.72 / 0.71 m. Starting directly from this mismatch makes the motors chase a dramatic contraction. Subsequent footage shows the avatar rotating close to horizontal. Absolute shoulder-to-wrist mapping did not provide a comfortable neutral control pose.
2. **A closed, recognized supporting grip still overloaded during a normal transfer.** In C at 32.9 s, the left hand is on TOP and recognized as Jug. At 33.8 s, the right hand is open for a transfer; the left remains visibly closed and recognized as Jug. Its aim error grows to 0.37 m. At 33.8335 s the event log says `Grip overloaded`, followed by a brief regrab and a fall at 34.7084 s. This failure was not an intentional left-hand release. A also slips from move 1 at 24.6208 s while both hands are recognized as Jug and command very short arm extensions.
3. **A hooked Crimp was misclassified as Pinch.** In C at 18.6 s, the visible right-hand shape has hooked fingers. The classifier reports Pinch. Thumb and index overlap in the image; a two-dimensional fingertip-distance shortcut took priority over the finger articulation.
4. **The next-hold guidance and completion rule were too restrictive.** In C at 32.9 s, one hand has reached TOP, but guidance still points to a skipped intermediate hold. The implementation also required every checkpoint before accepting a two-hand finish. This is a confirmed rule/UI defect; the recording does not show a sustained two-hand TOP match, so it does not establish that the checkpoint rule alone prevented this particular attempt from finishing.

Missing arm positions and uncertain fingers also occur in the captures. Video alone cannot tell whether every individual loss comes from framing, occlusion, or model error. These are reasons to protect and rebase the controls, rather than treat tracking loss as a deliberate release.

## Implemented changes

- **Center on start and resume.** After the hands-free countdown, the user's current comfortable wrist positions map to the physical avatar's current arms. Relaxed fists no longer imply an immediate maximum pull. The initial physical pose also starts with bent arms.
- **Compact relative motion.** Movement is measured from that center, with a default 1.8 gain and selectable smaller movement ranges. Arm-length estimation locks during a centered segment instead of continually changing as the user curls or extends. Wrist movement remains independent of finger shape.
- **Recenter mid-climb.** `Recenter hands · C` pauses the simulation, preserving contacts, body state, momentum and resources. Return both hands comfortably to view and match the held grips; the three-second countdown centers the new pose and resumes. No simultaneous click and hand pose is required.
- **Automatic recovery.** Hands near the image edge, sustained position loss, and delayed camera frames pause and arm the same return/recenter flow. Normal menu and window-focus pauses still require an intentional resume.
- **Control grip shock.** Held arms have a minimum contraction radius, bounded contraction/extension speeds and motor effort that backs off as contact load rises. Gravity, swing momentum, finite grips and physical hand/hold intersection remain active. No body teleport or remote hold attachment was added.
- **More usable reserves.** Holding drains reserve more gradually, with bounded load growth; Crimps still cost more. The old controller could consume the supporting reserve while fighting an unreachable request.
- **Separate Crimp and Pinch.** A clear hooked-finger Crimp takes priority over incidental thumb/index overlap. Pinch uses three-dimensional fingertip separation and an opposing-finger cue. A Crimp-like curled grasp may also hold a Jug; precise Crimp, Sloper and Pinch holds retain their specific gesture requirements.
- **Clear finishing.** Intermediate holds may be skipped. Both hands must match TOP for the finish dwell, and any explicit crossing, flight or Undercling route objective still applies. Guidance prioritizes TOP once either hand reaches it.

## Verification and limits

- Type checking and **55 unit/physics/control/recording tests pass**. Three complete starter-route tests run the centered camera-processing path at 10 or 15 Hz and gains 1.8 or 2.2. Their authored hand landmarks stay inside the image throughout. A neutral-fist test holds the initial grips for five simulated seconds; a recenter test preserves the paused simulation summary.
- **12/12 campaign routes solve and replay identically** through normal semantic controls in fresh physical worlds. This checks route feasibility, not human playability.
- **6/6 production HTTP/package checks pass.** They do not launch a camera or inspect the rendered interface.
- Ten manually reviewed poses from C match the revised geometric classifier, including the previously wrong Crimp. This small set was inspected after tuning. It is not held-out accuracy, and it does not establish Sloper, Undercling, crossing or dyno acceptance.
- All three original WebM files decode successfully. Their encoded picture begins about **5.1 seconds after the diagnostic clock**. Original videos and telemetry are preserved. Future captures now supply continuous silent game audio from the start and log encoder-start delay; an actual new capture is still needed to verify that synchronization correction.
- Browser inspection remains disabled in Work settings. The current controls are built and served, but the refreshed interface and the user's comfort/completion with the new mapping have not been observed.

## Focused next human check

Refresh the local game. Begin Jug Ladder with relaxed Jug fists near chest height. During the countdown, leave generous space above and beside each hand. Check that staying still does not cause a sudden pull. Open one hand, move it a small distance toward hold 1, close it, then lower the supporting fist a few centimetres. If the movement box becomes awkward, use Recenter hands or let edge protection pause the climb, bring both hands back comfortably, and wait for the countdown. The first goal is a controlled transfer to holds 1 and 2; a full campaign run is not needed to evaluate this correction.

If that still feels inconsistent, use a new short reach recording. Its center anchors, edge flags and encoder-start timing are now recorded so the next failure can be separated into input movement, recognition, physical response and recovery behavior.
