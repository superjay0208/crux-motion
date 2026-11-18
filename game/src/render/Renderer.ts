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

type ImpactKind = "launch" | "dyno" | "apex" | "finish";

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
  impactFrame: {
    timer: number;
    duration: number;
    kind: ImpactKind;
    p: V;
    dir: V;
  } | null = null;
  private particles: {
    p: V;
    vel: V;
    life: number;
    color: string;
    size?: number;
  }[] = [];
  private callouts: {
    p: V;
    text: string;
    age: number;
    duration: number;
    color: string;
    accent: string;
    bg: string;
    emphasis: boolean;
  }[] = [];
  private strainTick = { left: -1, right: -1 };
  private restTick = { left: -1, right: -1 };
  private seen = 0;
  private trail: V[] = [];
  private bgGradient: CanvasGradient | null = null;
  private bgW = 0;
  private bgH = 0;
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
    if (this.w !== r.width || this.h !== r.height) {
      this.bgGradient = null;
    }
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
    this.impactFrame = null;
    this.particles = [];
    this.callouts = [];
    this.strainTick = { left: -1, right: -1 };
    this.restTick = { left: -1, right: -1 };
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

    if (this.impactFrame) {
      this.impactFrame.timer -= dt;
      const elapsed = this.impactFrame.duration - this.impactFrame.timer;
      if (elapsed >= Math.max(this.impactFrame.duration, 0.11)) {
        this.impactFrame = null;
      }
    }
    for (const e of s.events) {
      if (e.id > this.seen) {
        this.seen = e.id;
        this.effect(e, s);
      }
    }

    if (!this.reduced && s.state === "playing") {
      const restingFn = (s as any).resting as
        | ((side: Hand) => boolean)
        | undefined;
      if (typeof restingFn === "function") {
        for (const side of hands) {
          if (
            restingFn.call(s, side) &&
            s.tick !== this.restTick[side] &&
            s.tick % 10 === (side === "left" ? 0 : 5)
          ) {
            this.restTick[side] = s.tick;
            const fromBag = ((s.tick / 10) | 0) % 2 === 0;
            const bagPos = s.rig.torso.getWorldPoint(v(-0.04, -0.18));
            const src = fromBag ? bagPos : s.rig.hand(side);
            const driftX = (((s.tick * 13 + (side === "left" ? 2 : 7)) % 9) - 4) * 0.025;
            this.particles.push({
              p: add(src, v(driftX * 0.3, -0.015)),
              vel: v(driftX, 0.12),
              life: 0.46,
              color: "#edf8f2",
              size: 2.1,
            });
          }
        }
      }
    }

    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.bgGradient || this.bgW !== this.w || this.bgH !== this.h) {
      const bg = ctx.createLinearGradient(0, 0, this.w, this.h);
      bg.addColorStop(0, "#1d3036");
      bg.addColorStop(1, "#13252c");
      this.bgGradient = bg;
      this.bgW = this.w;
      this.bgH = this.h;
    }
    ctx.fillStyle = this.bgGradient;
    ctx.fillRect(0, 0, this.w, this.h);

    let kickX = 0,
      kickY = 0;
    if (!this.reduced && this.impactFrame) {
      const imp = this.impactFrame;
      const elapsed = clamp(imp.duration - imp.timer, 0, 0.11);
      if (elapsed < 0.11) {
        const decay = (1 - elapsed / 0.11) ** 2;
        const basePx =
          imp.kind === "apex" || imp.kind === "finish"
            ? 5.8
            : imp.kind === "dyno"
              ? 5.0
              : 4.2;
        const mag = basePx * decay;
        kickX = imp.dir.x * mag;
        kickY = -imp.dir.y * mag;
      }
    }

    ctx.save();
    if (kickX !== 0 || kickY !== 0) {
      ctx.translate(kickX, kickY);
    }

    // Wall panels, seams and bolt pattern are procedural, with no raster assets.
    ctx.strokeStyle = "#ffffff06";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -3; x < 3; x += 0.85) {
      const p = this.toScreen(v(x, 0));
      ctx.moveTo(p.x - 40, 0);
      ctx.lineTo(p.x + 35, this.h);
    }
    ctx.stroke();
    const worldMin = this.toWorld(v(-8, this.h + 8)),
      worldMax = this.toWorld(v(this.w + 8, -8)),
      minX =
        -2.3 +
        Math.max(0, Math.ceil((Math.max(-2.3, worldMin.x) + 2.3) / 0.22)) *
          0.22,
      maxX = Math.min(2.4, worldMax.x),
      minY =
        -2 +
        Math.max(0, Math.ceil((Math.max(-2, worldMin.y) + 2) / 0.25)) * 0.25,
      maxY = Math.min(5, worldMax.y);
    ctx.fillStyle = "#c8dfd312";
    ctx.beginPath();
    for (let x = minX; x < maxX; x += 0.22)
      for (let y = minY; y < maxY; y += 0.25) {
        const p = this.toScreen(v(x, y));
        ctx.moveTo(p.x + 1.3, p.y);
        ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
      }
    ctx.fill();
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
      const dynoAir = !!(s as any).dynoLaunch;
      ctx.strokeStyle = dynoAir ? "#ffd98e4d" : "#b0f5df32";
      ctx.lineWidth = dynoAir ? 3.8 : 3;
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        const q = this.toScreen(p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
    }

    if (this.ghost) this.drawGhost(this.ghost);
    this.drawDynoPreview(s, showIntent);
    this.body(s, selected, showIntent, nextHold?.p);

    if (!this.reduced && this.impactFrame && this.impactFrame.timer > 0) {
      this.drawImpactOverlay(this.impactFrame);
    }

    if (!this.reduced) {
      for (const p of this.particles) {
        p.life -= dt;
        p.vel.y -= dt * 0.85;
        p.p = add(p.p, mul(p.vel, dt));
        const q = this.toScreen(p.p);
        const sz = p.size ?? 2.5;
        ctx.globalAlpha = clamp(p.life * 1.35, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(q.x - sz * 0.5, q.y - sz * 0.5, sz, sz);
      }
      ctx.globalAlpha = 1;
      this.particles = this.particles.filter((p) => p.life > 0);
      if (this.particles.length > 180) {
        this.particles = this.particles.slice(-180);
      }
    }

    if (this.callouts.length) {
      ctx.save();
      for (const item of this.callouts) {
        item.age += dt;
        const alpha =
          clamp(item.age / 0.06, 0, 1) *
          clamp((item.duration - item.age) / 0.3, 0, 1);
        if (alpha <= 0.01) continue;
        const q = this.toScreen(item.p),
          rise = this.reduced ? 0 : (item.age / item.duration) * 22,
          pop =
            !this.reduced && item.emphasis
              ? 1 + 0.14 * Math.exp(-item.age * 20)
              : 1,
          cy = q.y - 32 - rise;
        ctx.save();
        ctx.translate(q.x, cy);
        if (pop !== 1) ctx.scale(pop, pop);
        ctx.globalAlpha = alpha;
        ctx.font = item.emphasis
          ? '800 10.5px "Barlow", sans-serif'
          : '700 10px "Barlow", sans-serif';
        const padX = item.emphasis ? 11 : 9,
          pillH = item.emphasis ? 22 : 20,
          tw = ctx.measureText(item.text).width + padX * 2;
        if (item.emphasis) {
          ctx.strokeStyle = item.accent + "55";
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.roundRect(-tw / 2 - 1.5, -pillH / 2 - 1.5, tw + 3, pillH + 3, 12);
          ctx.stroke();
        }
        ctx.fillStyle = item.bg;
        ctx.strokeStyle = item.accent;
        ctx.lineWidth = item.emphasis ? 1.6 : 1.2;
        ctx.beginPath();
        ctx.roundRect(-tw / 2, -pillH / 2, tw, pillH, pillH / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.textAlign = "center";
        ctx.fillText(item.text, 0, 3.6);
        ctx.restore();
      }
      ctx.restore();
      this.callouts = this.callouts.filter((item) => item.age < item.duration);
    }

    const floor = this.toScreen(v(0, -1.12));
    if (floor.y < this.h + 8) {
      ctx.fillStyle = "#101e24";
      ctx.fillRect(-8, floor.y, this.w + 16, this.h - floor.y + 16);
      ctx.strokeStyle = "#ffffff13";
      ctx.beginPath();
      ctx.moveTo(-8, floor.y);
      ctx.lineTo(this.w + 8, floor.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '10px "Barlow", sans-serif';
    ctx.fillStyle = "#9bb4b36b";
    ctx.textAlign = "right";
    ctx.fillText("CAMPUS / UPPER BODY ONLY", this.w - 22, this.h - 20);
  }
  private drawDynoPreview(s: Simulation, showIntent: boolean) {
    if (!showIntent || !s.contacts.left || !s.contacts.right) return;
    if (
      (s.contacts.left.age ?? 1) < 0.22 ||
      (s.contacts.right.age ?? 1) < 0.22 ||
      (this.impactFrame &&
        this.impactFrame.timer > 0 &&
        this.impactFrame.kind !== "launch")
    )
      return;
    const charge = clamp(Number((s as any).dynoCharge ?? 0), 0, 1);
    if (charge <= 0.12) return;
    const dynoReady = !!(s as any).dynoReady;
    const dynoVec = (s as any).dynoVector as V | undefined;
    const c = this.ctx,
      com = s.rig.com(),
      cp = this.toScreen(com),
      arcR = 0.31 * this.scale,
      startA = -Math.PI * 1.22,
      spanA = Math.PI * 1.44;
    const ringColor = dynoReady
      ? "#ffd98e"
      : charge > 0.58
        ? "#9ce7c8"
        : "#4cc3b7";

    c.save();
    // Subtle background gauge track around climber torso
    c.strokeStyle = "#ffffff18";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.arc(cp.x, cp.y, arcR, startA, startA + spanA);
    c.stroke();

    if (dynoReady && !this.reduced) {
      const pulse = 0.28 + 0.14 * Math.sin(s.tick * 0.25);
      c.strokeStyle = `rgba(255, 217, 142, ${pulse.toFixed(2)})`;
      c.lineWidth = 6.5;
      c.beginPath();
      c.arc(cp.x, cp.y, arcR, startA, startA + spanA * charge);
      c.stroke();
    }

    c.strokeStyle = ringColor;
    c.lineWidth = dynoReady ? 3.4 : 2.8;
    c.beginPath();
    c.arc(cp.x, cp.y, arcR, startA, startA + spanA * charge);
    c.stroke();

    if (dynoReady) {
      const ly = cp.y - 0.77 * this.scale;
      c.font = '800 9.5px "Barlow", sans-serif';
      const label = "DYNO READY!",
        tw = c.measureText(label).width + 16;
      c.fillStyle = "rgba(15, 29, 34, 0.88)";
      c.strokeStyle = "#ffd98ecc";
      c.lineWidth = 1.3;
      c.beginPath();
      c.roundRect(cp.x - tw / 2, ly - 9.5, tw, 18, 9);
      c.fill();
      c.stroke();
      c.fillStyle = "#ffe29e";
      c.textAlign = "center";
      c.fillText(label, cp.x, ly + 2.8);
    }

    // 7-dot ballistic launch trajectory preview: p(t) = com + dynoVec * t + 0.5 * (0, -9.81) * t^2
    if (
      dynoReady &&
      dynoVec &&
      Math.abs(dynoVec.x) + Math.abs(dynoVec.y) > 0.4
    ) {
      const pts: V[] = [];
      for (let k = 1; k <= 7; k++) {
        const t = k * 0.05;
        pts.push(
          this.toScreen(
            v(
              com.x + dynoVec.x * t,
              com.y + dynoVec.y * t - 0.5 * 9.81 * t * t,
            ),
          ),
        );
      }
      c.strokeStyle = "#ffd98e40";
      c.lineWidth = 1.6;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.moveTo(cp.x, cp.y);
      for (const pt of pts) c.lineTo(pt.x, pt.y);
      c.stroke();
      c.setLineDash([]);

      // Batched soft glow pass + crisp bright core pass across all 7 dots
      c.fillStyle = "#9ce7c838";
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i],
          gr = 5.8 - i * 0.35;
        c.moveTo(pt.x + gr, pt.y);
        c.arc(pt.x, pt.y, gr, 0, Math.PI * 2);
      }
      c.fill();

      c.fillStyle = "#ffe29e";
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i],
          cr = 3.1 - i * 0.18;
        c.moveTo(pt.x + cr, pt.y);
        c.arc(pt.x, pt.y, cr, 0, Math.PI * 2);
      }
      c.fill();

      const lastPt = pts[pts.length - 1];
      c.strokeStyle = "#ffd98eb8";
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(lastPt.x, lastPt.y, 5.4, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  private drawImpactOverlay(imp: NonNullable<Renderer["impactFrame"]>) {
    const c = this.ctx,
      center = this.toScreen(imp.p),
      progress = clamp(1 - imp.timer / imp.duration, 0, 1),
      fade = clamp(imp.timer / imp.duration, 0, 1),
      ringColor = imp.kind === "apex" ? "#ffd98e" : "#eafff5";

    c.save();
    // 1. Brief radial dark-edge contrast flash (#07131844) around impact center
    const maxR = Math.max(this.w, this.h) * 0.75;
    const vignette = c.createRadialGradient(
      center.x,
      center.y,
      20,
      center.x,
      center.y,
      maxR,
    );
    vignette.addColorStop(0, "rgba(7, 19, 24, 0)");
    vignette.addColorStop(0.35, "rgba(7, 19, 24, 0.08)");
    vignette.addColorStop(1, "#07131844");
    c.globalAlpha = fade;
    c.fillStyle = vignette;
    c.fillRect(-10, -10, this.w + 20, this.h + 20);

    // 2. Batched expanding double shockwave ring + 12 crisp radial impact speed lines
    const rOuter = (0.14 + progress * 0.46) * this.scale,
      rInner = (0.07 + progress * 0.27) * this.scale,
      basePhase = imp.kind === "apex" ? 0.13 : 0.26;
    c.globalAlpha = 0.35 + 0.65 * fade;
    c.strokeStyle = ringColor;
    c.lineWidth = imp.kind === "apex" ? 2.4 : 2;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(center.x + rOuter, center.y);
    c.arc(center.x, center.y, rOuter, 0, Math.PI * 2);
    c.moveTo(center.x + rInner, center.y);
    c.arc(center.x, center.y, rInner, 0, Math.PI * 2);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + basePhase,
        cos = Math.cos(ang),
        sin = Math.sin(ang),
        r0 = rOuter * 0.78 + (i % 2) * 5,
        r1 = rOuter * (i % 3 === 0 ? 1.52 : 1.3) + progress * 14;
      c.moveTo(center.x + cos * r0, center.y + sin * r0);
      c.lineTo(center.x + cos * r1, center.y + sin * r1);
    }
    c.stroke();
    c.restore();
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
    const impactRim =
      !this.reduced &&
      !!this.impactFrame &&
      this.impactFrame.timer > 0 &&
      this.impactFrame.kind !== "launch" &&
      dist(h.p, this.impactFrame.p) <= h.radius + 0.16;
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
    if (impactRim) {
      c.strokeStyle =
        this.impactFrame!.kind === "apex" ? "#ffd98e" : "#eafff5";
      c.lineWidth = 4.2;
      c.stroke();
    } else {
      c.strokeStyle = occupied ? "#e7fff3" : "#0c191f";
      c.lineWidth = occupied ? 2.4 : 3;
      c.stroke();
    }
    // Sculpted lip highlight
    c.strokeStyle = impactRim ? "#ffffff" : "#ffffff82";
    c.lineWidth = impactRim ? 2.6 : 2;
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
      torsoAngle = torso.getAngle(),
      climberRim =
        !this.reduced && !!this.impactFrame && this.impactFrame.timer > 0
          ? this.impactFrame.kind === "apex"
            ? "#ffd98e"
            : "#eafff5"
          : null;
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
    if (climberRim) {
      c.strokeStyle = climberRim;
      c.lineWidth = 2.4;
      c.stroke();
    }
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
    if (climberRim) {
      c.strokeStyle = climberRim;
      c.lineWidth = 2.2;
      c.stroke();
    }
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
        this.line(elbow, hand, climberRim ? climberRim + "88" : "#ffffff1c", 0.028);
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
      c.strokeStyle = climberRim && contact
        ? climberRim
        : highStrain
          ? "#ff9478"
          : accent;
      c.lineWidth = climberRim && contact ? 3.5 : 2.8;
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
  private effect(e: SimEvent, s: Simulation) {
    const impact = (e as any).impact as ImpactKind | undefined;
    const isApex = impact === "apex" || e.message.includes("Apex");
    const isDynoCatch =
      !isApex &&
      (impact === "dyno" || (e.kind === "catch" && /dyno/i.test(e.message)));
    const isDynoLaunch =
      impact === "launch" || (e.kind === "launch" && /dyno/i.test(e.message));
    const isFinish = impact === "finish" || e.kind === "finish";

    const vel = s.rig.velocity(),
      vLen = Math.hypot(vel.x, vel.y),
      toEvent = sub(e.p, s.rig.com()),
      toLen = Math.hypot(toEvent.x, toEvent.y),
      dir =
        vLen > 0.25
          ? v(vel.x / vLen, vel.y / vLen)
          : toLen > 0.05
            ? v(toEvent.x / toLen, toEvent.y / toLen)
            : v(0, 1);

    if (isFinish) {
      this.impactFrame = {
        timer: 0.07,
        duration: 0.07,
        kind: "finish",
        p: { ...e.p },
        dir,
      };
      this.callouts.push({
        p: add(e.p, v(0, 0.35)),
        text: "ROUTE COMPLETE",
        age: 0,
        duration: 1.15,
        color: "#f7efe0",
        accent: "#ffd98e",
        bg: "rgba(18, 33, 38, 0.94)",
        emphasis: true,
      });
    } else if (isApex || isDynoCatch) {
      const prevCenter =
        this.impactFrame &&
        this.impactFrame.timer > 0 &&
        (this.impactFrame.kind === "apex" || this.impactFrame.kind === "dyno")
          ? v(
              (this.impactFrame.p.x + e.p.x) * 0.5,
              Math.max(this.impactFrame.p.y, e.p.y),
            )
          : { ...e.p };
      const upgradeApex =
        isApex ||
        (this.impactFrame?.timer && this.impactFrame.kind === "apex");
      this.impactFrame = {
        timer: upgradeApex ? 0.065 : 0.055,
        duration: upgradeApex ? 0.065 : 0.055,
        kind: upgradeApex ? "apex" : "dyno",
        p: prevCenter,
        dir,
      };
      const existing = this.callouts.find(
        (c) =>
          c.age < 0.08 &&
          (c.text === "DYNO CAUGHT!" || c.text === "APEX DYNO!"),
      );
      if (existing) {
        existing.p = v(
          (existing.p.x + e.p.x) * 0.5,
          Math.max(existing.p.y, e.p.y),
        );
        if (isApex) {
          existing.text = "APEX DYNO!";
          existing.duration = 1.08;
          existing.color = "#ffe29a";
          existing.accent = "#ffd98e";
          existing.bg = "rgba(28, 24, 14, 0.92)";
        }
      } else if (isApex) {
        this.callouts.push({
          p: { ...e.p },
          text: "APEX DYNO!",
          age: 0,
          duration: 1.08,
          color: "#ffe29a",
          accent: "#ffd98e",
          bg: "rgba(28, 24, 14, 0.92)",
          emphasis: true,
        });
      } else {
        this.callouts.push({
          p: { ...e.p },
          text: "DYNO CAUGHT!",
          age: 0,
          duration: 0.98,
          color: "#b7fae0",
          accent: "#9ce7c8",
          bg: "rgba(10, 30, 35, 0.92)",
          emphasis: true,
        });
      }
    } else if (isDynoLaunch) {
      this.impactFrame = {
        timer: 0.045,
        duration: 0.045,
        kind: "launch",
        p: { ...e.p },
        dir,
      };
      this.callouts.push({
        p: { ...e.p },
        text: "DYNO LAUNCH!",
        age: 0,
        duration: 0.86,
        color: "#a8f7dc",
        accent: "#66dfb9",
        bg: "rgba(10, 29, 34, 0.90)",
        emphasis: true,
      });
    } else if (e.kind === "catch" && /clean/i.test(e.message)) {
      this.callouts.push({
        p: { ...e.p },
        text: "CLEAN CATCH",
        age: 0,
        duration: 0.9,
        color: "#d2f8c9",
        accent: "#9ce7c8",
        bg: "rgba(12, 26, 32, 0.86)",
        emphasis: false,
      });
    }
    if (this.callouts.length > 4) {
      this.callouts.splice(0, this.callouts.length - 4);
    }

    if (isDynoLaunch) {
      for (let i = 0; i < 14; i++) {
        const spread = ((i / 13) - 0.5) * 1.6;
        const speed = 0.45 + (i % 4) * 0.22;
        this.particles.push({
          p: { ...e.p },
          vel: v(
            Math.sin(spread) * speed - dir.x * 0.25,
            Math.cos(spread) * 0.4 + 0.35,
          ),
          life: 0.38 + (i % 4) * 0.09,
          color: "#eaf8f0",
          size: 2.3,
        });
      }
    } else if (
      e.kind === "catch" &&
      (isApex || isDynoCatch || e.power > 1.2)
    ) {
      const count = isApex ? 34 : 26;
      for (let i = 0; i < count; i++) {
        const cone = Math.PI * 0.5 + ((i / (count - 1)) - 0.5) * 2.1;
        const speed = 0.55 + (i % 6) * 0.22;
        this.particles.push({
          p: { ...e.p },
          vel: v(
            Math.cos(cone) * speed + dir.x * 0.32,
            Math.abs(Math.sin(cone)) * speed + 0.34,
          ),
          life: 0.44 + (i % 5) * 0.11,
          color:
            isApex && i % 3 === 0
              ? "#ffe29c"
              : i % 2 === 0
                ? "#f4fbf7"
                : "#dff4e8",
          size: isApex && i % 4 === 0 ? 3.1 : 2.6,
        });
      }
    } else if (
      e.kind === "catch" ||
      e.kind === "slip" ||
      e.kind === "finish"
    ) {
      const count = e.kind === "finish" ? 50 : 16;
      for (let i = 0; i < count; i++) {
        const a = i * 2.399;
        this.particles.push({
          p: { ...e.p },
          vel: v(
            Math.cos(a) * (0.2 + (i % 5) * 0.13),
            Math.sin(a) * 0.6 + 0.3,
          ),
          life: 0.4 + (i % 5) * 0.12,
          color:
            e.kind === "slip"
              ? "#eab680"
              : e.kind === "finish" && i % 4 === 0
                ? "#ffe3a3"
                : "#e5f4df",
          size: e.kind === "finish" && i % 4 === 0 ? 3 : 2.5,
        });
      }
    }
    if (this.particles.length > 180) {
      this.particles.splice(0, this.particles.length - 180);
    }
  }
}
