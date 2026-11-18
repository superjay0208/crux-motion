import { World, Vec2 } from "planck";
import { Rig } from "./Rig";
import { AnchorRig } from "./AnchorRig";
import { GripConstraint } from "./GripConstraint";
import { add, sub, mul, len, dist, closest, clamp, v, type V } from "./math";
import {
  hands,
  initialInputs,
  type ArmMotion,
  type Hand,
  type Intent,
  type Inputs,
  type Hold,
  type Route,
  type SimEvent,
  type Replay,
  gripFits,
} from "./types";
const armEqual = (a?: ArmMotion, b?: ArmMotion) =>
  a === b ||
  (!!a &&
    !!b &&
    a.upper === b.upper &&
    a.elbow === b.elbow &&
    a.upperVelocity === b.upperVelocity &&
    a.elbowVelocity === b.elbowVelocity);
const intentEqual = (a: Intent, b: Intent) =>
  a.target.x === b.target.x &&
  a.target.y === b.target.y &&
  a.grip === b.grip &&
  a.ready === b.ready &&
  a.orientation === b.orientation &&
  a.quality === b.quality &&
  a.bend === b.bend &&
  armEqual(a.arm, b.arm);
const inputsEqual = (a: Inputs, b: Inputs) =>
  intentEqual(a.left, b.left) && intentEqual(a.right, b.right);
