import type { Simulation } from "../core/Simulation";
import { hands, type Hold, type Hand, type SimEvent } from "../core/types";
import { v, add, sub, mul, clamp, type V } from "../core/math";
import { FollowCamera } from "./FollowCamera";
const colors = {
  jug: "#8ae2c7",
  crimp: "#efb373",
  sloper: "#a9baf2",
  pinch: "#ef9f96",
};
export class Renderer {
  ctx: CanvasRenderingContext2D;
  w = 1;
  h = 1;
  scale = 1;
  origin = v();
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private particles: { p: V; vel: V; life: number; color: string }[] = [];
  private seen = 0;
  private trail: V[] = [];
  readonly view = new FollowCamera();
  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }
  toScreen(p: V) {
    return v(
      this.origin.x + p.x * this.scale,
      this.origin.y - p.y * this.scale,
    );
  }
  toWorld(p: V) {
    return v(
      (p.x - this.origin.x) / this.scale,
      (this.origin.y - p.y) / this.scale,
    );
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    if (
      this.canvas.width !== Math.round(r.width * dpr) ||
      this.canvas.height !== Math.round(r.height * dpr)
    ) {
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  reset() {
    this.view.reset();
    this.particles = [];
    this.seen = 0;
    this.trail = [];
  }
  render(
    s: Simulation,
    selected: Hand = "left",
    showIntent = true,
    dt = 1 / 60,
  ) {
    this.resize();
    const ctx = this.ctx;
    const nextHold =
      s.route.holds.find((h) => h.checkpoint && !s.visited.has(h.id)) ??
      s.route.holds.find((h) => h.finish);
    this.view.update(
      this.w,
      this.h,
      s.rig.torso.getPosition(),
      nextHold?.p,
      dt,
    );
    this.scale = this.view.scale;
    this.origin = this.view.origin;
    ctx.clearRect(0, 0, this.w, this.h);
    const bg = ctx.createLinearGradient(0, 0, this.w, this.h);
    bg.addColorStop(0, "#1d3036");
    bg.addColorStop(1, "#13252c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);
    // Wall panels, seams and bolt pattern are procedural, with no raster assets.
    ctx.strokeStyle = "#ffffff06";
    ctx.lineWidth = 1;
    for (let x = -3; x < 3; x += 0.85) {
      const p = this.toScreen(v(x, 0));
      ctx.beginPath();
      ctx.moveTo(p.x - 40, 0);
      ctx.lineTo(p.x + 35, this.h);
      ctx.stroke();
    }
    for (let x = -2.3; x < 2.4; x += 0.22)
      for (let y = -2; y < 5; y += 0.25) {
        const p = this.toScreen(v(x, y));
        ctx.fillStyle = "#c8dfd312";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    // A quiet contour motif gives the wall depth without crowding contact cues.
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = "#83cbb5";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(
        this.w * 0.87,
        this.h * 0.57,
        110 + i * 18,
        230 + i * 21,
        -0.35,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = "#c5e2d121";
    ctx.beginPath();
    s.route.holds
      .filter((h) => h.checkpoint || h.finish)
      .forEach((h, i) => {
        const p = this.toScreen(h.p);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
    ctx.stroke();
    ctx.setLineDash([]);
    for (const hold of s.route.holds)
      this.hold(
        hold,
        s.visited.has(hold.id),
        hands.some((side) => s.contacts[side]?.hold.id === hold.id),
      );
    if (showIntent && s.state !== "finished") {
      const next =
        (hands.some((side) => s.contacts[side]?.hold.finish)
          ? s.route.holds.find((h) => h.finish)
          : undefined) ??
        s.route.holds.find((h) => h.checkpoint && !s.visited.has(h.id)) ??
        s.route.holds.find((h) => h.finish);
      if (next) {
        const p = this.toScreen(next.p),
          r = (next.radius + 0.07) * this.scale;
        ctx.strokeStyle = "#d2f8c9aa";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#d2f8c9";
        ctx.font = '700 11px "Barlow", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText("NEXT", p.x, p.y - r - 17);
      }
    }
    if (s.tick % 3 === 0) {
      this.trail.push({ ...s.rig.com() });
      if (this.trail.length > 24) this.trail.shift();
    }
    if (!this.reduced && s.flight > 0) {
      ctx.strokeStyle = "#b0f5df32";
      ctx.lineWidth = 3;
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        const q = this.toScreen(p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
    }
    this.body(s, selected, showIntent);
    for (const e of s.events)
      if (e.id > this.seen) {
        this.seen = e.id;
        this.effect(e);
      }
    if (!this.reduced) {
      for (const p of this.particles) {
        p.life -= dt;
        p.vel.y -= dt * 0.8;
        p.p = add(p.p, mul(p.vel, dt));
        const q = this.toScreen(p.p);
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(q.x, q.y, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
      this.particles = this.particles.filter((p) => p.life > 0).slice(-180);
    }
    const floor = this.toScreen(v(0, -1.12));
    if (floor.y < this.h) {
      ctx.fillStyle = "#101e24";
      ctx.fillRect(0, floor.y, this.w, this.h - floor.y);
      ctx.strokeStyle = "#ffffff13";
      ctx.beginPath();
      ctx.moveTo(0, floor.y);
      ctx.lineTo(this.w, floor.y);
      ctx.stroke();
    }
    ctx.font = '10px "Barlow", sans-serif';
    ctx.fillStyle = "#9bb4b36b";
    ctx.textAlign = "right";
    ctx.fillText("CAMPUS / UPPER BODY ONLY", this.w - 22, this.h - 20);
  }
  private hold(h: Hold, visited: boolean, occupied: boolean) {
    const c = this.ctx,
      p = this.toScreen(h.p),
      r = h.radius * this.scale;
    c.save();
    c.translate(p.x, p.y);
    if (h.direction.y < 0) c.rotate(Math.PI);
    else if (Math.abs(h.direction.x) > 0.2)
      c.rotate(-Math.atan2(h.direction.x, h.direction.y));
    c.shadowColor = "#0007";
    c.shadowBlur = 2;
    c.shadowOffsetY = 5;
    c.beginPath();
    if (h.kind === "crimp") {
      c.roundRect(-r * 1.15, -r * 0.28, r * 2.3, r * 0.55, 2);
    } else if (h.kind === "pinch") {
      c.moveTo(-r * 0.45, -r);
      c.quadraticCurveTo(r, -r * 0.4, r * 0.52, r * 0.6);
      c.quadraticCurveTo(0, r * 1.2, -r * 0.58, r * 0.5);
      c.closePath();
    } else if (h.kind === "sloper") {
      c.ellipse(0, 0, r * 1.12, r * 0.72, -0.1, 0, Math.PI * 2);
    } else {
      c.moveTo(-r * 0.9, -r * 0.15);
      c.lineTo(-r * 0.6, -r * 0.65);
      c.quadraticCurveTo(0, -r * 0.95, r * 0.7, -r * 0.45);
      c.lineTo(r, r * 0.1);
      c.lineTo(r * 0.6, r * 0.6);
      c.quadraticCurveTo(0, r * 0.83, -r * 0.72, r * 0.5);
      c.closePath();
    }
    c.fillStyle = h.finish ? "#f0e6cc" : colors[h.kind];
    c.strokeStyle = occupied ? "#e7fff3" : "#0c191f";
    c.lineWidth = occupied ? 2 : 3;
    c.fill();
    c.stroke();
    c.shadowColor = "transparent";
    c.strokeStyle = "#ffffff77";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-r * 0.55, -r * 0.27);
    c.quadraticCurveTo(0, -r * 0.5, r * 0.55, -r * 0.25);
    c.stroke();
    c.fillStyle = "#172a3466";
    c.beginPath();
    c.arc(0, r * 0.15, 2.8, 0, 7);
    c.fill();
    c.restore();
    c.font = '600 10px "Barlow", sans-serif';
    c.textAlign = "center";
    c.fillStyle = h.finish ? "#f2e8d1" : visited ? "#91e9ca" : "#c1ceca88";
    c.fillText(h.label || "", p.x, p.y - r - 12);
    if (visited && !occupied) {
      c.fillStyle = "#8ae2c7";
      c.font = "10px sans-serif";
      c.fillText("✓", p.x + r + 8, p.y);
    }
  }
  private line(a: V, b: V, color: string, width: number) {
    const c = this.ctx,
      A = this.toScreen(a),
      B = this.toScreen(b);
    c.strokeStyle = color;
    c.lineWidth = width * this.scale;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.lineTo(B.x, B.y);
    c.stroke();
  }
  private body(s: Simulation, selected: Hand, intent: boolean) {
    const c = this.ctx,
      rig = s.rig,
      torso = rig.torso;
    // Body transforms are physical, including the passive lower-body hinge.
    const hip = torso.getWorldPoint(v(0, -0.25)),
      legEnd = rig.legs.getWorldPoint(v(0, -0.34));
    this.line(
      add(hip, v(-0.08, 0)),
      add(legEnd, v(-0.13, 0)),
      "#c99c7e",
      0.105,
    );
    this.line(
      add(hip, v(0.08, 0)),
      add(legEnd, v(0.17, 0.04)),
      "#d9b293",
      0.105,
    );
    this.line(
      add(legEnd, v(-0.15, -0.01)),
      add(legEnd, v(-0.04, -0.04)),
      "#101c23",
      0.09,
    );
    this.line(
      add(legEnd, v(0.15, 0.03)),
      add(legEnd, v(0.27, 0.02)),
      "#101c23",
      0.09,
    );
    const p = this.toScreen(torso.getPosition());
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-torso.getAngle());
    c.fillStyle = "#122029";
    c.beginPath();
    c.roundRect(
      -0.2 * this.scale,
      0.12 * this.scale,
      0.4 * this.scale,
      0.29 * this.scale,
      8,
    );
    c.fill();
    c.fillStyle = "#63bea7";
    c.beginPath();
    c.roundRect(
      -0.2 * this.scale,
      -0.36 * this.scale,
      0.4 * this.scale,
      0.52 * this.scale,
      10,
    );
    c.fill();
    c.fillStyle = "#ffffff20";
    c.fillRect(
      -0.14 * this.scale,
      -0.32 * this.scale,
      0.025 * this.scale,
      0.36 * this.scale,
    );
    c.fillStyle = "#dcb494";
    c.beginPath();
    c.ellipse(
      0,
      -0.52 * this.scale,
      0.14 * this.scale,
      0.16 * this.scale,
      0,
      0,
      7,
    );
    c.fill();
    c.fillStyle = "#1b2930";
    c.beginPath();
    c.ellipse(
      -0.012 * this.scale,
      -0.61 * this.scale,
      0.14 * this.scale,
      0.08 * this.scale,
      -0.1,
      Math.PI,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
    for (const side of hands) {
      const arm = rig.arms[side],
        shoulder = rig.shoulder(side),
        elbow = arm.elbow.getAnchorA(),
        hand = rig.hand(side);
      this.line(shoulder, elbow, "#00000020", 0.12);
      this.line(elbow, hand, "#00000020", 0.105);
      this.line(
        shoulder,
        elbow,
        side === "left" ? "#d4a687" : "#e2bb99",
        0.095,
      );
      this.line(elbow, hand, side === "left" ? "#d4a687" : "#e2bb99", 0.083);
      const hp = this.toScreen(hand),
        contact = s.contacts[side],
        accent = side === "left" ? "#93e7cf" : "#edbd8d";
      c.strokeStyle = accent;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(hp.x, hp.y, 0.055 * this.scale, 0, 7);
      c.stroke();
      if (contact || s.reserve[side] < 0.95) {
        c.strokeStyle = "#ffffff14";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(hp.x, hp.y, 13, 0, 7);
        c.stroke();
        c.strokeStyle = s.reserve[side] < 0.25 ? "#f49c81" : accent;
        c.beginPath();
        c.arc(
          hp.x,
          hp.y,
          13,
          -Math.PI / 2,
          -Math.PI / 2 + s.reserve[side] * Math.PI * 2,
        );
        c.stroke();
      }
      if (contact) {
        c.fillStyle = accent;
        c.beginPath();
        c.arc(hp.x, hp.y, 3, 0, 7);
        c.fill();
      }
      c.font = '700 9px "Barlow", sans-serif';
      c.fillStyle = accent;
      c.textAlign = "center";
      c.fillText(side === "left" ? "L" : "R", hp.x, hp.y - 19);
      if (intent) {
        const target = this.toScreen(rig.aim(side, s.input));
        const motion = s.input[side].arm;
        if (motion) {
          const elbowAim = this.toScreen(
            add(
              shoulder,
              v(0.36 * Math.cos(motion.upper), 0.36 * Math.sin(motion.upper)),
            ),
          );
          const shoulderAim = this.toScreen(shoulder);
          c.strokeStyle = accent + "55";
          c.lineWidth = 1.5;
          c.setLineDash([3, 4]);
          c.beginPath();
          c.moveTo(shoulderAim.x, shoulderAim.y);
          c.lineTo(elbowAim.x, elbowAim.y);
          c.lineTo(target.x, target.y);
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = accent + "88";
          c.beginPath();
          c.arc(elbowAim.x, elbowAim.y, 2.5, 0, Math.PI * 2);
          c.fill();
        }
        c.strokeStyle = accent + "aa";
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(hp.x, hp.y);
        c.lineTo(target.x, target.y);
        c.stroke();
        c.setLineDash([3, 3]);
        c.beginPath();
        c.arc(target.x, target.y, 9, 0, 7);
        c.stroke();
        c.setLineDash([]);
        c.font = '600 9px "Barlow", sans-serif';
        c.fillStyle = accent;
        c.textAlign = "center";
        c.fillText(
          side === "left" ? "L AIM" : "R AIM",
          target.x,
          target.y + 22,
        );
      }
    }
    // Overall reserve follows the hip; hand resources remain separate.
    const h = this.toScreen(hip);
    c.fillStyle = "#07171d99";
    c.beginPath();
    c.roundRect(h.x - 22, h.y + 14, 44, 4, 2);
    c.fill();
    c.fillStyle = "#94ccb8";
    c.beginPath();
    c.roundRect(h.x - 22, h.y + 14, 44 * s.energy, 4, 2);
    c.fill();
  }
  private effect(e: SimEvent) {
    if (e.kind !== "catch" && e.kind !== "slip" && e.kind !== "finish") return;
    for (let i = 0; i < (e.kind === "finish" ? 50 : 16); i++) {
      const a = i * 2.399;
      this.particles.push({
        p: { ...e.p },
        vel: v(Math.cos(a) * (0.2 + (i % 5) * 0.13), Math.sin(a) * 0.6 + 0.3),
        life: 0.4 + (i % 5) * 0.12,
        color: e.kind === "slip" ? "#eab680" : "#e5f4df",
      });
    }
  }
}
