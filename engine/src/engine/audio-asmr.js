/**
 * Realistic Close-Mic Acoustic Foley Web Audio ASMR Engine
 * (Synced identically with offline 48kHz WAV synthesizer in scripts/synth-wav.mjs — ZERO electronic sine beeps!)
 */
export class AsmrAudioEngine {
  constructor({ headless = false } = {}) {
    this.headless = headless;
    this.ctx = null;
    this.masterGain = null;
    this.recordDest = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.volume = 0.80;
    this.lastCutTime = 0;
    this.lastCascadeTime = 0;
  }

  ensureContext() {
    if (this.headless) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.06;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      this.recordDest = this.ctx.createMediaStreamDestination();
      this.compressor.connect(this.recordDest);

      const sr = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, Math.floor(sr * 1.5), sr);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  getRecordStream() {
    this.ensureContext();
    return this.recordDest ? this.recordDest.stream : null;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
    }
  }

  playCutImpact({ axis = 'x', soundProfile = 'culinary', surfaceAudio = 'wood', speedFactor = 1.0 }) {
    if (this.headless || this.muted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const minInterval = speedFactor > 18 ? 0.009 : speedFactor > 8 ? 0.013 : 0.015;
    if (now - this.lastCutTime < minInterval) return;
    this.lastCutTime = now;

    const jitter = (0.94 + Math.random() * 0.12) * (speedFactor > 16 ? 1.14 : speedFactor > 7 ? 1.06 : 1.0);
    const gainScale = speedFactor > 18 ? 0.38 : speedFactor > 8 ? 0.50 : speedFactor > 3 ? 0.70 : 0.96;

    // 1. Crisp fibrous blade-through-object slice (dual bandpasses: juicy body + crisp skin shear)
    const sliceDur = speedFactor > 10 ? 0.022 : (axis === 'y' ? 0.075 : 0.048);
    const midSrc = this.ctx.createBufferSource();
    midSrc.buffer = this.noiseBuffer;
    const midFilter = this.ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    const midFreq = soundProfile === 'crystal' ? 2600 : soundProfile === 'metal' ? 2900 : soundProfile === 'tech' ? 2100 : (axis === 'y' ? 1650 : 1350);
    midFilter.frequency.setValueAtTime(midFreq * jitter, now);
    midFilter.Q.value = 1.2;
    const midGain = this.ctx.createGain();
    midGain.gain.setValueAtTime(0.36 * gainScale, now);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + sliceDur);
    midSrc.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(this.masterGain);
    midSrc.start(now, Math.random() * 0.9, sliceDur + 0.01);

    // 2. Dry close-mic wooden/stone cutting board "THOCK" (damped broadband knock + razor click, ZERO sine sweep!)
    if (axis !== 'y') {
      const clickSrc = this.ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const clickFilt = this.ctx.createBiquadFilter();
      clickFilt.type = 'bandpass';
      const clickFreq = surfaceAudio === 'glass' || surfaceAudio === 'ice' ? 5400 : surfaceAudio === 'stone' ? 4400 : 3200;
      clickFilt.frequency.setValueAtTime(clickFreq * jitter, now);
      clickFilt.Q.value = 1.4;
      const clickGain = this.ctx.createGain();
      clickGain.gain.setValueAtTime(0.34 * gainScale, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
      clickSrc.connect(clickFilt);
      clickFilt.connect(clickGain);
      clickGain.connect(this.masterGain);
      clickSrc.start(now, Math.random() * 0.9, 0.02);

      // Dry damped hardwood body impulse (ultra-short 24ms knock)
      const bodySrc = this.ctx.createBufferSource();
      bodySrc.buffer = this.noiseBuffer;
      const bodyFilt = this.ctx.createBiquadFilter();
      bodyFilt.type = 'bandpass';
      const bodyFreq = surfaceAudio === 'stone' ? 520 : surfaceAudio === 'glass' || surfaceAudio === 'ice' ? 920 : surfaceAudio === 'metal' ? 760 : 285;
      bodyFilt.frequency.setValueAtTime(bodyFreq * jitter, now);
      bodyFilt.Q.value = 2.6;
      const bodyGain = this.ctx.createGain();
      bodyGain.gain.setValueAtTime(0.62 * gainScale, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      bodySrc.connect(bodyFilt);
      bodyFilt.connect(bodyGain);
      bodyGain.connect(this.masterGain);
      bodySrc.start(now, Math.random() * 0.9, 0.036);
    }
  }

  playCascade({ tier = 1, soundProfile = 'culinary', intensity = 1.0 }) {
    if (this.headless || this.muted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    if (now - this.lastCascadeTime < 0.055) return;
    this.lastCascadeTime = now;

    if (tier === 1) {
      const taps = Math.min(5, Math.max(2, Math.round(intensity * 3)));
      for (let i = 0; i < taps; i++) {
        const t = now + 0.055 + i * 0.036 + Math.random() * 0.02;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(
          soundProfile === 'crystal' ? 2100 + Math.random() * 800 :
          soundProfile === 'metal' ? 1400 + Math.random() * 500 :
          380 + Math.random() * 190,
          t
        );
        f.Q.value = 2.0;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.24 * Math.min(1, intensity), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.026);
        src.connect(f);
        f.connect(g);
        g.connect(this.masterGain);
        src.start(t, Math.random() * 0.9, 0.035);
      }
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(tier === 3 ? 3400 : 2100, now);
      filter.Q.value = 0.85;

      const dur = tier === 3 ? 0.24 : 0.15;
      const peak = (tier === 3 ? 0.22 : 0.16) * Math.min(1.2, intensity);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(now, Math.random() * 0.8, dur + 0.02);
    }
  }
}
