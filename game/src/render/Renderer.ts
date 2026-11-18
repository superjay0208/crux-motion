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

const holdPalette: Record<
  string,
  { base: string; hi: string; lo: string; pocket: string; rim: string }
> = {
  jug: {
    base: "#2fb370",
    hi: "#5be09b",
    lo: "#175c39",
    pocket: "#0d3822",
    rim: "#8ef5be",
  },
  crimp: {
    base: "#eb9c28",
    hi: "#ffd175",
    lo: "#7c4b08",
    pocket: "#4a2b04",
    rim: "#ffe3a3",
  },
  pinch: {
    base: "#e55938",
    hi: "#ff987d",
    lo: "#7a2210",
    pocket: "#521509",
    rim: "#ffb8a3",
  },
};

const WRIST_TAPE: Record<Hand, string> = {
  left: "#4d8ef7",
  right: "#f2a93b",
};

type ImpactKind = "launch" | "dyno" | "apex" | "finish";

/** World-space architectural plywood wall volumes (triangles around an apex). */
const WALL_VOLUMES: {
  apex: V;
  pts: V[];
  tones: string[];
}[] = [
  {
    apex: { x: -1.12, y: 0.92 },
    pts: [
      { x: -1.95, y: 1.65 },
      { x: -0.42, y: 1.48 },
      { x: -0.52, y: 0.18 },
      { x: -1.78, y: 0.05 },
    ],
    tones: ["#322c27", "#292420", "#1f1b18", "#2c2723"],
  },
  {
    apex: { x: 1.18, y: 1.55 },
    pts: [
      { x: 0.44, y: 2.32 },
      { x: 1.96, y: 2.12 },
      { x: 1.82, y: 0.72 },
      { x: 0.56, y: 0.88 },
    ],
    tones: ["#332d28", "#27221e", "#1e1a17", "#2d2723"],
  },
  {
    apex: { x: -0.22, y: 2.95 },
    pts: [
      { x: -1.28, y: 3.75 },
      { x: 0.78, y: 3.62 },
      { x: 0.52, y: 2.28 },
      { x: -1.02, y: 2.35 },
    ],
    tones: ["#322c27", "#28231f", "#211d1a", "#2b2622"],
  },
];

