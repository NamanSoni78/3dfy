/**
 * Procedural Web Audio sound engine — every sound is synthesized,
 * zero audio files. Unlocks on first user gesture (mobile autoplay policy).
 */

type SoundName =
  | "pop" | "boing" | "snap" | "whoosh" | "sparkle" | "shutter"
  | "chime" | "tick" | "break" | "recStart" | "recStop" | "spawn" | "error";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      /* audio unsupported */
    }
  }

  private env(g: GainNode, t: number, a: number, d: number, peak = 1): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(
    type: OscillatorType, f0: number, f1: number, dur: number,
    vol = 0.5, delay = 0, attack = 0.008,
  ): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this.env(g, t, attack, dur, vol);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  private noise(dur: number, vol = 0.3, filter: "highpass" | "lowpass" | "bandpass" = "highpass", f0 = 2000, f1 = f0, delay = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    bq.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, dur, vol);
    src.connect(bq).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  play(name: SoundName, opts: { pitch?: number; vol?: number } = {}): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    const p = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    switch (name) {
      case "pop":
        this.tone("sine", 320 * p, 780 * p, 0.09, 0.5 * v);
        this.noise(0.03, 0.1 * v, "highpass", 3000);
        break;
      case "spawn":
        this.tone("sine", 260 * p, 620 * p, 0.12, 0.45 * v);
        this.tone("triangle", 520 * p, 980 * p, 0.1, 0.2 * v, 0.03);
        break;
      case "boing":
        this.tone("triangle", 180 * p, 420 * p, 0.1, 0.4 * v);
        this.tone("triangle", 400 * p, 160 * p, 0.16, 0.35 * v, 0.09);
        break;
      case "snap":
        this.noise(0.06, 0.5 * v, "highpass", 2500);
        this.tone("square", 220 * p, 90 * p, 0.08, 0.25 * v);
        break;
      case "break":
        this.noise(0.16, 0.55 * v, "highpass", 1800, 500);
        this.tone("sawtooth", 300 * p, 70 * p, 0.2, 0.3 * v);
        break;
      case "whoosh":
        this.noise(0.3, 0.35 * v, "bandpass", 400, 2400);
        break;
      case "sparkle":
        [880, 1174, 1568, 2093].forEach((f, i) =>
          this.tone("sine", f * p, f * p * 1.02, 0.09, 0.22 * v, i * 0.045));
        break;
      case "shutter":
        this.noise(0.03, 0.4 * v, "highpass", 4000);
        this.noise(0.04, 0.35 * v, "highpass", 3500, 2500, 0.08);
        break;
      case "chime":
        this.tone("sine", 784, 784, 0.18, 0.3 * v);
        this.tone("sine", 1046, 1046, 0.28, 0.25 * v, 0.09);
        break;
      case "tick":
        this.tone("square", 1400, 1200, 0.02, 0.12 * v);
        break;
      case "recStart":
        this.tone("sine", 880, 880, 0.09, 0.3 * v);
        this.tone("sine", 1320, 1320, 0.12, 0.25 * v, 0.1);
        break;
      case "recStop":
        this.tone("sine", 1320, 1320, 0.09, 0.3 * v);
        this.tone("sine", 880, 880, 0.14, 0.25 * v, 0.1);
        break;
      case "error":
        this.tone("square", 300, 180, 0.12, 0.2 * v);
        this.tone("square", 240, 140, 0.14, 0.18 * v, 0.1);
        break;
    }
  }
}

export const sfx = new AudioEngine();

export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
