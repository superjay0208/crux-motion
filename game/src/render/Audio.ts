import { clamp } from "../core/math";
import type { SimEvent } from "../core/types";

export class AudioFeedback {
  context: AudioContext | null = null;
  muted = false;
  private last = 0;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private silence: ConstantSourceNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private noiseCtx: AudioContext | null = null;

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

  private out(c: AudioContext, g: GainNode) {
    g.connect(c.destination);
    if (this.capture) g.connect(this.capture);
  }

  private noise(c: AudioContext): AudioBuffer | null {
    if (this.noiseBuf && this.noiseCtx === c) return this.noiseBuf;
    if (typeof c.createBuffer !== "function") return null;
    const len = Math.max(1, Math.floor((c.sampleRate || 44100) * 0.35));
    const buf = c.createBuffer(1, len, c.sampleRate || 44100);
    const data = buf.getChannelData(0);
    let seed = 0x517cc1b7;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuf = buf;
    this.noiseCtx = c;
    return buf;
  }

  private tone(
    c: AudioContext,
    type: OscillatorType,
    f0: number,
    f1: number,
    start: number,
    dur: number,
    peak: number,
    attack = 0.005,
  ) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak),
      start + Math.min(attack, dur * 0.4),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    this.out(c, g);
    o.start(start);
    o.stop(start + dur + 0.015);
  }

  private burst(
    c: AudioContext,
    filterType: BiquadFilterType,
    freq0: number,
    freq1: number,
    q: number,
    start: number,
    dur: number,
    peak: number,
  ) {
    const buf = this.noise(c);
    if (
      !buf ||
      typeof c.createBufferSource !== "function" ||
      typeof c.createBiquadFilter !== "function"
    )
      return;
    const src = c.createBufferSource(),
      flt = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = buf;
    flt.type = filterType;
    flt.Q.setValueAtTime(q, start);
    flt.frequency.setValueAtTime(freq0, start);
    if (freq1 !== freq0) {
      flt.frequency.exponentialRampToValueAtTime(
        Math.max(40, freq1),
        start + dur,
      );
    }
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, peak),
      start + Math.min(0.006, dur * 0.35),
    );
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(flt);
    flt.connect(g);
    this.out(c, g);
    src.start(start);
    src.stop(start + dur + 0.015);
  }

  play(events: SimEvent[]) {
    for (const e of events) {
      if (e.id <= this.last) continue;
      this.last = e.id;
      if (this.muted || !this.context || this.context.state !== "running")
        continue;
      try {
        const c = this.context,
          t = c.currentTime,
          p = clamp(e.power || 1, 0.35, 2),
          scale = 0.55 + 0.45 * (p / 2);
        switch (e.kind) {
          case "catch": {
            // Warm low triangle body thud + crisp rock contact tap
            this.tone(c, "triangle", 145, 48, t, 0.095, 0.085 * scale, 0.004);
            this.tone(c, "sine", 610, 215, t, 0.022, 0.032 * scale, 0.002);
            this.burst(
              c,
              "bandpass",
              1150,
              760,
              1.6,
              t,
              0.026,
              0.038 * scale,
            );
            // Bright fifth harmonic ping on clean / dyno catches
            if (/dyno|clean/i.test(e.message)) {
              this.tone(
                c,
                "sine",
                587.33,
                880,
                t + 0.012,
                0.065,
                0.036 * scale,
                0.005,
              );
              this.tone(
                c,
                "sine",
                880,
                880,
                t + 0.055,
                0.15,
                0.026 * scale,
                0.008,
              );
            }
            break;
          }
          case "release": {
            // Soft high-passed noise/sine brush (340 -> 190 Hz, 45ms)
            this.tone(c, "sine", 340, 190, t, 0.045, 0.026, 0.004);
            this.burst(c, "highpass", 1050, 820, 0.8, t, 0.045, 0.018);
            break;
          }
          case "slip": {
            // Short gritty sawtooth/noise chalk scrape (150 -> 65 Hz, 140ms)
            if (typeof c.createBiquadFilter === "function") {
              const o = c.createOscillator(),
                flt = c.createBiquadFilter(),
                g = c.createGain();
              o.type = "sawtooth";
              o.frequency.setValueAtTime(150, t);
              o.frequency.exponentialRampToValueAtTime(65, t + 0.14);
              flt.type = "lowpass";
              flt.frequency.setValueAtTime(520, t);
              flt.frequency.exponentialRampToValueAtTime(240, t + 0.14);
              g.gain.setValueAtTime(0.0001, t);
              g.gain.exponentialRampToValueAtTime(0.042, t + 0.012);
              g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
              o.connect(flt);
              flt.connect(g);
              this.out(c, g);
              o.start(t);
              o.stop(t + 0.155);
            } else {
              this.tone(c, "sawtooth", 150, 65, t, 0.14, 0.035, 0.01);
            }
            this.burst(c, "bandpass", 1450, 680, 1.3, t, 0.14, 0.034);
            break;
          }
          case "launch": {
            // Rising airy sweep (220 -> 440 Hz + soft bandpass whoosh) scaled by power
            this.tone(c, "sine", 220, 440, t, 0.17, 0.038 * scale, 0.012);
            this.burst(
              c,
              "bandpass",
              380,
              1220,
              1.1,
              t,
              0.19,
              0.032 * scale,
            );
            break;
          }
          case "checkpoint": {
            // Gentle marimba tick (659 Hz, 70ms)
            this.tone(c, "sine", 659.25, 659.25, t, 0.07, 0.045, 0.003);
            this.tone(c, "triangle", 1318.5, 987.77, t, 0.032, 0.014, 0.002);
            break;
          }
          case "fall": {
            // Downward glide (240 -> 72 Hz, 300ms)
            this.tone(c, "triangle", 240, 72, t, 0.3, 0.065, 0.016);
            this.burst(c, "lowpass", 620, 180, 0.9, t, 0.26, 0.022);
            break;
          }
          case "finish": {
            // Warm resolving triad chime (C5 523.25 Hz -> G5 783.99 Hz -> C6 1046.5 Hz)
            const notes: [number, number, number, number][] = [
              [523.25, 0, 0.36, 0.052],
              [783.99, 0.11, 0.42, 0.054],
              [1046.5, 0.23, 0.62, 0.058],
            ];
            for (const [freq, delay, dur, amp] of notes) {
              this.tone(c, "sine", freq, freq, t + delay, dur, amp, 0.008);
              this.tone(
                c,
                "triangle",
                freq * 0.5,
                freq * 0.5,
                t + delay,
                dur * 0.75,
                amp * 0.28,
                0.01,
              );
            }
            break;
          }
        }
      } catch {
        // Keep gameplay resilient if browser audio state changes mid-frame.
      }
    }
  }
}
