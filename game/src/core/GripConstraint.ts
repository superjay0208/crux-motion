// Adapter around Planck 1.5.0 MotorJoint (MIT, see THIRD_PARTY.md).
// Project accumulated impulse inside each velocity-solver iteration, not afterward.
import { MotorJoint, Vec2, type Body } from "planck";
import { v, clamp, dot, mul, add, closest, dist, type V } from "./math";
export function projectGrip(
  p: V,
  n: V,
  normal: number,
  tangent: number,
  mu: number,
  broad = false,
): V {
  const t = v(n.y, -n.x),
    q = v(dot(p, n), dot(p, t));
  if (broad)
    return add(
      mul(n, clamp(q.x, -normal * 0.18, normal)),
      mul(t, clamp(q.y, -tangent, tangent)),
    );
  const top = Math.min(tangent, mu * normal),
    corner = Math.min(normal, tangent / Math.max(mu, 0.001));
  const polygon = [
    v(0, 0),
    v(corner, -top),
    v(normal, -top),
    v(normal, top),
    v(corner, top),
  ];
  if (q.x >= 0 && q.x <= normal && Math.abs(q.y) <= Math.min(tangent, mu * q.x))
    return p;
  let best = v(),
    d = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const c = closest(q, polygon[i], polygon[(i + 1) % polygon.length]);
    const cd = dist(q, c);
    if (cd < d) {
      best = c;
      d = cd;
    }
  }
  return add(mul(n, best.x), mul(t, best.y));
}
export class GripConstraint extends MotorJoint {
  declare m_linearImpulse: Vec2;
  private _normal = 1000;
  private _tangent = 500;
  mu = 0.65;
  broad = false;
  direction: V;
  get normal() {
    return this._normal;
  }
  set normal(value: number) {
    if (Math.abs(value - this._normal) > 1e-6) this.getBodyB().setAwake(true);
    this._normal = value;
  }
  get tangent() {
    return this._tangent;
  }
  set tangent(value: number) {
    if (Math.abs(value - this._tangent) > 1e-6) this.getBodyB().setAwake(true);
    this._tangent = value;
  }
  constructor(ground: Body, body: Body, anchor: V, direction: V) {
    super({
      bodyA: ground,
      bodyB: body,
      linearOffset: Vec2(anchor.x, anchor.y),
      maxForce: 1500,
      maxTorque: 0,
      correctionFactor: 0.18,
    });
    this.direction = direction;
  }
  private projected(dt: number) {
    return projectGrip(
      this.m_linearImpulse,
      this.direction,
      this.normal * dt,
      this.tangent * dt,
      this.mu,
      this.broad,
    );
  }
  initVelocityConstraints(step: any) {
    const p = this.projected(step.dt);
    this.m_linearImpulse.set(p.x, p.y);
    super.initVelocityConstraints(step);
  }
  solveVelocityConstraints(step: any) {
    super.solveVelocityConstraints(step);
    const p = this.projected(step.dt),
      dx = p.x - this.m_linearImpulse.x,
      dy = p.y - this.m_linearImpulse.y;
    this.m_linearImpulse.set(p.x, p.y);
    // Planck's solver works on island velocities, not the public body velocity copy.
    const a = this as any,
      A = a.m_bodyA,
      B = a.m_bodyB;
    A.c_velocity.v.x -= a.m_invMassA * dx;
    A.c_velocity.v.y -= a.m_invMassA * dy;
    A.c_velocity.w -= a.m_invIA * (a.m_rA.x * dy - a.m_rA.y * dx);
    B.c_velocity.v.x += a.m_invMassB * dx;
    B.c_velocity.v.y += a.m_invMassB * dy;
    B.c_velocity.w += a.m_invIB * (a.m_rB.x * dy - a.m_rB.y * dx);
  }
}
