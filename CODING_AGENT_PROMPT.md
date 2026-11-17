# Coding agent assignment

**Implementation update, November 9, 2026:** a playable 0.1.0 candidate now exists in `game/`. Start with [implementation status](IMPLEMENTATION_STATUS.md) and [validation evidence](validation/REPORT.md). Preserve the working implementation and focus continuation on the remaining real-camera acceptance work. The assignment below is the original product brief, not an instruction to replace the existing game.

Implement **Crux Motion**, a new camera-controlled 2D campus climbing game, inside `D:/Climbing/crux-motion`. The user requested this as a separate version building on the existing climbing analyzer, 3D game, and 2D game.

Read `README.md`, `GOAL.md`, then `docs/00-existing-projects.md` through `docs/06-delivery-and-validation.md`, and `research/SOURCES.md` before implementation. Treat the goal and acceptance gates as the assignment; do not stop after building a mockup or mouse-only prototype.

## Required outcome

Create a playable local browser game in which a webcam captures both arms and hand gestures. Anatomical left/right identity must persist when arms cross. Players climb using detailed jug, crimp, sloper, pinch, sidepull, and undercling-oriented holds; build swing through arm motion; release into dynos; physically catch; manage hand and overall stamina; and finish twelve authored routes. Focus on upper body. Feet remain passive and never attach or provide hidden support.

Preserve the local Crux game's restrained slate-wall presentation, original character identity, compact controls, route structure, and two-hand finish concept. The user named Roblox **CRUX** as the movement-feel reference. Do not confuse it with the local Crux project or claim its internal mechanics have been verified.

## Work order

1. Establish the independent TypeScript/Vite/Canvas/Planck project and selective source reuse. Preserve sibling projects and existing saves.
2. Prove real camera feasibility first: calibration, named hands, crossings, detailed gesture confusion, model/provider choice, and frame-age telemetry. Compare paired MediaPipe tasks with Holistic.
3. Build the articulated campus rig and finite directional contact spike using deterministic practice input. Pass the isolated physics gates before authoring many routes.
4. Integrate camera intent through the same semantic input interface. Add gesture-aware contact, protected pause, resources, and recovery.
5. Complete three polished routes including a cross and a double-release dyno. Obtain actual camera playthrough evidence, then expand to all twelve routes.
6. Complete the performance, lifecycle, accessibility, privacy, route, replay, visual, and human-feel checks. Deliver a current local build and Windows launch instructions.

## Implementation rules

- Keep model observations, calibrated intent, simulation state, and rendering separate.
- Do not sort hands by x, treat array index as identity, infer a release from missing landmarks, or use a camera confidence score as grip strength.
- Make sloper cupping distinct from deliberate finger-splay release. A wrong known gesture must have observable consequences.
- Keep hand/pose coordinate frames explicit. Separate mirrored display from unmirrored model input and test the exact convention.
- Drive arm joints with bounded internal actuation. Never teleport a live hand or torso to a target, pin hands kinematically for final gameplay, or add free upward force in flight.
- Enforce finite grip capacity and load direction inside contact resolution. A lone ordinary undercling must not suspend the avatar.
- Allow zero-contact flight. Preserve momentum on release and absorb the catch physically.
- Use no foot-swap rules, loaded-foot finish gates, or old foot-supported recovery checks.
- Treat all proposed numbers as tuning hypotheses. Change them when evidence warrants it and document the final setting and reason.
- Keep camera frames local and unrecorded by default. Pin model/WASM assets and preserve licenses.
- Build and inspect actual rendered behavior. Automated state checks cannot prove that gestures feel responsive or that effects are visible.

## Reporting and completion

Maintain a concise implementation status and evidence log in this project. Record which milestone passed, which device/browser/model was used, commands and actual results, route completions, and unresolved concerns. Report camera accuracy from held-out labeled trials; report latency using the documented measurement distinction; report physics from independent fixtures and real gameplay.

If a feasibility gate fails, pursue the listed alternatives before broadening the game. Do not conceal a failure by replacing the requested control mode, labeling synthetic input as a webcam test, or silently enabling unlimited grip. If external human testing cannot be performed, finish the work that can be verified and identify that remaining gate precisely.

The current assignment is local implementation and validation. Do not publish to an external service unless the user separately requests it. The final handoff should give the playable local location, concise launch steps, what was tested, and any material limitations.
