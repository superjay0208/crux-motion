# Camera centering candidate — November 12, 2026

The user still reports inconsistent, unplayable motion and suggests moving the camera with position. There are six local recordings; no newer clip was present during this iteration. The latest recording is from the previous mirrored-motor build, not a personal attempt on this candidate. Its original video remains private. The existing upstream ports are retained; this change fixes their integration with a desktop webcam's limited frame.

## Behavior

1. The wall view follows the torso with a small dead zone and smooth motion. Nearby next holds nudge the view slightly. Avatar size stays constant as the player climbs instead of shrinking to fit the full route. Bounds keep full arm reach and passive legs visible during fast movement. View coordinates never enter camera input or body physics.
2. At full virtual arm reach, the mapper discards unreachable overshoot. The control origin follows only that excess motion, independently for each anatomical hand. Reversing direction responds immediately. There is no gradual drift toward neutral that could cancel a pull or create a swing while stationary.
3. Near a webcam boundary, the simulation freezes before the wrist leaves view. Sustained missing positions and stale camera/game frames use the same recovery. The preview shows an inner return guide with more clearance than the boundary trigger to prevent repeated pause/resume loops.
4. Bring both hands back comfortably into the guide, match held grips, and settle. About 700 ms of fresh, distinct, settled observations resumes automatically. Duplicate/stale frames, movement, missing hands and wrong held grips cannot complete recovery. Free hands may remain open. Initial starts retain their visible three-second countdown.
5. Rebase maps the returned real hands to the avatar's current hand offsets. The world does not step during relocation: contacts, body position, velocity and stamina stay unchanged. Old velocity samples are cleared; returning hands never creates dyno energy. Manual C uses the same fast recovery for Hand anchors. Cancel, menus, blur and route changes cancel pending recovery.
6. Old saved calibration could silently retain the previous motor controller after a refresh. A one-time control revision switches older settings to Hand anchors while preserving saved grip prototypes, orientation calibration, gain and L/R correction. An explicit controller choice made after migration persists. The centering and hand-anchor swing recording presets select Hand anchors explicitly.

The physical webcam retains its field of view. Digital wall following improves game visibility; automatic freezing and rebasing provide the way to reposition real hands without losing the climb.

## Bugs exposed by testing

Thirty repeated recenter/resume cycles originally lowered the body by **22 cm** despite stationary returned hands. The native soft joint's static gravity deflection was being counted again at every rebase. Its target now includes the calculated support deflection, `-gravity * totalMass / (torsoMass * (2*pi*frequency)^2)`. Planck's installed MouseJoint source defines spring stiffness as body mass times angular frequency squared. The joint still supplies the real support force, so finite directional capacity and fatigue continue to apply. The repeated-reset regression now stays within 1 cm with no slips or artificial launch history.

This also exposed repeated automatic re-catching of a failed grip while a closed hand never left the patch. Hand anchors now requires opening the hand or leaving and re-entering that patch before retrying it. Lone Undercling and exhausted-hold failures remain verified. The previous motor experiment retains its old behavior for comparison.

## Evidence and limits

- **100 automated tests pass**, including eight centering/view checks, two returning-player migration checks, slip retry and the focused recording prompts, plus the existing physics/tracking/recording suite.
- The default anchor pipeline completes Jug Ladder through authored camera landmarks at **10 and 15 Hz**, with 1.8/2.2 gains. Both hands stay inside the return guide throughout. This checks inference-output-to-game integration, not recognition on real camera images.
- Thirty repeated resets preserve the stationary held body, contacts and resources during each pause; resets clear launch history. Camera tests cover jitter, resize/projection round trips, multi-metre ascent and fast ballistic motion.
- All twelve routes still solve and replay identically under each of the two controllers. The semantic pilot runs much faster than a person; this is feasibility evidence, not human completion.
- Retained landmarks from the latest old clip were replayed through current controls. The first segment reaches hold 1 with no overload; the second falls after releases. Both avoid torso inversion. Different feedback and the absence of a live recovery response mean this does not validate the new recovery experience.
- Browser control again failed at tool startup with `failed to write kernel assets`. Current rendering, GPU execution and the person's comfort remain unverified. HTTP/package tests do not replace these checks.

## Focused personal test

Refresh the local game, use the camera and choose **Record a local play test → Centering · follow and reset**. This preset starts automatically after preparation. Sweep gently while both Jugs hold; slowly approach the camera edge with one fist; return both fists into the guide when play freezes. After automatic resumption, try holds 1 and 2 using small reaches and a supporting-hand pull. No mouse action is required during recovery.

New telemetry includes recovery state/reason/progress, per-hand return-zone and movement-speed checks, the moving input origins, and wall-view center/scale. Compare the visible return, frozen ticks/resources, resumed targets and first post-reset body velocity. Excessive recovery frequency, comfortable poses rejected by the guide, mismatched real/virtual movement and momentum lost or gained at reset are failures to fix, even if automated checks pass.
