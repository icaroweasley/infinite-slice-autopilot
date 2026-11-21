import fs from 'node:fs';

const SAMPLE_RATE = 48000;

/**
 * Deterministic PRNG (Mulberry32) so offline WAV synthesis is 100% reproducible.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple 2-pole biquad bandpass/highpass filter applied to a short burst buffer.
 */
function filterBurst(input, type, freq, Q) {
  const out = new Float32Array(input.length);
  const w0 = (2 * Math.PI * Math.min(freq, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Math.max(0.3, Q));
  const cosW0 = Math.cos(w0);

  let b0, b1, b2;
  if (type === 'highpass') {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  } else {
    // bandpass (constant 0 dB peak gain)
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0;
  const na1 = a1 / a0, na2 = a2 / a0;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

function mixMono(left, right, startSample, buf, gain, pan = 0) {
  const gL = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gR = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const end = Math.min(left.length, startSample + buf.length);
  for (let i = Math.max(0, startSample); i < end; i++) {
    const v = buf[i - startSample];
    left[i] += v * gL;
    right[i] += v * gR;
  }
}

function makeNoiseBurst(durSec, rand) {
  const len = Math.max(16, Math.floor(durSec * SAMPLE_RATE));
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = rand() * 2 - 1;
  return buf;
}

function synthToneSweep(durSec, fStart, fEnd, shape = 'sine', amp = 0.5) {
  const len = Math.max(16, Math.floor(durSec * SAMPLE_RATE));
  const buf = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const freq = fStart * Math.pow(Math.max(20, fEnd) / Math.max(20, fStart), t);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-5.2 * t) * Math.min(1, i / 28);
    let s;
    if (shape === 'triangle') {
      const p = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
      s = 4 * Math.abs(p - 0.5) - 1;
    } else {
      s = Math.sin(phase);
    }
    buf[i] = s * env * amp;
  }
  return buf;
}

/**
 * Renders an exact timeline of ASMR cut & cascade events into a 48kHz 16-bit Stereo WAV file.
 */
export function synthesizeAsmrWav({ durationSec, audioEvents, outputPath, seed = 20261121 }) {
  const totalSamples = Math.max(SAMPLE_RATE, Math.ceil((durationSec + 0.35) * SAMPLE_RATE));
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const rand = mulberry32(seed);

  let lastCutSec = -1;
  let lastCascadeSec = -1;

  for (const ev of audioEvents) {
    const tSec = ev.timeSec || 0;
    const sampleIdx = Math.floor(tSec * SAMPLE_RATE);
    if (sampleIdx < 0 || sampleIdx >= totalSamples) continue;

    if (ev.kind === 'cut') {
      const sf = ev.speedFactor || 1;
      // Escalate audio tick rate cleanly across 10 -> 50 -> 100 -> 250 -> 500 -> 1,000 cuts!
      const minGap = sf > 18 ? 0.0075 : sf > 8 ? 0.011 : sf > 3 ? 0.016 : 0.010;
      if (tSec - lastCutSec < minGap) continue;
      lastCutSec = tSec;

      const jitter = 0.93 + rand() * 0.14;
      // Subtle pitch & crispness lift at supersonic speeds (500-1,000 cuts sounds like a rapid precision razor zipper!)
      const speedPitch = sf > 15 ? 1.24 : sf > 7 ? 1.12 : 1.0;
      const gainScale = sf > 18 ? 0.34 : sf > 8 ? 0.44 : sf > 3 ? 0.62 : 0.90;
      const pan = (rand() - 0.5) * 0.18;
      const profile = ev.soundProfile || 'culinary';
      const surface = ev.surfaceAudio || 'wood';

      // 1. Material Slice Shear
      const rawNoise = makeNoiseBurst(sf > 12 ? 0.024 : (ev.axis === 'y' ? 0.085 : 0.055), rand);
      let freq = (ev.axis === 'y' ? 2300 : 1850) * speedPitch;
      let q = 1.8;
      let fType = 'bandpass';
      let sliceGain = 0.34 * gainScale;

      if (profile === 'tech') {
        freq = 3400; q = 3.2; sliceGain = 0.38 * gainScale;
      } else if (profile === 'crystal') {
        freq = 2800; q = 1.0; fType = 'highpass'; sliceGain = 0.24 * gainScale;
        const ping = synthToneSweep(0.14, (2400 + rand() * 1400) * jitter, 2000 * jitter, 'sine', 0.16 * gainScale);
        mixMono(left, right, sampleIdx, ping, 1.0, pan * 1.4);
      } else if (profile === 'metal') {
        freq = 4200; q = 5.0; sliceGain = 0.28 * gainScale;
        const ring = synthToneSweep(0.13, (1250 + rand() * 420) * jitter, 1180 * jitter, 'sine', 0.20 * gainScale);
        mixMono(left, right, sampleIdx, ring, 1.0, pan);
      } else if (profile === 'plastic') {
        freq = 2600; q = 2.6; sliceGain = 0.34 * gainScale;
      }

      const filtered = filterBurst(rawNoise, fType, freq * jitter, q);
      for (let i = 0; i < filtered.length; i++) {
        const t = i / filtered.length;
        filtered[i] *= Math.exp(-5.5 * t) * Math.min(1, i / 18);
      }
      mixMono(left, right, sampleIdx, filtered, sliceGain, pan);

      // 2. Cutting Board / Surface Impact Thud (vertical X and Z cuts)
      if (ev.axis !== 'y') {
        let f0 = 168, f1 = 68, dur = 0.062, shape = 'triangle', amp = 0.44 * gainScale;
        if (surface === 'glass') { f0 = 1480; f1 = 860; dur = 0.048; shape = 'sine'; amp = 0.26 * gainScale; }
        else if (surface === 'leaf') { f0 = 120; f1 = 52; dur = 0.050; shape = 'sine'; amp = 0.32 * gainScale; }
        else if (surface === 'stone') { f0 = 420; f1 = 160; dur = 0.046; shape = 'triangle'; amp = 0.36 * gainScale; }
        else if (surface === 'metal') { f0 = 920; f1 = 540; dur = 0.064; shape = 'sine'; amp = 0.24 * gainScale; }
        else if (surface === 'ice') { f0 = 1120; f1 = 420; dur = 0.054; shape = 'triangle'; amp = 0.26 * gainScale; }

        const thud = synthToneSweep(dur, f0 * jitter, f1 * jitter, shape, amp);
        mixMono(left, right, sampleIdx, thud, 1.0, pan * 0.5);
      }
    } else if (ev.kind === 'cascade') {
      if (tSec - lastCascadeSec < 0.052) continue;
      lastCascadeSec = tSec;

      const tier = ev.tier || 1;
      const profile = ev.soundProfile || 'culinary';
      const intensity = Math.min(1.2, ev.intensity || 0.8);

      if (tier === 1) {
        const taps = Math.min(5, Math.max(2, Math.round(intensity * 3)));
        for (let k = 0; k < taps; k++) {
          const offset = Math.floor((0.055 + k * 0.032 + rand() * 0.022) * SAMPLE_RATE);
          const f =
            profile === 'crystal' ? 1600 + rand() * 900 :
            profile === 'metal' ? 980 + rand() * 520 :
            profile === 'tech' || profile === 'plastic' ? 680 + rand() * 320 :
            125 + rand() * 65;
          const shape = (profile === 'culinary') ? 'triangle' : 'sine';
          const tap = synthToneSweep(0.042, f, f * 0.55, shape, 0.11 * intensity);
          mixMono(left, right, sampleIdx + offset, tap, 1.0, (rand() - 0.5) * 0.55);
        }
      } else {
        const dur = tier === 3 ? 0.24 : 0.15;
        const raw = makeNoiseBurst(dur, rand);
        const filt = filterBurst(raw, 'bandpass', tier === 3 ? 4200 : 2800, tier === 3 ? 0.9 : 1.6);
        for (let i = 0; i < filt.length; i++) {
          const t = i / filt.length;
          const env = t < 0.12 ? t / 0.12 : Math.exp(-4.6 * ((t - 0.12) / 0.88));
          filt[i] *= env;
        }
        const gain = (tier === 3 ? 0.24 : 0.16) * intensity;
        mixMono(left, right, sampleIdx + Math.floor(0.015 * SAMPLE_RATE), filt, gain, (rand() - 0.5) * 0.42);
      }
    }
  }

  // Write 16-bit Stereo PCM WAV with soft tanh studio limiter (zero digital clipping)
  const dataBytes = totalSamples * 4;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);        // PCM chunk size
  wav.writeUInt16LE(1, 20);         // PCM format
  wav.writeUInt16LE(2, 22);         // Stereo
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  let ptr = 44;
  for (let i = 0; i < totalSamples; i++) {
    const sL = Math.tanh(left[i] * 1.15) * 0.92;
    const sR = Math.tanh(right[i] * 1.15) * 0.92;
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sL * 32767))), ptr);
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sR * 32767))), ptr + 2);
    ptr += 4;
  }

  fs.writeFileSync(outputPath, wav);
  return { outputPath, sampleRate: SAMPLE_RATE, durationSec: totalSamples / SAMPLE_RATE };
}
