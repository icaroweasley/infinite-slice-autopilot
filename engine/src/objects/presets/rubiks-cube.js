import * as THREE from 'three';
import { clamp, lerp } from '../noise.js';

export const rubiksCubeObject = {
  id: 'rubiks-cube',
  name: 'Cubo Mágico 3×3',
  englishName: "Rubik's Cube",
  subtitle: '6 faces coloridas + trilhos pretos + núcleo mecânico interno',
  bounds: { w: 1.56, h: 1.56, d: 1.56 },
  gridRes: { x: 112, y: 112, z: 112 },
  physics: {
    restitution: 0.32,
    friction: 0.42,
    cohesion: 0.46,
    density: 1.45,
    soundProfile: 'plastic',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const ax = Math.abs(nx * 2.0);
    const ay = Math.abs((ny - 0.5) * 2.0);
    const az = Math.abs(nz * 2.0);
    if (ax > 1.0 || ay > 1.0 || az > 1.0) return false;
    // Chamfered outer cubie corners
    const corner = Math.pow(ax, 18) + Math.pow(ay, 18) + Math.pow(az, 18);
    return corner <= 1.08;
  },

  sampleVolume(nx, ny, nz) {
    const u = nx + 0.5;
    const v = ny;
    const w = nz + 0.5;

    // 3x3 cubie groove coordinates
    const gx = Math.abs(((u * 3) % 1) - 0.5);
    const gy = Math.abs(((v * 3) % 1) - 0.5);
    const gz = Math.abs(((w * 3) % 1) - 0.5);
    const isStickerTile = (a, b) => a < 0.41 && b < 0.41;

    // 1. Six Classic Vivid Sticker Faces
    if (v > 0.945 && isStickerTile(gx, gz)) {
      return { r: 0.96, g: 0.96, b: 0.97, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // White top
    }
    if (v < 0.055 && isStickerTile(gx, gz)) {
      return { r: 0.99, g: 0.85, b: 0.08, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // Yellow bottom
    }
    if (w > 0.945 && isStickerTile(gx, gy)) {
      return { r: 0.08, g: 0.46, b: 0.94, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // Blue front
    }
    if (w < 0.055 && isStickerTile(gx, gy)) {
      return { r: 0.09, g: 0.72, b: 0.30, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // Green back
    }
    if (u > 0.945 && isStickerTile(gy, gz)) {
      return { r: 0.92, g: 0.14, b: 0.18, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // Red right
    }
    if (u < 0.055 && isStickerTile(gy, gz)) {
      return { r: 0.98, g: 0.46, b: 0.06, roughness: 0.16, metalness: 0.04, emissive: 0.0 }; // Orange left
    }

    // 2. Internal Spherical Core & Spring Spider Mechanism!
    const dx = nx;
    const dy = ny - 0.5;
    const dz = nz;
    const r = Math.hypot(dx, dy, dz);

    // Central core spider sphere (bright metallic chrome + neon cyan hub)
    if (r < 0.16) {
      return { r: 0.14, g: 0.85, b: 0.95, roughness: 0.22, metalness: 0.65, emissive: 0.15 };
    }
    // 6-axis steel screw shafts radiating to face centers
    const onXAxis = Math.hypot(dy, dz) < 0.055 && Math.abs(dx) < 0.38;
    const onYAxis = Math.hypot(dx, dz) < 0.055 && Math.abs(dy) < 0.38;
    const onZAxis = Math.hypot(dx, dy) < 0.055 && Math.abs(dz) < 0.38;
    if (onXAxis || onYAxis || onZAxis) {
      const spring = 0.5 + 0.5 * Math.sin((Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) * 120.0);
      return {
        r: lerp(0.70, 0.92, spring),
        g: lerp(0.72, 0.94, spring),
        b: lerp(0.76, 0.98, spring),
        roughness: 0.20,
        metalness: 0.92,
        emissive: 0.0,
      };
    }

    // Internal plastic color-coded cubie chambers (makes internal cuts burst with color!)
    const nearOuterShell = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > 0.36;
    if (!nearOuterShell && r < 0.34) {
      // Vibrant colored internal plastic tracks
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) {
        return dx > 0
          ? { r: 0.86, g: 0.18, b: 0.22, roughness: 0.34, metalness: 0.05, emissive: 0.0 }
          : { r: 0.94, g: 0.48, b: 0.10, roughness: 0.34, metalness: 0.05, emissive: 0.0 };
      }
      if (Math.abs(dy) > Math.abs(dz)) {
        return dy > 0
          ? { r: 0.92, g: 0.92, b: 0.95, roughness: 0.34, metalness: 0.05, emissive: 0.0 }
          : { r: 0.96, g: 0.82, b: 0.12, roughness: 0.34, metalness: 0.05, emissive: 0.0 };
      }
      return dz > 0
        ? { r: 0.12, g: 0.48, b: 0.92, roughness: 0.34, metalness: 0.05, emissive: 0.0 }
        : { r: 0.14, g: 0.70, b: 0.32, roughness: 0.34, metalness: 0.05, emissive: 0.0 };
    }

    // Glossy jet-black ABS plastic cubie body
    return { r: 0.065, g: 0.07, b: 0.08, roughness: 0.24, metalness: 0.08, emissive: 0.0 };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 24, 24, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + h * 0.5;
      let z = pos.getZ(i);
      const ax = Math.abs((x / w) * 2.0);
      const ay = Math.abs(((y / h) - 0.5) * 2.0);
      const az = Math.abs((z / d) * 2.0);
      const p = Math.pow(Math.pow(ax, 18) + Math.pow(ay, 18) + Math.pow(az, 18), 1 / 18);
      if (p > 1.005) {
        x /= p;
        y = ((y / h - 0.5) / p + 0.5) * h;
        z /= p;
      }
      pos.setXYZ(i, x, clamp(y, 0, h), z);
    }
    geo.computeVertexNormals();
    return geo;
  },
};
