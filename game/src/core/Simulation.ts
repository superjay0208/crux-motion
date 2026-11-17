import { World, Vec2 } from "planck";
import { Rig } from "./Rig";
import { AnchorRig } from "./AnchorRig";
import { GripConstraint } from "./GripConstraint";
import { add, sub, mul, len, dist, closest, clamp, v, type V } from "./math";
import {
  hands,
  initialInputs,
  type Hand,
  type Inputs,
  type Hold,
  type Route,
  type SimEvent,
  type Replay,
  gripFits,
} from "./types";
type Contact = {
  hold: Hold;
  anchor: V;
  joint: GripConstraint;
  age: number;
  drift: number;
  wrong: number;
  load: number;
};
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
  fatigue = true;
  motors = true;
  time = 0;
  frames: Replay["frames"] = [];
  private lastInput = "";
  lastCause = "";
  private recentReleases: { id: string; tick: number }[] = [];
  private launchHolds = new Set<string>();
  private openedHold: Partial<Record<Hand, string>> = {};
  private slippedHold: Partial<Record<Hand, string>> = {};
  private armFrameTick = { left: 0, right: 0 };
  private intentionalFlight = true;
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
  emit(kind: SimEvent["kind"], p: V, message: string, hand?: Hand, power = 1) {
    this.events.push({
      id: ++this.serial,
      tick: this.tick,
      kind,
      p: { ...p },
      hand,
      power,
      message,
    });
    if (this.events.length > 128) this.events.shift();
  }
  setInput(input: Inputs) {
    for (const side of hands)
      if (
        JSON.stringify(input[side].arm) !== JSON.stringify(this.input[side].arm)
      )
        this.armFrameTick[side] = this.tick;
    this.input = structuredClone(input);
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
    }
  }
  release(side: Hand, cause = "Released", slip = false) {
    const c = this.contacts[side];
    if (!c) return;
    if (!slip) this.openedHold[side] = c.hold.id;
    else if (this.rig instanceof AnchorRig) this.slippedHold[side] = c.hold.id;
    this.recentReleases.push({ id: c.hold.id, tick: this.tick });
    this.recentReleases = this.recentReleases.filter(
      (r) => this.tick - r.tick < 30,
    );
    if (!(this.rig instanceof AnchorRig)) this.world.destroyJoint(c.joint);
    this.contacts[side] = null;
    if (!this.contacts.left && !this.contacts.right) {
      this.launchHolds = new Set(this.recentReleases.map((r) => r.id));
      this.intentionalFlight = !slip;
      if (this.rig instanceof AnchorRig) this.rig.releaseLast(!slip);
    }
    this.cooldown[side] = 0.12;
    this.emit(slip ? "slip" : "release", this.rig.hand(side), cause, side);
    this.lastCause = cause;
  }
  private attach(side: Hand, hold: Hold, anchor: V, start = false) {
    if (this.contacts[side]) return;
    const other = this.contacts[side === "left" ? "right" : "left"];
    if (other?.hold.id === hold.id && !hold.match) return;
    const joint = new GripConstraint(
      this.ground,
      this.rig.arms[side].hand,
      anchor,
      hold.direction,
    );
    if (!(this.rig instanceof AnchorRig)) this.world.createJoint(joint);
    this.contacts[side] = {
      hold,
      anchor: { ...anchor },
      joint,
      age: start ? 1 : 0,
      drift: 0,
      wrong: 0,
      load: 0,
    };
    if (!start) {
      this.catchCount++;
      if (hold.checkpoint || hold.finish) this.visited.add(hold.id);
      if (hold.direction.y < -0.5) this.undercling = true;
      const dyno =
        this.intentionalFlight &&
        this.flight >= 0.08 &&
        !this.route.start.includes(hold.id) &&
        !this.launchHolds.has(hold.id);
      this.emit(
        "catch",
        anchor,
        dyno ? "Dyno caught" : "Secure catch",
        side,
        clamp(len(this.rig.velocity()) / 2, 0.35, 2),
      );
      if (dyno) {
        this.flew = true;
        this.longestFlight = Math.max(this.longestFlight, this.flight);
      }
      this.flight = 0;
    }
  }
  private capacities(side: Hand, c: Contact, dt: number) {
    const f =
      c.hold.kind === "crimp"
        ? 2.5
        : c.hold.kind === "sloper"
          ? 2.0
          : c.hold.kind === "pinch"
            ? 2.6
            : 2.8;
    const t =
      c.hold.kind === "crimp"
        ? 1.2
        : c.hold.kind === "sloper"
          ? 0.55
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
    c.joint.mu = c.hold.kind === "sloper" ? 0.32 : 1.2;
    c.joint.broad = c.hold.kind === "jug" && c.hold.direction.y > 0.5;
    c.joint.setMaxForce(Math.hypot(c.joint.normal, c.joint.tangent));
  }
  private eligible(side: Hand, hold: Hold) {
    const i = this.input[side];
    return (
      i.quality &&
      i.ready &&
      gripFits(i.grip, hold.kind) &&
      (hold.direction.y >= -0.5 || i.orientation === "down") &&
      (Math.abs(hold.direction.x) < 0.5 || i.orientation === "side") &&
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
    // Overlapping visible patches resolve toward the player's requested point.
    // Actual hand/patch intersection is still mandatory below.
    const requested = this.rig.aim(side, this.input);
    const candidates = [...this.route.holds].sort(
      (a, b) =>
        dist(a.p, requested) - dist(b.p, requested) || a.id.localeCompare(b.id),
    );
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
          (this.rig instanceof AnchorRig || this.input[side].arm
            ? radius * 0.7
            : radius + 0.1)
      )
        continue;
      if (dist(center, point) > radius + 0.025 || dist(to, point) > 0.08)
        continue;
      if (!this.eligible(side, hold)) {
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
  }
  step() {
    if (this.state !== "playing") return;
    const encoded = JSON.stringify(this.input);
    if (encoded !== this.lastInput) {
      this.frames.push({ tick: this.tick, input: structuredClone(this.input) });
      this.lastInput = encoded;
    }
    this.tick++;
    this.time += this.dt;
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
          c.wrong = !gripFits(this.input[side].grip, c.hold.kind)
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
      for (const side of hands)
        if (!this.contacts[side])
          this.acquire(side, prev[side], this.rig.hand(side));
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
        if (this.fatigue)
          this.reserve[side] = clamp(
            this.reserve[side] -
              this.dt *
                (0.003 + 0.012 * Math.min(3, c.load) ** 1.5) *
                (c.hold.kind === "crimp" ? 3 : 1),
            0,
            1,
          );
      } else if (this.input[side].target.y < 0.2 && this.fatigue)
        this.reserve[side] = clamp(this.reserve[side] + 0.05 * this.dt, 0, 1);
    }
    if (this.fatigue)
      this.energy = clamp(this.energy - 0.002 * this.dt - work / 120000, 0, 1);
    const count = hands.filter((s) => this.contacts[s]).length;
    if (!count) {
      if (!this.flight)
        this.emit(
          "launch",
          this.rig.com(),
          "In flight",
          undefined,
          len(this.rig.velocity()),
        );
      this.flight += this.dt;
    } else if (this.flight > 0) this.flight = 0;
    if (this.rig.hand("left").x > this.rig.hand("right").x + 0.12 && count > 0)
      this.crossed = true;
    const goal =
      this.route.goal === "none" ||
      (this.route.goal === "cross" && this.crossed) ||
      (this.route.goal === "flight" && this.flew) ||
      (this.route.goal === "undercling" && this.undercling);
    if (
      this.rig.com().y < this.route.fallY ||
      !Number.isFinite(this.rig.com().y)
    ) {
      this.state = "fallen";
      this.emit("fall", this.rig.com(), this.lastCause || "Missed the catch");
    } else if (
      count === 2 &&
      hands.every((s) => this.contacts[s]?.hold.finish) &&
      goal
    ) {
      this.finishDwell += this.dt;
      if (this.finishDwell >= 0.35) {
        this.state = "finished";
        this.emit("finish", this.rig.com(), "Route complete");
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
    };
  }
}
