// Música ambiental. Si meta.json define music.src usa ese archivo en bucle;
// si no, genera un fondo suave con Web Audio (acordes lentos y notas sueltas).

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS = [
  [50, 57, 62, 66, 69], // Re
  [47, 54, 59, 62, 66], // Si menor
  [43, 50, 55, 59, 62], // Sol
  [45, 52, 57, 61, 64], // La
];
const BELLS = [74, 76, 78, 81, 83, 86];

export class Ambient {
  constructor({ src } = {}) {
    this.src = src || null;
    this.enabled = true;
    this.volume = 0.5;
    this.playing = false;
    this.voices = [];
    this.timers = [];
  }

  level() {
    return this.volume * 0.5;
  }

  init() {
    if (this.ctx || this.audio) return;
    if (this.src) {
      this.audio = new Audio(this.src);
      this.audio.loop = true;
      this.audio.volume = 0;
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.43;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    delay.connect(feedback).connect(delay);
    this.bus = ctx.createGain();
    this.bus.connect(lp);
    this.bus.connect(delay);
    delay.connect(lp);
    lp.connect(this.master).connect(ctx.destination);
  }

  async start() {
    if (!this.enabled) return;
    this.init();
    if (this.audio) {
      try {
        await this.audio.play();
        this.playing = true;
        this.fadeElement(this.level());
      } catch {}
      return;
    }
    if (!this.ctx) return;
    try { await this.ctx.resume(); } catch {}
    if (this.playing) return;
    this.playing = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.level(), now, 1.5);
    this.chord = 0;
    this.playChord();
    this.timers.push(setInterval(() => this.playChord(), 11000));
    this.scheduleBell();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this.timers.forEach((t) => (clearInterval(t), clearTimeout(t)));
    this.timers = [];
    if (this.audio) {
      this.fadeElement(0, () => this.audio.pause());
      return;
    }
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, now, 0.5);
    const old = this.voices;
    this.voices = [];
    setTimeout(() => {
      old.forEach((v) => { try { v.osc.stop(); } catch {} });
      if (!this.playing) this.ctx.suspend();
    }, 2500);
  }

  setEnabled(on) {
    this.enabled = on;
    on ? this.start() : this.stop();
  }

  setVolume(v) {
    this.volume = v;
    if (!this.playing) return;
    if (this.audio) this.audio.volume = this.level();
    else this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.2);
  }

  playChord() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 5);
      v.osc.stop(now + 5.2);
    }
    const notes = CHORDS[this.chord % CHORDS.length];
    this.chord += 1;
    this.voices = notes.map((m, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = NOTE(m);
      osc.detune.value = (Math.random() - 0.5) * 8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.06 : 0.035, now + 5);
      osc.connect(gain).connect(this.bus);
      osc.start(now);
      return { osc, gain };
    });
  }

  scheduleBell() {
    const t = setTimeout(() => {
      if (!this.playing) return;
      this.bell(BELLS[Math.floor(Math.random() * BELLS.length)], 0.03);
      this.scheduleBell();
    }, 2600 + Math.random() * 4200);
    this.timers.push(t);
  }

  bell(midi, peak) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = NOTE(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
    osc.connect(g).connect(this.bus);
    osc.start(now);
    osc.stop(now + 3.3);
  }

  /** Nota breve al elegir una respuesta. */
  chime() {
    if (!this.playing || !this.ctx) return;
    this.bell(BELLS[Math.floor(Math.random() * 3) + 2], 0.05);
  }

  fadeElement(target, done) {
    const a = this.audio;
    const from = a.volume;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1500);
      a.volume = from + (target - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }
}
