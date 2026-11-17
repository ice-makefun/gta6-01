// Solmar Bay — sound.
// One job: every sound is synthesized with WebAudio (no audio files):
// engine hum, gunshots, siren, pickups, mission jingles, reload clicks.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return false;
    }
    // Engine: sawtooth through a low-pass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.ctx.destination);
    this.engineOsc.start();
    // Siren: two-tone square wave, toggled by a timer in step().
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.ctx.destination);
    this.sirenOsc.start();
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.engineGain) this.engineGain.gain.value = this.muted ? 0 : this.engineGain.gain.value;
    return this.muted;
  }

  setEngine(speedNorm, inCar) {
    if (!this.ctx || this.muted) return;
    const target = inCar ? 0.05 + speedNorm * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 160, this.ctx.currentTime, 0.1);
  }

  setSiren(wanted) {
    if (!this.ctx) return;
    if (this.muted || wanted <= 0) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      return;
    }
    this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.2);
  }

  step(dt, wanted) {
    if (!this.ctx || this.muted || wanted <= 0) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.45;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime, 0.05);
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.15, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start();
  }

  gunshot() {
    this.noiseBurst(0.14, 0.5, 2500);
    this.blip(180, 0.08, 'square', 0.2);
  }

  enemyShot() {
    this.noiseBurst(0.1, 0.25, 1800);
  }

  hitmark(headshot) {
    this.blip(headshot ? 1400 : 1000, 0.07, 'sine', 0.18);
  }

  reload() {
    this.blip(500, 0.05, 'square', 0.1, 0);
    this.blip(700, 0.05, 'square', 0.1, 0.35);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.18, 0);
    this.blip(1320, 0.14, 'sine', 0.18, 0.09);
  }

  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.2, i * 0.11));
  }

  busted() {
    this.blip(220, 0.5, 'sawtooth', 0.2, 0);
    this.blip(165, 0.6, 'sawtooth', 0.2, 0.3);
  }

  crash() {
    this.noiseBurst(0.2, 0.4, 900);
  }
}
