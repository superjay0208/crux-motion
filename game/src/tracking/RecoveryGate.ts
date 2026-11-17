/** Fresh, settled camera observations are required; elapsed wall time alone never resumes play. */
export class RecoveryGate {
  active = false;
  reason = "";
  private since: number | null = null;
  private sequence = -1;
  private lastSample = -Infinity;
  progress = 0;
  arm(reason: string) {
    this.active = true;
    this.reason = reason;
    this.since = null;
    this.sequence = -1;
    this.lastSample = -Infinity;
    this.progress = 0;
  }
  update(now: number, sequence: number, ready: boolean) {
    if (!this.active) return false;
    if (!ready || now - this.lastSample > 300) {
      this.since = null;
      this.progress = 0;
    }
    if (!ready || sequence === this.sequence) return false;
    this.sequence = sequence;
    this.lastSample = now;
    this.since ??= now;
    this.progress = Math.min(1, (now - this.since) / 700);
    return this.progress >= 1;
  }
  cancel() {
    this.active = false;
    this.since = null;
    this.progress = 0;
  }
}