function lerpHex(a: [number, number, number], b: [number, number, number], t: number): string {
  const u = clamp(t, 0, 1);
  const r = Math.round(a[0] + (b[0] - a[0]) * u);
  const g = Math.round(a[1] + (b[1] - a[1]) * u);
  const bl = Math.round(a[2] + (b[2] - a[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

const STAMINA_EMERALD: [number, number, number] = [55, 196, 123]; // #37c47b
const STAMINA_OCHRE: [number, number, number] = [240, 168, 48];   // #f0a830
const STAMINA_VERMILION: [number, number, number] = [236, 78, 50]; // #ec4e32

function staminaGaugeColor(val: number): string {
  const vClamped = clamp(val, 0, 1);
  if (vClamped >= 0.6) {
    return lerpHex(STAMINA_OCHRE, STAMINA_EMERALD, (vClamped - 0.6) / 0.4);
  }
  if (vClamped >= 0.35) {
    return lerpHex(STAMINA_VERMILION, STAMINA_OCHRE, (vClamped - 0.35) / 0.25);
  }
  return "#ec4e32";
}

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
  private spotGradient: CanvasGradient | null = null;
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
      this.spotGradient = null;
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
      const restingFn = (s as unknown as { resting?: (side: Hand) => boolean }).resting;
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
              color: "#f5efe4",
              size: 2.2,
            });
          }
        }
      }
    }

    ctx.clearRect(0, 0, this.w, this.h);

    // 1. Cached warm charcoal-limestone / smoked-plywood base gradient
    if (!this.bgGradient || !this.spotGradient || this.bgW !== this.w || this.bgH !== this.h) {
      const bg = ctx.createLinearGradient(0, 0, this.w * 0.35, this.h);
      bg.addColorStop(0, "#292421");
      bg.addColorStop(0.45, "#221e1b");
      bg.addColorStop(1, "#191614");
      this.bgGradient = bg;

      const spot = ctx.createRadialGradient(
        this.w * 0.46,
        -this.h * 0.08,
        this.w * 0.04,
        this.w * 0.5,
        this.h * 0.25,
        Math.max(this.w, this.h) * 0.88,
      );
      spot.addColorStop(0, "rgba(255, 232, 195, 0.11)");
      spot.addColorStop(0.45, "rgba(235, 168, 72, 0.035)");
      spot.addColorStop(1, "rgba(20, 17, 15, 0)");
      this.spotGradient = spot;

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

    // 2. Architectural angled volume facets on the bouldering wall
    this.drawWallArchitecture();

    // 3. Overhead warm gym spotlight wash
    ctx.fillStyle = this.spotGradient!;
    ctx.fillRect(-8, -8, this.w + 16, this.h + 16);

    // 4. Subtle chalked topo route line between checkpoints & finish
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(244, 239, 230, 0.14)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    s.route.holds
      .filter((h) => h.checkpoint || h.finish)
      .forEach((h, i) => {
        const p = this.toScreen(h.p);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Sculpted resin climbing holds
    for (const hold of s.route.holds) {
      this.hold(
        hold,
        s.visited.has(hold.id),
        hands.some((side) => s.contacts[side]?.hold.id === hold.id),
        s,
        showIntent,
      );
    }

    // 6. Next target topo ring
    if (showIntent && s.state !== "finished" && nextHold) {
      const p = this.toScreen(nextHold.p),
        r = (nextHold.radius + 0.072) * this.scale;
      ctx.strokeStyle = "rgba(244, 239, 230, 0.68)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f4efe6";
      ctx.font = '700 11px "BarlowCondensed", "Fredoka", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("NEXT", p.x, p.y - r - 16);
    }

    // 7. Airborne COM chalk/momentum trail
    if (s.tick % 3 === 0) {
      this.trail.push({ ...s.rig.com() });
      if (this.trail.length > 24) this.trail.shift();
    }
    if (!this.reduced && s.flight > 0) {
      const dynoAir = !!(s as unknown as { dynoLaunch?: boolean }).dynoLaunch;
      ctx.strokeStyle = dynoAir
        ? "rgba(240, 168, 48, 0.42)"
        : "rgba(244, 239, 230, 0.22)";
      ctx.lineWidth = dynoAir ? 4 : 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      this.trail.forEach((p, i) => {
        const q = this.toScreen(p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
    }

    // 8. PB ghost, dyno ballistic preview, anatomical climber & diegetic stamina
    if (this.ghost) this.drawGhost(this.ghost);
    this.drawDynoPreview(s, showIntent);
    this.body(s, selected, showIntent, nextHold?.p);

    if (!this.reduced && this.impactFrame && this.impactFrame.timer > 0) {
      this.drawImpactOverlay(this.impactFrame);
    }

    // 9. Chalk & strain particles
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

    // 10. Tactile callout pills
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
          ? '700 11.5px "BarlowCondensed", "Fredoka", sans-serif'
          : '600 10.5px "Fredoka", sans-serif';
        const padX = item.emphasis ? 12 : 9,
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
        ctx.fillText(item.text, 0, 3.8);
        ctx.restore();
      }
      ctx.restore();
      this.callouts = this.callouts.filter((item) => item.age < item.duration);
    }

    // 11. Thick stitched bouldering crash-pad mat at floor y = -1.12
    const floor = this.toScreen(v(0, -1.12));
    if (floor.y < this.h + 8) {
      const matH = Math.max(24, this.h - floor.y + 18);
      // Drop shadow onto floor base
      ctx.fillStyle = "rgba(10, 8, 7, 0.5)";
      ctx.fillRect(-10, floor.y - 4, this.w + 20, 5);
      // Slate-charcoal heavy canvas crash-pad top body
      ctx.fillStyle = "#2c353d";
      ctx.fillRect(-10, floor.y, this.w + 20, matH);
      // Deeper lower vinyl skirt
      ctx.fillStyle = "#222a31";
      ctx.fillRect(-10, floor.y + 18, this.w + 20, Math.max(0, matH - 18));
      // Saffron & terracotta gym mat edge binding stripe
      ctx.fillStyle = "#eb9c28";
      ctx.fillRect(-10, floor.y, this.w + 20, 4);
      ctx.fillStyle = "#d96b43";
      ctx.fillRect(-10, floor.y + 4, this.w + 20, 3);
      // Vertical crash-pad seam joints scrolling with world X
      ctx.strokeStyle = "rgba(12, 15, 18, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let mx = -3.6; mx <= 3.6; mx += 1.2) {
        const sx = this.toScreen(v(mx, -1.12)).x;
        ctx.moveTo(sx, floor.y + 7);
        ctx.lineTo(sx, floor.y + matH);
      }
      ctx.stroke();
      // Heavy chalk-ochre box stitching along top seam
      ctx.strokeStyle = "rgba(244, 239, 230, 0.34)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(-10, floor.y + 12);
      ctx.lineTo(this.w + 10, floor.y + 12);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.font = '600 10px "BarlowCondensed", "Fredoka", sans-serif';
    ctx.fillStyle = "rgba(244, 239, 230, 0.36)";
    ctx.textAlign = "right";
    ctx.fillText("BOULDERING WALL · UPPER-BODY CAMPUS", this.w - 20, this.h - 18);
  }

  private drawWallArchitecture() {
    const c = this.ctx;
    const floorY = this.toScreen(v(0, -1.12)).y;

    // Faceted sunlit plywood macro-volumes (12 triangles total -> negligible CPU cost)
    c.save();
    c.beginPath();
    c.rect(-8, -8, this.w + 16, Math.max(0, Math.min(this.h + 16, floorY + 8)));
    c.clip();

    for (const vol of WALL_VOLUMES) {
      const ap = this.toScreen(vol.apex);
      const pts = vol.pts.map((pt) => this.toScreen(pt));
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        c.fillStyle = vol.tones[i % vol.tones.length];
        c.beginPath();
        c.moveTo(ap.x, ap.y);
        c.lineTo(p0.x, p0.y);
        c.lineTo(p1.x, p1.y);
        c.closePath();
        c.fill();
      }
      // Crisp bevel ridge lines from volume perimeter to apex
      c.strokeStyle = "rgba(255, 240, 220, 0.055)";
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        c.moveTo(p0.x, p0.y);
        c.lineTo(p1.x, p1.y);
        c.moveTo(ap.x, ap.y);
        c.lineTo(p0.x, p0.y);
      }
      c.stroke();
    }

    // Batched plywood panel bevel seams (dark groove + warm lit edge)
    c.strokeStyle = "rgba(10, 8, 7, 0.42)";
    c.lineWidth = 1.4;
    c.beginPath();
    for (let x = -3; x <= 3; x += 0.92) {
      const p = this.toScreen(v(x, 0));
      c.moveTo(p.x - 36, -8);
      c.lineTo(p.x + 32, this.h + 8);
    }
    for (let y = -0.9; y <= 5.2; y += 1.05) {
      const py = this.toScreen(v(0, y)).y;
      c.moveTo(-8, py);
      c.lineTo(this.w + 8, py + (Math.round(y * 10) % 2 === 0 ? 12 : -10));
    }
    c.stroke();

    c.strokeStyle = "rgba(255, 238, 214, 0.045)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -3; x <= 3; x += 0.92) {
      const p = this.toScreen(v(x, 0));
      c.moveTo(p.x - 34.5, -8);
      c.lineTo(p.x + 33.5, this.h + 8);
    }
    c.stroke();

    // Batched recessed T-nut bolt holes across visible wall bounds
    const worldMin = this.toWorld(v(-8, Math.min(this.h + 8, floorY))),
      worldMax = this.toWorld(v(this.w + 8, -8)),
      minX =
        -2.3 +
        Math.max(0, Math.ceil((Math.max(-2.3, worldMin.x) + 2.3) / 0.24)) *
          0.24,
      maxX = Math.min(2.4, worldMax.x),
      minY =
        -1.05 +
        Math.max(0, Math.ceil((Math.max(-1.05, worldMin.y) + 1.05) / 0.26)) *
          0.26,
      maxY = Math.min(5.2, worldMax.y);

    c.fillStyle = "rgba(9, 7, 6, 0.52)";
    c.beginPath();
    for (let x = minX; x < maxX; x += 0.24) {
      for (let y = minY; y < maxY; y += 0.26) {
        const p = this.toScreen(v(x, y));
        c.moveTo(p.x + 1.55, p.y);
        c.arc(p.x, p.y, 1.55, 0, Math.PI * 2);
      }
    }
    c.fill();

    c.fillStyle = "rgba(244, 232, 214, 0.07)";
    c.beginPath();
    for (let x = minX; x < maxX; x += 0.24) {
      for (let y = minY; y < maxY; y += 0.26) {
        const p = this.toScreen(v(x, y));
        c.moveTo(p.x + 0.9, p.y + 0.8);
        c.arc(p.x + 0.3, p.y + 0.8, 0.65, 0, Math.PI * 2);
      }
    }
    c.fill();
    c.restore();
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
    const dyn = s as unknown as {
      dynoCharge?: number;
      dynoReady?: boolean;
      dynoVector?: V;
    };
    const charge = clamp(Number(dyn.dynoCharge ?? 0), 0, 1);
    if (charge <= 0.12) return;
    const dynoReady = !!dyn.dynoReady;
    const dynoVec = dyn.dynoVector;
    const c = this.ctx,
      com = s.rig.com(),
      cp = this.toScreen(com),
      arcR = 0.31 * this.scale,
      startA = -Math.PI * 1.22,
      spanA = Math.PI * 1.44;
    const ringColor = dynoReady
      ? "#ffd175"
      : charge > 0.58
        ? "#eb9c28"
        : "#37c47b";

    c.save();
    c.strokeStyle = "rgba(244, 239, 230, 0.14)";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.arc(cp.x, cp.y, arcR, startA, startA + spanA);
    c.stroke();

    if (dynoReady && !this.reduced) {
      const pulse = 0.28 + 0.14 * Math.sin(s.tick * 0.25);
      c.strokeStyle = `rgba(235, 156, 40, ${pulse.toFixed(2)})`;
      c.lineWidth = 6.5;
      c.beginPath();
      c.arc(cp.x, cp.y, arcR, startA, startA + spanA * charge);
      c.stroke();
    }

    c.strokeStyle = ringColor;
    c.lineWidth = dynoReady ? 3.5 : 2.8;
    c.beginPath();
    c.arc(cp.x, cp.y, arcR, startA, startA + spanA * charge);
    c.stroke();

    if (dynoReady) {
      const ly = cp.y - 0.78 * this.scale;
      c.font = '700 10.5px "BarlowCondensed", "Fredoka", sans-serif';
      const label = "DYNO READY!",
        tw = c.measureText(label).width + 18;
      c.fillStyle = "rgba(24, 21, 18, 0.92)";
      c.strokeStyle = "#ffd175";
      c.lineWidth = 1.4;
      c.beginPath();
      c.roundRect(cp.x - tw / 2, ly - 9.5, tw, 19, 9.5);
      c.fill();
      c.stroke();
      c.fillStyle = "#ffd175";
      c.textAlign = "center";
      c.fillText(label, cp.x, ly + 3.4);
    }

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
      c.strokeStyle = "rgba(255, 209, 117, 0.34)";
      c.lineWidth = 1.6;
      c.setLineDash([3, 4]);
      c.beginPath();
      c.moveTo(cp.x, cp.y);
      for (const pt of pts) c.lineTo(pt.x, pt.y);
      c.stroke();
      c.setLineDash([]);

      c.fillStyle = "rgba(235, 156, 40, 0.24)";
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i],
          gr = 5.8 - i * 0.35;
        c.moveTo(pt.x + gr, pt.y);
        c.arc(pt.x, pt.y, gr, 0, Math.PI * 2);
      }
      c.fill();

      c.fillStyle = "#ffd175";
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i],
          cr = 3.1 - i * 0.18;
        c.moveTo(pt.x + cr, pt.y);
        c.arc(pt.x, pt.y, cr, 0, Math.PI * 2);
      }
      c.fill();

      const lastPt = pts[pts.length - 1];
      c.strokeStyle = "#ffd175cc";
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
      ringColor = imp.kind === "apex" ? "#ffd175" : "#f4efe6";

    c.save();
    const maxR = Math.max(this.w, this.h) * 0.75;
    const vignette = c.createRadialGradient(
      center.x,
      center.y,
      20,
      center.x,
      center.y,
      maxR,
    );
    vignette.addColorStop(0, "rgba(18, 15, 12, 0)");
    vignette.addColorStop(0.35, "rgba(18, 15, 12, 0.08)");
    vignette.addColorStop(1, "rgba(12, 10, 8, 0.32)");
    c.globalAlpha = fade;
    c.fillStyle = vignette;
    c.fillRect(-10, -10, this.w + 20, this.h + 20);

    const rOuter = (0.14 + progress * 0.46) * this.scale,
      rInner = (0.07 + progress * 0.27) * this.scale,
      basePhase = imp.kind === "apex" ? 0.13 : 0.26;
    c.globalAlpha = 0.35 + 0.65 * fade;
    c.strokeStyle = ringColor;
    c.lineWidth = imp.kind === "apex" ? 2.5 : 2;
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
      r = h.radius * this.scale,
      kind = h.kind as string,
      pal = holdPalette[kind] ?? holdPalette.jug;

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
        const ringColor = WRIST_TAPE[reaching];
        c.save();
        c.strokeStyle = ringColor + "88";
        c.fillStyle = ringColor + "18";
        c.lineWidth = 2.4;
        c.beginPath();
        c.arc(p.x, p.y, (h.radius + 0.044) * this.scale, 0, Math.PI * 2);
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

    let seed = 0;
    for (let i = 0; i < h.id.length; i++) {
      seed = (seed * 31 + h.id.charCodeAt(i)) | 0;
    }

    // Gym finish twin V-tape tags behind TOP finishing volume
    if (h.finish) {
      c.save();
      for (const [sign, tapeCol] of [
        [-1, "#e55938"],
        [1, "#eb9c28"],
      ] as const) {
        c.save();
        c.translate(sign * r * 0.38, r * 0.55);
        c.rotate(sign * -0.34);
        c.fillStyle = tapeCol;
        c.strokeStyle = "#14110e";
        c.lineWidth = 1.2;
        c.beginPath();
        c.rect(-3.4, 0, 6.8, Math.max(13, r * 0.62));
        c.fill();
        c.stroke();
        c.restore();
      }
      c.restore();
    }

    // Cast wall contact shadow beneath sculpted resin hold
    const holdPath = () => {
      c.beginPath();
      if (h.finish) {
        // Large geometric ivory/sandstone finishing volume
        c.moveTo(-r * 1.18, r * 0.18);
        c.lineTo(-r * 0.88, -r * 0.68);
        c.lineTo(0, -r * 0.92);
        c.lineTo(r * 0.88, -r * 0.68);
        c.lineTo(r * 1.18, r * 0.18);
        c.lineTo(r * 0.72, r * 0.78);
        c.lineTo(-r * 0.72, r * 0.78);
        c.closePath();
      } else if (kind === "crimp") {
        // Crisp angular beveled incut rail/edge
        c.moveTo(-r * 1.12, -r * 0.34);
        c.lineTo(r * 1.12, -r * 0.34);
        c.lineTo(r * 1.24, r * 0.16);
        c.lineTo(r * 1.04, r * 0.36);
        c.lineTo(-r * 1.04, r * 0.36);
        c.lineTo(-r * 1.24, r * 0.16);
        c.closePath();
      } else if (kind === "pinch") {
        // Tall vertical sculpted rib/tufa with dual concave waist flanks
        c.moveTo(0, -r * 1.14);
        c.bezierCurveTo(r * 0.68, -r * 0.95, r * 0.62, -r * 0.45, r * 0.42, -r * 0.05);
        c.bezierCurveTo(r * 0.34, r * 0.22, r * 0.64, r * 0.68, r * 0.42, r * 1.02);
        c.quadraticCurveTo(0, r * 1.18, -r * 0.42, r * 1.02);
        c.bezierCurveTo(-r * 0.64, r * 0.68, -r * 0.34, r * 0.22, -r * 0.42, -r * 0.05);
        c.bezierCurveTo(-r * 0.62, -r * 0.45, -r * 0.68, -r * 0.95, 0, -r * 1.14);
        c.closePath();
      } else if (kind === "jug") {
        // Ergonomic rounded positive bucket
        c.moveTo(-r * 0.98, -r * 0.08);
        c.bezierCurveTo(-r * 1.04, -r * 0.68, -r * 0.48, -r * 0.98, 0, -r * 0.94);
        c.bezierCurveTo(r * 0.52, -r * 0.96, r * 1.05, -r * 0.64, r * 0.98, -r * 0.04);
        c.bezierCurveTo(r * 0.94, r * 0.55, r * 0.48, r * 0.88, 0, r * 0.86);
        c.bezierCurveTo(-r * 0.5, r * 0.88, -r * 0.94, r * 0.52, -r * 0.98, -r * 0.08);
        c.closePath();
      } else {
        c.ellipse(0, 0, r * 1.08, r * 0.72, -0.08, 0, Math.PI * 2);
      }
    };

    // Soft cast shadow on wall
    c.save();
    c.translate(2, kind === "crimp" ? 6 : 5);
    holdPath();
    c.fillStyle = kind === "crimp" ? "rgba(8, 6, 5, 0.72)" : "rgba(8, 6, 5, 0.54)";
    c.fill();
    c.restore();

    // Base polyurethane resin gradient fill
    const grad = c.createLinearGradient(0, -r * 1.05, 0, r * 1.05);
    if (h.finish) {
      grad.addColorStop(0, "#fffaf0");
      grad.addColorStop(0.52, "#f5ede0");
      grad.addColorStop(1, "#c7b69c");
    } else {
      grad.addColorStop(0, pal.hi);
      grad.addColorStop(0.45, pal.base);
      grad.addColorStop(1, pal.lo);
    }
    holdPath();
    c.fillStyle = grad;
    c.fill();

    // Interior sculpted hold features (clipped to silhouette)
    c.save();
    holdPath();
    c.clip();

    if (h.finish) {
      // Sandstone volume planar facets + chalked top shelf
      c.fillStyle = "rgba(255, 255, 255, 0.42)";
      c.beginPath();
      c.moveTo(-r * 0.88, -r * 0.68);
      c.lineTo(0, -r * 0.92);
      c.lineTo(r * 0.88, -r * 0.68);
      c.lineTo(0, -r * 0.24);
      c.closePath();
      c.fill();

      c.fillStyle = "rgba(92, 74, 52, 0.22)";
      c.beginPath();
      c.moveTo(0, -r * 0.24);
      c.lineTo(r * 1.18, r * 0.18);
      c.lineTo(r * 0.72, r * 0.78);
      c.lineTo(0, r * 0.78);
      c.closePath();
      c.fill();
    } else if (kind === "jug") {
      // Deep recessed shadowed grab pocket scooped into top of jug bucket
      c.fillStyle = pal.pocket;
      c.beginPath();
      c.moveTo(-r * 0.68, -r * 0.36);
      c.quadraticCurveTo(0, -r * 0.72, r * 0.68, -r * 0.36);
      c.quadraticCurveTo(r * 0.48, -r * 0.04, 0, -r * 0.08);
      c.quadraticCurveTo(-r * 0.48, -r * 0.04, -r * 0.68, -r * 0.36);
      c.closePath();
      c.fill();

      // Realistic white chalk stippling along the positive top rim
      const chalkAlpha = visited ? 0.78 : 0.36;
      c.fillStyle = `rgba(246, 242, 235, ${chalkAlpha})`;
      c.beginPath();
      c.ellipse(0, -r * 0.58, r * 0.64, r * 0.13, 0, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 7; k++) {
        const u = (k / 6 - 0.5) * r * 1.16;
        const vy = -r * 0.54 + Math.abs(u) * 0.18 + (((seed + k * 37) % 5) - 2) * 0.6;
        c.beginPath();
        c.arc(u, vy, visited ? 1.8 : 1.25, 0, Math.PI * 2);
        c.fill();
      }
    } else if (kind === "crimp") {
      // Sharp sunlit incut top biting shelf
      c.fillStyle = pal.hi;
      c.fillRect(-r * 1.2, -r * 0.36, r * 2.4, r * 0.22);
      // Dark undercut shadow below front edge
      c.fillStyle = pal.pocket;
      c.fillRect(-r * 1.25, r * 0.14, r * 2.5, r * 0.26);
      // Narrow chalked top biting lip
      c.fillStyle = visited
        ? "rgba(248, 244, 238, 0.85)"
        : "rgba(248, 244, 238, 0.46)";
      c.fillRect(-r * 0.96, -r * 0.34, r * 1.92, Math.max(2.2, r * 0.12));
    } else if (kind === "pinch") {
      // Lit central vertical spine ridge
      c.fillStyle = "rgba(255, 196, 176, 0.34)";
      c.beginPath();
      c.ellipse(0, -r * 0.06, r * 0.15, r * 0.88, 0, 0, Math.PI * 2);
      c.fill();
      // Concave thumb-and-finger depressions on BOTH left and right flanks
      c.fillStyle = "rgba(92, 22, 10, 0.62)";
      c.beginPath();
      c.ellipse(-r * 0.36, -r * 0.02, r * 0.17, r * 0.48, 0.08, 0, Math.PI * 2);
      c.ellipse(r * 0.36, -r * 0.02, r * 0.17, r * 0.48, -0.08, 0, Math.PI * 2);
      c.fill();
      // White chalk marks on BOTH left and right flanks
      const pChalk = visited ? 0.78 : 0.42;
      c.fillStyle = `rgba(246, 242, 235, ${pChalk})`;
      for (const sideSign of [-1, 1]) {
        c.beginPath();
        c.ellipse(
          sideSign * r * 0.35,
          -r * 0.04,
          r * 0.09,
          r * 0.34,
          sideSign * -0.06,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    c.restore();

    // Crisp outer hold silhouette border
    holdPath();
    if (impactRim) {
      c.strokeStyle =
        this.impactFrame!.kind === "apex" ? "#ffd175" : "#f4efe6";
      c.lineWidth = 4;
      c.stroke();
    } else {
      c.strokeStyle = occupied ? "#f4efe6" : "#120f0d";
      c.lineWidth = occupied ? 2.6 : 2.8;
      c.stroke();
    }

    // Specular resin rim highlight
    c.strokeStyle = impactRim ? "#ffffff" : h.finish ? "#ffffffaa" : pal.rim + "aa";
    c.lineWidth = 1.7;
    c.lineCap = "round";
    c.beginPath();
    if (h.finish) {
      c.moveTo(-r * 0.8, -r * 0.62);
      c.lineTo(0, -r * 0.84);
      c.lineTo(r * 0.8, -r * 0.62);
    } else if (kind === "crimp") {
      c.moveTo(-r * 0.98, -r * 0.22);
      c.lineTo(r * 0.98, -r * 0.22);
    } else if (kind === "pinch") {
      c.moveTo(-r * 0.24, -r * 0.62);
      c.quadraticCurveTo(-r * 0.18, 0, -r * 0.24, r * 0.5);
      c.moveTo(r * 0.24, -r * 0.62);
      c.quadraticCurveTo(r * 0.18, 0, r * 0.24, r * 0.5);
    } else {
      c.moveTo(-r * 0.62, -r * 0.36);
      c.quadraticCurveTo(0, -r * 0.68, r * 0.62, -r * 0.36);
    }
    c.stroke();

    // Hardware details: washer hex bolt (jug/pinch/TOP) vs twin screws (crimp)
    if (kind === "crimp" && !h.finish) {
      for (const sx of [-r * 0.62, r * 0.62]) {
        c.fillStyle = "#2b1c08";
        c.beginPath();
        c.arc(sx, r * 0.02, Math.max(2, r * 0.11), 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#a89882aa";
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(sx - 1.5, r * 0.02);
        c.lineTo(sx + 1.5, r * 0.02);
        c.moveTo(sx, r * 0.02 - 1.5);
        c.lineTo(sx, r * 0.02 + 1.5);
        c.stroke();
      }
    } else {
      const by = h.finish ? r * 0.32 : kind === "jug" ? r * 0.28 : r * 0.42;
      const br = Math.max(2.6, r * 0.14);
      c.fillStyle = "rgba(18, 15, 13, 0.68)";
      c.beginPath();
      c.arc(0, by, br * 1.45, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(214, 206, 194, 0.55)";
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(0, by, br, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#181512";
      c.beginPath();
      c.arc(0, by, br * 0.52, 0, Math.PI * 2);
      c.fill();
    }

    // Dual match zone arcs + TOP volume stamp
    if (h.match) {
      const patchOffset = Math.min(0.084 * this.scale, r * 0.5);
      for (const [sign, tint] of [
        [-1, "#4d8ef7cc"],
        [1, "#f2a93bcc"],
      ] as const) {
        c.strokeStyle = tint;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(
          sign * patchOffset,
          -r * 0.12,
          Math.max(4.5, r * 0.23),
          Math.PI * 1.08,
          Math.PI * 1.92,
        );
        c.stroke();
      }
    }

    if (h.finish) {
      c.font = '700 9.5px "BarlowCondensed", "Bebas Neue", sans-serif';
      c.fillStyle = "#2b241d";
      c.textAlign = "center";
      c.fillText("TOP", 0, r * 0.06);
    }

    c.restore();

    // Directional chevron cues for undercling / sidepull
    if (h.direction.y < -0.5 || Math.abs(h.direction.x) > 0.2) {
      const dirLen = Math.hypot(h.direction.x, h.direction.y) || 1,
        nx = h.direction.x / dirLen,
        ny = h.direction.y / dirLen;
      const edge = this.toScreen(
        add(h.p, mul(v(nx, ny), h.radius + 0.056)),
      );
      const inAngle = Math.atan2(ny, -nx);
      c.save();
      c.translate(edge.x, edge.y);
      c.rotate(inAngle);
      c.strokeStyle = h.direction.y < -0.5 ? "#5be09bee" : "#ffd175ee";
      c.lineWidth = 1.9;
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

    const labelOffset = h.direction.y < -0.5 ? r + 14 : r + 13;
    c.font = '700 10.5px "BarlowCondensed", "Fredoka", sans-serif';
    c.textAlign = "center";
    c.fillStyle = h.finish
      ? "#f5ede0"
      : visited
        ? "#5be09b"
        : "rgba(244, 239, 230, 0.56)";
    if (!h.finish && h.label) c.fillText(h.label, p.x, p.y - labelOffset);
    if (visited && !occupied) {
      c.fillStyle = "#5be09b";
      c.font = '700 10px "Fredoka", sans-serif';
      c.fillText("✓", p.x + r + 9, p.y + 2);
    }
  }

  /** Sculpted anatomical tapered limb polygon in screen space (no stick lines!). */
  private drawSculptedLimb(
    aWorld: V,
    bWorld: V,
    rAWorld: number,
    rBWorld: number,
    bulgeFrac: number,
    bulgeAsym: number,
    fill: string,
    highlight: string | null,
    outline = "#171310",
  ) {
    const c = this.ctx;
    const A = this.toScreen(aWorld);
    const B = this.toScreen(bWorld);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy;
    const ny = ux;
    const rA = rAWorld * this.scale;
    const rB = rBWorld * this.scale;
    const midR = (rA * 0.58 + rB * 0.42) * (1 + bulgeFrac);
    const c1Dist = L * 0.42;
    const topBulge = midR * (1 + bulgeAsym * 0.22);
    const botBulge = midR * (1 - bulgeAsym * 0.14);

    c.save();
    c.beginPath();
    c.moveTo(A.x + nx * rA, A.y + ny * rA);
    c.quadraticCurveTo(
      A.x + ux * c1Dist + nx * topBulge,
      A.y + uy * c1Dist + ny * topBulge,
      B.x + nx * rB,
      B.y + ny * rB,
    );
    c.arc(
      B.x,
      B.y,
      rB,
      Math.atan2(ny, nx),
      Math.atan2(-ny, -nx),
      true,
    );
    c.quadraticCurveTo(
      A.x + ux * (L * 0.52) - nx * botBulge,
      A.y + uy * (L * 0.52) - ny * botBulge,
      A.x - nx * rA,
      A.y - ny * rA,
    );
    c.arc(
      A.x,
      A.y,
      rA,
      Math.atan2(-ny, -nx),
      Math.atan2(ny, nx),
      true,
    );
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (outline) {
      c.strokeStyle = outline;
      c.lineWidth = 1.6;
      c.stroke();
    }
    if (highlight) {
      c.strokeStyle = highlight;
      c.lineWidth = Math.max(1.2, rB * 0.42);
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(A.x + ux * (L * 0.18) + nx * (rA * 0.45), A.y + uy * (L * 0.18) + ny * (rA * 0.45));
      c.quadraticCurveTo(
        A.x + ux * c1Dist + nx * (topBulge * 0.55),
        A.y + uy * c1Dist + ny * (topBulge * 0.55),
        B.x - ux * (L * 0.16) + nx * (rB * 0.45),
        B.y - uy * (L * 0.16) + ny * (rB * 0.45),
      );
      c.stroke();
    }
    c.restore();
  }

  /** Real arched bouldering climbing shoe with dark rubber rand & ochre velcro strap. */
  private drawClimbingShoe(ankleWorld: V, side: Hand, shinAngleScreen: number) {
    const c = this.ctx;
    const fp = this.toScreen(ankleWorld);
    const dir = side === "left" ? -1 : 1;
    const u = Math.max(2.6, 0.015 * this.scale);

    c.save();
    c.translate(fp.x, fp.y);
    c.rotate(clamp(shinAngleScreen * 0.25, -0.35, 0.35));

    // Arched downturned sole & aggressive rubber toe rand
    c.fillStyle = "#191614";
    c.strokeStyle = "#0b0908";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(-dir * u * 2.1, -u * 1.1);
    c.quadraticCurveTo(dir * u * 1.2, -u * 1.5, dir * u * 4.4, u * 0.55);
    c.quadraticCurveTo(dir * u * 4.8, u * 1.85, dir * u * 2.9, u * 1.95);
    c.quadraticCurveTo(dir * u * 0.4, u * 1.15, -dir * u * 1.9, u * 1.65);
    c.quadraticCurveTo(-dir * u * 2.8, u * 0.65, -dir * u * 2.1, -u * 1.1);
    c.closePath();
    c.fill();
    c.stroke();

    // Terracotta/ochre microfiber upper panel
    c.fillStyle = "#d96b43";
    c.beginPath();
    c.moveTo(-dir * u * 1.3, -u * 0.95);
    c.quadraticCurveTo(dir * u * 0.9, -u * 1.25, dir * u * 2.6, -u * 0.05);
    c.quadraticCurveTo(dir * u * 0.8, u * 0.65, -dir * u * 1.2, u * 0.45);
    c.closePath();
    c.fill();

    // Ochre velcro closure strap + chalk-white buckle tab
    c.strokeStyle = "#eb9c28";
    c.lineWidth = Math.max(1.8, u * 0.72);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-dir * u * 0.2, -u * 1.05);
    c.lineTo(dir * u * 1.15, u * 0.45);
    c.stroke();

    // Heel pull-tab loop
    c.strokeStyle = "#eb9c28";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-dir * u * 2.0, -u * 0.8);
    c.lineTo(-dir * u * 2.7, -u * 1.35);
    c.stroke();

    c.restore();
  }

  /** Readable sculpted hand gesture pose + colored L/R athletic wrist tape at `hp`. */
  private drawHandPose(
    elbowWorld: V,
    handWorld: V,
    side: Hand,
    grip: Grip,
    skin: string,
    highStrain: boolean,
  ) {
    const c = this.ctx;
    const ep = this.toScreen(elbowWorld);
    const hp = this.toScreen(handWorld);
    const foreAng = Math.atan2(hp.y - ep.y, hp.x - ep.x);
    const tapeColor = WRIST_TAPE[side];
    const u = clamp(0.0135 * this.scale, 1.9, 3.6);
    const mirror = side === "left" ? -1 : 1;

    // 1. Colored athletic wrist tape cuff just behind the wrist joint along forearm
    c.save();
    c.translate(hp.x, hp.y);
    c.rotate(foreAng);
    c.fillStyle = tapeColor;
    c.strokeStyle = "#14110e";
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(-u * 3.1, -u * 1.65, u * 1.85, u * 3.3, 2);
    c.fill();
    c.stroke();
    c.restore();

    // 2. Sculpted hand & finger pose centered on contact point `hp`
    const handFill = highStrain ? "#f0a58e" : skin;
    const gStr = grip as string;
    c.save();
    c.translate(hp.x, hp.y);
    c.strokeStyle = "#171310";
    c.lineWidth = 1.25;
    c.lineCap = "round";
    c.lineJoin = "round";

    if (gStr === "release") {
      // Open 5-finger splayed hand (palm + 5 clearly spread chalked fingers)
      c.fillStyle = handFill;
      c.beginPath();
      c.ellipse(0, u * 0.7, u * 2.0, u * 1.8, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      const angles = [
        -Math.PI * 0.5 - mirror * 0.92,
        -Math.PI * 0.5 - mirror * 0.44,
        -Math.PI * 0.5,
        -Math.PI * 0.5 + mirror * 0.42,
        -Math.PI * 0.5 + mirror * 0.82,
      ];
      const lengths = [u * 2.7, u * 3.4, u * 3.7, u * 3.3, u * 2.6];
      for (let i = 0; i < 5; i++) {
        const a = angles[i];
        const lenF = lengths[i];
        const fx = Math.cos(a) * lenF;
        const fy = Math.sin(a) * lenF;
        c.strokeStyle = "#171310";
        c.lineWidth = u * 1.15;
        c.beginPath();
        c.moveTo(Math.cos(a) * u * 1.1, u * 0.3 + Math.sin(a) * u * 1.1);
        c.lineTo(fx, fy);
        c.stroke();

        c.strokeStyle = handFill;
        c.lineWidth = u * 0.76;
        c.beginPath();
        c.moveTo(Math.cos(a) * u * 1.1, u * 0.3 + Math.sin(a) * u * 1.1);
        c.lineTo(fx, fy);
        c.stroke();

        // White chalked fingertip pad
        c.fillStyle = "#f7f3eb";
        c.beginPath();
        c.arc(fx, fy, u * 0.44, 0, Math.PI * 2);
        c.fill();
      }
    } else if (gStr === "crimp") {
      // Arched 4-finger claw hook biting downward onto crisp edge
      c.fillStyle = handFill;
      // Arched back of hand
      c.beginPath();
      c.moveTo(-u * 2.2, u * 1.1);
      c.quadraticCurveTo(0, -u * 2.5, u * 2.2, u * 1.1);
      c.closePath();
      c.fill();
      c.stroke();

      // 4 arched PIP-joint claw fingers hooking onto top edge
      for (let k = 0; k < 4; k++) {
        const kx = (k - 1.5) * u * 1.08;
        c.fillStyle = handFill;
        c.beginPath();
        c.roundRect(kx - u * 0.48, -u * 2.15, u * 0.96, u * 2.45, u * 0.42);
        c.fill();
        c.stroke();
        // Sharp PIP knuckle ridge + chalked biting tip
        c.fillStyle = "#f7f3eb";
        c.beginPath();
        c.arc(kx, -u * 1.85, u * 0.4, 0, Math.PI * 2);
        c.fill();
      }
    } else if (gStr === "pinch") {
      // Opposed thumb + 4-finger clamp squeezing inward from opposite sides
      const dir = side === "left" ? 1 : -1;
      // 4 grouped fingers clamping from outer flank
      c.fillStyle = handFill;
      c.beginPath();
      c.moveTo(-dir * u * 0.5, u * 1.9);
      c.quadraticCurveTo(-dir * u * 2.8, 0, -dir * u * 0.9, -u * 2.35);
      c.quadraticCurveTo(-dir * u * 0.1, -u * 1.7, -dir * u * 0.5, u * 1.9);
      c.fill();
      c.stroke();

      // Opposed thumb clamping inward from inner flank
      c.beginPath();
      c.moveTo(dir * u * 0.3, u * 1.8);
      c.quadraticCurveTo(dir * u * 2.6, u * 0.25, dir * u * 1.15, -u * 1.55);
      c.quadraticCurveTo(dir * u * 0.4, -u * 0.9, dir * u * 0.3, u * 1.8);
      c.fill();
      c.stroke();

      // Chalk on opposed thumb pad & finger tips
      c.fillStyle = "#f7f3eb";
      c.beginPath();
      c.arc(-dir * u * 0.95, -u * 2.0, u * 0.48, 0, Math.PI * 2);
      c.arc(dir * u * 1.1, -u * 1.35, u * 0.48, 0, Math.PI * 2);
      c.fill();
    } else {
      // Jug (and fallback): solid clenched 4-knuckle fist locked over bucket rim
      c.fillStyle = handFill;
      c.beginPath();
      c.roundRect(-u * 2.15, -u * 1.55, u * 4.3, u * 3.1, u * 1.1);
      c.fill();
      c.stroke();

      // 4 distinct clenched knuckles across top ridge
      for (let k = 0; k < 4; k++) {
        const kx = (k - 1.5) * u * 1.02;
        c.fillStyle = handFill;
        c.beginPath();
        c.arc(kx, -u * 1.25, u * 0.62, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      // Thumb locked securely across front of fist
      c.beginPath();
      c.roundRect(-u * 1.5, -u * 0.1, u * 2.8, u * 1.05, u * 0.5);
      c.fill();
      c.stroke();

      // Chalk dust across upper knuckle ridge
      c.fillStyle = "rgba(247, 243, 235, 0.82)";
      c.beginPath();
      c.ellipse(0, -u * 1.48, u * 1.75, u * 0.34, 0, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }

  private drawGhost(g: NonNullable<Renderer["ghost"]>) {
    const c = this.ctx,
      cos = Math.cos(g.angle),
      sin = Math.sin(g.angle),
      local = (lx: number, ly: number) =>
        v(g.torso.x + lx * cos - ly * sin, g.torso.y + lx * sin + ly * cos);
    const hipL = local(-0.09, -0.25),
      hipR = local(0.09, -0.25),
      legBase = g.legs ?? local(0, -0.77),
      footL = add(legBase, v(-0.12, 0)),
      footR = add(legBase, v(0.15, 0.03)),
      kneeL = ik(hipL, footL, 0.27, 0.27, -1).point,
      kneeR = ik(hipR, footR, 0.27, 0.27, 1).point,
      fill = "rgba(244, 239, 230, 0.14)",
      rim = "rgba(235, 156, 40, 0.38)";

    c.save();
    this.drawSculptedLimb(hipL, kneeL, 0.062, 0.046, 0.1, -1, fill, null, rim);
    this.drawSculptedLimb(kneeL, footL, 0.045, 0.03, 0.08, -1, fill, null, rim);
    this.drawSculptedLimb(hipR, kneeR, 0.062, 0.046, 0.1, 1, fill, null, rim);
    this.drawSculptedLimb(kneeR, footR, 0.045, 0.03, 0.08, 1, fill, null, rim);

    const tp = this.toScreen(g.torso);
    c.save();
    c.translate(tp.x, tp.y);
    c.rotate(-g.angle);
    c.fillStyle = fill;
    c.strokeStyle = rim;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-0.21 * this.scale, -0.32 * this.scale);
    c.quadraticCurveTo(0, -0.39 * this.scale, 0.21 * this.scale, -0.32 * this.scale);
    c.lineTo(0.15 * this.scale, 0.26 * this.scale);
    c.quadraticCurveTo(0, 0.32 * this.scale, -0.15 * this.scale, 0.26 * this.scale);
    c.closePath();
    c.fill();
    c.stroke();

    c.beginPath();
    c.ellipse(0, -0.52 * this.scale, 0.135 * this.scale, 0.155 * this.scale, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    c.font = '700 9px "BarlowCondensed", "Fredoka", sans-serif';
    c.fillStyle = "rgba(255, 209, 117, 0.72)";
    c.textAlign = "center";
    c.fillText("PB", 0, -0.73 * this.scale);
    c.restore();

    for (const side of hands) {
      const sh = local(side === "left" ? -0.19 : 0.19, 0.28),
        target = side === "left" ? g.left : g.right,
        elPt = ik(sh, target, 0.36, 0.39, side === "left" ? -1 : 1).point;
      this.drawSculptedLimb(sh, elPt, 0.052, 0.042, 0.1, side === "left" ? -1 : 1, fill, null, rim);
      this.drawSculptedLimb(elPt, target, 0.044, 0.03, 0.1, side === "left" ? -1 : 1, fill, null, rim);
      const hp = this.toScreen(target);
      c.strokeStyle = rim;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(hp.x, hp.y, 0.048 * this.scale, 0, Math.PI * 2);
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
      vel = rig.velocity(),
      climberRim =
        !this.reduced && !!this.impactFrame && this.impactFrame.timer > 0
          ? this.impactFrame.kind === "apex"
            ? "#ffd175"
            : "#f4efe6"
          : null;

    // 2-segment articulated legs solved via IK from hip sockets to passive foot anchors
    const hipCenter = torso.getWorldPoint(v(0, -0.25)),
      hipL = torso.getWorldPoint(v(-0.095, -0.24)),
      hipR = torso.getWorldPoint(v(0.095, -0.24)),
      footL = rig.legs.getWorldPoint(v(-0.13, -0.21)),
      footR = rig.legs.getWorldPoint(v(0.15, -0.17)),
      kneeL = ik(hipL, footL, 0.255, 0.255, -1).point,
      kneeR = ik(hipR, footR, 0.255, 0.255, 1).point;

    // Depth-sort arms: active/free or newly crossed arm in front
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

    // 1. Soft wall cast shadow behind climber
    const shadowCol = "rgba(10, 8, 7, 0.34)";
    c.save();
    c.translate(4, 6);
    this.drawSculptedLimb(hipL, kneeL, 0.068, 0.05, 0.14, -1, shadowCol, null, "");
    this.drawSculptedLimb(kneeL, footL, 0.048, 0.032, 0.12, -1, shadowCol, null, "");
    this.drawSculptedLimb(hipR, kneeR, 0.068, 0.05, 0.14, 1, shadowCol, null, "");
    this.drawSculptedLimb(kneeR, footR, 0.048, 0.032, 0.12, 1, shadowCol, null, "");
    const sp = this.toScreen(torsoPos);
    c.save();
    c.translate(sp.x, sp.y);
    c.rotate(-torsoAngle);
    c.fillStyle = shadowCol;
    c.beginPath();
    c.moveTo(-0.22 * this.scale, -0.32 * this.scale);
    c.quadraticCurveTo(0, -0.39 * this.scale, 0.22 * this.scale, -0.32 * this.scale);
    c.lineTo(0.16 * this.scale, 0.28 * this.scale);
    c.quadraticCurveTo(0, 0.35 * this.scale, -0.16 * this.scale, 0.28 * this.scale);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(0, -0.52 * this.scale, 0.14 * this.scale, 0.16 * this.scale, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    for (const side of armOrder) {
      const sh = rig.shoulder(side),
        elPt = rig.arms[side].elbow.getAnchorA(),
        hd = rig.hand(side);
      this.drawSculptedLimb(sh, elPt, 0.055, 0.044, 0.14, side === "left" ? -1 : 1, shadowCol, null, "");
      this.drawSculptedLimb(elPt, hd, 0.046, 0.03, 0.14, side === "left" ? -1 : 1, shadowCol, null, "");
    }
    c.restore();

    // 2. Back arm (drawn behind torso when crossing/supporting)
    this.drawClimberArm(s, backSide, false, climberRim);

    // 3. Articulated 2-segment legs, shorts cuffs, and arched climbing shoes
    // Calves (drawn first so knee & thigh overlap naturally)
    this.drawSculptedLimb(
      kneeL,
      footL,
      0.048,
      0.031,
      0.16,
      -1,
      "#c99778",
      "rgba(255, 232, 210, 0.24)",
    );
    this.drawSculptedLimb(
      kneeR,
      footR,
      0.048,
      0.031,
      0.16,
      1,
      "#d7a889",
      "rgba(255, 236, 215, 0.28)",
    );

    // Thighs + tailored shorts leg cuffs covering upper 55% of thigh
    this.drawSculptedLimb(
      hipL,
      kneeL,
      0.068,
      0.049,
      0.18,
      -1,
      "#c99778",
      "rgba(255, 232, 210, 0.22)",
    );
    this.drawSculptedLimb(
      hipR,
      kneeR,
      0.068,
      0.049,
      0.18,
      1,
      "#d7a889",
      "rgba(255, 236, 215, 0.26)",
    );

    const cuffL = add(hipL, mul(sub(kneeL, hipL), 0.56));
    const cuffR = add(hipR, mul(sub(kneeR, hipR), 0.56));
    this.drawSculptedLimb(hipL, cuffL, 0.076, 0.064, 0.06, -1, "#26221f", null, "#14110e");
    this.drawSculptedLimb(hipR, cuffR, 0.076, 0.064, 0.06, 1, "#2b2623", null, "#14110e");

    const shinAngL = Math.atan2(
      this.toScreen(footL).y - this.toScreen(kneeL).y,
      this.toScreen(footL).x - this.toScreen(kneeL).x,
    ) - Math.PI * 0.5;
    const shinAngR = Math.atan2(
      this.toScreen(footR).y - this.toScreen(kneeR).y,
      this.toScreen(footR).x - this.toScreen(kneeR).x,
    ) - Math.PI * 0.5;
    this.drawClimbingShoe(footL, "left", shinAngL);
    this.drawClimbingShoe(footR, "right", shinAngR);

    // 4. Sculpted V-tapered athletic raglan torso, harness, swaying chalk bag & expressive head
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
    const sc = this.scale;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(-torsoAngle);

    // Climbing shorts hip/pelvis saddle
    c.fillStyle = "#26221f";
    c.strokeStyle = "#14110e";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(-0.165 * sc, 0.09 * sc);
    c.lineTo(0.165 * sc, 0.09 * sc);
    c.quadraticCurveTo(0.185 * sc, 0.25 * sc, 0.135 * sc, 0.31 * sc);
    c.quadraticCurveTo(0, 0.34 * sc, -0.135 * sc, 0.31 * sc);
    c.quadraticCurveTo(-0.185 * sc, 0.25 * sc, -0.165 * sc, 0.09 * sc);
    c.closePath();
    c.fill();
    c.stroke();

    // Sculpted athletic V-tapered raglan climbing top (warm terracotta #d96b43 + charcoal raglan yokes)
    const torsoPath = () => {
      c.beginPath();
      c.moveTo(-0.215 * sc, -0.29 * sc);
      c.quadraticCurveTo(-0.12 * sc, -0.38 * sc, 0, -0.375 * sc);
      c.quadraticCurveTo(0.12 * sc, -0.38 * sc, 0.215 * sc, -0.29 * sc);
      c.bezierCurveTo(0.225 * sc, -0.14 * sc, 0.175 * sc, 0.02 * sc, 0.162 * sc, 0.13 * sc);
      c.quadraticCurveTo(0, 0.165 * sc, -0.162 * sc, 0.13 * sc);
      c.bezierCurveTo(-0.175 * sc, 0.02 * sc, -0.225 * sc, -0.14 * sc, -0.215 * sc, -0.29 * sc);
      c.closePath();
    };

    const shirtGrad = c.createLinearGradient(-0.2 * sc, -0.36 * sc, 0.2 * sc, 0.15 * sc);
    shirtGrad.addColorStop(0, "#e57a52");
    shirtGrad.addColorStop(0.55, "#d96b43");
    shirtGrad.addColorStop(1, "#b4502d");
    torsoPath();
    c.fillStyle = shirtGrad;
    c.fill();

    // Charcoal raglan shoulder panels + cream athletic side seam piping
    c.save();
    torsoPath();
    c.clip();
    c.fillStyle = "#292420";
    c.beginPath();
    c.moveTo(-0.24 * sc, -0.38 * sc);
    c.lineTo(-0.06 * sc, -0.38 * sc);
    c.lineTo(-0.14 * sc, -0.14 * sc);
    c.lineTo(-0.24 * sc, -0.18 * sc);
    c.closePath();
    c.moveTo(0.24 * sc, -0.38 * sc);
    c.lineTo(0.06 * sc, -0.38 * sc);
    c.lineTo(0.14 * sc, -0.14 * sc);
    c.lineTo(0.24 * sc, -0.18 * sc);
    c.closePath();
    c.fill();

    // Cream raglan piping + subtle back spine contour
    c.strokeStyle = "rgba(244, 239, 230, 0.55)";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-0.065 * sc, -0.37 * sc);
    c.lineTo(-0.145 * sc, -0.14 * sc);
    c.moveTo(0.065 * sc, -0.37 * sc);
    c.lineTo(0.145 * sc, -0.14 * sc);
    c.stroke();

    c.strokeStyle = "rgba(26, 20, 16, 0.22)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(0, -0.28 * sc);
    c.lineTo(0, 0.06 * sc);
    c.stroke();
    c.restore();

    torsoPath();
    c.strokeStyle = climberRim ?? "#171310";
    c.lineWidth = climberRim ? 2.5 : 1.7;
    c.stroke();

    // Harness waistbelt + ochre gear loop
    c.fillStyle = "#3b342e";
    c.strokeStyle = "#14110e";
    c.lineWidth = 1.3;
    c.beginPath();
    c.roundRect(-0.172 * sc, 0.105 * sc, 0.344 * sc, 0.048 * sc, 3);
    c.fill();
    c.stroke();

    // Swaying chalked-up chalk bag suspended from waist cord
    const bagSway = this.reduced
      ? 0
      : clamp(torsoAngle * 0.6 - vel.x * 0.14 + Math.sin(s.tick * 0.08) * 0.04, -0.48, 0.48);
    c.save();
    c.translate(-0.035 * sc, 0.135 * sc);
    c.rotate(bagSway);
    // Cord loop
    c.strokeStyle = "#eb9c28";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-0.025 * sc, 0);
    c.lineTo(-0.03 * sc, 0.03 * sc);
    c.moveTo(0.025 * sc, 0);
    c.lineTo(0.03 * sc, 0.03 * sc);
    c.stroke();
    // Cylindrical canvas chalk bag body
    c.fillStyle = "#3b7dd8";
    c.strokeStyle = "#14110e";
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-0.052 * sc, 0.025 * sc);
    c.lineTo(0.052 * sc, 0.025 * sc);
    c.lineTo(0.062 * sc, 0.155 * sc);
    c.quadraticCurveTo(0, 0.18 * sc, -0.062 * sc, 0.155 * sc);
    c.closePath();
    c.fill();
    c.stroke();
    // Ochre woven accent stripe on bag
    c.fillStyle = "#eb9c28";
    c.fillRect(-0.054 * sc, 0.085 * sc, 0.108 * sc, 0.026 * sc);
    // Plush chalked fleece top rim
    c.fillStyle = "#f7f3eb";
    c.beginPath();
    c.roundRect(-0.056 * sc, 0.016 * sc, 0.112 * sc, 0.034 * sc, 3);
    c.fill();
    c.stroke();
    c.restore();

    // Sculpted neck + chin shadow
    c.fillStyle = "#c99778";
    c.strokeStyle = "#171310";
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(-0.052 * sc, -0.44 * sc, 0.104 * sc, 0.095 * sc, 4);
    c.fill();
    c.stroke();

    // Expressive head + tousled hair + headband + dynamic gaze/brows
    const isDynoFlight =
      !!(s as unknown as { dynoLaunch?: boolean }).dynoLaunch && s.flight > 0;
    const isPumped =
      s.energy < 0.35 ||
      s.reserve.left < 0.3 ||
      s.reserve.right < 0.3;

    c.save();
    c.translate(0, -0.535 * sc);
    c.rotate(gx * 0.16);

    // Fluttering headband tails behind head
    const tailFlutter = this.reduced ? 0 : Math.sin(s.tick * 0.22) * 0.02 * sc - clamp(vel.y * 0.018, -0.05, 0.05) * sc;
    c.strokeStyle = "#eb9c28";
    c.lineWidth = Math.max(2, 0.022 * sc);
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-0.12 * sc, -0.03 * sc);
    c.quadraticCurveTo(-0.19 * sc, 0.01 * sc + tailFlutter, -0.23 * sc, 0.06 * sc + tailFlutter);
    c.moveTo(-0.11 * sc, -0.01 * sc);
    c.quadraticCurveTo(-0.17 * sc, 0.04 * sc + tailFlutter, -0.2 * sc, 0.095 * sc + tailFlutter);
    c.stroke();

    // Ears
    c.fillStyle = "#cf9d7e";
    c.strokeStyle = "#171310";
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(-0.138 * sc, 0.01 * sc, 0.028 * sc, 0.042 * sc, -0.1, 0, Math.PI * 2);
    c.ellipse(0.138 * sc, 0.01 * sc, 0.028 * sc, 0.042 * sc, 0.1, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    // Sculpted head contour
    c.fillStyle = "#dfb393";
    c.strokeStyle = climberRim ?? "#171310";
    c.lineWidth = climberRim ? 2.2 : 1.6;
    c.beginPath();
    c.ellipse(0, 0, 0.138 * sc, 0.158 * sc, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    // Ochre athletic headband wrapping forehead
    c.fillStyle = "#eb9c28";
    c.strokeStyle = "#171310";
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(-0.142 * sc, -0.078 * sc, 0.284 * sc, 0.042 * sc, 3);
    c.fill();
    c.stroke();

    // Tousled dark espresso hair crown + wind-swept tufts
    const hairShift = (-0.01 - gx * 0.022) * sc;
    c.fillStyle = "#211b18";
    c.strokeStyle = "#120e0c";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-0.14 * sc + hairShift, -0.068 * sc);
    c.quadraticCurveTo(-0.15 * sc + hairShift, -0.175 * sc, -0.05 * sc + hairShift, -0.185 * sc);
    c.lineTo(-0.02 * sc + hairShift, -0.215 * sc);
    c.lineTo(0.035 * sc + hairShift, -0.182 * sc);
    c.lineTo(0.085 * sc + hairShift, -0.205 * sc);
    c.quadraticCurveTo(0.152 * sc + hairShift, -0.155 * sc, 0.14 * sc + hairShift, -0.068 * sc);
    c.closePath();
    c.fill();
    c.stroke();

    // Dynamic eyes, brows & mouth expression
    const eyeX = gx * 0.048 * sc,
      eyeY = clamp(-gy * 0.032 * sc + 0.006 * sc, -0.022 * sc, 0.035 * sc),
      eyeR = Math.max(1.7, 0.018 * sc) * (isDynoFlight ? 1.28 : isPumped ? 0.85 : 1);

    if (isDynoFlight) {
      c.fillStyle = "#f7f3eb";
      c.beginPath();
      c.arc(eyeX - 0.036 * sc, eyeY, eyeR * 1.35, 0, Math.PI * 2);
      c.arc(eyeX + 0.036 * sc, eyeY, eyeR * 1.35, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#191512";
    c.beginPath();
    c.arc(eyeX - 0.036 * sc, eyeY, eyeR, 0, Math.PI * 2);
    c.arc(eyeX + 0.036 * sc, eyeY, eyeR, 0, Math.PI * 2);
    c.fill();

    // Expressive brows
    c.strokeStyle = "#191512";
    c.lineWidth = Math.max(1.3, 0.012 * sc);
    c.lineCap = "round";
    c.beginPath();
    if (isPumped) {
      // Furrowed grit brows
      c.moveTo(eyeX - 0.062 * sc, eyeY - 0.032 * sc);
      c.lineTo(eyeX - 0.016 * sc, eyeY - 0.018 * sc);
      c.moveTo(eyeX + 0.062 * sc, eyeY - 0.032 * sc);
      c.lineTo(eyeX + 0.016 * sc, eyeY - 0.018 * sc);
    } else if (isDynoFlight) {
      // High arched dyno-flight brows
      c.moveTo(eyeX - 0.058 * sc, eyeY - 0.034 * sc);
      c.quadraticCurveTo(eyeX - 0.036 * sc, eyeY - 0.052 * sc, eyeX - 0.014 * sc, eyeY - 0.034 * sc);
      c.moveTo(eyeX + 0.014 * sc, eyeY - 0.034 * sc);
      c.quadraticCurveTo(eyeX + 0.036 * sc, eyeY - 0.052 * sc, eyeX + 0.058 * sc, eyeY - 0.034 * sc);
    } else {
      // Determined focused brows
      c.moveTo(eyeX - 0.056 * sc, eyeY - 0.026 * sc);
      c.lineTo(eyeX - 0.016 * sc, eyeY - 0.03 * sc);
      c.moveTo(eyeX + 0.016 * sc, eyeY - 0.03 * sc);
      c.lineTo(eyeX + 0.056 * sc, eyeY - 0.026 * sc);
    }
    c.stroke();

    // Mouth cue (grit grimace vs dyno O-mouth vs calm focus)
    if (isPumped) {
      c.fillStyle = "#f7f3eb";
      c.strokeStyle = "#191512";
      c.lineWidth = 1.1;
      c.beginPath();
      c.roundRect(eyeX - 0.032 * sc, eyeY + 0.044 * sc, 0.064 * sc, 0.022 * sc, 2);
      c.fill();
      c.stroke();
    } else if (isDynoFlight) {
      c.fillStyle = "#3a1e18";
      c.beginPath();
      c.ellipse(eyeX, eyeY + 0.052 * sc, 0.02 * sc, 0.025 * sc, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.strokeStyle = "#7a4e39";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(eyeX - 0.02 * sc, eyeY + 0.052 * sc);
      c.quadraticCurveTo(eyeX, eyeY + 0.058 * sc, eyeX + 0.022 * sc, eyeY + 0.048 * sc);
      c.stroke();
    }

    c.restore();
    c.restore();

    // 5. Front arm (drawn in front of torso for clear crossed-arm readability)
    this.drawClimberArm(s, frontSide, true, climberRim);

    // 6. Contact strain rings, L/R badges & intent guides
    for (const side of armOrder) {
      const shoulder = rig.shoulder(side),
        hand = rig.hand(side),
        hp = this.toScreen(hand),
        contact = s.contacts[side],
        accent = WRIST_TAPE[side];
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
          warnColor = sev > 0.82 ? "#ec4e32" : "#f0a830",
          pulse = this.reduced ? 0 : Math.sin(s.tick * 0.24) * 1.4;
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

      if (climberRim && contact) {
        c.strokeStyle = climberRim;
        c.lineWidth = 2.8;
        c.beginPath();
        c.arc(hp.x, hp.y, 0.056 * this.scale, 0, Math.PI * 2);
        c.stroke();
      }

      // Crisp L / R wrist tag pill above hand
      c.font = '700 9.5px "BarlowCondensed", "Fredoka", sans-serif';
      c.fillStyle = accent;
      c.textAlign = "center";
      c.fillText(side === "left" ? "L" : "R", hp.x, hp.y - 18);

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
          c.strokeStyle = accent + "58";
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
        c.font = '700 9px "BarlowCondensed", "Fredoka", sans-serif';
        c.fillStyle = accent;
        c.textAlign = "center";
        c.fillText(
          side === "left" ? "L AIM" : "R AIM",
          target.x,
          target.y + 21,
        );
      }
    }

    // 7. Stylish Diegetic Stamina Arc HUD beneath chalk bag / hip
    this.drawStaminaRig(s, hipCenter);
  }

  private drawClimberArm(
    s: Simulation,
    side: Hand,
    isFront: boolean,
    climberRim: string | null,
  ) {
    const rig = s.rig;
    const shoulder = rig.shoulder(side);
    const rawElbow = rig.arms[side].elbow.getAnchorA();
    const hand = rig.hand(side);
    const reserve = s.reserve[side];
    const contact = s.contacts[side];

    // Subtle muscle tremor along forearm/elbow when reserve < 0.35 (contact point stays exact!)
    let elbow: V = rawElbow;
    let bulgeExtra = 0;
    if (!this.reduced && reserve < 0.35) {
      const intensity = clamp((0.35 - reserve) / 0.35, 0.2, 1);
      const phase = s.tick * 0.85 + (side === "left" ? 0 : 2.1);
      const jitter = Math.sin(phase) * 0.0085 * intensity;
      const d = sub(hand, shoulder);
      const dLen = Math.hypot(d.x, d.y) || 1;
      elbow = add(rawElbow, v((-d.y / dLen) * jitter, (d.x / dLen) * jitter));
      bulgeExtra = Math.cos(phase * 1.4) * 0.05 * intensity;
    }

    const skinUpper = isFront
      ? side === "left"
        ? "#d9a98b"
        : "#e2b596"
      : side === "left"
        ? "#bf8e71"
        : "#c9997b";
    const skinFore = isFront
      ? side === "left"
        ? "#dfb092"
        : "#e7bc9e"
      : side === "left"
        ? "#c49376"
        : "#ce9e80";
    const outline = isFront ? "#14100d" : "#1c1714";
    const highlight = isFront
      ? climberRim
        ? climberRim + "88"
        : "rgba(255, 240, 222, 0.28)"
      : null;
    const asym = side === "left" ? -1 : 1;

    // Sculpted deltoid/bicep upper arm
    this.drawSculptedLimb(
      shoulder,
      elbow,
      0.054,
      0.043,
      0.22 + bulgeExtra,
      asym,
      skinUpper,
      highlight,
      outline,
    );

    // Charcoal raglan short-sleeve cap over deltoid
    const sleeveEnd = add(shoulder, mul(sub(elbow, shoulder), 0.34));
    this.drawSculptedLimb(
      shoulder,
      sleeveEnd,
      0.061,
      0.053,
      0.08,
      asym,
      isFront ? "#2d2723" : "#241f1c",
      null,
      outline,
    );

    // Tapered flexor forearm (broad brachioradialis near elbow -> trim wrist)
    this.drawSculptedLimb(
      elbow,
      hand,
      0.046,
      0.028,
      0.24 + bulgeExtra,
      asym,
      skinFore,
      highlight,
      outline,
    );

    const strainVal =
      typeof (s as { strain?: (h: Hand) => number }).strain === "function"
        ? s.strain(side)
        : 0;
    const highStrain =
      !!contact &&
      (contact.load > 1.15 || contact.drift > 0.025 || strainVal > 0.72);
    const shownGrip: Grip =
      s.input[side].grip === "unknown" && contact
        ? contact.hold.kind
        : s.input[side].grip;

    this.drawHandPose(elbow, hand, side, shownGrip, skinFore, highStrain);
  }

  /** Curved Jusant / BotW-inspired Diegetic Stamina Arc Rig beneath chalk bag / hip. */
  private drawStaminaRig(s: Simulation, hipWorld: V) {
    const c = this.ctx;
    const hp = this.toScreen(hipWorld);
    const cx = hp.x;
    const cy = hp.y - 2; // Center of curvature so arcs cradle gracefully beneath hips

    const restingFn = (s as unknown as { resting?: (side: Hand) => boolean }).resting;
    const restLeft = typeof restingFn === "function" && restingFn.call(s, "left");
    const restRight = typeof restingFn === "function" && restingFn.call(s, "right");
    const anyResting = restLeft || restRight;

    c.save();
    c.lineCap = "round";

    // 1. Central Curved Core Stamina Arc (`s.energy`): sweeps bottom smile 0.24π .. 0.76π
    const coreR = 26;
    const coreA0 = Math.PI * 0.24;
    const coreA1 = Math.PI * 0.76;
    const coreSpan = coreA1 - coreA0;

    // Dark recessed backing plate
    c.strokeStyle = "rgba(18, 15, 13, 0.78)";
    c.lineWidth = 6.5;
    c.beginPath();
    c.arc(cx, cy, coreR, coreA0, coreA1);
    c.stroke();

    c.strokeStyle = "rgba(244, 239, 230, 0.14)";
    c.lineWidth = 3.8;
    c.beginPath();
    c.arc(cx, cy, coreR, coreA0, coreA1);
    c.stroke();

    if (anyResting && !this.reduced) {
      c.strokeStyle = "rgba(244, 239, 230, 0.42)";
      c.lineWidth = 7.2;
      c.beginPath();
      c.arc(cx, cy, coreR, coreA0, coreA0 + coreSpan * clamp(s.energy, 0.03, 1));
      c.stroke();
    }

    const corePulse =
      !this.reduced && s.energy < 0.35
        ? 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(s.tick * 0.24))
        : 1;
    c.globalAlpha = corePulse;
    c.strokeStyle = staminaGaugeColor(s.energy);
    c.lineWidth = 4.2;
    const halfCore = (coreSpan * clamp(s.energy, 0, 1)) * 0.5;
    const coreMid = Math.PI * 0.5;
    if (halfCore > 0.01) {
      c.beginPath();
      c.arc(cx, cy, coreR, coreMid - halfCore, coreMid + halfCore);
      c.stroke();
    }
    c.globalAlpha = 1;

    // 2. Flanking Left & Right Forearm Arcs (`s.reserve.left` / `s.reserve.right`)
    const wingR = 33;
    const drawForearmWing = (
      val: number,
      resting: boolean,
      aBottom: number,
      aTop: number,
      ccw: boolean,
      phaseOff: number,
    ) => {
      c.strokeStyle = "rgba(18, 15, 13, 0.74)";
      c.lineWidth = 5.2;
      c.beginPath();
      c.arc(cx, cy, wingR, aBottom, aTop, ccw);
      c.stroke();

      c.strokeStyle = "rgba(244, 239, 230, 0.12)";
      c.lineWidth = 2.8;
      c.beginPath();
      c.arc(cx, cy, wingR, aBottom, aTop, ccw);
      c.stroke();

      const u = clamp(val, 0, 1);
      if (u <= 0.01) return;
      const aFill = aBottom + (aTop - aBottom) * u;

      if (resting) {
        c.strokeStyle = "rgba(247, 243, 235, 0.65)";
        c.lineWidth = 6.2;
        c.beginPath();
        c.arc(cx, cy, wingR, aBottom, aFill, ccw);
        c.stroke();
      }

      const pulse =
        !this.reduced && u < 0.35
          ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(s.tick * 0.26 + phaseOff))
          : 1;
      c.globalAlpha = pulse;
      c.strokeStyle = resting && u > 0.35 ? "#f4efe6" : staminaGaugeColor(u);
      c.lineWidth = 3.2;
      c.beginPath();
      c.arc(cx, cy, wingR, aBottom, aFill, ccw);
      c.stroke();
      c.globalAlpha = 1;
    };

    // Left forearm wing sweeps upward along left flank (0.64π -> 0.94π)
    drawForearmWing(s.reserve.left, restLeft, Math.PI * 0.64, Math.PI * 0.94, false, 0);
    // Right forearm wing sweeps upward along right flank (0.36π -> 0.06π)
    drawForearmWing(s.reserve.right, restRight, Math.PI * 0.36, Math.PI * 0.06, true, 1.4);

    c.restore();
  }

  private effect(e: SimEvent, s: Simulation) {
    const impact = (e as { impact?: ImpactKind }).impact;
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
        text: "BOULDER SENT!",
        age: 0,
        duration: 1.15,
        color: "#f5ede0",
        accent: "#ffd175",
        bg: "rgba(24, 21, 18, 0.94)",
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
          existing.color = "#ffd175";
          existing.accent = "#eb9c28";
          existing.bg = "rgba(32, 26, 20, 0.94)";
        }
      } else if (isApex) {
        this.callouts.push({
          p: { ...e.p },
          text: "APEX DYNO!",
          age: 0,
          duration: 1.08,
          color: "#ffd175",
          accent: "#eb9c28",
          bg: "rgba(32, 26, 20, 0.94)",
          emphasis: true,
        });
      } else {
        this.callouts.push({
          p: { ...e.p },
          text: "DYNO CAUGHT!",
          age: 0,
          duration: 0.98,
          color: "#8ef5be",
          accent: "#2fb370",
          bg: "rgba(24, 21, 18, 0.92)",
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
        color: "#ffd175",
        accent: "#eb9c28",
        bg: "rgba(24, 21, 18, 0.90)",
        emphasis: true,
      });
    } else if (e.kind === "catch" && /clean/i.test(e.message)) {
      this.callouts.push({
        p: { ...e.p },
        text: "CLEAN CATCH",
        age: 0,
        duration: 0.9,
        color: "#f4efe6",
        accent: "#2fb370",
        bg: "rgba(24, 21, 18, 0.88)",
        emphasis: false,
      });
    }
    if (this.callouts.length > 4) {
      this.callouts.splice(0, this.callouts.length - 4);
    }

    if (isDynoLaunch) {
      for (let i = 0; i < 14; i++) {
        const spread = (i / 13 - 0.5) * 1.6;
        const speed = 0.45 + (i % 4) * 0.22;
        this.particles.push({
          p: { ...e.p },
          vel: v(
            Math.sin(spread) * speed - dir.x * 0.25,
            Math.cos(spread) * 0.4 + 0.35,
          ),
          life: 0.38 + (i % 4) * 0.09,
          color: "#f7f3eb",
          size: 2.3,
        });
      }
    } else if (
      e.kind === "catch" &&
      (isApex || isDynoCatch || e.power > 1.2)
    ) {
      const count = isApex ? 34 : 26;
      for (let i = 0; i < count; i++) {
        const cone = Math.PI * 0.5 + (i / (count - 1) - 0.5) * 2.1;
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
              ? "#ffd175"
              : i % 2 === 0
                ? "#f7f3eb"
                : "#e8dfd2",
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
              ? "#e55938"
              : e.kind === "finish" && i % 4 === 0
                ? "#ffd175"
                : "#f7f3eb",
          size: e.kind === "finish" && i % 4 === 0 ? 3 : 2.5,
        });
      }
    }
    if (this.particles.length > 180) {
      this.particles.splice(0, this.particles.length - 180);
    }
  }
}
