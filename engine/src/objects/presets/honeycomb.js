import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm3 } from '../noise.js';

function hexDist(px, pz) {
  const ax = Math.abs(px);
  const az = Math.abs(pz);
  return Math.max(ax * 0.8660254 + az * 0.5, az);
}

function hexCellEdge(u, v) {
  // Periodic 2D hexagonal grid distance to cell wall
  const sX = 1.0;
  const sY = 1.7320508;
  const gx1 = ((u % sX) + sX) % sX - 0.5 * sX;
  const gy1 = ((v % sY) + sY) % sY - 0.5 * sY;
  const gx2 = (((u + 0.5 * sX) % sX) + sX) % sX - 0.5 * sX;
  const gy2 = (((v + 0.5 * sY) % sY) + sY) % sY - 0.5 * sY;
  const d1 = hexDist(gx1, gy1);
  const d2 = hexDist(gx2, gy2);
  return Math.min(d1, d2);
}

export const honeycombObject = {
  id: 'honeycomb',
  name: 'Favo de Mel',
  englishName: 'Raw Golden Honeycomb',
  subtitle: 'Células hexagonais de cera dourada recheadas de mel âmbar',
  bounds: { w: 2.24, h: 0.86, d: 1.56 },
  gridRes: { x: 96, y: 44, z: 68 },
  physics: {
    restitution: 0.12,
    friction: 0.74,
    cohesion: 0.80,
    density: 1.38,
    soundProfile: 'culinary',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const ax = Math.abs(nx * 2.0);
    const az = Math.abs(nz * 2.0);
    if (ax > 1.0 || az > 1.0) return false;
    return Math.pow(ax, 12) + Math.pow(az, 12) <= 1.02;
  },

  sampleVolume(nx, ny, nz) {
    const hd = hexCellEdge(nx * 10.5, nz * 7.5);
    const isWaxWall = hd > 0.39;
    const midSeptum = Math.abs(ny - 0.5) < 0.065;
    const topWaxCap = ny > 0.90 && hd < 0.42;
    const n = fbm3(nx * 15.0, ny * 15.0, nz * 15.0, 2);

    // Pale creamy-gold beeswax cell walls & mid-septum
    if (isWaxWall || midSeptum) {
      return {
        r: lerp(0.95, 0.99, n),
        g: lerp(0.84, 0.92, n),
        b: lerp(0.46, 0.62, n),
        roughness: 0.42,
        metalness: 0.02,
        emissive: 0.02,
      };
    }

    // Translucent waxy seal cap on top cells
    if (topWaxCap) {
      return {
        r: 0.98,
        g: 0.82,
        b: 0.34,
        roughness: 0.24,
        metalness: 0.04,
        emissive: 0.04,
      };
    }

    // Rich glowing liquid amber honey filling every hexagonal chamber!
    const depthTint = smoothstep(0.0, 0.9, ny);
    return {
      r: lerp(0.86, 0.99, depthTint * 0.7 + n * 0.3),
      g: lerp(0.42, 0.64, depthTint * 0.7 + n * 0.3),
      b: lerp(0.03, 0.11, depthTint),
      roughness: 0.10,
      metalness: 0.06,
      emissive: 0.12,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.BoxGeometry(w, h, d, 32, 14, 24);
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
