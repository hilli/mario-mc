/* Mario MC — synthesized audio (no external files). */
(function () {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.engines = [];
      this.musicTimer = null;
    }

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.gain.value = 0.22; this.music.connect(this.master);
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }

    tone(freq, dur, type, vol, slideTo, when) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (when || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + dur + 0.02);
    }

    noise(dur, vol, freq) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1200;
      const g = this.ctx.createGain(); g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(this.sfx);
      src.start(t);
    }

    play(name) {
      switch (name) {
        case 'countdown': this.tone(440, 0.25, 'square', 0.2); break;
        case 'go': this.tone(880, 0.5, 'square', 0.25); break;
        case 'itembox': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.18, null, i * 0.05)); break;
        case 'turbo': case 'boostpad': case 'miniturbo': case 'rocketstart': this.tone(200, 0.45, 'sawtooth', 0.18, 900); break;
        case 'oil': this.tone(300, 0.2, 'sine', 0.2, 80); break;
        case 'rocket': this.tone(900, 0.5, 'sawtooth', 0.12, 200); this.noise(0.4, 0.15, 3000); break;
        case 'star': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.15, 'square', 0.15, null, i * 0.07)); break;
        case 'spin': this.noise(0.6, 0.35, 900); this.tone(600, 0.6, 'triangle', 0.15, 120); break;
        case 'explode': this.noise(0.8, 0.5, 600); break;
        case 'bump': this.noise(0.12, 0.25, 500); break;
        case 'crash': this.noise(0.35, 0.4, 400); break;
        case 'lap': [660, 880].forEach((f, i) => this.tone(f, 0.15, 'square', 0.18, null, i * 0.1)); break;
        case 'finallap': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'square', 0.18, null, i * 0.1)); break;
        case 'finish': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, 'square', 0.2, null, i * 0.12)); break;
        case 'click': this.tone(1200, 0.05, 'square', 0.1); break;
        default: break;
      }
    }

    // One engine voice per human rider; gear changes give a motorcycle feel.
    setEngines(count) {
      this.stopEngines();
      if (!this.ctx) return;
      for (let i = 0; i < count; i++) {
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const f = this.ctx.createBiquadFilter();
        const g = this.ctx.createGain();
        o1.type = 'sawtooth'; o2.type = 'square';
        f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.value = 0;
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx);
        o1.start(); o2.start();
        this.engines.push({ o1, o2, f, g });
      }
    }

    updateEngine(i, speedFrac, throttle, vol) {
      const e = this.engines[i];
      if (!e || !this.ctx) return;
      const gears = 5;
      const v = Math.max(0, speedFrac) * gears;
      const gear = Math.min(gears - 1, Math.floor(v));
      const rpm = v - gear;
      const freq = 45 + gear * 8 + rpm * 75 + throttle * 6;
      const t = this.ctx.currentTime;
      e.o1.frequency.setTargetAtTime(freq, t, 0.03);
      e.o2.frequency.setTargetAtTime(freq / 2, t, 0.03);
      e.f.frequency.setTargetAtTime(500 + rpm * 900 + throttle * 600, t, 0.05);
      e.g.gain.setTargetAtTime((0.05 + throttle * 0.06 + speedFrac * 0.04) * (vol === undefined ? 1 : vol), t, 0.05);
    }

    stopEngines() {
      this.engines.forEach((e) => {
        try { e.o1.stop(); e.o2.stop(); e.g.disconnect(); } catch (err) { /* already stopped */ }
      });
      this.engines = [];
    }

    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      const bass = [110, 110, 165, 110, 147, 147, 196, 147, 131, 131, 196, 131, 165, 165, 247, 165];
      const lead = [440, 0, 523, 659, 0, 587, 523, 0, 494, 0, 523, 587, 659, 0, 784, 659];
      const step = 0.15;
      let n = 0;
      let next = this.ctx.currentTime + 0.1;
      const schedule = () => {
        while (next < this.ctx.currentTime + 0.3) {
          const i = n % 16;
          const bar = Math.floor(n / 16) % 4;
          const shift = [1, 1, 0.89, 1.122][bar];
          this.note(this.music, bass[i] * shift, step * 0.9, 'triangle', 0.5, next);
          if (lead[i] && bar % 2 === 0) this.note(this.music, lead[i] * shift, step * 0.8, 'square', 0.12, next);
          if (i % 4 === 0) this.note(this.music, 60, 0.08, 'sine', 0.6, next);
          next += step;
          n++;
        }
      };
      this.musicTimer = setInterval(schedule, 80);
      schedule();
    }

    note(dest, freq, dur, type, vol, t) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.02);
    }

    stopMusic() {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  window.MMCAudio = new AudioEngine();
})();
