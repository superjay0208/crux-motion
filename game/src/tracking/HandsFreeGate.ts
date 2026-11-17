export type GatePhase =
  | "idle"
  | "waiting"
  | "settling"
  | "countdown"
  | "complete";
export type GateView = { phase: GatePhase; seconds: number };

/** A deliberate click arms an action; fresh hands finish it later. No click-time pose gate. */
export class HandsFreeGate {
  active = false;
  private stable = 0;
  private remaining: number;
  private frames = 0;
  private sequence = -1;
  private lastTime = 0;
  private gap: number | null = null;
  view: GateView = { phase: "idle", seconds: 3 };
  constructor(
    readonly countdownMs = 3000,
    readonly settleMs = 500,
    readonly graceMs = 200,
  ) {
    this.remaining = countdownMs;
  }
  arm(now: number) {
    this.active = true;
    this.lastTime = now;
    this.resetProgress();
    this.view = { phase: "waiting", seconds: Math.ceil(this.remaining / 1000) };
  }
  cancel() {
    this.active = false;
    this.resetProgress();
    this.view = { phase: "idle", seconds: Math.ceil(this.remaining / 1000) };
  }
  private resetProgress() {
    this.stable = 0;
    this.remaining = this.countdownMs;
    this.frames = 0;
    this.sequence = -1;
    this.gap = null;
  }
  update(now: number, sequence: number, ready: boolean): GateView {
    if (!this.active) return this.view;
    // A stalled/hidden page must never skip the countdown when it wakes up.
    let dt = Math.min(100, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    if (!ready) {
      this.gap ??= now;
      if (now - this.gap > this.graceMs) {
        this.resetProgress();
        this.gap = now;
      }
      return (this.view = {
        phase: "waiting",
        seconds: Math.ceil(this.remaining / 1000),
      });
    }
    if (this.gap !== null) {
      if (now - this.gap > this.graceMs) this.resetProgress();
      this.gap = null;
      dt = 0;
    }
    if (sequence > this.sequence) {
      this.sequence = sequence;
      this.frames++;
    }
    if (this.stable < this.settleMs || this.frames < 3) {
      this.stable += dt;
      return (this.view = {
        phase: "settling",
        seconds: Math.ceil(this.remaining / 1000),
      });
    }
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining === 0) {
      this.active = false;
      return (this.view = { phase: "complete", seconds: 0 });
    }
    return (this.view = {
      phase: "countdown",
      seconds: Math.ceil(this.remaining / 1000),
    });
  }
}
