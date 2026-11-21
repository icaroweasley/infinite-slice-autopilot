import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm3 } from '../noise.js';

/**
 * Computes irregular volcanic dome radial coordinate.
 * Returns normalized radial distance `r` where r <= 1 is inside rock,
 * and r < 0.38 is the hollow glittering crystal cavity!
 */
function geodeRadius(nx, ny, nz) {
  const crag = (fbm3(nx * 5.2 + 1.1, ny * 4.6 + 2.3, nz * 5.2 + 0.7, 3) - 0.5) * 0.19;
  const dx = nx / 0.47;
  const dy = (ny - 0.04) / 0.90;
  const dz = nz / 0.47;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) + crag;
}

function geodeInnerCavity(nx, ny, nz) {
  // Jagged crystalline teeth jutting inward into the hollow chamber
  const teeth = fbm3(nx * 14.0 + 5.2, ny * 14.0 + 3.1, nz * 14.0 + 8.4, 2) * 0.14;
  const dx = nx / 0.44;
  const dy = (ny - 0.36) / 0.50;
  const dz = nz / 0.44;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - teeth;
}

export const amethystGeodeObject = {
  id: 'geode',
  name: 'Geodo de Ametista',
  englishName: 'Amethyst Crystal Geode',
  subtitle: 'Rocha vulcânica por fora + cavidade oca de cristais roxos',
  bounds: { w: 2.10, h: 1.16, d: 1.78 },
  gridRes: { x: 88, y: 52, z: 76 },
  physics: {
    restitution: 0.32,
    friction: 0.56,
    cohesion: 0.48,
    density: 2.65,
    soundProfile: 'crystal',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const outerR = geodeRadius(nx, ny, nz);
    if (outerR > 0.98) return false;
    // Hollow sparkling crystal pocket in the core (closed at the bottom so it sits solid)
    if (ny > 0.22) {
      const innerR = geodeInnerCavity(nx, ny, nz);
      if (innerR < 0.36) return false;
    }
    return true;
  },

  sampleVolume(nx, ny, nz) {
    const outerR = geodeRadius(nx, ny, nz);
    const fineNoise = fbm3(nx * 18.0, ny * 18.0, nz * 18.0, 3);

    // 1. Craggy volcanic basalt outer shell (outerR > 0.80)
    if (outerR > 0.80) {
      const speckle = smoothstep(0.35, 0.75, fineNoise);
      const moss = smoothstep(0.62, 0.85, fbm3(nx * 8.0 + 9.0, ny * 8.0, nz * 8.0, 2));
      return {
        r: lerp(0.24, 0.40, speckle) * lerp(1.0, 0.86, moss),
        g: lerp(0.23, 0.38, speckle) * lerp(1.0, 0.96, moss),
        b: lerp(0.22, 0.35, speckle) * lerp(1.0, 0.82, moss),
        roughness: 0.92,
        metalness: 0.04,
        emissive: 0.0,
      };
    }

    // 2. Agate / Chalcedony banded transition rings (0.64 < outerR <= 0.80)
    if (outerR > 0.64) {
      const bandT = (outerR - 0.64) / 0.16;
      const rings = 0.5 + 0.5 * Math.sin(bandT * 28.0 + fineNoise * 2.2);
      const blueBand = smoothstep(0.25, 0.65, bandT) * (1.0 - smoothstep(0.65, 0.95, bandT));
      return {
        r: lerp(0.58, 0.95, rings) * lerp(1.0, 0.84, blueBand),
        g: lerp(0.66, 0.96, rings) * lerp(1.0, 0.92, blueBand),
        b: lerp(0.78, 0.99, rings),
        roughness: 0.24,
        metalness: 0.06,
        emissive: 0.02,
      };
    }

    // 3. Sparkling Faceted Amethyst Crystal Core (outerR <= 0.64)
    const innerR = geodeInnerCavity(nx, ny, nz);
    const facet = Math.abs(Math.sin(nx * 24.0 + ny * 17.0) * Math.cos(nz * 22.0 - ny * 19.0));
    const nearHollow = 1.0 - smoothstep(0.36, 0.62, innerR);

    // Rich royal purple transitioning to glowing electric violet & lavender crystal tips
    const r = lerp(0.34, 0.88, clamp(nearHollow * 0.72 + facet * 0.38, 0, 1));
    const g = lerp(0.06, 0.52, clamp(nearHollow * 0.65 + facet * 0.28, 0, 1));
    const b = lerp(0.62, 1.00, clamp(nearHollow * 0.55 + facet * 0.45, 0, 1));

    return {
      r,
      g,
      b,
      roughness: lerp(0.18, 0.07, facet),
      metalness: 0.12,
      emissive: clamp(nearHollow * 0.26 + facet * 0.12, 0, 0.38),
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    // Start with a smooth subdivided hemisphere/dome flattened at y=0
    const geo = new THREE.SphereGeometry(0.5, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.52);
    // Add flat bottom disc cap by merging or deforming a full sphere's lower half to y=0
    const fullSphere = new THREE.SphereGeometry(0.5, 52, 36);
    const pos = fullSphere.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      let ux = pos.getX(i); // [-0.5, 0.5]
      let uy = pos.getY(i); // [-0.5, 0.5]
      let uz = pos.getZ(i); // [-0.5, 0.5]

      // Map upper hemisphere to dome [0..1], flatten lower hemisphere smoothly onto y=0
      let ny = uy < 0 ? 0.0 : clamp(uy * 2.0, 0, 1);
      // Scale radial direction so it conforms to geodeRadius(nx, ny, nz) == 0.98
      let scale = 1.0;
      if (uy >= 0) {
        // Binary search along radial ray from (0, 0.04, 0) to match outerR = 0.98
        const dirX = ux * 2.0;
        const dirY = Math.max(0, uy * 2.0);
        const dirZ = uz * 2.0;
        let lo = 0.25;
        let hi = 1.15;
        for (let iter = 0; iter < 10; iter++) {
          const mid = (lo + hi) * 0.5;
          const r = geodeRadius(dirX * mid * 0.48, clamp(0.04 + dirY * mid * 0.92, 0, 1), dirZ * mid * 0.48);
          if (r > 0.98) hi = mid;
          else lo = mid;
        }
        scale = (lo + hi) * 0.5;
        const nx = clamp(dirX * scale * 0.48, -0.5, 0.5);
        ny = clamp(0.04 + dirY * scale * 0.92, 0, 1);
        const nz = clamp(dirZ * scale * 0.48, -0.5, 0.5);
        pos.setXYZ(i, nx * w, ny * h, nz * d);
      } else {
        // Bottom base footprint
        const rHoriz = Math.hypot(ux, uz);
        const dirX = rHoriz > 1e-5 ? ux / rHoriz : 0;
        const dirZ = rHoriz > 1e-5 ? uz / rHoriz : 0;
        const radialFrac = Math.min(1.0, rHoriz * 2.0);
        let lo = 0.25;
        let hi = 1.15;
        for (let iter = 0; iter < 8; iter++) {
          const mid = (lo + hi) * 0.5;
          const r = geodeRadius(dirX * mid * 0.48, 0.04, dirZ * mid * 0.48);
          if (r > 0.98) hi = mid;
          else lo = mid;
        }
        const edge = (lo + hi) * 0.5 * radialFrac;
        pos.setXYZ(i, dirX * edge * 0.48 * w, 0.0, dirZ * edge * 0.48 * d);
      }
    }

    geo.dispose();
    fullSphere.computeVertexNormals();
    return fullSphere;
  },
};
