# Game design and controls

## Core experience

Crux Motion turns the space in front of the player into a comfortable movement envelope. The game maps that envelope onto the climber's reach. The player does not have to jump, hang from anything, squeeze hard, or reproduce real climbing loads. The avatar does the campus climbing.

A route lasts roughly 30–90 seconds after learning it. The interesting choices are which hand moves, which grip fits, whether to settle or carry the swing, when to unload a tired arm, and when to commit to flight. Reaching the top requires two secure hands for 0.35 seconds. The player can inspect a route without spending stamina and retry immediately.

## First minute

1. Show a short prerecorded in-engine demo and a clear **Use camera** button. No permission request before that action. **Try practice controls** remains available.
2. Request video only. Offer camera selection and a mirrored preview, with shoulders, elbows, wrists, and hand outlines. The game asks for an upper-body frame, not a full-body view.
3. Calibrate comfortable reach, anatomical hand identity, an open release signal, and a relaxed jug grip. Show a successful left/right response immediately.
4. Place the avatar on two large start jugs while the simulation is paused. Match the starting gestures, then intentionally start. There is no stamina drain during setup.
5. Teach one reach, one grip, one release, and a two-hand finish. Introduce the full gesture lab only when needed.

Full gesture calibration should take about 45–75 seconds, but route one should need only a shorter jug/release setup. These are usability targets to measure.

## Control vocabulary

| Player action | Game intent | Physical result |
|---|---|---|
| Move a free hand | Reach toward a shoulder-relative target | Shoulder/elbow motors move the real arm within speed, torque, and reach limits. |
| Form the hold's grip while reaching it | Attempt contact | The hand must actually reach a valid contact patch with the correct gesture and available occupancy. |
| Keep the grip while drawing a held hand toward the shoulder | Pull | The attached hand stays at the wall; arm contraction pulls or rotates the body. |
| Gradually extend the held arm | Lower or absorb | The body settles or swings under a limited eccentric controller. |
| Move a free arm rhythmically while hanging | Pump or counterbalance | Internal arm motion redistributes mass and can add swing energy through the fixed contact. |
| Cross the hands | Cross reach | The same anatomical hands cross on screen. There is no side-based relabeling. |
| Deliberately spread the fingers | Release that hand | The contact is removed after a short recognition confirmation; existing velocity is retained. |
| Pull, release, then reach | Dyno | Supported work becomes flight velocity; a real catch changes momentum. |
| Lower and relax one free arm | Rest that hand | Its reserve recovers if unloaded; the remaining hand bears the load. |

For free arms, maintain close visual correspondence. For a loaded arm, camera motion expresses an attempted movement rather than overriding the wall constraint. A small target outline shows the player's request when the arm cannot follow. This distinction is essential to having both real-time control and physical weight.

## Hold shape and orientation

