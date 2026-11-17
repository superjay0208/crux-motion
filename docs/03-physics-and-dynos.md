# Physics and dynos

## Physical model

Keep Planck 1.5.0 initially so the new project can reuse the known browser toolchain. Use meters, kilograms, seconds, radians, x right, y up, and gravity initially `(0, -9.81)`. Keep a fixed 1/120 second simulation tick. Rendering and camera inference have independent schedules. Planck revolute joints support angle limits and torque-limited motors; these are the starting building blocks. [Planck joint reference](https://piqnt.dev/planck.js/docs/joint/revolute-joint.html)

Use an **eight-body initial rig**: one torso/head/pelvis composite, two upper arms, two forearms, two hands, and one passive lower-body ballast. Seven revolute connections join shoulders, elbows, wrists, and the lower body. Render two dangling legs around the ballast pose; they do not claim separately simulated knee dynamics. Later split legs only if the added degrees of freedom improve measured feel.

Initial mass fractions: torso composite 0.55, each upper arm 0.035, each forearm 0.025, each hand 0.01, lower-body ballast 0.31. They sum to 1.00 and are **game tuning**, not an anthropometric estimate of the player. Start with total mass 60 kg and an arm length around 0.75 m including the hand. Validate mass sums and anchor geometry automatically.

Use fixed segment lengths, finite moments of inertia, bounded shoulder rotation, anatomically suggestive elbow limits, and limited wrist alignment. Treat limits as animation/game constraints to test, not clinical ranges. A passive hip hinge with mild damping gives the lower body follow-through without any foot controls. It supplies no ground reaction until a fall lands on the mat and ends the attempt.

The wall is a background plane, not a solid 2D polygon behind every limb. Holds are interaction patches; selected foreground volumes can be explicit obstacles later. Disable arm-versus-arm and arm-versus-torso collisions to allow projected crossing. Keep them in stable visual depth layers. This is an explicit 2D projection convention, not a claim of full 3D self-collision or barn-door physics.

## Arm controller

Free-arm input defines a reachable hand target and an elbow preference. Convert that into shoulder/elbow joint goals using continuous inverse kinematics, then drive joint motors with bounded angular velocity and torque. Motors operate internally between connected bodies. Never use a ground-attached mouse joint to drag a free hand through the air; that would give the character an external source of support.

While holding, the hand constraint owns the world contact. Camera contraction requests elbow flexion and a compatible shoulder angle. The torque-limited controller pulls the torso toward the anchor. Two held hands share the result through the solver, rather than each independently setting torso position. Incompatible intentions produce bounded effort and visible target error, not an unstable fight between infinite servos.

At a conceptual level, each joint requests `desiredSpeed = clamp(Kp × angleError - Kd × angularSpeed, ±speedLimit)` and has a fatigue-dependent torque ceiling. Avoid simultaneously adding a separate PD torque and a motor that already implements the same effort. Record actual motor torque and angular velocity for effort/work telemetry.

Contraction is calibrated to the person's comfortable arm range. Repeated full-range pulls must not hit a hidden one-time accumulator limit. Extension resets the available movement naturally. Neither recalibration nor zoom may alter physical arm length during an attempt.

When both hands are free, internal motors can change pose and rotational distribution but cannot accelerate total center of mass upward. Verify this directly. Do not carry local Crux's residual upward torso forces or leg-support gains into this system.

## Finite directional grip

The most important physics spike is a bounded contact constraint. An infinite positional weld plus a cosmetic slip timer is insufficient. The solver must enforce both magnitude and allowed reaction direction before applying an impulse.

Use a project-owned `GripConstraint` adapter for the pinned Planck release. The local installed source exposes `Joint.initVelocityConstraints`, `solveVelocityConstraints`, `solvePositionConstraints`, and reaction-force reporting. `MotorJoint` is a useful source reference for effective mass and clamped accumulated linear impulse. Keep adapted code and its license in the new project; never edit `node_modules` or quietly depend on an unpinned engine internal.

Start with a bounded MotorJoint only for a jug-only spike. It exposes maxForce/maxTorque, but its isotropic cap alone is **not** the final directional grip solution. [MotorJoint reference](https://piqnt.dev/planck.js/docs/joint/motor-joint.html)

For the final constraint:

1. Define a fixed patch frame with preferred support direction `n` and perpendicular tangent `t`. These directions mean **force exerted by the hold on the hand**.
2. Solve for a candidate point impulse using the hand's point velocity, effective mass, and a soft positional bias toward the acquired anchor.
3. Project the **accumulated** impulse into the hold's feasible set before applying the difference from the previous iteration. Project any warm-start impulse into the new set too when fatigue or grip quality changes.
4. Start with a convex truncated cone in local coordinates: `0 ≤ lambdaN ≤ capacityN × dt` and `abs(lambdaT) ≤ min(capacityT × dt, muGame × lambdaN)`. Use separate authored profiles for rounded slopers, positive jugs, pinches, and oriented holds. A broad positive jug can use a wider finite convex region; all variants include zero.
5. Compute telemetry once from the solved impulse divided by the step duration. Do not multiply a force returned by `getReactionForce(1/dt)` by another `1/dt`.
6. Bound bias correction and soft-constraint parameters. No post-solve position projection may secretly restore an impossible grip. On sustained drift or overload, mark Slipping, then remove the constraint.

This is a stylized in-plane contact model. `muGame` encodes directional gameplay tolerance; it is not a measured skin/resin friction coefficient. Real wall-normal friction is not resolved in a front-view simulation.

The accumulated-impulse clamp and soft-constraint approach are supported by Box2D's solver discussion; the specific hold feasible sets are our engineering proposal. Box2D 3 documentation is useful for principles, but its C API and substep parameter are not Planck 1.5 APIs. [Solver discussion](https://box2d.org/posts/2024/02/solver2d/), [Simulation principles](https://box2d.org/documentation/md_simulation.html)

Use frequency/damping tuning and fixtures, not an arbitrary enormous explicit spring constant. Start the custom constraint spike around 6–10 Hz and damping ratio 0.8–1.0, then measure settling, catch recoil, and drift. If 120 Hz cannot meet the gate, compare two 1/240 second world steps per game tick, updating constraints and fatigue with the correct substep durations. Additional solver iterations are not equivalent to substeps.

## Underclings without feet

For a basic upward-facing jug, the hold-on-hand support direction is approximately up. For an undercling, it is approximately down. The other hand must supply the upward reaction and often opposing horizontal force. Undercling engagement may improve control or a transition while increasing demand on the supporting hand.

Consequences the implementation must demonstrate:

- A sole ordinary undercling does not provide static upward support for a dangling body.
- Two down-facing underclings cannot indefinitely suspend the body by an invisible force.
- A jug/undercling pair can be useful for opposition if the jug has enough capacity.
- A physical wrapping lip can be authored as an additional positive contact patch; that is a different patch, not a global exception for all underclings.

REI describes underclings as pulling upward on the hold and emphasizes useful foot positions. The campus consequences above are our force-balance inference and design constraint. [Undercling reference](https://www.rei.com/learn/expert-advice/climbing-holds.html)

## Acquisition and catch

Perform a sweep of the **physical hand contact point** from the previous to current simulation position against eligible hold patches. The visual target alone cannot catch. Use a small collision tolerance, initially 0.025 m; keep any target-assist radius separate and visible.

A valid attempt requires ready grip intent from fresh identified observations, compatible orientation, a feasible hand/arm configuration, available occupancy, and actual patch intersection. Select one candidate with stable priority, proximity, and hold ID tie-breaking. Reserve occupancy atomically before creating the constraint.

At capture, create the constraint from the existing hand pose and the patch intersection. Do not set a body transform or zero any velocity. Ramp finite capture capacity over 30–60 ms and let the controller absorb the catch by allowing elbow extension. Ramp time is tuning: if it makes legitimate dynos impossible, adjust the route/capture profile and verify it rather than secretly snapping hands.

A catch can fail because the hand misses the patch, uses the wrong gesture, approaches outside the permitted direction, or demands more stopping impulse than the grip can sustain. Show the actual cause. The same rules apply to the first and second hands of a double catch. Cosmetic impact effects use the resulting impulse; they cannot grant strength.

Start a slip warning when load approaches capacity, then slip under actual saturation/drift. An initial rule is more than 0.03 m anchor separation for 50 ms, or 0.08 m immediately. Tune by hold patch size and record final values. Time-based grace may smooth the decision to detach but must not allow force beyond the capacity bound.

## Swinging and energy

A single contact makes a pendulum with changing shape and inertia. Moving the free arm, contracting the attached arm, and controlling the elbow can add or remove energy through actual work. Two contacts can damp or redirect the swing depending on geometry. Releasing one transfers the remaining load immediately through the solver.

Use zero global linear damping during flight and modest internal joint damping. If a small air-drag model is later introduced, include it explicitly in trajectory expectations. Excessive damping makes every release look floaty or dead. Keep the body free to rotate in the wall plane. The leg ballast should lag the torso and follow through at a catch. Do not animate a fake swing over a motionless center of mass.

Maintain an energy/debug ledger: total kinetic energy, gravitational potential energy, motor work, damping loss estimate, contact impulse, and any explicit assistance. This need not be exposed to players, but it should reveal energy created by reset, capture, warm start, or target discontinuities.

## Dyno state machine

Use **Supported → Loading → Pulling → Released → Flight → Catching → Supported**, with a direct transition from Flight to Falling after an unrecoverable miss. State labels explain feedback and metrics; they do not drive an animation that overrides physics.

- Loading: at least one secure contact, sufficient reserve, fresh tracking, and controlled arm extension.
- Pulling: intentional contraction requests bounded motor work. A visible readiness cue may reflect actual upward/tangential speed, not a timer charging a free jump.
- Released: deliberate grip release removes the relevant constraint. Preserve all body velocities.
- Flight: zero contacts is allowed. Gravity changes center-of-mass motion; arm motors aim for a catch without adding external lift.
- Catching: actual hand sweep and prepared gesture create a finite constraint; the body recoils and may slip again.
- Falling: the body has crossed the route's failure boundary or hit the mat. Camera uncertainty invokes protected pause, not a fall.

Release timing matters without an invented boost: an early release can be short, a late release can carry sideways or downward, and a well-timed release reaches farther. Let these outcomes emerge and show them in tutorial replays.

No launch impulse is planned for Standard mode. If testing shows a comfort issue, first increase calibrated input gain, tune bounded joint torque, and shorten the gap. An optional Assisted mode may use a separately budgeted contact-phase motor gain. Record it in replays and never add a second airborne impulse on top of the same work. A zero-contact arm flap must never become flight propulsion.

## Resource model

Keep hand reserves `Rleft`, `Rright` and overall reserve `E` in `[0,1]`. For each hand define a load ratio from actual solved reaction magnitude divided by a fixed fresh reference capacity for that hold family. Use bounded bend effort and positive motor-work terms as additional inputs. Avoid dividing by an already fatigue-reduced capacity to create an uncontrolled feedback singularity.

An initial design is `dR/dt = recoveryWhenUnloaded - baseGripDrain - loadDrain × loadRatio² - workDrain × positiveWorkRateNormalized`. Overall reserve loses a small supported baseline plus bounded active work; ordinary idle hanging gives no refill. Different holds change drain coefficients and capacity.

Starting targets for stationary tests: full fresh two-jug hang 60–90 seconds, a fresh one-arm jug hang 20–35 seconds, a loaded crimp 6–12 seconds, and a genuinely unloaded hand gaining about 4–6% reserve per second. These are accelerated game resources and must be tuned against route completion, not interpreted as real endurance.

Apply capacity and torque multipliers smoothly, for example a monotonic curve with a low residual floor rather than a discontinuous 100-to-zero change. At exhausted reserve the residual capacity should eventually be insufficient for the required load. A finishing result must not occur after physical contact has failed.

Camera confidence gates whether an intent is trustworthy; it never multiplies simulated strength. During the 120 ms tracking continuity window, normal physical load still drains reserve. During protected pause, all simulation clocks stop. The same pause policy governs stamina, slip, finish, dyno, and scoring.

## Initial tuning sheet

Use body weight `B = totalMass × gravityMagnitude` and avatar arm length `L` to scale starting values. For the proposed 60 kg, 0.75 m rig, B is about 589 N. These values seed P2 fixtures; they are not empirical climbing strength data or final balance.

| Parameter | Initial value or experiment |
|---|---|
| Shoulder motor torque ceiling | 0.20 × B × L per shoulder, about 88 N·m. |
| Elbow motor torque ceiling | 0.17 × B × L per elbow, about 75 N·m. |
| Wrist motor torque ceiling | 0.025 × B × L, about 11 N·m; reduce if wrist locking hides catch recoil. |
| Joint target speed | Start at 3.5 rad/s, compare 2.5–5 rad/s without changing physical reach. |
| Positive jug capacity | Preferred-axis cap 1.8 × B; tangent cap 0.9 × B, broad authored direction sector. |
| Crimp capacity | Preferred-axis cap 0.95 × B; tangent cap 0.35 × B, with faster reserve drain. |
| Sloper capacity | Preferred-axis cap 1.0 × B; tangent cap 0.25 × B, narrow direction sector. |
| Pinch capacity | Preferred-axis cap 1.3 × B; tangent cap 0.6 × B, authored orientation. |
| Undercling-oriented patch | Start from its shape-family caps with a downward preferred reaction; no upward exception. |
| Fatigue capacity multiplier | Smoothly reduce from 1.0 to 0.10 as reserve empties; test combined hand and overall effects. |
| Standard target assistance | At most 0.04 m of target bias; final physical capture tolerance remains 0.025 m. |
| Capture capacity ramp | Compare 30, 45, and 60 ms on identical launch/catch fixtures. |

The contact-region cone and torque/work limits must be tuned together. A large force cap does not create a valid direction, and a high capacity does not let a hand reach farther. Record final values in one versioned profile rather than scattering constants across controller, UI, and route files.

## Nonnegotiable physics fixtures

Before full campaign work, pass single and double jug hang, passive pendulum, supported pull, repeated pull cycles, momentum-preserving release, ballistic flight with moving arms, high-speed catch, directional sloper slip, unsupported undercling fall, jug/undercling opposition, capacity reduction, and crossed-arm capture. Add mass/length assertions and a ten-minute randomized command soak with finite-state checks. The exact numeric gates and evidence requirements are in the delivery plan.
