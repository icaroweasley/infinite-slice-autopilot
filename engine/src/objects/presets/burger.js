import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm3 } from '../noise.js';

function burgerRadiusAtY(ny, nx, nz) {
  const ang = Math.atan2(nz, nx);
  // Domed top brioche bun
  if (ny > 0.68) {
    const t = clamp((ny - 0.68) / 0.32, 0, 1);
    return 0.48 * Math.sqrt(Math.max(0.001, 1.0 - t * t));
  }
  // Ruffled crisp lettuce skirt jutting slightly outward
  if (ny > 0.56 && ny <= 0.68) {
    return 0.49 + 0.035 * Math.sin(ang * 9.0);
  }
  // Melted cheddar + beef patty + tomato + bottom bun
  return 0.475;
}

export const burgerObject = {
  id: 'burger',
  name: 'Hambúrguer Gourmet',
  englishName: 'Stacked Gourmet Burger',
  subtitle: 'Pão brioche com gergelim + alface + tomate + cheddar + carne',
  bounds: { w: 1.94, h: 1.32, d: 1.94 },
  gridRes: { x: 88, y: 64, z: 88 },
  physics: {
    restitution: 0.12,
    friction: 0.72,
    cohesion: 0.76,
    density: 0.95,
    soundProfile: 'culinary',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const r = Math.hypot(nx, nz);
    return r <= burgerRadiusAtY(ny, nx, nz);
  },

  sampleVolume(nx, ny, nz) {
    const n = fbm3(nx * 22.0, ny * 22.0, nz * 22.0, 2);
    const r = Math.hypot(nx, nz);
    const maxR = Math.max(0.05, burgerRadiusAtY(ny, nx, nz));

    // 1. Bottom Brioche Bun (0.00 .. 0.19)
    if (ny < 0.19) {
      const crust = ny < 0.045 || r > maxR * 0.88;
      return crust
        ? { r: 0.76, g: 0.46, b: 0.18, roughness: 0.64, metalness: 0.0, emissive: 0.0 }
        : { r: 0.95, g: 0.84, b: 0.58, roughness: 0.80, metalness: 0.0, emissive: 0.0 };
    }

    // 2. Thick Juicy Seared Beef Patty (0.19 .. 0.43)
    if (ny < 0.43) {
      const searedEdge = r > maxR * 0.84 || ny < 0.22 || ny > 0.40;
      if (searedEdge) {
        return { r: 0.25 + n * 0.08, g: 0.13 + n * 0.04, b: 0.08 + n * 0.03, roughness: 0.62, metalness: 0.0, emissive: 0.0 };
      }
      // Juicy medium-rare marbled center
      return { r: 0.48 + n * 0.14, g: 0.20 + n * 0.06, b: 0.16 + n * 0.05, roughness: 0.48, metalness: 0.0, emissive: 0.0 };
    }

    // 3. Vivid Melted Cheddar Cheese Layer (0.43 .. 0.50)
    if (ny < 0.50) {
      return { r: 0.99, g: 0.68, b: 0.06, roughness: 0.24, metalness: 0.02, emissive: 0.02 };
    }

    // 4. Fresh Juicy Red Tomato Slice (0.50 .. 0.58)
    if (ny < 0.58) {
      const seedPocket = smoothstep(0.62, 0.82, n) && r > 0.12 && r < 0.34;
      return seedPocket
        ? { r: 0.96, g: 0.78, b: 0.34, roughness: 0.16, metalness: 0.0, emissive: 0.0 }
        : { r: 0.88, g: 0.12, b: 0.10, roughness: 0.18, metalness: 0.0, emissive: 0.0 };
    }

    // 5. Crisp Emerald Lettuce Layer (0.58 .. 0.67)
    if (ny < 0.67) {
      return {
        r: lerp(0.18, 0.42, n),
        g: lerp(0.66, 0.86, n),
        b: lerp(0.14, 0.28, n),
        roughness: 0.36,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    // 6. Golden Domed Sesame Brioche Top Bun (0.67 .. 1.00)
    const onDomeSurface = r > maxR * 0.84 || ny > 0.92;
    if (onDomeSurface) {
      // Toasted white sesame seeds scattered on top crown
      const seedGrid = Math.sin(nx * 52.0) * Math.sin(nz * 52.0);
      if (ny > 0.78 && seedGrid > 0.84) {
        return { r: 0.98, g: 0.94, b: 0.80, roughness: 0.55, metalness: 0.0, emissive: 0.0 };
      }
      return { r: 0.82, g: 0.48, b: 0.16, roughness: 0.34, metalness: 0.02, emissive: 0.0 };
    }
    // Fluffy golden brioche crumb inside
    return {
      r: lerp(0.92, 0.98, n),
      g: lerp(0.80, 0.88, n),
      b: lerp(0.50, 0.62, n),
      roughness: 0.82,
      metalness: 0.0,
      emissive: 0.0,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.CylinderGeometry(0.48, 0.48, h, 44, 32);
    geo.translate(0, h * 0.5, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = clamp(pos.getY(i), 0, h);
      const z = pos.getZ(i);
      const ny = y / h;
      const curR = Math.hypot(x, z);
      if (curR > 1e-5) {
        const dirX = x / curR;
        const dirZ = z / curR;
        const targetR = burgerRadiusAtY(ny, dirX * 0.4, dirZ * 0.4);
        const radialFrac = Math.min(1.0, curR / 0.48);
        pos.setXYZ(i, dirX * targetR * radialFrac * w, y, dirZ * targetR * radialFrac * d);
      } else {
        pos.setXYZ(i, 0, y, 0);
      }
    }
    geo.computeVertexNormals();
    return geo;
  },
};
