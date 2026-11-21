import * as THREE from 'three';
import { clamp, lerp } from '../noise.js';

export const billiard8BallObject = {
  id: 'billiard-8ball',
  name: 'Bola 8 de Bilhar',
  englishName: 'Billiard 8-Ball',
  subtitle: 'Resina preta espelhada com núcleo neon ciano e magenta',
  bounds: { w: 1.62, h: 1.56, d: 1.62 },
  gridRes: { x: 84, y: 84, z: 84 },
  physics: {
    restitution: 0.36,
    friction: 0.32,
    cohesion: 0.45,
    density: 1.75,
    soundProfile: 'plastic',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    // Slightly flattened contact base at y = 0 so ball sits rock-steady on board
    const dx = nx / 0.49;
    const dy = (ny - 0.49) / 0.50;
    const dz = nz / 0.49;
    return dx * dx + dy * dy + dz * dz <= 1.0;
  },

  sampleVolume(nx, ny, nz) {
    const dx = nx / 0.49;
    const dy = (ny - 0.49) / 0.50;
    const dz = nz / 0.49;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 1. Mirror-Gloss Black Phenolic Outer Shell + Classic White "8" Circle on Top
    if (r > 0.84) {
      const topCircleR = Math.hypot(nx, nz);
      if (ny > 0.72 && topCircleR < 0.21) {
        // Stylized figure "8" inside white medallion
        const loop1 = Math.abs(Math.hypot(nx, nz - 0.055) - 0.052);
        const loop2 = Math.abs(Math.hypot(nx, nz + 0.055) - 0.056);
        if (loop1 < 0.022 || loop2 < 0.022) {
          return { r: 0.04, g: 0.04, b: 0.05, roughness: 0.08, metalness: 0.05, emissive: 0.0 };
        }
        return { r: 0.96, g: 0.95, b: 0.92, roughness: 0.08, metalness: 0.04, emissive: 0.0 };
      }
      return { r: 0.035, g: 0.038, b: 0.048, roughness: 0.06, metalness: 0.14, emissive: 0.0 };
    }

    // 2. SURPRISE INTERNAL NEON CYBER-CORE!
    // Concentric electric cyan, hot magenta & glowing white-plasma swirl rings
    const swirl = Math.sin(r * 22.0 + Math.atan2(dz, dx) * 3.0 + dy * 4.0) * 0.5 + 0.5;
    if (r < 0.28) {
      // Blazing electric cyan-white plasma center
      return { r: 0.65, g: 0.98, b: 1.0, roughness: 0.14, metalness: 0.1, emissive: 0.42 };
    }
    if (r < 0.58) {
      // Vibrant electric magenta <-> neon cyan energy bands
      return {
        r: lerp(0.06, 0.98, swirl),
        g: lerp(0.92, 0.14, swirl),
        b: lerp(0.98, 0.72, swirl),
        roughness: 0.18,
        metalness: 0.08,
        emissive: 0.32,
      };
    }
    // Deep cobalt-violet resin shell lining
    return {
      r: lerp(0.28, 0.75, swirl),
      g: lerp(0.08, 0.25, swirl),
      b: lerp(0.85, 0.98, swirl),
      roughness: 0.22,
      metalness: 0.08,
      emissive: 0.18,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.SphereGeometry(0.5, 48, 36);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ux = pos.getX(i) * 0.98;
      const uy = pos.getY(i);
      const uz = pos.getZ(i) * 0.98;
      const y = clamp((uy + 0.49) * h, 0.0, h);
      pos.setXYZ(i, ux * w, y, uz * d);
    }
    geo.computeVertexNormals();
    return geo;
  },
};
