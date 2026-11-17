# Levels and presentation

## Visual direction

Extend local Crux's dark slate wall, pale type, mint positive holds, amber edges, turquoise shirt, and compact route selection. Add sculpted-looking 2D silhouettes, recess shadows, chalk wear, and clear contact lips. Slopers should look broad and rounded, pinches narrow with opposed lobes, and underclings visibly expose their lower usable edge. Shape and glyphs must communicate type without relying on color.

The character needs readable shoulders, elbows, wrists, and hands. Use actual physics joint positions for the arms. Small finger illustrations may show the recognized gesture; they must not move the physical contact point. Keep anatomical left/right wrist accents persistent through crossing. Use restrained shadow/occlusion to distinguish the front arm without introducing physical depth that the simulation does not have.

Keep the whole body and next relevant holds visible. During flight include the landing zone in the camera bounds. Camera smoothing cannot alter input coordinates. No automatic zoom should make a reachable hold seem to move relative to the player's control target.

## Campaign proposal

All routes are original and campus-only. Start and finish holds are generous; narrow grips belong in the middle until recognition is proven. Difficulty labels are game-relative, not V grades. Each route requires a separately saved feasible solution and a human camera completion before being called shipped.

| Route | Main lesson | Authored structure | Acceptance |
|---|---|---|---|
| 01 Jug Ladder | Reach, grip, release | Four alternating large jugs and a two-patch TOP | First-time player finishes after brief instructions. |
| 02 Cross Current | Anatomical crossing | Offset jug sequence with a visible cross-reach objective | Cross, hold, and uncross without identity/contact exchange. |
| 03 Edge Etiquette | Crimp gesture and reserve | One required edge between generous jug rests | Wrong fist rejected; proper crimp accepted; unloaded hand recovers. |
| 04 Pendulum Bay | One-arm swing | Wide lateral traverse with room below | Phase changes reach; a static target cannot bypass the gap. |
| 05 Soft Landing | Sloper control | Two broad slopers beneath a supportive jug line | A calm aligned catch holds; an excessive lateral catch slips visibly. |
| 06 Under the Lip | Undercling opposition | High supporting jug plus low inverted patch and next reach | Undercling helps control the move; releasing the only upward support causes loss of support. |
| 07 Pinch Point | Pinch and sidepull | Short opposing lateral sequence | Correct shape and direction matter independently. |
| 08 Quiet Apex | Deadpoint | One supporting jug and a precise edge near swing apex | Catch timing reduces shock; uncontrolled speed makes the edge harder. |
| 09 First Flight | Double-release dyno | Two launch jugs, open gap, broad two-patch landing | A verified zero-contact flight interval, retained momentum, and physical catch. |
| 10 Catch and Carry | Convert catch into next swing | A lateral jug catch followed by an offset target | Catch recoil contributes to the next movement. |
| 11 Crosswind | Cross plus fatigue choices | Crossing section, one pinch, a sloper option, and alternate jug rest | More than one beta is feasible; optional rest costs time but aids reserve. |
| 12 Campus Circuit | Combined mastery | Short mixed route with one undercling transition and one dyno | Full camera playthrough with no foot supports or debug state changes. |

The first playable slice uses routes 01, 02, and 09 as an unlocked introduction set; reorder the final twelve-route campaign only after onboarding trials. Do not withhold dyno testing until route nine is authored.

## Route authoring rules

Use the physical avatar's reachable set to place ordinary moves, and simulated trajectories to size dynamic gaps. Express early spacing relative to arm length, then resolve to meters in authored content. Begin ordinary jug spacing around 0.45–0.70 arm lengths, crossing targets about 0.25–0.50 shoulder widths beyond the midline, and dyno gaps only modestly beyond demonstrated static reach. These are seed values, not proof of solvability.

A required move must have a visible teaching objective. The cross tutorial can require a sustained anatomical crossing while one hand catches a marked patch. A dyno objective requires both contacts absent for at least 80 ms and a later successful catch, rather than merely detecting a fast hand. Outside tutorials, accept alternative legitimate solutions.

Do not copy the old foot-required routes and hide their shoes. Re-author all start states, support geometry, rest positions, route constraints, and finish checks for hand-only play. A level may not require a grip that its selected calibration/profile cannot recognize; offer calibration or a clearly marked Assisted equivalent.

Each route includes an intended beat sequence, allowed alternate beta, start rig pose, hold/patch data, expected resource range at finish, and failure boundaries. A solution replay is validated in a freshly constructed world with default resources. Do not record a successful solution by attaching endpoints or replenishing stamina through debug APIs.

## Feedback event vocabulary

| Event | Visual response | Sound and feel |
|---|---|---|
| Candidate enters reach | Thin patch outline and tiny grip glyph | Usually silent; no repeated hover beeps. |
| Gesture becomes ready | Hand outline resolves into its grip icon | Subtle optional tick in the lab only. |
| Secure static catch | Small chalk puff, contact ring closes | Short material tap with slight pitch variation. |
| Heavy dyno catch | Chalk fan aligned with reaction, body recoil, brief impact accent | Low thump plus brighter grip tap, proportional to impulse with a loudness cap. |
| Near capacity | Hand-local amber ring and occasional chalk flecks | Quiet friction/strain cue; no relentless alarm. |
| Slip | Chalk streak along actual slip direction, opening fingers | Short scrape, then silence once released. |
| Deliberate release | Ring opens cleanly | Soft brush rather than failure sound. |
| Productive pull | Shoulder/arm tension pose and restrained stretch in clothing only | Rising effort accent based on actual motor work. |
| Dyno launch | Short arm/torso trail and an open flight silhouette | Air accent keyed to speed. |
| Clean catch | Tiny text or symbol that fades promptly | Crisp high accent; no resource bonus. |
| Hand recovers | Slow inward ring fill and relaxed hand | Optional small exhale; no credit for vigorous shaking. |
| Finish | Two-hand lock indicator completes, wall light warms | Brief resolving chord after the finish event. |
| Tracking interruption | Clear paused state and missing-hand cue | Neutral notice, never a slip or failure effect. |

Effects are emitted once per simulation event, pooled, and capped. Use deterministic event IDs to avoid duplicate audio during rerenders. Sound pitch variation uses a seeded effects RNG, not the simulation RNG. Retry clears particles, trails, audio voices, pending feedback, and camera offsets.

Keep live camera gameplay at normal simulation speed. Do not use hit-stop that freezes physics while the player keeps moving or automatic slow motion that changes capture timing. A 40–70 ms brightness/outline accent can deliver impact without interrupting control. Optional slow motion belongs in replay.

Camera shake is off by default. An optional small local impact offset is decorative and never moves targeting coordinates. Reduced-motion mode removes decorative shake, trail expansion, pulses, and automatic demo motion while retaining essential physical movement. [W3C reduced-motion guidance](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)

Resume Web Audio from a deliberate user interaction and provide a persistent mute/volume setting. A blocked audio context cannot block gameplay. [Web Audio guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

## Attempt review and progression

After a fall, offer immediate retry first. A secondary review shows the last few seconds of the avatar with physical hands, intent outlines, contact events, and one grounded explanation. An unknown gesture or missed track must not be mislabeled as bad climbing technique.

Track completion, best time, clean catches, optional minimal releases, and assisted status locally. Do not punish careful first attempts with a mandatory speed score. Practice, Assisted, and Standard results remain separate. Clear the route by meeting physical finish requirements, not by filling an arbitrary score meter.

After the twelve-route release, a small local route editor and exportable route files are sensible extensions. A public level service, competitive leaderboard, and accounts are separate projects.
