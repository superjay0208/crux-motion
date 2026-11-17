import { World, Body, Box, Circle, RevoluteJoint, Vec2 } from "planck";
import { v, add, sub, len, ik, wrap, clamp, type V } from "./math";
import { hands, type Hand, type Inputs, type ArmPose } from "./types";
export type Arm = {
  upper: Body;
  fore: Body;
  hand: Body;
  shoulder: RevoluteJoint;
  elbow: RevoluteJoint;
  wrist: RevoluteJoint;
  bend: number;
};
export class Rig {
  private reach = { left: Math.hypot(0.13, 0.5), right: Math.hypot(0.13, 0.5) };
  readonly torso: Body;
  readonly legs: Body;
  readonly arms = {} as Record<Hand, Arm>;
  readonly bodies: Body[] = [];
  readonly joints: RevoluteJoint[] = [];
  work = 0;
  constructor(readonly world: World) {
    this.torso = this.box(v(0, 0.32), 0.19, 0.38, 33);
    this.legs = this.box(v(0, -0.43), 0.13, 0.34, 18.6);
    this.joint(this.torso, this.legs, v(0, -0.05), -0.65, 0.65, 0);
    for (const side of hands) {
      const s = side === "left" ? -1 : 1,
        shoulder = v(s * 0.19, 0.6),
        target = v(s * 0.32, 1.1),
        solve = ik(shoulder, target, 0.36, 0.39, s);
      const elbow = add(
        shoulder,
        v(0.36 * Math.cos(solve.upper), 0.36 * Math.sin(solve.upper)),
      );
      const upper = this.segment(shoulder, elbow, 2.1, 0.045),
        fore = this.segment(elbow, target, 1.5, 0.036);
      const hand = this.world.createDynamicBody({
        position: Vec2(target.x, target.y),
        angle: fore.getAngle(),
      });
      hand.createFixture(Circle(0.055), {
        density: 0.6 / (Math.PI * 0.055 ** 2),
        filterGroupIndex: -1,
      });
      this.bodies.push(hand);
      this.arms[side] = {
        upper,
        fore,
        hand,
        shoulder: this.joint(
          this.torso,
          upper,
          shoulder,
          -Math.PI * 1.5,
          Math.PI * 1.5,
          110,
        ),
        elbow: this.joint(upper, fore, elbow, -2.7, 2.7, 95),
        wrist: this.joint(fore, hand, target, -1.3, 1.3, 8),
        bend: s,
      };
    }
  }
  private box(p: V, w: number, h: number, mass: number) {
    const b = this.world.createDynamicBody({ position: Vec2(p.x, p.y) });
    b.createFixture(Box(w, h), {
      density: mass / (4 * w * h),
      filterGroupIndex: -1,
    });
    this.bodies.push(b);
    return b;
  }
  private segment(a: V, b: V, mass: number, r: number) {
    const d = sub(b, a),
      body = this.box(add(a, { x: d.x / 2, y: d.y / 2 }), len(d) / 2, r, mass);
    body.setAngle(Math.atan2(d.y, d.x));
    return body;
  }
  private joint(
    a: Body,
    b: Body,
    p: V,
    min: number,
    max: number,
    torque: number,
  ) {
    const j = this.world.createJoint(
      new RevoluteJoint(
        {
          enableLimit: true,
          lowerAngle: min - (b.getAngle() - a.getAngle()),
          upperAngle: max - (b.getAngle() - a.getAngle()),
          enableMotor: true,
          maxMotorTorque: torque,
          motorSpeed: 0,
          collideConnected: false,
        },
        a,
        b,
        Vec2(p.x, p.y),
      ),
    )!;
    this.joints.push(j);
    return j;
  }
  shoulder(side: Hand): V {
    return this.arms[side].shoulder.getAnchorA();
  }
  hand(side: Hand): V {
    return this.arms[side].hand.getPosition();
  }
  pose(side: Hand, cameraPlane = false): ArmPose {
    const arm = this.arms[side];
    return {
      upper: wrap(
        arm.upper.getAngle() - (cameraPlane ? 0 : this.torso.getAngle()),
      ),
      elbow: wrap(arm.fore.getAngle() - arm.upper.getAngle()),
    };
  }
  aim(side: Hand, input: Inputs): V {
    const motion = input[side].arm;
    if (!motion) return add(this.shoulder(side), input[side].target);
    const a = motion.upper,
      b = a + motion.elbow;
    return add(
      this.shoulder(side),
      v(
        0.36 * Math.cos(a) + 0.39 * Math.cos(b),
        0.36 * Math.sin(a) + 0.39 * Math.sin(b),
      ),
    );
  }
  drive(
    input: Inputs,
    reserve: Record<Hand, number>,
    energy: number,
    enabled = true,
    held: Record<Hand, boolean> = { left: false, right: false },
    effort: Record<Hand, number> = { left: 1, right: 1 },
    motionAge: Record<Hand, number> = { left: 0, right: 0 },
  ) {
    for (const side of hands) {
      const mirrored = input[side].arm;
      if (mirrored) {
        const arm = this.arms[side],
          actual = this.pose(side, true);
        const supports = Number(held.left) + Number(held.right);
        const strength = held[side] ? (supports === 2 ? 0.55 : 1) : 0.5;
        const gain = (0.35 + 0.65 * Math.min(reserve[side], energy)) * strength;
        const feed = clamp(1 - motionAge[side] / 0.12, 0, 1);
        // Automatic posture is muscle work through a planted arm, never a
        // torque/force on the torso itself. Horizontal swings remain free.
        const posture = held[side]
          ? clamp(
              4 * wrap(this.torso.getAngle()) +
                1.5 * this.torso.getAngularVelocity(),
              -3,
              3,
            ) / Math.max(1, supports)
          : 0;
        // Camera up stays up while the physical torso swings. Shoulder and elbow
        // motors are internal; a pinned hand transmits their work to the body.
        this.motor(
          arm.shoulder,
          wrap(mirrored.upper - actual.upper),
          340 * gain,
          enabled,
          mirrored.upperVelocity * feed -
            this.torso.getAngularVelocity() +
            posture,
          8,
          0.35,
        );
        this.motor(
          arm.elbow,
          wrap(mirrored.elbow - actual.elbow),
          300 * gain,
          enabled,
          mirrored.elbowVelocity * feed,
          8,
          0.35,
        );
        this.motor(
          arm.wrist,
          wrap(arm.fore.getAngle() - arm.hand.getAngle()),
          8 * gain,
          enabled,
        );
        continue;
      }
      const requested = Math.max(
        held[side] ? 0.24 : 0,
        Math.min(0.745, len(input[side].target)),
      );
      // Eccentric lowering is slower than contraction: abrupt extension must
      // not turn a comfortable repeated pull into an uncontrolled shock load.
      this.reach[side] = held[side]
        ? requested > this.reach[side]
          ? Math.min(requested, this.reach[side] + 0.45 / 120)
          : Math.max(
              requested,
              this.reach[side] - (held.left && held.right ? 2.6 : 1.1) / 120,
            )
        : requested;
      const offset = {
        x:
          (input[side].target.x * this.reach[side]) /
          (len(input[side].target) || 1),
        y:
          (input[side].target.y * this.reach[side]) /
          (len(input[side].target) || 1),
      };
      const arm = this.arms[side],
        s = this.shoulder(side),
        target = add(s, offset),
        solve = ik(s, target, 0.36, 0.39, input[side].bend || arm.bend);
      const gain = (0.2 + 0.8 * Math.min(reserve[side], energy)) * effort[side],
        theta = solve.upper,
        fore = theta + solve.elbow;
      this.motor(
        arm.shoulder,
        wrap(theta - arm.upper.getAngle()),
        200 * gain,
        enabled,
        -this.torso.getAngularVelocity(),
      );
      this.motor(
        arm.elbow,
        wrap(fore - arm.fore.getAngle() - (theta - arm.upper.getAngle())),
        180 * gain,
        enabled,
      );
      this.motor(
        arm.wrist,
        wrap(fore - arm.hand.getAngle()),
        8 * gain,
        enabled,
      );
    }
  }
  private motor(
    j: RevoluteJoint,
    error: number,
    torque: number,
    enabled: boolean,
    feedforward = 0,
    stiffness = 14,
    damping = 0.35,
  ) {
    j.setMaxMotorTorque(enabled ? torque : 0);
    j.setMotorSpeed(
      clamp(
        stiffness * error - damping * j.getJointSpeed() + feedforward,
        -8,
        8,
      ),
    );
  }
  measureWork(dt: number) {
    this.work = 0;
    for (const j of this.joints)
      this.work +=
        Math.max(0, j.getMotorTorque(1 / dt) * j.getJointSpeed()) * dt;
    return this.work;
  }
  com() {
    let x = 0,
      y = 0,
      m = 0;
    for (const b of this.bodies) {
      const w = b.getMass(),
        p = b.getWorldCenter();
      x += p.x * w;
      y += p.y * w;
      m += w;
    }
    return v(x / m, y / m);
  }
  velocity() {
    let x = 0,
      y = 0,
      m = 0;
    for (const b of this.bodies) {
      const w = b.getMass(),
        p = b.getLinearVelocity();
      x += p.x * w;
      y += p.y * w;
      m += w;
    }
    return v(x / m, y / m);
  }
  kinetic() {
    return this.bodies.reduce(
      (e, b) =>
        e +
        0.5 * b.getMass() * len(b.getLinearVelocity()) ** 2 +
        0.5 * b.getInertia() * b.getAngularVelocity() ** 2,
      0,
    );
  }
}
