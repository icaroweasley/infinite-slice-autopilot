import * as THREE from 'three';
import { clamp, lerp, fbm3 } from '../noise.js';

function goldBarHalfExtents(ny) {
  // Classic trapezoidal Swiss bullion ingot profile (wider at base, tapered at top)
  const taper = lerp(0.50, 0.39, clamp(ny, 0, 1));
  return { hx: taper, hz: taper * 0.96 };
}

export const goldBarObject = {
  id: 'gold-bar',
  name: 'Barra de Ouro 24k',
  englishName: '24k Solid Gold Bar',
  subtitle: 'Lingote 999.9 FINE GOLD + brilho metálico interno',
  bounds: { w: 2.38, h: 0.78, d: 1.32 },
  gridRes: { x: 96, y: 44, z: 60 },
  physics: {
    restitution: 0.22,
    friction: 0.36,
    cohesion: 0.44,
    density: 19.3,
    soundProfile: 'metal',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const { hx, hz } = goldBarHalfExtents(ny);
    const ax = Math.abs(nx / hx);
    const az = Math.abs(nz / hz);
    if (ax > 1.0 || az > 1.0) return false;
    return Math.pow(ax, 10) + Math.pow(az, 10) <= 1.02;
  },

  sampleVolume(nx, ny, nz) {
    const grain = fbm3(nx * 24.0, ny * 24.0, nz * 24.0, 2);

    // Top stamped recess border ("999.9 FINE GOLD" mint hallmark frame)
    if (ny > 0.91) {
      const { hx, hz } = goldBarHalfExtents(ny);
      const rx = Math.abs(nx / hx);
      const rz = Math.abs(nz / hz);
      const isBorder = (rx > 0.72 && rx < 0.84 && rz < 0.80) || (rz > 0.68 && rz < 0.80 && rx < 0.84);
      // Mint emblem bars across top center
      const isStamp = rx < 0.58 && (Math.abs(rz - 0.30) < 0.06 || Math.abs(rz) < 0.055 || Math.abs(rz + 0.30) < 0.06) && ((Math.floor((nx + 0.5) * 28) % 2) === 0);
      if (isBorder || isStamp) {
        return { r: 0.74, g: 0.52, b: 0.12, roughness: 0.32, metalness: 0.96, emissive: 0.0 };
      }
    }

    // Internal cast crystalline gold striations (subtle lustrous butter-gold interior!)
    const castRing = 0.5 + 0.5 * Math.sin(Math.hypot(nx * 2.2, ny - 0.45, nz * 2.0) * 26.0 + grain * 2.5);
    const r = lerp(0.95, 1.00, castRing * 0.6 + grain * 0.4);
    const g = lerp(0.73, 0.85, castRing * 0.65 + grain * 0.35);
    const b = lerp(0.16, 0.30, castRing * 0.5 + grain * 0.5);

    return {
      r,
      g,
      b,
      roughness: lerp(0.14, 0.24, grain),
      metalness: 0.95,
      emissive: 0.04,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 36, 16, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + h * 0.5;
      let z = pos.getZ(i);
      const ny = clamp(y / h, 0, 1);
      const { hx, hz } = goldBarHalfExtents(ny);
      let nx = (x / w) * (hx / 0.5);
      let nz = (z / d) * (hz / 0.5);
      const ax = Math.abs(nx / hx);
      const az = Math.abs(nz / hz);
      const p = Math.pow(Math.pow(ax, 10) + Math.pow(az, 10), 0.1);
      if (p > 1.001) {
        nx /= p;
        nz /= p;
      }
      pos.setXYZ(i, nx * w, y, nz * d);
    }
    geo.computeVertexNormals();
    return geo;
  },
};
