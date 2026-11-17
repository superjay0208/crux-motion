import { MouseJoint, Vec2, type World } from "planck";
import { Rig } from "./Rig";
import { hands, type Hand, type Inputs, type ArmPose } from "./types";
import { add, sub, mul, v, ik, dist, len, type V } from "./math";
import {
  inverseHandCorrection,
  ReleaseVelocity,
} from "../vendor/climbing/HandAnchors";

/** Physical body with visually retargeted arms, driven by planted-hand locomotion. */
export class AnchorRig extends Rig {
  private endpoints = { left: v(-0.32, 1.1), right: v(0.32, 1.1) };
  private actuator: MouseJoint | null = null;
  private history = new ReleaseVelocity();
  private before = v();
  constructor(world: World) {
    super(world);
    // The hip remains passive. Arm shapes are retargeted graphics and have no
    // competing joint motors/constraints injecting work into the player body.
    for (const j of this.joints.slice(1)) world.destroyJoint(j);
    this.joints.splice(1);
    this.torso.setFixedRotation(true);
    this.torso.getFixtureList()!.setDensity(41.4 / (4 * 0.19 * 0.38));
    this.torso.resetMassData();
    for (const side of hands)
      for (const b of [
        this.arms[side].upper,
        this.arms[side].fore,
        this.arms[side].hand,
      ])
        b.setType("kinematic");
  }
  override shoulder(side: Hand) {
    return this.torso.getWorldPoint(v(side === "left" ? -0.19 : 0.19, 0.28));
  }
  override hand(side: Hand) {
    return this.endpoints[side];
  }
  offset(input: Inputs, side: Hand) {
    const p = input[side].target,
      l = len(p);
    return l > 0.745 ? mul(p, 0.745 / l) : p;
  }
  override aim(side: Hand, input: Inputs) {
    return add(this.shoulder(side), this.offset(input, side));
  }
  override pose(side: Hand, _cameraPlane = false): ArmPose {
    const solved = ik(
      this.shoulder(side),
      this.hand(side),
      0.36,
      0.39,
      side === "left" ? -1 : 1,
    );
    return { upper: solved.upper, elbow: solved.elbow };
  }
  override drive() {}
  override measureWork() {
    return 0;
  }
  override com() {
    const a = this.torso.getWorldCenter(),
      b = this.legs.getWorldCenter();
    return mul(
      add(mul(a, this.torso.getMass()), mul(b, this.legs.getMass())),
      1 / 60,
    );
  }
  override velocity() {
    return super.velocity();
  }
  sync(input: Inputs, anchors: Partial<Record<Hand, V>>) {
    for (const side of hands) {
      const a = this.arms[side],
        s = this.shoulder(side),
        h = anchors[side] ?? this.aim(side, input);
      this.endpoints[side] = { ...h };
      const solve = ik(s, h, 0.36, 0.39, side === "left" ? -1 : 1),
        e = solve.point;
      a.upper.setTransform(mul(add(s, e), 0.5), solve.upper);
      a.fore.setTransform(
        mul(add(e, h), 0.5),
        Math.atan2(h.y - e.y, h.x - e.x),
      );
      a.hand.setTransform(h, a.fore.getAngle());
    }
  }
  updateSupport(
    input: Inputs,
    anchors: Partial<Record<Hand, V>>,
    maxForce: number,
    ground: import("planck").Body,
  ) {
    this.before = { ...this.torso.getPosition() };
    const supports = hands
      .filter((side) => anchors[side])
      .map((side) => ({
        anchor: anchors[side]!,
        requested: this.aim(side, input),
      }));
    if (!supports.length) {
      if (this.actuator) {
        this.world.destroyJoint(this.actuator);
        this.actuator = null;
      }
      return;
    }
    if (!this.actuator) {
      this.history.clear();
      this.actuator = this.world.createJoint(
        new MouseJoint({
          bodyA: ground,
          bodyB: this.torso,
          target: this.torso.getPosition(),
          maxForce,
          frequencyHz: 7,
          dampingRatio: 1,
        }),
      )!;
    }
    this.actuator.setMaxForce(maxForce);
    const correction = inverseHandCorrection(supports);
    // A soft joint sags under gravity. Without this static spring deflection,
    // every rebase treats the sagged pose as a new target and sinks a little
    // farther. Compensate the spring target, keeping the real support force
    // (and its grip capacity checks) in the native joint.
    const spring = this.torso.getMass() * (2 * Math.PI * 7) ** 2;
    const weightOffset = mul(this.world.getGravity(), -60 / spring);
    this.actuator.setTarget(
      add(add(this.torso.getPosition(), correction), weightOffset),
    );
  }
  afterStep(dt: number) {
    if (this.actuator)
      this.history.addDistance(dt, sub(this.torso.getPosition(), this.before));
  }
  releaseLast(intentional: boolean) {
    if (!this.actuator) return;
    this.world.destroyJoint(this.actuator);
    this.actuator = null;
    if (intentional) {
      const velocity = this.history.velocity();
      this.torso.setLinearVelocity(velocity);
      this.legs.setLinearVelocity(velocity);
    }
    this.history.clear();
  }
  rebase() {
    this.history.clear();
  }
  get supportForce() {
    return this.actuator?.getReactionForce(240) ?? v();
  }
  get launchVelocity() {
    return this.history.velocity();
  }
  reachError(side: Hand) {
    return Math.max(0, dist(this.shoulder(side), this.hand(side)) - 0.76);
  }
}
