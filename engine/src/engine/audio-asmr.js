/**
 * Procedural Web Audio ASMR Synthesizer (supports culinary, tech, crystal, metal, plastic).
 * In headless mode, skips Web Audio playback while scene-core logs exact impact timestamps
 * for deterministic offline 48kHz stereo WAV synthesis (scripts/synth-wav.mjs).
 */
export class AsmrAudioEngine {
  constructor({ headless = false } = {}) {
    this.headless = headless;
    this.ctx = null;
    this.masterGain = null;
    this.recordDest = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.volume = 0.72;
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
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.08;

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
    const minInterval = speedFactor > 18 ? 0.0085 : speedFactor > 8 ? 0.012 : 0.015;
    if (now - this.lastCutTime < minInterval) return;
    this.lastCutTime = now;

    const pitchJitter = (0.93 + Math.random() * 0.14) * (speedFactor > 15 ? 1.22 : speedFactor > 7 ? 1.10 : 1.0);
    const gainScale = speedFactor > 18 ? 0.36 : speedFactor > 8 ? 0.46 : speedFactor > 3 ? 0.65 : 0.92;

    const sliceSrc = this.ctx.createBufferSource();
    sliceSrc.buffer = this.noiseBuffer;
    const sliceFilter = this.ctx.createBiquadFilter();
    const sliceGain = this.ctx.createGain();

    if (soundProfile === 'tech') {
      sliceFilter.type = 'bandpass';
      sliceFilter.frequency.setValueAtTime(3400 * pitchJitter, now);
      sliceFilter.Q.value = 3.2;
      sliceGain.gain.setValueAtTime(0.28 * gainScale, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    } else if (soundProfile === 'crystal') {
      sliceFilter.type = 'highpass';
      sliceFilter.frequency.setValueAtTime(2800 * pitchJitter, now);
      sliceGain.gain.setValueAtTime(0.22 * gainScale, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      this._playPing(now, (2400 + Math.random() * 1400) * pitchJitter, 0.14 * gainScale, 0.14);
    } else if (soundProfile === 'metal') {
      sliceFilter.type = 'bandpass';
      sliceFilter.frequency.setValueAtTime(4200 * pitchJitter, now);
      sliceFilter.Q.value = 5.5;
      sliceGain.gain.setValueAtTime(0.20 * gainScale, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      this._playPing(now, (1200 + Math.random() * 450) * pitchJitter, 0.18 * gainScale, 0.12);
    } else if (soundProfile === 'plastic') {
      sliceFilter.type = 'bandpass';
      sliceFilter.frequency.setValueAtTime(2600 * pitchJitter, now);
      sliceFilter.Q.value = 2.6;
      sliceGain.gain.setValueAtTime(0.26 * gainScale, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    } else {
      sliceFilter.type = 'bandpass';
      sliceFilter.frequency.setValueAtTime((axis === 'y' ? 2300 : 1850) * pitchJitter, now);
      sliceFilter.Q.value = 1.8;
      sliceGain.gain.setValueAtTime(0.24 * gainScale, now);
      sliceGain.gain.exponentialRampToValueAtTime(0.001, now + (axis === 'y' ? 0.075 : 0.045));
    }

    sliceSrc.connect(sliceFilter);
    sliceFilter.connect(sliceGain);
    sliceGain.connect(this.masterGain);
    sliceSrc.start(now, Math.random() * 0.9, 0.09);

    if (axis !== 'y') {
      const osc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();

      let baseFreq = 165, endFreq = 68, dur = 0.058, oscType = 'triangle', amp = 0.42 * gainScale;
      if (surfaceAudio === 'glass') { baseFreq = 1480; endFreq = 860; dur = 0.045; oscType = 'sine'; amp = 0.24 * gainScale; }
      else if (surfaceAudio === 'leaf') { baseFreq = 118; endFreq = 52; dur = 0.045; oscType = 'sine'; amp = 0.30 * gainScale; }
      else if (surfaceAudio === 'stone') { baseFreq = 420; endFreq = 160; dur = 0.042; oscType = 'triangle'; amp = 0.34 * gainScale; }
      else if (surfaceAudio === 'metal') { baseFreq = 920; endFreq = 540; dur = 0.062; oscType = 'sine'; amp = 0.22 * gainScale; }
      else if (surfaceAudio === 'ice') { baseFreq = 1120; endFreq = 420; dur = 0.052; oscType = 'triangle'; amp = 0.24 * gainScale; }

      osc.type = oscType;
      osc.frequency.setValueAtTime(baseFreq * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq * pitchJitter), now + dur);
      thudGain.gain.setValueAtTime(amp, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(thudGain);
      thudGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    }
  }

  _playPing(now, freq, amp, dur) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
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
        const t = now + 0.06 + i * 0.032 + Math.random() * 0.02;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = soundProfile === 'crystal' || soundProfile === 'tech' || soundProfile === 'metal' ? 'sine' : 'triangle';
        const f =
          soundProfile === 'crystal' ? 1600 + Math.random() * 900 :
          soundProfile === 'metal' ? 980 + Math.random() * 520 :
          soundProfile === 'tech' || soundProfile === 'plastic' ? 680 + Math.random() * 320 :
          120 + Math.random() * 65;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.035);
        g.gain.setValueAtTime(0.09 * Math.min(1, intensity), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.045);
      }
    } else {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(tier === 3 ? 4200 : 2800, now);
      filter.Q.value = tier === 3 ? 0.9 : 1.6;

      const dur = tier === 3 ? 0.22 : 0.14;
      const peak = (tier === 3 ? 0.18 : 0.12) * Math.min(1.2, intensity);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(now, Math.random() * 0.8, dur + 0.02);
    }
  }
}