Hold **shape** and **orientation** are separate. A jug can face upward, sideways, or downward; undercling is an orientation/use pattern rather than a separate material. The art, gesture prompt, and allowed force directions must agree. REI's hold guide supports these qualitative distinctions; the gesture shortcuts and numerical capacities below are this game's design. [Hold reference](https://www.rei.com/learn/expert-advice/climbing-holds.html)

| Hold | Relaxed camera gesture | Physical identity | Teaching cue |
|---|---|---|---|
| Jug | Curled fingers, relaxed closed hand; thumb position forgiving | Generous patch and broad upward-support range; best catch/rest hold | “Curl and catch.” |
| Crimp edge | Compact hook shape with bent fingers; distinguish from a full fist using calibrated finger angles | Small patch, lower reserve endurance, little tolerance for a fast sideways catch | “Hook your fingers.” |
| Sloper | Cupped hand with fingers together; mild curl is allowed | Rounded silhouette, narrow useful force direction, sliding under poor alignment | “Cup, then settle underneath.” |
| Pinch | Thumb opposed to a bent index/middle group in a C shape | Two opposing lobes; lateral capacity depends on orientation | “Bring thumb and fingers together.” |
| Undercling orientation | The base grip plus a palm-up/scooping orientation cue | Reaction direction reverses; useful with another supporting hand or briefly during movement | “Scoop while the other hand supports.” |
| Sidepull orientation | Base grip with the thumb edge turned toward the indicated side | Supports useful sideways tension rather than universal upward support | “Pull across the hold.” |

Do not require a literal loaded full crimp or precise thumb-over-index lock. Those are unreliable camera distinctions and unnecessary for the game. Label the input as a crimp gesture. A user-specific comfortable substitute can be assigned in Assisted mode, with the physical hold behavior unchanged.

The release gesture must not be the same as the sloper gesture. Use a visibly **splayed**, extended hand for release and a **cupped, fingers-together** hand for a sloper. Calibration must prove that distinction before enabling sloper campaign routes. If it fails, offer a different user-calibrated release signal or an explicit auxiliary release button in Assisted mode. Do not silently turn all open hands into releases.

## Contact rules

The hand lifecycle is **Free → Ready → Acquiring → Holding → Slipping → Free**, with tracking health represented separately. A gesture may become Ready before the hand reaches the hold; that permits fast catches. Acquiring is physical capture, not a long dwell on a moving target. Holding requires both retained contact and a compatible gesture. Slipping is visible progressive failure under load.

Wrong known gesture: show the hold's cue and reject acquisition. Unknown gesture: show uncertain tracking and allow the documented brief continuity interval for an existing contact; never invent a new grip. A deliberate release wins over acquisition in the same tick. Regrabbing the same hold requires release completion and a new valid grip, preventing sticky open-close loops.

Large matching jugs have two authored contact patches. Both hands may match only if each occupies a valid patch. Small holds have capacity one. Hand transfers reserve and release slots atomically. The second hand cannot briefly give free support before the first releases.

## Dyno interaction

Teach four phases: **load, pull, release, catch**. A useful initial motion is to extend the arms comfortably, draw them toward the shoulders while gripping, release near the upward swing, and reach toward the landing hold. No physical jump is part of the input vocabulary.

Support single-hand deadpoints, one-hand releases into a continued swing, and double releases into flight. Timing, available reserve, actual simulated speed, and target direction determine the result. The route never requires a hidden jump key. A brief launch trail, rising air sound, and a crisp impact accent make the sequence readable. A catch should recoil through the elbow, torso, and dangling legs instead of freezing the body.

Aim assistance changes the requested hand target only within a small declared radius. It cannot attach a distant hand, increase limb length, or rewrite a trajectory. In Assisted mode, wider gesture confirmation and a visible target bias are allowed. Standard mode remains the baseline for physics validation.

## Fatigue and recovery

Use two hand rings as the primary resource display, plus one small overall reserve bar near the hip. Simulated load, grip family, bent-arm effort, and repeated pulling consume resources. Gesture confidence is not muscle effort. Camera jitter and a tracking outage must never consume stamina by themselves.

An unloaded hand can recover. On a stable jug, lower the free hand and relax it; optional gentle movement gives a chalk animation but no special recovery multiplier. The supporting hand drains faster because it bears more load. Ordinary hanging does not refill the overall reserve indefinitely. Generous rest jugs can slow its drain; explicit checkpoint practice resets are marked as practice.

At low reserve, reduce active torque and grip capacity smoothly, show hand-local warnings, then allow a physical slip when capacity is insufficient. Do not drop both hands instantly because a global bar reaches zero. Resource behavior must be deterministic and explained by the visible load.

## Additional features worth building

- **Gesture lab:** a safe wall that shows the requested versus recognized grip, identity, and contact direction. It is available without campaign unlocks.
- **Swing trail:** a short optional torso trail helps players understand release timing without exposing force equations.
- **Catch quality:** a small “Clean catch” accent rewards good timing and low shock; it never secretly grants strength.
- **Attempt review:** replay the avatar and hand intent, with a short cause label such as “wrong grip,” “hand passed above,” or “grip overloaded.” Tracking uncertainty is labeled separately.
- **Personal best ghost:** replay locally stored semantic inputs, not webcam video. Optional after the core campaign works.
- **Practice checkpoint:** restart a difficult section with restored resources, clearly separate from a full-route clear.
- **Seated and compact reach calibration:** smaller comfortable movements produce the same avatar reach and capped speed. Accessibility must not depend on moving farther or faster.

## Player interface

The wall occupies most of the screen. Top-left shows route and one current teaching cue. Bottom-left has pause, retry, routes, and camera settings. Hand rings show reserve and contact state; a small outlined glyph shows the grip. A collapsible mirrored preview sits away from the route. Camera trouble produces a clear banner with the needed correction.

Menus, pause, and retry must be usable by ordinary controls from day one. Optional hand dwell buttons operate only while paused and cannot accidentally trigger during climbing. Pause freezes all gameplay clocks. Returning from a pause requires stable tracking and an intentional resume; raising the hands into the frame must not immediately launch the climber.
