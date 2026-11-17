import type { SimEvent } from "../core/types";
export class AudioFeedback {
  context: AudioContext | null = null;
  muted = false;
  private last = 0;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private silence: ConstantSourceNode | null = null;
  recordingStream() {
    this.unlock();
    this.capture ??= this.context!.createMediaStreamDestination();
    if (!this.silence) {
      this.silence = this.context!.createConstantSource();
      this.silence.offset.value = 0;
      this.silence.connect(this.capture);
      this.silence.start();
    }
    return this.capture.stream;
  }
  unlock() {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume().catch(() => {});
  }
  reset() {
    this.last = 0;
  }
  play(events: SimEvent[]) {
    for (const e of events) {
      if (e.id <= this.last) continue;
      this.last = e.id;
      if (this.muted || !this.context || this.context.state !== "running")
        continue;
      const c = this.context,
        o = c.createOscillator(),
        g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      if (this.capture) g.connect(this.capture);
      const f =
        e.kind === "finish"
          ? 523
          : e.kind === "catch"
            ? 150
            : e.kind === "slip"
              ? 90
              : e.kind === "launch"
                ? 300
                : 220;
      o.type = e.kind === "catch" ? "triangle" : "sine";
      o.frequency.setValueAtTime(f, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        e.kind === "finish" ? 784 : f * 0.45,
        c.currentTime + 0.16,
      );
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
      o.start();
      o.stop(c.currentTime + 0.25);
    }
  }
}
