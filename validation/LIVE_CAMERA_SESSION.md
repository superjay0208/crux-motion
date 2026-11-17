# Personal camera session — November 9, 2026

The requested sequence is grip recognition, slow and fast crossed arms, then camera-driven dynos on First Flight. The source-access failure below occurred earlier in the session; it reopened during the subsequent [hands-free start correction](HANDS_FREE_START.md). Labeled personal grip/crossing/dyno outcomes remain pending.

The user confirmed that returning both hands starts the climb after the countdown. The start interaction has personal-camera confirmation; the remaining grip, crossing, and dyno tests are separate.

## Changes completed during the session

- Grip names are **Jug, Crimp, Sloper, Pinch, and Undercling**, as requested. The hand shape is described beneath the name. Undercling is a curled grip with the calibrated upward-palm orientation; it is not the sloper shape.
- The grip cards read the live recognition state rather than only the last game input accepted when both hands were clear.
- Persistent unknown classifications now become visibly Uncertain even at low similarity scores. This never synthesizes an intentional release.
- A protected physical input can no longer retain a misleading healthy flag. Per-hand feedback distinguishes hidden/ambiguous identity, hidden shoulder, unclear shape, and shape confirmation.
- The camera preview has a minimum height and cannot collapse into a thin strip when the sidebar fills up.
- The production asset checks now exercise the same standalone server used to play. Font paths are resolved relative to CSS, and font MIME/binary signatures are checked.

The current build passes TypeScript, 26 tests, and all five production package checks. Regressions cover persistent recognition uncertainty without a release and the new hands-free action timing. The existing twelve physics solutions are unchanged. [Renamed controls capture](screenshots/hold-names.jpg) was taken in practice mode; it is not evidence of camera recognition.

## Source limitation encountered

The browser initially processed a live video stream, with readings around 13–17 inference frames per second at observed moments. These opportunistic readings are not a sustained performance measurement. No labeled recognition corpus or completed human route trial was collected.

After a reload, opening video repeatedly returned `NotReadableError`. The game's camera selector listed only **OBS Virtual Camera** and System default. No physical webcam appeared in that enumeration. This establishes a source-access failure, not which external application or driver caused it.

The earlier handoff left OBS Virtual Camera selected in settings. The source reopened during the start-flow correction and live video inference resumed. If this source-access failure recurs, supply a working OBS webcam feed, or connect/enable the intended physical webcam and reopen settings to refresh the device list. Then apply camera settings and verify framing/calibration.

## Next live checks

1. Hold relaxed fists for five seconds: both cards should report Jug. Then test Crimp, Sloper, Pinch, Undercling, and spread-finger release individually. Record the intended shape and displayed result; recalibrate classes that overlap.
2. Hold one Jug and one open hand while crossing and uncrossing slowly, then at ordinary playing speed. Verify anatomical L/R continuity and count protective pauses. Do not infer identity success solely from synthetic tests.
3. Complete Jug Ladder and Cross Current with camera input, then test First Flight. Compare early, near-apex, and late release timing. Record catch control and whether failures have understandable causes.

Grip accuracy, physical-camera performance, crossed-arm usability, and human dyno feel remain unverified. No webcam images or video were saved to this validation folder.
