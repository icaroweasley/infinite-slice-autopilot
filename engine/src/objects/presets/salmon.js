import * as THREE from 'three';
import { clamp, fract, lerp, smoothstep, fbm3 } from '../noise.js';

/**
 * Computes normalized top height (0..1) of the Atlantic salmon fillet at (nx, nz).
 * nx in [-0.5, 0.5], nz in [-0.5, 0.5]
 */
function salmonTopHeight(nx, nz) {
  const u = clamp(nx + 0.5, 0, 1); // 0 = thick dorsal side (-X), 1 = thinner belly (+X)
  const v = Math.abs(nz * 2.0);    // 0 = center, 1 = front/back cut ends

  // Asymmetric organic fillet profile: plump back loin tapering cleanly toward belly
  const dorsalArch = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.36);
  const bellyTaper = lerp(1.0, 0.56, smoothstep(0.35, 0.96, u));
  const endBevel = 1.0 - 0.14 * Math.pow(v, 5.0);

  // Subtle organic crown wave
  const organic = 1.0 + 0.025 * Math.sin(nz * 5.2 + nx * 2.1);
  return clamp(dorsalArch * bellyTaper * endBevel * organic, 0.0, 1.0);
}

function insideFootprint(nx, nz) {
  const ax = Math.abs(nx * 2.0);
  const az = Math.abs(nz * 2.0);
  if (ax > 1.0 || az > 1.0) return false;
  // Slightly rounded super-ellipse corners like a hand-trimmed sashimi loin
  const corner = Math.pow(ax, 10) + Math.pow(az, 10);
  return corner <= 1.02;
}

export const salmonObject = {
  id: 'salmon',
  name: 'Salmão Fresco',
  englishName: 'Atlantic Salmon',
  subtitle: 'Veios de gordura 3D + pele escura inferior',
  bounds: { w: 2.38, h: 0.88, d: 1.50 },
  gridRes: { x: 96, y: 44, z: 64 },
  physics: {
    restitution: 0.14,
    friction: 0.62,
    cohesion: 0.68,
    density: 1.05,
    soundProfile: 'culinary',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    if (!insideFootprint(nx, nz)) return false;
    const maxY = salmonTopHeight(nx, nz);
    return ny <= maxY;
  },

  sampleVolume(nx, ny, nz) {
    const maxY = Math.max(0.08, salmonTopHeight(nx, nz));
    const nNoise = fbm3(nx * 10.0 + 3.1, ny * 10.0 + 1.4, nz * 10.0 + 2.7, 3);

    // 1. Bottom fish skin layer (ONLY at the bottom y < 0.085)
    if (ny < 0.082) {
      // Subtle diamond scale iridescence
      const sx = Math.sin((nx * 56 + nz * 28));
      const sz = Math.sin((nx * 56 - nz * 28));
      const scaleGlint = smoothstep(0.2, 0.95, sx * sz * 0.5 + 0.5);
      const base = lerp(0.075, 0.16, scaleGlint);
      return {
        r: base * 0.92,
        g: base * 1.02,
        b: base * 1.18,
        roughness: lerp(0.36, 0.18, scaleGlint),
        metalness: lerp(0.18, 0.42, scaleGlint),
        emissive: 0.0,
      };
    }

    // 2. Thin silvery-brown sub-skin fat line (0.082..0.135)
    if (ny < 0.135) {
      const t = smoothstep(0.082, 0.135, ny);
      const fatTint = lerp(0.42, 0.72, nNoise);
      return {
        r: lerp(0.42, 0.86, t) * lerp(0.85, 1.05, fatTint),
        g: lerp(0.36, 0.56, t) * lerp(0.85, 1.05, fatTint),
        b: lerp(0.35, 0.44, t) * lerp(0.85, 1.05, fatTint),
        roughness: 0.32,
        metalness: 0.08,
        emissive: 0.0,
      };
    }

    // 3. Vibrant marbled Atlantic salmon flesh with true 3D curved diagonal fat veins (myocommata)
    const curveWarp = 0.24 * Math.sin(nz * 4.4 + 0.7) + 0.12 * Math.cos(ny * 3.8);
    const veinCoord = nx * 8.4 + nz * 2.5 - ny * 2.1 + curveWarp + (nNoise - 0.5) * 0.18;
    const distToVein = Math.abs(fract(veinCoord) - 0.5);

    // Primary sharp fat stripe + secondary delicate marbling halo
    const primaryVein = 1.0 - smoothstep(0.025, 0.085, distToVein);
    const secondaryGlow = (1.0 - smoothstep(0.06, 0.15, distToVein)) * 0.32;
    const veinFactor = clamp(primaryVein + secondaryGlow, 0.0, 1.0);

    // Subtle anatomical flesh variation (deeper coral at center, slightly paler near belly)
    const bellyShift = smoothstep(0.05, 0.48, nx) * 0.14;
    const topSheen = smoothstep(maxY - 0.12, maxY, ny) * 0.06;
    const microTex = (nNoise - 0.5) * 0.08;

    const fleshR = clamp(0.95 + bellyShift * 0.25 + topSheen + microTex, 0, 1);
    const fleshG = clamp(0.39 + bellyShift * 0.55 + topSheen * 0.8 + microTex * 0.6, 0, 1);
    const fleshB = clamp(0.22 + bellyShift * 0.48 + topSheen * 0.5 + microTex * 0.4, 0, 1);

    // Creamy white intramuscular fat
    const fatR = 0.99;
    const fatG = 0.91;
    const fatB = 0.84;

    return {
      r: lerp(fleshR, fatR, veinFactor * 0.88),
      g: lerp(fleshG, fatG, veinFactor * 0.88),
      b: lerp(fleshB, fatB, veinFactor * 0.88),
      roughness: lerp(0.26, 0.19, veinFactor),
      metalness: 0.02,
      emissive: 0.0,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 56, 20, 36);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + h * 0.5; // map [-h/2, h/2] -> [0, h]
      let z = pos.getZ(i);

      let nx = x / w;
      let nz = z / d;

      // Conform footprint gently to the super-ellipse boundary
      const ax = Math.abs(nx * 2.0);
      const az = Math.abs(nz * 2.0);
      const normP = Math.pow(Math.pow(ax, 10) + Math.pow(az, 10), 0.1);
      if (normP > 1.001) {
        const s = 1.0 / normP;
        nx *= s;
        nz *= s;
        x = nx * w;
        z = nz * d;
      }

      const ny = clamp(y / h, 0, 1);
      const maxH = salmonTopHeight(nx, nz);
      y = ny * maxH * h;

      pos.setXYZ(i, x, y, z);
    }

    geo.computeVertexNormals();
    return geo;
  },
};
