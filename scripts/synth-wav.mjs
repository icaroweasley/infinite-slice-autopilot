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
 * 2-pole biquad filter (bandpass / highpass / lowpass) applied cleanly to a short foley burst.
 */
function filterBurst(input, type, freq, Q) {
  const out = new Float32Array(input.length);
  const w0 = (2 * Math.PI * Math.max(40, Math.min(freq, SAMPLE_RATE * 0.45))) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Math.max(0.35, Q));
  const cosW0 = Math.cos(w0);

  let b0, b1, b2;
  if (type === 'highpass') {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  } else if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
  } else {
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
  const len = Math.max(24, Math.floor(durSec * SAMPLE_RATE));
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = rand() * 2 - 1;
  return buf;
}

/**
 * Generates an authentic, dry, close-mic acoustic wood/stone/glass cutting-board knock ("THOCK / TOK")
 * using damped multi-modal resonant body impulses + razor-edge transient click — ZERO electronic sine sweeps!
 */
function synthAcousticBoardChop(surface, jitter, rand, amp) {
  const durSec = 0.036;
  const len = Math.floor(durSec * SAMPLE_RATE);
  const out = new Float32Array(len);

  // Modal body resonances of a real physical cutting surface (short ultra-dry acoustic decay!)
  let modes;
  let clickFreq = 3200;
  let clickGain = 0.42;
  if (surface === 'stone') {
    modes = [
      { f: 340, a: 0.45, d: 110 },
      { f: 890, a: 0.34, d: 145 },
      { f: 2150, a: 0.22, d: 190 },
    ];
    clickFreq = 4600;
    clickGain = 0.52;
  } else if (surface === 'glass' || surface === 'ice') {
    modes = [
      { f: 680, a: 0.28, d: 95 },
      { f: 1620, a: 0.24, d: 120 },
      { f: 3480, a: 0.16, d: 155 },
    ];
    clickFreq = 5800;
    clickGain = 0.46;
  } else if (surface === 'metal') {
    modes = [
      { f: 520, a: 0.32, d: 95 },
      { f: 1380, a: 0.26, d: 110 },
      { f: 2920, a: 0.18, d: 135 },
    ];
    clickFreq = 5200;
    clickGain = 0.50;
  } else if (surface === 'leaf') {
    modes = [
      { f: 165, a: 0.52, d: 130 },
      { f: 390, a: 0.30, d: 160 },
      { f: 840, a: 0.14, d: 210 },
    ];
    clickFreq = 2600;
    clickGain = 0.30;
  } else {
    // Classic viral close-mic solid oak butcher block ("crisp woody THOCK!")
    modes = [
      { f: 195, a: 0.58, d: 125 },
      { f: 465, a: 0.38, d: 155 },
      { f: 1080, a: 0.22, d: 210 },
    ];
    clickFreq = 3400;
    clickGain = 0.46;
  }

  // 1. Resonant damped wood/stone modes excited by sharp micro-impulse (0.8ms attack)
  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const attack = i < 14 ? i / 14 : 1.0;
    let sum = 0;
    for (let m = 0; m < modes.length; m++) {
      const mo = modes[m];
      sum += Math.sin(2 * Math.PI * mo.f * jitter * t) * mo.a * Math.exp(-mo.d * t);
    }
    out[i] = sum * attack;
  }

  // 2. Ultra-crisp 3ms razor-edge contact click (bandpassed noise transient — makes it sound 100% real!)
  const clickRaw = makeNoiseBurst(0.012, rand);
  const clickFilt = filterBurst(clickRaw, 'bandpass', clickFreq * jitter, 1.5);
  for (let i = 0; i < clickFilt.length && i < len; i++) {
    const t = i / SAMPLE_RATE;
    out[i] += clickFilt[i] * clickGain * Math.exp(-360 * t);
  }

  // 3. Dry low-mid wooden thump body noise (adds warm close-mic presence)
  const thumpRaw = makeNoiseBurst(0.024, rand);
  const thumpFilt = filterBurst(thumpRaw, 'lowpass', 480 * jitter, 0.9);
  for (let i = 0; i < thumpFilt.length && i < len; i++) {
    const t = i / SAMPLE_RATE;
    out[i] += thumpFilt[i] * 0.48 * Math.exp(-145 * t);
  }

  for (let i = 0; i < len; i++) out[i] *= amp;
  return out;
}

/**
 * Generates an authentic close-mic fibrous knife-through-object slice ("shhhk / krrch")
 * that swells cleanly RIGHT into the board strike.
 */
function synthFibrousSlice(profile, axis, speedFactor, jitter, rand, amp) {
  const isFast = speedFactor > 10;
  const durSec = isFast ? 0.018 : (axis === 'y' ? 0.078 : 0.048);
  const raw = makeNoiseBurst(durSec, rand);

  // Dual-band organic slice: juicy body shear + crisp skin/fiber tear
  let midFreq = axis === 'y' ? 1650 : 1350;
  let hiFreq = 4800;
  let midQ = 1.1;
  let hiGain = 0.55;

  if (profile === 'crystal') {
    midFreq = 2600; hiFreq = 6800; midQ = 1.6; hiGain = 0.85;
  } else if (profile === 'tech' || profile === 'plastic') {
    midFreq = 2100; hiFreq = 5600; midQ = 1.5; hiGain = 0.72;
  } else if (profile === 'metal') {
    midFreq = 2900; hiFreq = 7200; midQ = 2.2; hiGain = 0.78;
  }

  const mid = filterBurst(raw, 'bandpass', midFreq * jitter, midQ);
  const hi = filterBurst(raw, 'highpass', hiFreq * jitter, 0.9);
  const out = new Float32Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    const u = i / raw.length;
    // Crisp organic slice swell into the cut impact, then rapid clean damping
    const env = u < 0.28
      ? Math.pow(u / 0.28, 0.7)
      : Math.exp(-5.4 * ((u - 0.28) / 0.72));
    // Subtle micro-crunch grain texture (like slicing crisp watermelon, carrot, cucumber, or fruit skin!)
    const crunch = 0.78 + 0.22 * Math.sin(u * 42.0 * jitter);
    out[i] = (mid[i] * 0.82 + hi[i] * hiGain) * env * crunch * amp;
  }
  return out;
}

