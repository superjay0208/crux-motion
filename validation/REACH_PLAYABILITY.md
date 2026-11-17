# Reach and detection correction — November 9, 2026

Historical record: subsequent personal recordings showed that this absolute-reach approach still failed. The active controls now use comfortable-pose centering, compact relative motion and mid-climb recentering. Follow [the November 10 recorded findings and retry instructions](RECORDED_FINDINGS.md) for the current build. The counts, gain values and personal-retry instructions below describe the earlier candidate.

The user reported that the avatar's hand moved but stopped short, preventing progress beyond the opening holds. The original semantic route solutions bypassed camera mapping and therefore did not establish camera playability.

## Faults addressed

1. **Fixed camera scale:** the original default divided wrist displacement by a normalized reach of 0.44. In an independent 1280×720 fixture with a 200-pixel real arm extension, that produced only 0.266 game metres against a 0.745-metre avatar arm. The new mapper uses aspect-correct pixel measurements, shoulder width, and robust upper/forearm lengths. It scales with camera distance, bounds full reach, and offers sensitivity control. Extra gain grows toward extension so it does not undo a tucked pull pose.
2. **Fingers moved the aim:** the target used the palm-landmark average. Curling or spreading fingers changed that average even with a stationary wrist. The target now follows the wrist, with a faster position filter and stable elbow-bend selection near straight poses.
3. **Finger uncertainty froze both arms:** input quality combined positional tracking and a recognized grip. One unclear shape prevented both arms updating and could pause play after 120 ms. Position and shape are now independent. Each visible arm updates separately. A confidently tracked pose wrist can continue movement if finger landmarks vanish, but cannot acquire a hold without a confirmed gesture. Missing positions get 350 ms of protection before pause, with no inferred release. Fresh-frame protection also accounts for actual inference cost within a bounded interval.
4. **Partial calibration disabled untrained shapes:** having two prototypes previously restricted recognition to those classes. Untrained classes now retain automatic geometry recognition. Added distal-joint and knuckle features distinguish hooked fingers from a rounded palm and a fist. Old ten-feature saved samples remain readable. Settings can switch between automatic and personal recognition.
5. **Early closing re-grabbed the old hold:** a deliberately released hold is ignored while the requested aim clearly moves away. Physical hand intersection and compatible grip are still mandatory for new catches. Brief known-shape flicker gets a short holding grace; sustained wrong grips still weaken/slip, and wrong-class acquisition remains blocked.
6. **The opening lesson required too much technique:** Jug Ladder's numbered holds now sit at (-0.22, 1.34), (0.14, 1.58), and (-0.10, 1.82), with 0.18-metre patches and a matched top at 2.14. This supports ordinary alternating arms before the campaign's larger traverses. Aim markers, a NEXT ring, reach percentages, and contextual pull/reach instructions explain the physical controller.

The automatic body mapping no longer requires a nine-step calibration every time the camera opens. Personal shape/orientation capture remains available through Calibrate. No arm/body teleport, automatic upward impulse, infinite grip, foot support, or distant magnetic catch was added.

## Evidence

- TypeScript and production build pass.
- **43 tests pass.** Seventeen new checks extend the previous 26.
- Three complete Jug Ladder tests pass authored, anatomically labeled hand/pose landmarks through `Camera.process`, identity association, gesture features/classification/latching, reach mapping/filtering, input protection, and the real 120 Hz simulation. Cases use 15 Hz at 100% gain, 10 Hz at the default 115% gain, and 15 Hz at compact 135% gain. They alternate left/right arms, release with spread fingers, pull with the supporting arm, and match TOP. They do not attach or teleport hands.
- Five articulated finger fixtures distinguish Jug, Crimp, Sloper, Pinch, and Release. Further tests check partial calibration, wrist-aim stability across grip changes, pose-wrist movement without finger acquisition, brief versus sustained wrong grips, independent position protection, distance/aspect scaling, crossing direction, and reach bounds.
- **12/12 campaign solutions and identical fresh replays pass.** Jug Ladder's solution was regenerated for the new layout using natural first-hand selection. The other eleven routes retain their demonstrated solutions.
- **5/5 package checks pass** on the standalone localhost server. The prebuilt release and semantic demos are current.

These fixtures exercise control logic after image inference. They do not establish real-image recognition precision/recall or prove that the corrected controls feel right to this user. Browser control returned "Local browser use is disabled in Work settings" during final inspection. The current UI could not be reloaded or visually verified by the agent, and no new screenshot was taken.

## Personal retry

Refresh `http://127.0.0.1:4318/`, choose Use your camera, then arm Begin climb. Keep one Jug fist close to its shoulder to pull the body upward. Open the other hand, reach toward NEXT, then close into Jug. Try the first two numbered holds before the rest of the route. A fully extended, visible arm should approach 100% reach on its card. Settings provides Comfortable, Compact, and Small movements sensitivity options without a camera restart.

Record whether the hand still stops short, whether the reach percentage saturates, whether the supporting fist is pulling, and whether any pause is due to a missing position or an unclear grip. Personal grip accuracy, ordinary crossings, and dyno feel remain separate acceptance checks.
