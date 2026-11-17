# Hands-free start correction — November 9, 2026

The user reported that Begin climb did nothing, and correctly pointed out that using the mouse prevents keeping both hands posed in view. The old handler checked two-hand recognition at click time and wrote a refusal into a status line that the HUD could overwrite. Calibration had the same click-time requirement and mixed setup/mouse motion into its collected samples.

## New behavior

Begin climb and Resume climb always arm immediately in camera mode. The player can put the mouse down afterward. The wall shows an armed heading, per-hand readiness checks, a Cancel start button, and a three-second countdown once the held grip requirements are satisfied. A short uncertain interval freezes the countdown; sustained loss resets it. Clock, stamina, contacts, and physics stay paused until the countdown completes. Retry automatically arms this flow.

Escape, opening another menu, leaving the window/tab, changing routes, and starting a review cancel pending actions. Cancel start disarms without starting physics. Practice controls retain their immediate start behavior.

Calibration now arms on click without requiring a click-time pose. Fresh raw tracking starts a preparation countdown even if the gesture classifier is Uncertain. Samples are collected only in the following window, with at least eight fresh observations from each hand. A hidden hand restarts preparation and discards the incomplete capture. Shape/orientation capture lasts at least 1.5 seconds; comfortable-reach measurement lasts four seconds. No extra click is required while holding a pose.

## Verification

- Type checking and production build pass.
- 26 unit/physics/interaction tests pass, including five new timing/cancellation cases.
- All five package checks pass against the standalone launcher.
- In the production browser with a real active video stream and hands hidden, Begin climb immediately changed to Start armed and Cancel start, with explicit left/right hand warnings and the attempt clock still at zero.
- Confirm framing armed a delayed calibration capture with both hands absent. Cancel capture worked without saving a pose.
- Cancel start, keyboard Escape while the start button had focus, and retry were checked in the browser. Retry immediately re-armed the action, with the clock still at zero while hands were missing.
- The start card was inspected at laptop and narrow window sizes, and temporary viewport overrides were reset. [Armed-start capture](screenshots/hands-free-start.jpg) includes only the software wall, excluding the webcam preview.

The camera source reopened and inference was running during the browser check. The user then confirmed: **"Yes, it starts after the countdown."** This verifies the personal hands-return/countdown start transition in addition to the deterministic timing tests. It does not establish per-gesture accuracy, crossing reliability, or a human dyno completion.

The shared game is left unarmed at Begin climb for the user's next deliberate click. One click is sufficient; both hands may return afterward.