/**
 * Renders an exact timeline of hyper-realistic acoustic ASMR foley events into a 48kHz 16-bit Stereo WAV file.
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
      const minGap = sf > 18 ? 0.0085 : sf > 8 ? 0.013 : sf > 3 ? 0.018 : 0.012;
      if (tSec - lastCutSec < minGap) continue;
      lastCutSec = tSec;

      const jitter = 0.94 + rand() * 0.12;
      const speedPitch = sf > 16 ? 1.14 : sf > 7 ? 1.06 : 1.0;
      const gainScale = sf > 18 ? 0.38 : sf > 8 ? 0.50 : sf > 3 ? 0.70 : 0.96;
      const pan = (rand() - 0.5) * 0.14;
      const profile = ev.soundProfile || 'culinary';
      const surface = ev.surfaceAudio || 'wood';

      // 1. Crisp juicy blade-through-object fibrous slice (starts slightly before impact for ultra-real foley!)
      const sliceBuf = synthFibrousSlice(profile, ev.axis, sf, jitter * speedPitch, rand, 0.54 * gainScale);
      const preRoll = ev.axis === 'y' ? 0 : Math.floor((sf > 10 ? 0.006 : 0.018) * SAMPLE_RATE);
      mixMono(left, right, sampleIdx - preRoll, sliceBuf, 1.0, pan);

      // 2. Dry close-mic hardwood/stone cutting-board "THOCK" right on impact (vertical X & Z cuts!)
      if (ev.axis !== 'y') {
        const chopBuf = synthAcousticBoardChop(surface, jitter * speedPitch, rand, 0.68 * gainScale);
        mixMono(left, right, sampleIdx, chopBuf, 1.0, pan * 0.45);
      }
    } else if (ev.kind === 'cascade') {
      if (tSec - lastCascadeSec < 0.055) continue;
      lastCascadeSec = tSec;

      const tier = ev.tier || 1;
      const profile = ev.soundProfile || 'culinary';
      const intensity = Math.min(1.2, ev.intensity || 0.8);

      if (tier === 1) {
        // Organic muffled piece tumbles hitting the board ("tok-plop-tok", ZERO sine beeps!)
        const taps = Math.min(6, Math.max(2, Math.round(intensity * 3.5)));
        for (let k = 0; k < taps; k++) {
          const offset = Math.floor((0.055 + k * 0.036 + rand() * 0.024) * SAMPLE_RATE);
          const tapDur = 0.026;
          const raw = makeNoiseBurst(tapDur, rand);
          const fBase =
            profile === 'crystal' ? 2200 + rand() * 900 :
            profile === 'metal' ? 1400 + rand() * 600 :
            profile === 'tech' || profile === 'plastic' ? 950 + rand() * 380 :
            360 + rand() * 190;
          const filt = filterBurst(raw, 'bandpass', fBase, 2.0);
          for (let i = 0; i < filt.length; i++) {
            const u = i / filt.length;
            filt[i] *= Math.exp(-8.5 * u) * (i < 12 ? i / 12 : 1.0);
          }
          mixMono(left, right, sampleIdx + offset, filt, 0.34 * intensity, (rand() - 0.5) * 0.55);
        }
      } else {
        // Silky kinetic-sand / micro-cube crisp granular shower ("shhhhhh-crisp!")
        const dur = tier === 3 ? 0.26 : 0.16;
        const raw = makeNoiseBurst(dur, rand);
        const body = filterBurst(raw, 'bandpass', tier === 3 ? 3400 : 2100, 0.85);
        const sparkle = filterBurst(raw, 'highpass', 5400, 0.9);
        const out = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          const t = i / raw.length;
          const env = t < 0.10 ? t / 0.10 : Math.exp(-4.4 * ((t - 0.10) / 0.90));
          out[i] = (body[i] * 0.72 + sparkle[i] * 0.38) * env;
        }
        const gain = (tier === 3 ? 0.28 : 0.20) * intensity;
        mixMono(left, right, sampleIdx + Math.floor(0.012 * SAMPLE_RATE), out, gain, (rand() - 0.5) * 0.38);
      }
    }
  }

  // Write 16-bit Stereo PCM WAV with smooth studio soft-clipper
  const dataBytes = totalSamples * 4;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);

  let ptr = 44;
  for (let i = 0; i < totalSamples; i++) {
    const sL = Math.tanh(left[i] * 1.25) * 0.94;
    const sR = Math.tanh(right[i] * 1.25) * 0.94;
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sL * 32767))), ptr);
    wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sR * 32767))), ptr + 2);
    ptr += 4;
  }

  fs.writeFileSync(outputPath, wav);
  return { outputPath, sampleRate: SAMPLE_RATE, durationSec: totalSamples / SAMPLE_RATE };
}
