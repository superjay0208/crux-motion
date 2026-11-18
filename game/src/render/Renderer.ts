import type { Simulation } from "../core/Simulation";
import {
  hands,
  type Hold,
  type Hand,
  type Grip,
  type SimEvent,
} from "../core/types";
import { v, add, sub, mul, clamp, dist, ik, type V } from "../core/math";
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
  reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  ghost: { torso: V; angle: number; left: V; right: V; legs?: V } | null = null;
  private particles: { p: V; vel: V; life: number; color: string }[] = [];
  private callouts: {
    p: V;
    text: string;
    age: number;
    duration: number;
    color: string;
  }[] = [];
  private strainTick = { left: -1, right: -1 };
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
    this.callouts = [];
    this.strainTick = { left: -1, right: -1 };
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
      (hands.some((side) => s.contacts[side]?.hold.finish)
        ? s.route.holds.find((h) => h.finish)
        : undefined) ??
      s.route.holds.find((h) => h.checkpoint && !s.visited.has(h.id)) ??
      s.route.holds.find((h) => h.finish);
    this.view.reduced = this.reduced;
    this.view.update(
      this.w,
      this.h,
      s.rig.torso.getPosition(),
      nextHold?.p,
      dt,
      s.rig.velocity(),
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
        s,
        showIntent,
      );
    if (showIntent && s.state !== "finished" && nextHold) {
      const p = this.toScreen(nextHold.p),
        r = (nextHold.radius + 0.07) * this.scale;
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
    if (this.ghost) this.drawGhost(this.ghost);
    this.body(s, selected, showIntent, nextHold?.p);
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
    if (this.callouts.length) {
      ctx.save();
      for (const item of this.callouts) {
        item.age += dt;
        const alpha =
          clamp(item.age / 0.08, 0, 1) *
          clamp((item.duration - item.age) / 0.32, 0, 1);
        if (alpha <= 0.01) continue;
        const q = this.toScreen(item.p),
          rise = this.reduced ? 0 : (item.age / item.duration) * 18,
          cy = q.y - 30 - rise;
        ctx.globalAlpha = alpha;
        ctx.font = '700 10px "Barlow", sans-serif';
        const padX = 9,
          tw = ctx.measureText(item.text).width + padX * 2;
        ctx.fillStyle = "rgba(12, 26, 32, 0.86)";
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(q.x - tw / 2, cy - 10, tw, 20, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.textAlign = "center";
        ctx.fillText(item.text, q.x, cy + 3.5);
      }
      ctx.restore();
      this.callouts = this.callouts.filter((item) => item.age < item.duration);
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
  private hold(
    h: Hold,
    visited: boolean,
    occupied: boolean,
    s: Simulation,
    showIntent: boolean,
  ) {
    const c = this.ctx,
      p = this.toScreen(h.p),
      r = h.radius * this.scale;
    // Soft reachable ring when a free hand's aim is within h.radius + 0.08
    if (showIntent && s.state !== "finished") {
      const reaching = hands.find((side) => {
        if (s.contacts[side]) return false;
        const aim = s.rig.aim(side, s.input);
        if (dist(aim, h.p) <= h.radius + 0.08) return true;
        if (h.match) {
          const patch = add(h.p, v(side === "left" ? -0.09 : 0.09, 0));
          return dist(aim, patch) <= h.radius * 0.75 + 0.08;
        }
        return false;
      });
      if (reaching) {
        const ringColor = reaching === "left" ? "#93e7cf" : "#edbd8d";
        c.save();
        c.strokeStyle = ringColor + "66";
        c.fillStyle = ringColor + "12";
        c.lineWidth = 2.2;
        c.beginPath();
        c.arc(p.x, p.y, (h.radius + 0.042) * this.scale, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.restore();
      }
    }
    c.save();
    c.translate(p.x, p.y);
    if (h.direction.y < 0) c.rotate(Math.PI);
    else if (Math.abs(h.direction.x) > 0.2)
      c.rotate(-Math.atan2(h.direction.x, h.direction.y));
    c.shadowColor = "rgba(6, 15, 20, 0.52)";
    c.shadowBlur = 5;
    c.shadowOffsetX = 1.5;
    c.shadowOffsetY = 5;
    const holdPath = () => {
      c.beginPath();
      if (h.kind === "crimp") {
        c.roundRect(-r * 1.15, -r * 0.28, r * 2.3, r * 0.55, 2.5);
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
    };
    holdPath();
    c.fillStyle = h.finish ? "#f0e6cc" : colors[h.kind];
    c.fill();
    c.shadowColor = "transparent";
    // Sculpted 3D bevel shading inside clipped hold silhouette
    c.save();
    holdPath();
    c.clip();
    const bevel = c.createLinearGradient(0, -r, 0, r);
    bevel.addColorStop(0, "rgba(255, 255, 255, 0.30)");
    bevel.addColorStop(0.45, "rgba(255, 255, 255, 0.03)");
    bevel.addColorStop(1, "rgba(10, 24, 30, 0.30)");
    c.fillStyle = bevel;
    c.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
    if (visited) {
      // Subtle chalk dusting along the gripping lip on visited holds
      c.fillStyle = "rgba(244, 251, 247, 0.36)";
      c.beginPath();
      c.ellipse(0, -r * 0.34, r * 0.62, r * 0.16, 0, 0, Math.PI * 2);
      c.fill();
      let seed = 0;
      for (let i = 0; i < h.id.length; i++)
        seed = (seed * 31 + h.id.charCodeAt(i)) | 0;
      c.fillStyle = "rgba(250, 253, 251, 0.58)";
      for (let k = 0; k < 5; k++) {
        const sx = (((((seed + k * 97) % 19) + 19) % 19) / 18 - 0.5) * r * 1.1;
        const sy =
          -r * 0.22 - (((((seed + k * 53) % 11) + 11) % 11) / 10) * r * 0.28;
        c.beginPath();
        c.arc(sx, sy, 1.3 + (k % 2) * 0.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    holdPath();
    c.strokeStyle = occupied ? "#e7fff3" : "#0c191f";
    c.lineWidth = occupied ? 2.4 : 3;
    c.stroke();
    // Sculpted lip highlight
    c.strokeStyle = "#ffffff82";
    c.lineWidth = 2;
    c.beginPath();
    if (h.kind === "crimp") {
      c.moveTo(-r * 0.92, -r * 0.16);
      c.lineTo(r * 0.92, -r * 0.16);
    } else if (h.kind === "pinch") {
      c.moveTo(-r * 0.34, -r * 0.55);
      c.quadraticCurveTo(-r * 0.45, 0, -r * 0.32, r * 0.36);
      c.moveTo(r * 0.38, -r * 0.45);
      c.quadraticCurveTo(r * 0.5, 0.05, r * 0.34, r * 0.42);
    } else {
      c.moveTo(-r * 0.55, -r * 0.27);
      c.quadraticCurveTo(0, -r * 0.52, r * 0.55, -r * 0.25);
    }
    c.stroke();
    // Dual-patch subtle markers on match holds (TOP & dyno landings)
    if (h.match) {
      const patchOffset = Math.min(0.082 * this.scale, r * 0.48);
      for (const [sign, tint] of [
        [-1, "#93e7cf99"],
        [1, "#edbd8d99"],
      ] as const) {
        c.strokeStyle = tint;
        c.lineWidth = 1.6;
        c.beginPath();
        c.arc(
          sign * patchOffset,
          -r * 0.06,
          Math.max(4, r * 0.22),
          Math.PI * 1.1,
          Math.PI * 1.9,
        );
        c.stroke();
      }
    }
    c.fillStyle = "#172a3478";
    c.beginPath();
    c.arc(0, r * 0.15, 2.8, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // Clear directional chevron cues for scoop/undercling or sidepull holds
    if (h.direction.y < -0.5 || Math.abs(h.direction.x) > 0.2) {
      const dirLen = Math.hypot(h.direction.x, h.direction.y) || 1,
        nx = h.direction.x / dirLen,
        ny = h.direction.y / dirLen;
      const edge = this.toScreen(
        add(h.p, mul(v(nx, ny), h.radius + 0.055)),
      );
      // Point chevron inward into the active gripping face (-nx in world X, +ny in screen Y)
      const inAngle = Math.atan2(ny, -nx);
      c.save();
      c.translate(edge.x, edge.y);
      c.rotate(inAngle);
      c.strokeStyle = h.direction.y < -0.5 ? "#9ce7c8ee" : "#efb373ee";
      c.lineWidth = 1.8;
      c.lineCap = "round";
      c.lineJoin = "round";
      for (const offset of [-3.5, 1.5]) {
        c.beginPath();
        c.moveTo(offset - 4, -4.2);
        c.lineTo(offset, 0);
        c.lineTo(offset - 4, 4.2);
        c.stroke();
      }
      c.restore();
    }
    const labelOffset = h.direction.y < -0.5 ? r + 13 : r + 12;
    c.font = '600 10px "Barlow", sans-serif';
    c.textAlign = "center";
    c.fillStyle = h.finish ? "#f2e8d1" : visited ? "#91e9ca" : "#c1ceca88";
    c.fillText(h.label || "", p.x, p.y - labelOffset);
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
  private drawGhost(g: NonNullable<Renderer["ghost"]>) {
    const c = this.ctx,
      cos = Math.cos(g.angle),
      sin = Math.sin(g.angle),
      local = (lx: number, ly: number) =>
        v(g.torso.x + lx * cos - ly * sin, g.torso.y + lx * sin + ly * cos);
    const hip = local(0, -0.25),
      legEnd = g.legs ?? local(0, -0.77),
      fill = "rgba(156, 231, 200, 0.16)",
      rim = "rgba(186, 246, 224, 0.34)";
    c.save();
    this.line(add(hip, v(-0.08, 0)), add(legEnd, v(-0.13, 0)), fill, 0.1);
    this.line(add(hip, v(0.08, 0)), add(legEnd, v(0.17, 0.04)), fill, 0.1);
    const tp = this.toScreen(g.torso);
    c.save();
    c.translate(tp.x, tp.y);
    c.rotate(-g.angle);
    c.fillStyle = fill;
    c.strokeStyle = rim;
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(
      -0.19 * this.scale,
      -0.36 * this.scale,
      0.38 * this.scale,
      0.76 * this.scale,
      10,
    );
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(
      0,
      -0.52 * this.scale,
      0.135 * this.scale,
      0.155 * this.scale,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.stroke();
    c.font = '700 8px "Barlow", sans-serif';
    c.fillStyle = "rgba(186, 246, 224, 0.55)";
    c.textAlign = "center";
    c.fillText("PB", 0, -0.73 * this.scale);
    c.restore();
    for (const side of hands) {
      const sh = local(side === "left" ? -0.19 : 0.19, 0.28),
        target = side === "left" ? g.left : g.right,
        elPt = ik(sh, target, 0.36, 0.39, side === "left" ? -1 : 1).point;
      this.line(sh, elPt, fill, 0.09);
      this.line(elPt, target, fill, 0.08);
      const hp = this.toScreen(target);
      c.strokeStyle = rim;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(hp.x, hp.y, 0.05 * this.scale, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  private drawGripGlyph(hp: V, side: Hand, grip: Grip, color: string) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 2;
    c.lineCap = "round";
    c.lineJoin = "round";
    if (grip === "release") {
      for (const a of [-2.35, -1.9, -1.57, -1.24, -0.79]) {
        c.beginPath();
        c.moveTo(hp.x + Math.cos(a) * 4.2, hp.y + Math.sin(a) * 4.2);
        c.lineTo(hp.x + Math.cos(a) * 8.2, hp.y + Math.sin(a) * 8.2);
        c.stroke();
      }
    } else if (grip === "crimp") {
      const dir = side === "left" ? -1 : 1;
      c.beginPath();
      c.moveTo(hp.x - 5 * dir, hp.y - 2.2);
      c.lineTo(hp.x + 4.2 * dir, hp.y - 2.2);
      c.lineTo(hp.x + 5.2 * dir, hp.y + 2.6);
      c.stroke();
    } else if (grip === "sloper") {
      c.beginPath();
      c.arc(hp.x, hp.y + 2, 5.2, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
    } else if (grip === "pinch") {
      c.beginPath();
      if (side === "right") {
        c.arc(hp.x + 0.8, hp.y, 4.5, Math.PI * 0.32, Math.PI * 1.68);
      } else {
        c.arc(hp.x - 0.8, hp.y, 4.5, -Math.PI * 0.68, Math.PI * 0.68);
      }
      c.stroke();
    } else if (grip === "jug") {
      c.beginPath();
      c.arc(hp.x, hp.y, 3.4, 0, Math.PI * 2);
      c.fill();
    } else {
      c.globalAlpha = 0.55;
      c.beginPath();
      c.arc(hp.x, hp.y, 2.4, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  private body(
    s: Simulation,
    selected: Hand,
    intent: boolean,
    nextPos?: V,
  ) {
    const c = this.ctx,
      rig = s.rig,
      torso = rig.torso,
      torsoPos = torso.getPosition(),
      torsoAngle = torso.getAngle();
    // Body transforms are physical, including the passive lower-body hinge.
    const hip = torso.getWorldPoint(v(0, -0.25)),
      legEnd = rig.legs.getWorldPoint(v(0, -0.34));
    // Depth-sort arms: active/free or newly crossed arm in front, supporting arm behind
    let frontSide: Hand = selected;
    if (!s.contacts.left && s.contacts.right) frontSide = "left";
    else if (!s.contacts.right && s.contacts.left) frontSide = "right";
    else if (
      s.contacts.left &&
      s.contacts.right &&
      Math.abs(s.contacts.left.age - s.contacts.right.age) > 1e-4
    ) {
      frontSide =
        s.contacts.left.age < s.contacts.right.age ? "left" : "right";
    }
    const backSide: Hand = frontSide === "left" ? "right" : "left";
    const armOrder: [Hand, Hand] = [backSide, frontSide];
    // 1. Subtle wall drop-shadow pass offset (3, 5) px behind the climber
    const shadowCol = "rgba(10, 22, 28, 0.28)";
    c.save();
    c.translate(3, 5);
    this.line(add(hip, v(-0.08, 0)), add(legEnd, v(-0.13, 0)), shadowCol, 0.105);
    this.line(add(hip, v(0.08, 0)), add(legEnd, v(0.17, 0.04)), shadowCol, 0.105);
    const sp = this.toScreen(torsoPos);
    c.save();
    c.translate(sp.x, sp.y);
    c.rotate(-torsoAngle);
    c.fillStyle = shadowCol;
    c.beginPath();
    c.roundRect(
      -0.2 * this.scale,
      -0.36 * this.scale,
      0.4 * this.scale,
      0.77 * this.scale,
      10,
    );
    c.fill();
    c.beginPath();
    c.ellipse(
      0,
      -0.52 * this.scale,
      0.14 * this.scale,
      0.16 * this.scale,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
    for (const side of armOrder) {
      const sh = rig.shoulder(side),
        elPt = rig.arms[side].elbow.getAnchorA(),
        hd = rig.hand(side);
      this.line(sh, elPt, shadowCol, 0.095);
      this.line(elPt, hd, shadowCol, 0.083);
    }
    c.restore();
    // 2. Legs & climbing shoes
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
    // 3. Torso, chalk bag at waist & expressive head/gaze
    const gazeWorld = !s.contacts[frontSide]
      ? rig.aim(frontSide, s.input)
      : (nextPos ?? add(torsoPos, v(0, 0.85)));
    const headWorld = torso.getWorldPoint(v(0, 0.52)),
      gDelta = sub(gazeWorld, headWorld),
      cosT = Math.cos(-torsoAngle),
      sinT = Math.sin(-torsoAngle),
      localGx = gDelta.x * cosT - gDelta.y * sinT,
      localGy = gDelta.x * sinT + gDelta.y * cosT,
      gNorm = Math.hypot(localGx, localGy) || 1,
      gx = clamp(localGx / gNorm, -1, 1),
      gy = clamp(localGy / gNorm, -1, 1);
    const p = this.toScreen(torsoPos);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-torsoAngle);
    // Shorts
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
    // Shirt
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
    // Small chalk bag at the back of the shorts waist
    c.strokeStyle = "#243942";
    c.lineWidth = Math.max(1.5, 0.018 * this.scale);
    c.beginPath();
    c.moveTo(-0.19 * this.scale, 0.14 * this.scale);
    c.lineTo(0.19 * this.scale, 0.14 * this.scale);
    c.stroke();
    c.fillStyle = "#cf8462";
    c.strokeStyle = "#0d1b22";
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(
      -0.095 * this.scale,
      0.115 * this.scale,
      0.11 * this.scale,
      0.135 * this.scale,
      4,
    );
    c.fill();
    c.stroke();
    c.fillStyle = "#eaf4ee";
    c.beginPath();
    c.roundRect(
      -0.092 * this.scale,
      0.11 * this.scale,
      0.104 * this.scale,
      0.032 * this.scale,
      2,
    );
    c.fill();
    // Head + subtle gaze turn toward active free hand's aim or nextHold
    c.save();
    c.translate(0, -0.52 * this.scale);
    c.rotate(gx * 0.14);
    c.fillStyle = "#dcb494";
    c.beginPath();
    c.ellipse(0, 0, 0.14 * this.scale, 0.16 * this.scale, 0, 0, Math.PI * 2);
    c.fill();
    // Gaze eyes looking toward active hand / next hold
    const eyeX = gx * 0.052 * this.scale,
      eyeY = -gy * 0.042 * this.scale - 0.015 * this.scale,
      eyeR = Math.max(1.6, 0.017 * this.scale);
    c.fillStyle = "#1b2930";
    c.beginPath();
    c.arc(eyeX - 0.032 * this.scale, eyeY, eyeR, 0, Math.PI * 2);
    c.arc(eyeX + 0.032 * this.scale, eyeY, eyeR, 0, Math.PI * 2);
    c.fill();
    // Hair cap shifted slightly opposite gaze for 3D head turn cues
    c.fillStyle = "#1b2930";
    c.beginPath();
    c.ellipse(
      (-0.012 - gx * 0.024) * this.scale,
      (-0.085 + gy * 0.015) * this.scale,
      0.142 * this.scale,
      0.082 * this.scale,
      -0.08 + gx * 0.08,
      Math.PI,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
    c.restore();
    // 4. Depth-sorted arms with crisp sleeve & forearm crossing separator
    for (const side of armOrder) {
      const isFront = side === frontSide,
        arm = rig.arms[side],
        shoulder = rig.shoulder(side),
        elbow = arm.elbow.getAnchorA(),
        hand = rig.hand(side),
        skin = isFront
          ? side === "left"
            ? "#dbaea0"
            : "#e6c19f"
          : side === "left"
            ? "#c39478"
            : "#cfa485";
      const sepColor = isFront ? "#09161de6" : "#09161db0",
        sepUpper = isFront ? 0.128 : 0.116,
        sepFore = isFront ? 0.114 : 0.104;
      this.line(shoulder, elbow, sepColor, sepUpper);
      this.line(elbow, hand, sepColor, sepFore);
      this.line(shoulder, elbow, skin, 0.095);
      this.line(elbow, hand, skin, 0.083);
      // Short sleeve cap + cuff separator at shoulder
      const sleeveEnd = add(shoulder, mul(sub(elbow, shoulder), 0.3));
      this.line(
        shoulder,
        sleeveEnd,
        isFront ? "#6ec8b0" : "#51a993",
        0.108,
      );
      if (isFront) {
        this.line(elbow, hand, "#ffffff1c", 0.028);
      }
    }
    // 5. Wrist rings, grip-shape indicators, strain warnings & intent guides
    for (const side of armOrder) {
      const shoulder = rig.shoulder(side),
        hand = rig.hand(side),
        hp = this.toScreen(hand),
        contact = s.contacts[side],
        accent = side === "left" ? "#93e7cf" : "#edbd8d";
      const strainVal =
        typeof (s as { strain?: (h: Hand) => number }).strain === "function"
          ? s.strain(side)
          : 0;
      const highStrain =
        !!contact &&
        (contact.load > 1.15 || contact.drift > 0.025 || strainVal > 0.72);
      if (highStrain) {
        const sev = clamp(
            Math.max(
              strainVal,
              (contact!.load - 0.85) / 0.65,
              contact!.drift / 0.08,
            ),
            0.35,
            1,
          ),
          warnColor = sev > 0.82 ? "#ff7a66" : "#f5b26b",
          pulse = this.reduced ? 0 : Math.sin(s.tick * 0.22) * 1.2;
        c.save();
        c.strokeStyle = warnColor;
        c.lineWidth = 2.6;
        c.beginPath();
        c.arc(
          hp.x,
          hp.y,
          17 + pulse,
          -Math.PI * 0.85,
          -Math.PI * 0.85 + Math.PI * (0.7 + sev * 0.9),
        );
        c.stroke();
        c.restore();
        if (
          !this.reduced &&
          s.tick !== this.strainTick[side] &&
          s.tick % 6 === 0
        ) {
          this.strainTick[side] = s.tick;
          const jitter = ((s.tick * 17 + (side === "left" ? 3 : 9)) % 11) - 5;
          this.particles.push({
            p: add(hand, v(jitter * 0.008, -0.02)),
            vel: v(jitter * 0.04, -0.25),
            life: 0.36,
            color: warnColor,
          });
        }
      }
      c.strokeStyle = highStrain ? "#ff9478" : accent;
      c.lineWidth = 2.8;
      c.beginPath();
      c.arc(hp.x, hp.y, 0.055 * this.scale, 0, Math.PI * 2);
      c.stroke();
      if (contact || s.reserve[side] < 0.95) {
        c.strokeStyle = "#ffffff14";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(hp.x, hp.y, 13, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle =
          highStrain || s.reserve[side] < 0.25 ? "#f49c81" : accent;
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
      const shownGrip: Grip =
        s.input[side].grip === "unknown" && contact
          ? contact.hold.kind
          : s.input[side].grip;
      this.drawGripGlyph(hp, side, shownGrip, highStrain ? "#ffd2c2" : accent);
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
        c.arc(target.x, target.y, 9, 0, Math.PI * 2);
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
    if (e.kind === "finish") {
      this.callouts.push({
        p: add(e.p, v(0, 0.35)),
        text: "ROUTE COMPLETE",
        age: 0,
        duration: 0.9,
        color: "#f0e6cc",
      });
    } else if (e.kind === "catch") {
      if (/dyno/i.test(e.message)) {
        this.callouts.push({
          p: { ...e.p },
          text: "DYNO!",
          age: 0,
          duration: 0.9,
          color: "#9ce7c8",
        });
      } else if (/clean/i.test(e.message)) {
        this.callouts.push({
          p: { ...e.p },
          text: "CLEAN CATCH",
          age: 0,
          duration: 0.9,
          color: "#d2f8c9",
        });
      }
    }
    if (this.callouts.length > 3) this.callouts.splice(0, this.callouts.length - 3);
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