const cloneIntent = (i: Intent): Intent => ({
  target: { x: i.target.x, y: i.target.y },
  grip: i.grip,
  ready: i.ready,
  orientation: i.orientation,
  quality: i.quality,
  bend: i.bend,
  ...(i.arm
    ? {
        arm: {
          upper: i.arm.upper,
          elbow: i.arm.elbow,
          upperVelocity: i.arm.upperVelocity,
          elbowVelocity: i.arm.elbowVelocity,
        },
      }
    : {}),
});
export const cloneInputs = (input: Inputs): Inputs => ({
  left: cloneIntent(input.left),
  right: cloneIntent(input.right),
});
type Contact = {
  hold: Hold;
  anchor: V;
  joint: GripConstraint;
  age: number;
  drift: number;
  wrong: number;
  load: number;
};
const DYNO_RING_TICKS = 60;
const DYNO_STAGGER_TICKS = 34;
const COYOTE_CATCH_TICKS = 12;
export class Simulation {
  readonly world = new World(Vec2(0, -9.81));
  readonly rig: Rig;
  readonly ground = this.world.createBody();
  readonly dt = 1 / 120;
  tick = 0;
  state: "ready" | "playing" | "paused" | "finished" | "fallen" = "ready";
  pauseReason = "";
  contacts: Record<Hand, Contact | null> = { left: null, right: null };
  reserve = { left: 1, right: 1 };
  energy = 1;
  input = initialInputs();
  events: SimEvent[] = [];
  private serial = 0;
  cooldown = { left: 0, right: 0 };
  visited = new Set<string>();
  crossed = false;
  flew = false;
  undercling = false;
  flight = 0;
  longestFlight = 0;
  finishDwell = 0;
  catchCount = 0;
  apexCatchCount = 0;
  dynoCharge = 0;
  dynoReady = false;
  dynoWindowRemaining = 0;
  dynoSource: "none" | "push" | "swing" = "none";
  dynoVector: V = v();
  dynoLaunch = false;
  fatigue = true;
  motors = true;
  assisted = false;
  time = 0;
  frames: Replay["frames"] = [];
  private lastInput: Inputs | null = null;
  lastCause = "";
  private recentReleases: { id: string; tick: number }[] = [];
  private launchHolds = new Set<string>();
  private openedHold: Partial<Record<Hand, string>> = {};
  private slippedHold: Partial<Record<Hand, string>> = {};
  private armFrameTick = { left: 0, right: 0 };
  private intentionalFlight = true;
  private lastDualSupportTick = 0;
  private intentionalReleaseTick: Record<Hand, number> = {
    left: -999,
    right: -999,
  };
  private dynoCatchWindow = 0;
  private dynoLaunchPower = 1;
  private readonly scoreRing = new Float64Array(DYNO_RING_TICKS);
  private readonly vecXRing = new Float64Array(DYNO_RING_TICKS);
  private readonly vecYRing = new Float64Array(DYNO_RING_TICKS);
  private readonly sourceRing = new Uint8Array(DYNO_RING_TICKS);
  private chargeHead = 0;
  private prevMeanOffset: V | null = null;
  private handDrive: V = v();
  private pendingDyno: {
    vec: V;
    charge: number;
    source: "none" | "push" | "swing";
    tick: number;
    comY: number;
  } | null = null;
  private flybyHold: Partial<
    Record<Hand, { hold: Hold; anchor: V; tick: number }>
  > = {};
  constructor(
    public route: Route,
    readonly mode = "practice",
    readonly controller: "anchors" | "motors" = mode === "camera"
      ? "anchors"
      : "motors",
  ) {
    this.rig =
      controller === "anchors"
        ? new AnchorRig(this.world)
        : new Rig(this.world);
    for (const [i, side] of hands.entries()) {
      const hold = route.holds.find((h) => h.id === route.start[i])!;
      this.attach(side, hold, this.rig.hand(side), true);
    }
    this.events = [];
  }
  emit(
    kind: SimEvent["kind"],
    p: V,
    message: string,
    hand?: Hand,
    power = 1,
    impact?: SimEvent["impact"],
  ) {
    this.events.push({
      id: ++this.serial,
      tick: this.tick,
      kind,
      p: { ...p },
      hand,
      power,
      message,
      ...(impact ? { impact } : {}),
    });
    if (this.events.length > 128) this.events.shift();
  }
  pumped(side: Hand): boolean {
    return this.reserve[side] < 0.35;
  }
  get exhausted(): boolean {
    return this.energy < 0.30;
  }
  resting(side: Hand): boolean {
    return (
      !this.contacts[side] &&
      this.input[side].target.y < 0.2 &&
      (!!this.contacts.left || !!this.contacts.right)
    );
  }
  private clearDynoWindow(keepSource = false) {
    this.scoreRing.fill(0);
    this.vecXRing.fill(0);
    this.vecYRing.fill(0);
    this.sourceRing.fill(0);
    this.chargeHead = 0;
    this.dynoCharge = 0;
    this.dynoReady = false;
    this.dynoWindowRemaining = 0;
    this.dynoVector = v();
    if (!keepSource) this.dynoSource = "none";
  }
  setInput(input: Inputs) {
    for (const side of hands)
      if (!armEqual(input[side].arm, this.input[side].arm))
        this.armFrameTick[side] = this.tick;
    this.input = cloneInputs(input);
  }
  start() {
    if (this.state === "ready" || this.state === "paused") {
      this.state = "playing";
      this.pauseReason = "";
    }
  }
  pause(reason = "Take a breath") {
    if (this.state === "playing") {
      this.state = "paused";
      this.pauseReason = reason;
      this.prevMeanOffset = null;
      this.handDrive = v();
    }
  }
  release(side: Hand, cause = "Released", slip = false) {
    const c = this.contacts[side];
    if (!c) return;
    const otherSide: Hand = side === "left" ? "right" : "left";
    const otherAttached = !!this.contacts[otherSide];
    if (!slip) {
      this.openedHold[side] = c.hold.id;
      this.intentionalReleaseTick[side] = this.tick;
      if (otherAttached && this.dynoCharge >= 0.72) {
        this.pendingDyno = {
          vec: { ...this.dynoVector },
          charge: this.dynoCharge,
          source: this.dynoSource,
          tick: this.tick,
          comY: this.rig.com().y,
        };
      }
    } else {
      this.intentionalReleaseTick[side] = -999;
      this.pendingDyno = null;
      if (this.rig instanceof AnchorRig) this.slippedHold[side] = c.hold.id;
    }
    delete this.flybyHold[side];
    this.recentReleases.push({ id: c.hold.id, tick: this.tick });
    this.recentReleases = this.recentReleases.filter(
      (r) => this.tick - r.tick <= DYNO_STAGGER_TICKS + 6,
    );
    if (!(this.rig instanceof AnchorRig)) this.world.destroyJoint(c.joint);
    this.contacts[side] = null;
    let flightHint = "";
    if (!this.contacts.left && !this.contacts.right) {
      this.launchHolds = new Set(this.recentReleases.map((r) => r.id));
      this.intentionalFlight = !slip;
      this.dynoCatchWindow = 0;
      const simultaneous =
        !slip &&
        this.tick - this.lastDualSupportTick <= DYNO_STAGGER_TICKS &&
        Math.abs(
          this.intentionalReleaseTick.left - this.intentionalReleaseTick.right,
        ) <= DYNO_STAGGER_TICKS;
      const locked =
        simultaneous &&
        this.pendingDyno &&
        this.tick - this.pendingDyno.tick <= DYNO_STAGGER_TICKS
          ? this.pendingDyno
          : null;
      const effectiveCharge = locked
        ? Math.max(locked.charge, this.dynoCharge)
        : this.dynoCharge;
      const launchVec = locked ? { ...locked.vec } : { ...this.dynoVector };
      const launchSource = locked ? locked.source : this.dynoSource;
      const sag = locked ? Math.max(0, locked.comY - this.rig.com().y) : 0;
      this.pendingDyno = null;
      if (this.rig instanceof AnchorRig) this.rig.releaseLast(!slip);
      if (simultaneous && effectiveCharge >= 1) {
        this.dynoLaunch = true;
        this.dynoSource = launchSource;
        this.dynoLaunchPower = clamp(len(launchVec), 1, 3.5);
        if (this.rig instanceof AnchorRig) {
          this.rig.applyLaunchVelocity(launchVec, sag);
        }
        this.clearDynoWindow(true);
      } else if (simultaneous && effectiveCharge >= 0.72) {
        const scale = 0.65 + 0.35 * ((effectiveCharge - 0.72) / 0.28);
        const hopVec = mul(launchVec, scale);
        this.dynoLaunch = effectiveCharge >= 0.85;
        this.dynoSource = this.dynoLaunch ? launchSource : "none";
        this.dynoLaunchPower = this.dynoLaunch
          ? clamp(len(hopVec), 1, 3.5)
          : 1;
        if (this.rig instanceof AnchorRig) {
          this.rig.applyLaunchVelocity(hopVec, sag * scale);
        }
        this.clearDynoWindow(this.dynoLaunch);
      } else {
        this.dynoLaunch = false;
        this.dynoLaunchPower = 1;
        this.clearDynoWindow(false);
        if (!slip) {
          flightHint = !simultaneous
            ? "Release both hands at the same time to dyno"
            : "Build swing or push-up momentum before releasing both hands";
        }
      }
    }
    this.cooldown[side] = 0.12;
    this.emit(slip ? "slip" : "release", this.rig.hand(side), cause, side);
    this.lastCause = flightHint || cause;
  }
  strain(side: Hand): number {
    const c = this.contacts[side];
    if (!c) return 0;
    return clamp(
      Math.max(
        c.load / Math.max(0.4, c.joint.normal / 589),
        c.drift / (this.rig instanceof AnchorRig ? 0.22 : 0.11),
        c.wrong / 0.35,
      ),
      0,
      1,
    );
  }
  private gripMatches(grip: Inputs[Hand]["grip"], kind: Hold["kind"]) {
    return this.assisted
      ? grip !== "release" && grip !== "unknown"
      : gripFits(grip, kind);
  }
  private attach(side: Hand, hold: Hold, anchor: V, start = false) {
    if (this.contacts[side]) return;
    const other = this.contacts[side === "left" ? "right" : "left"];
    if (other?.hold.id === hold.id && !hold.match) return;
    this.intentionalReleaseTick[side] = -999;
    this.pendingDyno = null;
    delete this.flybyHold[side];
    const preVel = start ? v() : this.rig.velocity();
    const dyno =
      !start &&
      this.dynoLaunch &&
      (this.flight >= 0.08 || this.dynoCatchWindow > 0) &&
      !this.route.start.includes(hold.id) &&
      !this.launchHolds.has(hold.id);
    const apex = dyno && Math.abs(preVel.y) < 0.95;
    const joint = new GripConstraint(
      this.ground,
      this.rig.arms[side].hand,
      anchor,
      hold.direction,
    );
    const contact: Contact = {
      hold,
      anchor: { ...anchor },
      joint,
      age: start ? 1 : apex ? 0.03 : 0,
      drift: 0,
      wrong: 0,
      load: 0,
    };
    this.capacities(side, contact, this.dt);
    if (!(this.rig instanceof AnchorRig)) this.world.createJoint(joint);
    this.contacts[side] = contact;
    if (!start) {
      this.catchCount++;
      if (hold.checkpoint || hold.finish) this.visited.add(hold.id);
      if (hold.direction.y < -0.5) this.undercling = true;
      if (this.rig instanceof AnchorRig) this.rig.onCatch(preVel);
      const speed = len(preVel);
      if (apex) {
        this.apexCatchCount++;
        this.emit(
          "catch",
          anchor,
          "Apex dyno catch",
          side,
          clamp(speed / 1.5, 1.15, 2),
          "apex",
        );
      } else if (dyno) {
        this.emit(
          "catch",
          anchor,
          "Dyno caught",
          side,
          clamp(speed / 1.6, 1.05, 2),
          "dyno",
        );
      } else {
        const message =
          speed < 0.55 && dist(anchor, hold.p) <= hold.radius * 0.65
            ? "Clean catch"
            : "Secure catch";
        this.emit("catch", anchor, message, side, clamp(speed / 2, 0.35, 2));
      }
      if (dyno) {
        this.flew = true;
        this.longestFlight = Math.max(this.longestFlight, this.flight);
        if (other) {
          this.dynoCatchWindow = 0;
          this.dynoLaunch = false;
          this.dynoSource = "none";
        } else {
          this.dynoCatchWindow = 0.18;
        }
      } else {
        this.dynoCatchWindow = 0;
        this.dynoLaunch = false;
        if (this.dynoCharge === 0) this.dynoSource = "none";
      }
      this.flight = 0;
    }
  }
  private capacities(side: Hand, c: Contact, dt: number) {
    const f =
      c.hold.kind === "crimp"
        ? 2.5
        : c.hold.kind === "pinch"
          ? 2.6
          : 2.8;
    const t =
      c.hold.kind === "crimp"
        ? 1.2
        : c.hold.kind === "pinch"
          ? 1.3
          : 1.6;
    const reserve = this.fatigue
      ? (0.1 + 0.9 * this.reserve[side]) * (0.25 + 0.75 * this.energy)
      : 1;
    const ramp = clamp(c.age / 0.04, 0.15, 1),
      wrong = clamp(1 - Math.max(0, c.wrong - 0.18) / 0.22, 0.05, 1);
    c.joint.normal = 589 * f * reserve * ramp * wrong;
    c.joint.tangent = 589 * t * reserve * ramp * wrong;
    c.joint.mu = 1.2;
    c.joint.broad = c.hold.kind === "jug" && c.hold.direction.y > 0.5;
    c.joint.setMaxForce(Math.hypot(c.joint.normal, c.joint.tangent));
  }
  private eligible(side: Hand, hold: Hold) {
    const i = this.input[side];
    return (
      i.quality &&
      i.ready &&
      this.gripMatches(i.grip, hold.kind) &&
      (hold.direction.y >= -0.5 || i.orientation === "down") &&
      (this.assisted ||
        Math.abs(hold.direction.x) < 0.5 ||
        i.orientation === "side") &&
      !(
        this.contacts[side === "left" ? "right" : "left"]?.hold.id ===
          hold.id && !hold.match
      )
    );
  }
  private acquire(side: Hand, from: V, to: V) {
    if (
      this.cooldown[side] > 0 ||
      this.contacts[side] ||
      !this.input[side].quality
    )
      return;
    const other = this.contacts[side === "left" ? "right" : "left"];
    const airborne = !this.contacts.left && !this.contacts.right;
    const anchored = this.rig instanceof AnchorRig;
    // Overlapping visible patches resolve toward the player's requested point.
    // Actual hand/patch intersection is still mandatory below.
    const requested = this.rig.aim(side, this.input);
    const candidates = [...this.route.holds].sort(
      (a, b) =>
        dist(a.p, requested) - dist(b.p, requested) || a.id.localeCompare(b.id),
    );
    let recordedFlyby = false;
    for (const hold of candidates) {
      const center = hold.match
        ? add(hold.p, v(side === "left" ? -0.09 : 0.09, 0))
        : hold.p;
      const point = closest(center, from, to),
        radius = hold.match ? hold.radius * 0.75 : hold.radius;
      // A failed grip cannot auto-catch the same patch indefinitely while the
      // hand remains closed and stationary. Open, or leave and re-enter, to retry.
      if (this.slippedHold[side] === hold.id) {
        if (dist(to, center) > radius + 0.08) delete this.slippedHold[side];
        else continue;
      }
      // Closing on the way upward must not re-grab the old hold behind the aim.
      if (
        this.openedHold[side] === hold.id &&
        dist(requested, center) >
          (anchored || this.input[side].arm ? radius * 0.7 : radius + 0.1)
      )
        continue;
      if (
        other &&
        other.hold.p.y > hold.p.y + 0.18 &&
        (this.route.start.includes(hold.id) || this.visited.has(hold.id)) &&
        requested.y > center.y + radius * 0.55 &&
        dist(requested, center) > radius * 0.85
      )
        continue;
      const nonLaunchHold =
        !this.launchHolds.has(hold.id) && !this.route.start.includes(hold.id);
      if (
        airborne &&
        !nonLaunchHold &&
        this.flybyHold[side] &&
        this.tick - this.flybyHold[side]!.tick <= COYOTE_CATCH_TICKS
      )
        continue;
      const eligible = this.eligible(side, hold);
      if (
        airborne &&
        nonLaunchHold &&
        !eligible &&
        !recordedFlyby &&
        dist(center, point) <= radius + 0.045
      ) {
        const ref = dist(to, center) <= radius ? to : point;
        const flyDelta = sub(ref, center);
        const flyAnchor =
          dist(ref, center) <= radius
            ? { ...ref }
            : add(center, mul(flyDelta, radius / (len(flyDelta) || 1)));
        this.flybyHold[side] = { hold, anchor: flyAnchor, tick: this.tick };
        recordedFlyby = true;
      }
      const assist =
        this.assisted &&
        eligible &&
        dist(this.rig.shoulder(side), center) <= 0.76 + radius
          ? 0.035
          : 0;
      const dynoGrace = airborne && this.dynoLaunch && nonLaunchHold ? 0.04 : 0;
      const sweepTol = radius + 0.025 + assist + dynoGrace;
      const endTol = (dynoGrace > 0 ? 0.11 : 0.08) + assist;
      if (dist(center, point) > sweepTol || dist(to, point) > endTol) continue;
      if (!eligible) {
        if (this.input[side].ready)
          this.lastCause =
            hold.direction.y < -0.5
              ? "Turn your palm up to scoop"
              : `Use ${hold.kind} grip`;
        continue;
      }
      const delta = sub(to, center),
        anchor =
          dist(to, center) <= radius
            ? to
            : add(center, mul(delta, radius / (len(delta) || 1)));
      this.attach(side, hold, anchor);
      return;
    }
    const flyby = this.flybyHold[side];
    if (flyby) {
      const validWindow =
        this.tick - flyby.tick <= COYOTE_CATCH_TICKS &&
        (airborne || (this.dynoCatchWindow > 0 && !!flyby.hold.match));
      if (!validWindow) {
        delete this.flybyHold[side];
        return;
      }
      const flyCenter = flyby.hold.match
        ? add(flyby.hold.p, v(side === "left" ? -0.09 : 0.09, 0))
        : flyby.hold.p;
      const flyRadius = flyby.hold.match
        ? flyby.hold.radius * 0.75
        : flyby.hold.radius;
      if (
        this.slippedHold[side] !== flyby.hold.id &&
        this.eligible(side, flyby.hold) &&
        dist(to, flyCenter) <= flyRadius + (anchored ? 0.15 : 0.12)
      ) {
        const delta = sub(to, flyCenter);
        const catchAnchor =
          dist(to, flyCenter) <= flyRadius
            ? { ...to }
            : len(delta) > 1e-6
              ? add(flyCenter, mul(delta, flyRadius / len(delta)))
              : { ...flyby.anchor };
        delete this.flybyHold[side];
        this.attach(side, flyby.hold, catchAnchor);
      }
    }
  }
  private updateDynoMomentum(anchored: AnchorRig | null) {
    if (this.contacts.left && this.contacts.right) {
      this.lastDualSupportTick = this.tick;
      this.pendingDyno = null;
      const clampReach = (p: V) => {
        const l = len(p);
        return l > 0.745 ? mul(p, 0.745 / l) : p;
      };
      const meanOffset = anchored
        ? anchored.meanHandOffset(this.input)
        : mul(
            add(
              clampReach(this.input.left.target),
              clampReach(this.input.right.target),
            ),
            0.5,
          );
      if (this.prevMeanOffset) {
        const rawDx = clamp(
          -(meanOffset.x - this.prevMeanOffset.x),
          -0.06,
          0.06,
        );
        const rawDy = clamp(
          -(meanOffset.y - this.prevMeanOffset.y),
          -0.06,
          0.06,
        );
        const alpha = 0.16;
        this.handDrive = v(
          clamp(
            this.handDrive.x + alpha * (rawDx / this.dt - this.handDrive.x),
            -2.6,
            2.6,
          ),
          clamp(
            this.handDrive.y + alpha * (rawDy / this.dt - this.handDrive.y),
            -2.6,
            2.6,
          ),
        );
      } else {
        this.handDrive = v();
      }
      this.prevMeanOffset = meanOffset;

      const instVel = this.rig.velocity();
      const sampleVel = anchored ? anchored.recentLaunchVelocity : instVel;
      const handDriveX = this.handDrive.x;
      const handDriveY = this.handDrive.y;

      if (Math.abs(instVel.x) > 0.38) {
        for (let i = 0; i < DYNO_RING_TICKS; i++)
          if (this.vecXRing[i] * instVel.x < -0.08) {
            this.scoreRing[i] = 0;
            this.vecXRing[i] = 0;
            this.vecYRing[i] = 0;
            this.sourceRing[i] = 0;
          }
      }
      if (instVel.y < -0.8) {
        for (let i = 0; i < DYNO_RING_TICKS; i++)
          if (this.sourceRing[i] === 1) {
            this.scoreRing[i] = 0;
            this.vecXRing[i] = 0;
            this.vecYRing[i] = 0;
            this.sourceRing[i] = 0;
          }
      }

      let effectiveVx = instVel.x;
      let effectiveVy = instVel.y;
      if (anchored) {
        effectiveVy =
          instVel.y > -0.05 &&
          (instVel.y > 0.08 || sampleVel.y > 0.1 || handDriveY > 0.22)
            ? Math.max(instVel.y, sampleVel.y * 0.92, handDriveY * 0.52)
            : 0;
        const dirX =
          Math.abs(instVel.x) > 0.08
            ? Math.sign(instVel.x)
            : Math.abs(sampleVel.x) > 0.12 &&
                instVel.x * sampleVel.x >= -0.005
              ? Math.sign(sampleVel.x)
              : Math.abs(handDriveX) > 0.25 &&
                  instVel.x * handDriveX >= -0.005
                ? Math.sign(handDriveX)
                : 0;
        if (dirX !== 0) {
          const cInst = instVel.x * dirX > 0 ? Math.abs(instVel.x) : 0;
          const cSample =
            sampleVel.x * dirX > 0 ? Math.abs(sampleVel.x) * 0.92 : 0;
          const cDrive =
            handDriveX * dirX > 0 ? Math.abs(handDriveX) * 0.48 : 0;
          const activeX =
            cInst > 0.09 ||
            (sampleVel.x * dirX > 0 && Math.abs(sampleVel.x) > 0.12) ||
            (handDriveX * dirX > 0 && Math.abs(handDriveX) > 0.25);
          effectiveVx = activeX ? dirX * Math.max(cInst, cSample, cDrive) : 0;
        } else {
          effectiveVx = 0;
        }
      }

      const pushScore = effectiveVy > 0.11 ? effectiveVy / 0.33 : 0;
      const swingScore =
        Math.abs(effectiveVx) > 0.13 ? Math.abs(effectiveVx) / 0.35 : 0;
      const score = Math.max(pushScore, swingScore);
      let candX = 0,
        candY = 0,
        src = 0;
      if (score > 0) {
        if (pushScore >= swingScore) {
          src = 1;
          candX = clamp(effectiveVx * 1.08, -3.6, 3.6);
          candY = clamp(
            Math.max(
              effectiveVy * 1.35,
              1.92 + Math.max(0, effectiveVy - 0.33) * 1.35,
            ),
            1.85,
            3.95,
          );
        } else {
          src = 2;
          candX = clamp(effectiveVx * 1.28, -3.7, 3.7);
          candY = clamp(
            Math.max(effectiveVy, 1.55 + Math.abs(effectiveVx) * 0.95),
            1.5,
            3.35,
          );
        }
        const sp = Math.hypot(candX, candY);
        if (sp > 4.2) {
          candX = (candX * 4.2) / sp;
          candY = (candY * 4.2) / sp;
        }
      }

      const idx = this.chargeHead;
      this.scoreRing[idx] = score;
      this.vecXRing[idx] = candX;
      this.vecYRing[idx] = candY;
      this.sourceRing[idx] = src;
      this.chargeHead = (idx + 1) % DYNO_RING_TICKS;

      let bestScore = 0,
        bestX = 0,
        bestY = 0,
        bestSrc = 0,
        latestReadyK = -1;
      for (let k = 0; k < DYNO_RING_TICKS; k++) {
        const i = (this.chargeHead + k) % DYNO_RING_TICKS;
        const s = this.scoreRing[i];
        if (s >= 1) latestReadyK = k;
        if (s > 0 && s >= bestScore) {
          bestScore = s;
          bestX = this.vecXRing[i];
          bestY = this.vecYRing[i];
          bestSrc = this.sourceRing[i];
        }
      }
      this.dynoCharge = clamp(bestScore, 0, 1);
      this.dynoReady = this.dynoCharge >= 1;
      this.dynoWindowRemaining =
        latestReadyK >= 0 ? (latestReadyK + 1) / DYNO_RING_TICKS : 0;
      this.dynoVector = bestScore > 0 ? v(bestX, bestY) : v();
      this.dynoSource =
        bestSrc === 2 ? "swing" : bestSrc === 1 ? "push" : "none";
      return;
    }
    this.prevMeanOffset = null;
    this.handDrive = v();
    if (this.contacts.left || this.contacts.right) {
      const elapsed = this.tick - this.lastDualSupportTick;
      if (elapsed <= DYNO_STAGGER_TICKS) {
        if (
          this.pendingDyno &&
          this.tick - this.pendingDyno.tick <= DYNO_STAGGER_TICKS
        ) {
          this.dynoCharge = this.pendingDyno.charge;
          this.dynoReady = this.pendingDyno.charge >= 1;
          this.dynoVector = { ...this.pendingDyno.vec };
          this.dynoSource = this.pendingDyno.source;
          this.dynoWindowRemaining = this.dynoReady
            ? clamp(
                (DYNO_STAGGER_TICKS - (this.tick - this.pendingDyno.tick) + 1) /
                  DYNO_STAGGER_TICKS,
                0,
                1,
              )
            : 0;
        } else {
          this.dynoReady = this.dynoCharge >= 1;
          if (!this.dynoReady) this.dynoWindowRemaining = 0;
        }
      } else {
        this.pendingDyno = null;
        this.clearDynoWindow(this.dynoLaunch);
      }
      return;
    }
    this.pendingDyno = null;
    this.clearDynoWindow(this.dynoLaunch);
  }
  step() {
    if (this.state !== "playing") return;
    if (!this.lastInput || !inputsEqual(this.input, this.lastInput)) {
      const snapshot = cloneInputs(this.input);
      this.frames.push({ tick: this.tick, input: snapshot });
      this.lastInput = cloneInputs(snapshot);
    }
    this.tick++;
    this.time += this.dt;
    if (this.dynoCatchWindow > 0) {
      this.dynoCatchWindow = Math.max(0, this.dynoCatchWindow - this.dt);
      if (
        this.dynoCatchWindow === 0 &&
        (this.contacts.left || this.contacts.right)
      ) {
        this.dynoLaunch = false;
        if (this.dynoCharge === 0) this.dynoSource = "none";
      }
    }
    for (const side of hands) {
      this.cooldown[side] = Math.max(0, this.cooldown[side] - this.dt);
      if (this.input[side].quality && this.input[side].grip === "release") {
        delete this.slippedHold[side];
        this.release(side);
      }
    }
    this.rig.drive(
      this.input,
      this.reserve,
      this.energy,
      this.motors,
      {
        left: !!this.contacts.left,
        right: !!this.contacts.right,
      },
      Object.fromEntries(
        hands.map((side) => {
          const c = this.contacts[side];
          const threshold = c
            ? Math.max(0.8, (c.joint.normal / 589) * 0.7)
            : 1.5;
          return [
            side,
            c
              ? Math.max(0.2, 1 / (1 + Math.max(0, c.load - threshold) * 3))
              : 1,
          ];
        }),
      ) as Record<Hand, number>,
      {
        left: (this.tick - this.armFrameTick.left) * this.dt,
        right: (this.tick - this.armFrameTick.right) * this.dt,
      },
    );
    const before = {
      left: { ...this.rig.hand("left") },
      right: { ...this.rig.hand("right") },
    };
    for (const side of hands) {
      const c = this.contacts[side];
      if (c) {
        c.age += this.dt;
        if (
          this.input[side].quality &&
          this.input[side].ready &&
          this.input[side].grip !== "unknown"
        )
          c.wrong = !this.gripMatches(this.input[side].grip, c.hold.kind)
            ? c.wrong + this.dt
            : 0;
        else c.wrong = Math.max(0, c.wrong - this.dt);
        this.capacities(side, c, this.dt);
      }
    }
    // Two real world substeps make swept contact tests responsive without snapping.
    const anchored = this.rig instanceof AnchorRig ? this.rig : null;
    const anchors = () =>
      Object.fromEntries(
        hands
          .filter((side) => this.contacts[side])
          .map((side) => [side, this.contacts[side]!.anchor]),
      );
    if (anchored) {
      const prev = {
        left: { ...anchored.hand("left") },
        right: { ...anchored.hand("right") },
      };
      anchored.sync(this.input, anchors());
      for (const side of hands)
        if (!this.contacts[side])
          this.acquire(side, prev[side], anchored.hand(side));
      const capacity = hands.reduce(
        (sum, side) => sum + (this.contacts[side]?.joint.normal ?? 0),
        0,
      );
      anchored.updateSupport(this.input, anchors(), capacity, this.ground);
    }
    let work = 0;
    for (let substep = 0; substep < 2; substep++) {
      const prev = {
        left: { ...this.rig.hand("left") },
        right: { ...this.rig.hand("right") },
      };
      this.world.step(this.dt / 2, 12, 4);
      if (anchored) anchored.sync(this.input, anchors());
      work += this.rig.measureWork(this.dt / 2);
      let acquired = false;
      for (const side of hands)
        if (!this.contacts[side]) {
          this.acquire(side, prev[side], this.rig.hand(side));
          if (this.contacts[side]) acquired = true;
        }
      if (anchored && substep === 0 && acquired) {
        const capacity = hands.reduce(
          (sum, side) => sum + (this.contacts[side]?.joint.normal ?? 0),
          0,
        );
        anchored.updateSupport(
          this.input,
          anchors(),
          capacity,
          this.ground,
          true,
        );
      } else if (anchored && acquired) {
        anchored.sync(this.input, anchors());
      }
    }
    anchored?.afterStep(this.dt);
    const supportCount = hands.filter((side) => this.contacts[side]).length;
    for (const side of hands) {
      const c = this.contacts[side];
      if (c) {
        const totalForce = anchored?.supportForce;
        const weight = (contact: Contact) => {
          if (!totalForce) return 0;
          const normal =
            totalForce.x * contact.hold.direction.x +
            totalForce.y * contact.hold.direction.y;
          return normal >= 0
            ? contact.joint.normal
            : contact.joint.broad
              ? contact.joint.normal * 0.18
              : 0;
        };
        const totalWeight = hands.reduce(
          (sum, s) => sum + (this.contacts[s] ? weight(this.contacts[s]!) : 0),
          0,
        );
        const force = anchored
          ? mul(
              anchored.supportForce,
              totalWeight > 0
                ? weight(c) / totalWeight
                : 1 / Math.max(1, supportCount),
            )
          : c.joint.getReactionForce(2 / this.dt);
        const measuredLoad = len(force) / 589;
        c.load =
          anchored || this.input[side].arm
            ? c.load + 0.1 * (measuredLoad - c.load)
            : measuredLoad;
        const drift = anchored
          ? anchored.reachError(side)
          : dist(this.rig.hand(side), c.anchor);
        const normal =
          force.x * c.hold.direction.x + force.y * c.hold.direction.y;
        const tangent = Math.abs(
          force.x * c.hold.direction.y - force.y * c.hold.direction.x,
        );
        const outside =
          anchored &&
          (normal < -(c.joint.broad ? c.joint.normal * 0.18 : 25) ||
            normal > c.joint.normal * 1.03 ||
            tangent > c.joint.tangent * 1.03);
        c.drift =
          drift > 0.045 || outside
            ? c.drift + this.dt
            : anchored
              ? Math.max(0, c.drift - this.dt)
              : 0;
        if (
          drift > (anchored ? 0.25 : 0.13) ||
          c.drift > (anchored ? 0.3 : 0.12) ||
          c.wrong > 0.4
        )
          this.release(
            side,
            c.wrong > 0.4 ? "Grip changed" : `Grip overloaded`,
            true,
          );
        if (this.fatigue) {
          // Forearm drain: Jug ~0.014/s base at 1g, Pinch 1.7x, Crimp 2.8x
          const gripDrain =
            c.hold.kind === "crimp"
              ? 2.8
              : c.hold.kind === "pinch"
                ? 1.7
                : 1.0;
          this.reserve[side] = clamp(
            this.reserve[side] -
              this.dt *
                0.014 *
                gripDrain *
                (0.55 + 0.45 * Math.min(3, c.load) ** 1.4),
            0,
            1,
          );
        }
      } else if (this.resting(side) && this.fatigue)
        this.reserve[side] = clamp(this.reserve[side] + 0.085 * this.dt, 0, 1);
    }
    if (this.fatigue) {
      const onStartOrRest = hands.some((s) => {
        const c = this.contacts[s];
        return (
          c &&
          c.hold.kind === "jug" &&
          (c.hold.label === "START" || c.hold.label === "REST")
        );
      });
      const onRestJug = hands.some((s) => {
        const c = this.contacts[s];
        return c && c.hold.kind === "jug" && c.hold.label === "REST";
      });
      const restingOnRest =
        onRestJug &&
        (supportCount === 2 || hands.some((s) => this.resting(s)));
      const hangDrain =
        supportCount > 0 ? (onStartOrRest ? 0.0025 : 0.008) * this.dt : 0;
      const passiveFloor = onStartOrRest
        ? supportCount === 2
          ? 0.55
          : restingOnRest
            ? 1.05
            : 0
        : 0;
      const effortDrain = hands.reduce((sum, s) => {
        const c = this.contacts[s];
        return (
          sum + (c ? 0.006 * Math.max(0, c.load - passiveFloor) * this.dt : 0)
        );
      }, 0);
      this.energy = clamp(
        this.energy - hangDrain - effortDrain - work / 90000,
        0,
        1,
      );
      if (restingOnRest) {
        this.energy = clamp(this.energy + 0.012 * this.dt, 0, 1);
      }
    }
    this.updateDynoMomentum(anchored);
    const count = hands.filter((s) => this.contacts[s]).length;
    if (!count) {
      if (!this.flight) {
        if (this.dynoLaunch) {
          this.emit(
            "launch",
            this.rig.com(),
            "Dyno launch!",
            undefined,
            this.dynoLaunchPower,
            "launch",
          );
        } else {
          this.emit(
            "launch",
            this.rig.com(),
            "In flight",
            undefined,
            len(this.rig.velocity()),
          );
        }
      }
      this.flight += this.dt;
    } else if (this.flight > 0) this.flight = 0;
    // Keep crossed/flew/undercling as optional style telemetry
    if (this.rig.hand("left").x > this.rig.hand("right").x + 0.12 && count > 0)
      this.crossed = true;
    // Pure "Match Top to Win" — matching both hands on finish hold for 0.35s wins
    if (
      this.rig.com().y < this.route.fallY ||
      !Number.isFinite(this.rig.com().y)
    ) {
      this.state = "fallen";
      this.emit("fall", this.rig.com(), this.lastCause || "Missed the catch");
    } else if (
      count === 2 &&
      hands.every((s) => this.contacts[s]?.hold.finish)
    ) {
      this.finishDwell += this.dt;
      if (this.finishDwell >= 0.35) {
        this.state = "finished";
        this.emit(
          "finish",
          this.rig.com(),
          "Route complete",
          undefined,
          1,
          "finish",
        );
      }
    } else this.finishDwell = 0;
  }
  replay(): Replay {
    return {
      version: 1,
      route: this.route.id,
      mode: this.mode,
      controller: this.controller,
      frames: this.frames,
      duration: this.tick,
    };
  }
  summary() {
    return {
      tick: this.tick,
      state: this.state,
      com: this.rig.com(),
      velocity: this.rig.velocity(),
      reserve: this.reserve,
      energy: this.energy,
      contacts: hands.map((s) => this.contacts[s]?.hold.id ?? null),
      visited: [...this.visited],
      crossed: this.crossed,
      flew: this.flew,
      undercling: this.undercling,
      catchCount: this.catchCount,
      dynoWindowRemaining: this.dynoWindowRemaining,
    };
  }
}
