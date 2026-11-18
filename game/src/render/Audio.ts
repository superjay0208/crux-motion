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
          p = clamp(e.power || 1, 0.35, 3),
          scale = 0.55 + 0.45 * Math.min(1.35, p / 2),
          impact = (e as any).impact as string | undefined;
        switch (e.kind) {
          case "catch": {
            const isApex = impact === "apex" || /apex/i.test(e.message);
            const isDyno =
              isApex || impact === "dyno" || /dyno/i.test(e.message);
            if (isDyno) {
              // Deep sub-bass punch (92 -> 34 Hz sine) + warm body thud + crisp rock slap
              this.tone(
                c,
                "sine",
                92,
                34,
                t,
                isApex ? 0.17 : 0.145,
                (isApex ? 0.115 : 0.098) * scale,
                0.003,
              );
              this.tone(
                c,
                "triangle",
                165,
                52,
                t,
                0.095,
                0.082 * scale,
                0.003,
              );
              this.tone(c, "sine", 780, 240, t, 0.024, 0.044 * scale, 0.002);
              this.burst(
                c,
                "bandpass",
                1420,
                820,
                1.45,
                t,
                0.034,
                0.055 * scale,
              );
              if (isApex) {
                // Celebratory D-major harmonic triad (D5 587 Hz -> A5 880 Hz -> F#6 1480 Hz)
                this.tone(
                  c,
                  "sine",
                  587.33,
                  587.33,
                  t + 0.01,
                  0.18,
                  0.044 * scale,
                  0.004,
                );
                this.tone(
                  c,
                  "sine",
                  880,
                  880,
                  t + 0.048,
                  0.22,
                  0.042 * scale,
                  0.005,
                );
                this.tone(
                  c,
                  "sine",
                  1479.98,
                  1479.98,
                  t + 0.092,
                  0.3,
                  0.038 * scale,
                  0.006,
                );
                this.tone(
                  c,
                  "triangle",
                  739.99,
                  739.99,
                  t + 0.092,
                  0.22,
                  0.016 * scale,
                  0.008,
                );
              } else {
                // Bright fifth chime (C5 523.25 Hz -> G5 783.99 Hz) on Dyno catch
                this.tone(
                  c,
                  "sine",
                  523.25,
                  523.25,
                  t + 0.012,
                  0.15,
                  0.04 * scale,
                  0.005,
                );
                this.tone(
                  c,
                  "sine",
                  783.99,
                  783.99,
                  t + 0.056,
                  0.21,
                  0.036 * scale,
                  0.006,
                );
              }
            } else {
              // Warm low triangle body thud + crisp rock contact tap
              this.tone(
                c,
                "triangle",
                145,
                48,
                t,
                0.095,
                0.085 * scale,
                0.004,
              );
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
              if (/clean/i.test(e.message)) {
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
            if (impact === "launch" || e.message.includes("Dyno")) {
              // Energetic upward spring-release whoosh (115 -> 390 Hz triangle + crisp bandpass air burst)
              this.tone(
                c,
                "triangle",
                115,
                390,
                t,
                0.19,
                0.068 * scale,
                0.006,
              );
              this.tone(c, "sine", 180, 95, t, 0.038, 0.045 * scale, 0.003);
              this.burst(
                c,
                "bandpass",
                340,
                1680,
                1.35,
                t,
                0.21,
                0.052 * scale,
              );
            } else {
              // Subtle soft drop on ordinary uncharged flight
              this.tone(c, "sine", 210, 155, t, 0.11, 0.022 * scale, 0.01);
              this.burst(
                c,
                "bandpass",
                520,
                340,
                0.9,
                t,
                0.11,
                0.016 * scale,
              );
            }
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

  playDynoFocus() {
    if (this.muted || !this.context || this.context.state !== "running") return;
    try {
      const c = this.context,
        t = c.currentTime;
      this.tone(c, "sine", 72, 118, t, 0.16, 0.046, 0.024);
      this.burst(c, "bandpass", 260, 520, 1.35, t, 0.16, 0.022);
    } catch {
      // Keep gameplay resilient if browser audio state changes mid-frame.
    }
  }
}
