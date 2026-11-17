# Latest recordings and mirrored arm controls

Historical iteration, rejected in the next personal recording. Current controls port planted-hand locomotion and reusable tracking components; see [the research and port record](../research/CONTROL_FOUNDATIONS.md).

November 10, 2026. The user rejected the centered-controls candidate as still unplayable and requested arm mirroring as the main source of swing and momentum. This change follows two new saved recordings from that candidate, not a successful human acceptance test.

## What the latest videos establish

Both clips used build `fdc66b726bf5ece8a802013378b98ac5e2f325360318e481a5931eb54505e050`. They contain 35.6 / 43.8 seconds of diagnostics and 23.8 / 27.8 seconds of active play. They recorded 8 catches / 5 slips and 5 catches / 2 slips, respectively. Regrabbing starting holds is included in those totals. Neither clip completes Jug Ladder.

- **Centering was active.** The first clip centers at 9.24 s. The second centers at 6.03 s and successfully goes through protective pause/recenter at 10.87–18.53 s. The user's continued failure cannot be dismissed as an unrefreshed build or missing the new start flow.
- **A tucked supporting fist still fails to produce a useful pull.** In the second clip at about 24 s, the supporting right fist is tucked and recognized as Jug. Its requested extension is 44%, but the physical arm remains at 94%, with 0.55 m aim error. The free hand sits below the next patch. This is the central control/physics failure.
- **The avatar often regrabs the starting holds.** In the first clip the left hand reaches move 0 only at 29.08 s; the right subsequently catches the lower start-left hold at 31.69 s. In the second clip the first move is caught at 31.16 s, and the right later catches start-right again at 38.68 s. Catch count therefore overstated useful progress.
- **The recording workflow gave conflicting instructions.** Actual play began at 9.24 s and 6.03 s, while the recorder's first 15 seconds still requested open/close checks. The video visibly asks for a right-hand grip check during active hanging. The UI allowed starting during preparation.
- **Inference remains relatively slow.** Frame-age p95 is 149.0 / 148.5 ms and inference p95 is 92.4 / 85.9 ms. The new control architecture does not claim to reduce these image-model times.
- **The earlier five-second encoding gap is gone in these clips.** Inspected encoded seeks at 6, 11, 24 and 29 seconds show the corresponding burned-in clock, rather than a five-second offset. Encoder-start events report 69 / 109 ms. This confirms removal of that large offset; it is not an external motion-to-photon synchronization measurement.

The videos, extracted frames and raw landmarks remain private in the ignored local recordings folder.

## Current controller

**Mirror arms is the default camera mode.** It mirrors the comfortable, centered wrist path and uses the measured shoulder/elbow/wrist geometry to choose the elbow bend. A two-link retargeter converts that path to shoulder direction and elbow flexion on the avatar. It preserves camera up/down and anatomical crossing. It does not copy a constant offset between the person's raw joint angles and the avatar's initial angles: doing that rotates reach paths from a relaxed starting pose.

The avatar is still a physical rig. Bounded shoulder/elbow motors follow the retargeted motion and its measured angular velocity. Planted hands transmit that arm work to the body; release retains the resulting momentum. There is no jump impulse, force on the center of mass, remote attachment or body teleport. The upper-arm direction uses the camera/gravity plane so that camera up remains up as the torso swings.

Changes that support this control path:

- A single planted arm has enough motor capacity for a campus pull: maximum shoulder/elbow torque is 340 / 300 N·m before reserve scaling. Two-arm support reduces each arm's effort; free-arm strength is lower. These are game tuning values, not measured human physiology.
- A bounded posture correction acts through planted shoulder motors. It helps keep the torso usable during one-arm hangs while allowing horizontal swings. It applies no direct force or torque to the torso and never uses feet.
- Velocity feed-forward expires over 120 ms without a changed arm sample. A stalled camera does not keep commanding a previous swing velocity indefinitely. Existing delayed-frame and lost-position pauses remain active.
- Both arm-length and shoulder-width normalization lock during a centered segment. Setup/resume unlocks estimation before capturing the next center. Holding still no longer keeps changing the movement scale.
- Elbow occlusion is reported explicitly and protected; it does not silently switch the hand to the old controller. Ambiguous nearly folded/straight elbows retain their bend. A bend change traverses a valid elbow range rather than wrapping through an impossible angle.
- A deliberately released Jug can be regrabbed only when the mirrored aim returns near its center. Closing on the way upward no longer accepts a loose near-old-hold aim as a return.
- Reserve drain uses a filtered contact-load estimate for mirrored controls, reducing sensitivity to rapid solver-force spikes. Contact capacity itself remains finite and unfiltered.
- Dotted full-arm targets show intended movement beside the physical limbs. A smoothed physical momentum meter distinguishes swing/rise from stillness and cues release while rising.

The previous wrist-reach controller remains selectable in Settings for comparison. Existing semantic route demonstrations use those ordinary controls, not the new camera retargeter.

## Recording workflow correction

Recording preparation now blocks start, including manual Begin/Resume attempts. The button explains that the grip check is in progress. At 15 seconds the hands-free countdown arms automatically. The new **Mirror arms · swing and momentum** preset separates preparation, two-hand sweeping, one-hand transfer and an optional airborne catch.

New telemetry records the observed arm, retargeted command and actual joint angles, contact load/drift, body velocity/angular motion, selected mode/gain and center anchors. Observed angles and retargeted angles use different reference poses; compare the retargeted command with actual joints, and wrist paths with the video, rather than treating raw source angles as an exact avatar pose.

## Verification

- Type checking, production build and **70 tests pass**.
- Three new full Jug Ladder runs pass through the actual mirrored camera-processing path at 10/15 Hz and gains 1.8/2.2. The three previous wrist-reach runs also pass. The authored landmarks remain inside the frame. These are controller tests, not image-recognition accuracy or human completions.
- Each arm independently raises the body by more than 0.1 m in the finite-grip campus-pull test without slipping.
- Sweeping arms generates sustained horizontal movement and speed. The release test confirms unchanged horizontal center-of-mass momentum and gravitational vertical acceleration while the free arms keep moving.
- A constant-input test limits settled horizontal excursion to 3 cm and filtered horizontal speed to 0.08 m/s. Small rapid finite-solver vibrations remain; instantaneous substep velocity spikes are not treated as deliberate swings by the displayed meter. A separate 30-second neutral probe retains both initial grips with no slips and about 65% hand reserve / 93% overall reserve.
- New arm commands replay identically in a fresh simulation. Nonfinite joint commands are rejected. The 600-second varied-input stability test now exercises both controller paths.
- Preparation gating, dedicated swing prompts, hidden elbows, elbow bend changes and old-hold regrabs have regression coverage.
- All **12 existing campaign solutions** still solve and replay; **six production HTTP/package checks** pass. This remains separate from camera-mode campaign acceptance.

The retained landmarks were also run through an offline diagnostic with the changed controller. Those movements were made while watching a different physical response; the result is not an equivalent live attempt and is not a completion claim. It does not replace the next camera trial.

Browser control remains disabled in Work settings, so the refreshed interface and this controller's live feel were not inspected. The user has not yet accepted the new arm-driven build.

## Next camera trial

Refresh the local game. Choose Record a local play test, then **Mirror arms · swing and momentum**. Keep shoulders, elbows and both hands visible. Let preparation and the countdown finish automatically. With both relaxed Jug fists still attached, gently sweep both hands left and right; compare the dotted arm targets, physical arms and momentum meter. Then open one hand, reach a little and catch hold 1, using the supporting arm to pull. This separates direction/latency, momentum generation and grip transfer before asking for a complete level.
