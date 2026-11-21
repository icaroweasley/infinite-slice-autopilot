import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm3 } from '../noise.js';

export const iceRoseObject = {
  id: 'ice-rose',
  name: 'Gelo com Rosa',
  englishName: 'Crystal Ice Block with Frozen Rose',
  subtitle: 'Bloco de gelo azulado com rosa vermelha e caule congelados dentro',
  bounds: { w: 1.92, h: 1.24, d: 1.62 },
  gridRes: { x: 92, y: 60, z: 76 },
  physics: {
    restitution: 0.26,
    friction: 0.22,
    cohesion: 0.42,
    density: 0.92,
    soundProfile: 'crystal',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const ax = Math.abs(nx * 2.0);
    const az = Math.abs(nz * 2.0);
    if (ax > 1.0 || az > 1.0) return false;
    return Math.pow(ax, 12) + Math.pow(az, 12) <= 1.02;
  },

  sampleVolume(nx, ny, nz) {
    const frost = fbm3(nx * 14.0, ny * 14.0, nz * 14.0, 3);

    // 1. Frozen Crimson Rose Blossom Suspended in Center (ny in [0.42, 0.86])
    const rx = nx * 1.15;
    const ry = (ny - 0.64) * 1.65;
    const rz = nz * 1.15;
    const roseR = Math.hypot(rx, ry, rz);
    if (roseR < 0.29) {
      const ang = Math.atan2(rz, rx);
      const petalSpiral = Math.sin(roseR * 34.0 + ang * 5.0 + ry * 8.0);
      if (petalSpiral > -0.35 || roseR < 0.09) {
        const deepCore = 1.0 - smoothstep(0.05, 0.28, roseR);
        return {
          r: lerp(0.92, 0.56, deepCore),
          g: lerp(0.08, 0.02, deepCore),
          b: lerp(0.18, 0.08, deepCore),
          roughness: 0.26,
          metalness: 0.04,
          emissive: 0.08,
        };
      }
    }

    // 2. Emerald Green Rose Stem & Two Frozen Leaves (ny in [0.10, 0.46])
    const stemCurveX = Math.sin(ny * 7.0) * 0.035;
    const distStem = Math.hypot(nx - stemCurveX, nz);
    if (ny > 0.10 && ny < 0.48 && distStem < 0.038) {
      return { r: 0.10, g: 0.52, b: 0.20, roughness: 0.32, metalness: 0.02, emissive: 0.0 };
    }
    // Frozen leaf pair
    const leaf1 = Math.hypot((nx - 0.13) * 1.2, (ny - 0.34) * 4.5, nz * 2.4);
    const leaf2 = Math.hypot((nx + 0.13) * 1.2, (ny - 0.26) * 4.5, (nz - 0.04) * 2.4);
    if (leaf1 < 0.11 || leaf2 < 0.11) {
      return { r: 0.14, g: 0.62, b: 0.26, roughness: 0.28, metalness: 0.02, emissive: 0.0 };
    }

    // 3. Glacial Ice Matrix with Trapped Micro-Air Bubbles & Crystalline Frost Veins
    const nearEdge = Math.max(Math.abs(nx * 2.0), Math.abs(nz * 2.0), Math.abs((ny - 0.5) * 2.0));
    const bubble = smoothstep(0.68, 0.86, frost);
    const rimFrost = smoothstep(0.76, 1.0, nearEdge);
    const glow = clamp(bubble * 0.55 + rimFrost * 0.45, 0, 1);

    return {
      r: lerp(0.62, 0.94, glow),
      g: lerp(0.86, 0.98, glow),
      b: lerp(0.98, 1.00, glow),
      roughness: lerp(0.08, 0.24, rimFrost),
      metalness: 0.06,
      emissive: 0.08,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 28, 18, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + h * 0.5;
      let z = pos.getZ(i);
      const ax = Math.abs((x / w) * 2.0);
      const az = Math.abs((z / d) * 2.0);
      const p = Math.pow(Math.pow(ax, 12) + Math.pow(az, 12), 1 / 12);
      if (p > 1.001) {
        x /= p;
        z /= p;
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  },
};
