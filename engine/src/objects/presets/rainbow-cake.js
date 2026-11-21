import * as THREE from 'three';
import { clamp, lerp, fbm3 } from '../noise.js';

const RAINBOW_LAYERS = [
  [0.92, 0.14, 0.24], // Red
  [0.99, 0.48, 0.05], // Orange
  [0.99, 0.84, 0.08], // Yellow
  [0.16, 0.78, 0.34], // Green
  [0.08, 0.68, 0.95], // Sky Cyan
  [0.32, 0.28, 0.92], // Indigo
  [0.78, 0.18, 0.84], // Magenta-Violet
];

export const rainbowCakeObject = {
  id: 'rainbow-cake',
  name: 'Bolo Arco-Íris',
  englishName: 'Secret Rainbow Cake',
  subtitle: 'Casca de ganache escuro escondendo 7 camadas arco-íris',
  bounds: { w: 2.12, h: 1.14, d: 1.54 },
  gridRes: { x: 104, y: 72, z: 80 },
  physics: {
    restitution: 0.10,
    friction: 0.72,
    cohesion: 0.78,
    density: 0.82,
    soundProfile: 'culinary',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const ax = Math.abs(nx * 2.0);
    const az = Math.abs(nz * 2.0);
    if (ax > 1.0 || az > 1.0) return false;
    // Softly beveled frosting edges
    const corner = Math.pow(ax, 14) + Math.pow(az, 14);
    return corner <= 1.02;
  },

  sampleVolume(nx, ny, nz) {
    const crumb = fbm3(nx * 26.0 + 1.5, ny * 26.0 + 4.2, nz * 26.0 + 7.1, 2);

    // 1. Glossy Dark Chocolate Ganache Shell on outer walls & top
    const onShell = Math.abs(nx) > 0.452 || Math.abs(nz) > 0.452 || ny > 0.915;
    if (onShell) {
      // Minimalist gold-white decorative diagonal drizzle on top face
      if (ny > 0.965) {
        const drizzle = Math.abs(Math.sin((nx * 14.0 + nz * 10.0) + 0.35 * Math.sin(nz * 12.0)));
        if (drizzle > 0.945) {
          return { r: 0.96, g: 0.84, b: 0.56, roughness: 0.22, metalness: 0.35, emissive: 0.0 };
        }
      }
      return {
        r: 0.13 + crumb * 0.02,
        g: 0.07 + crumb * 0.015,
        b: 0.05 + crumb * 0.01,
        roughness: 0.16,
        metalness: 0.05,
        emissive: 0.0,
      };
    }

    // 2. Thin dark cocoa biscuit base
    if (ny < 0.045) {
      return {
        r: 0.19 + crumb * 0.05,
        g: 0.11 + crumb * 0.03,
        b: 0.08 + crumb * 0.02,
        roughness: 0.80,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    // 3. 7 Vibrant Rainbow Sponge Layers separated by snow-white buttercream!
    const innerY = clamp((ny - 0.045) / (0.915 - 0.045), 0, 0.9999);
    const layerPos = innerY * RAINBOW_LAYERS.length;
    const layerIdx = Math.min(RAINBOW_LAYERS.length - 1, Math.floor(layerPos));
    const localY = layerPos - layerIdx;

    // Creamy white buttercream frosting stripe between every sponge layer
    if (localY < 0.17 || (layerIdx === RAINBOW_LAYERS.length - 1 && localY > 0.86)) {
      return {
        r: 0.98,
        g: 0.96,
        b: 0.91,
        roughness: 0.38,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    const col = RAINBOW_LAYERS[layerIdx];
    const spongeAir = lerp(0.86, 1.06, crumb);
    return {
      r: clamp(col[0] * spongeAir, 0, 1),
      g: clamp(col[1] * spongeAir, 0, 1),
      b: clamp(col[2] * spongeAir, 0, 1),
      roughness: 0.76,
      metalness: 0.0,
      emissive: 0.02,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 32, 16, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + h * 0.5;
      let z = pos.getZ(i);
      const ax = Math.abs((x / w) * 2.0);
      const az = Math.abs((z / d) * 2.0);
      const p = Math.pow(Math.pow(ax, 14) + Math.pow(az, 14), 1 / 14);
      if (p > 1.001) {
        x /= p;
        z /= p;
      }
      // Very subtle soft crown bevel on top frosting
      const ny = y / h;
      if (ny > 0.95) {
        const edge = Math.max(ax, az);
        y -= Math.max(0, edge - 0.90) * 0.22 * h;
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  },
};
