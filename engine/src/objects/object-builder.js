import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm3 } from './noise.js';

/**
 * Luxury Mechanical Skeleton Gold & Sapphire Watch
 * Bespoke AI volumetric creation for brief-1795242608896
 *
 * Exterior: Sculpted brushed 18k rose-gold octagonal bezel, dark sapphire crystal dial,
 *           luminous hour markers, cyan hands & fluted winding crown.
 * Interior: Interlocking toothed gold gears, ruby jewel bearings, blued-steel mainspring coil,
 *           brushed rhodium bridges & open mechanical skeleton cavities.
 */

function watchCaseRadius(nx, nz) {
  const ang = Math.atan2(nz, nx);
  // Subtle luxury octagonal watch case silhouette (Royal Oak inspired)
  const oct = 0.468 + 0.018 * Math.cos(ang * 8.0);
  // Protruding fluted winding crown on +X side
  const inCrown = nx > 0.42 && nx < 0.50 && Math.abs(nz) < 0.085;
  return inCrown ? 0.505 : oct;
}

function gearMask(px, pz, cx, cz, outerR, teeth, phase = 0) {
  const dx = px - cx;
  const dz = pz - cz;
  const r = Math.hypot(dx, dz);
  if (r > outerR * 1.15) return 0; // outside
  const ang = Math.atan2(dz, dx) + phase;
  const toothWave = Math.sin(ang * teeth) > 0.15 ? 1.0 : 0.0;
  const rimR = outerR * (0.88 + 0.14 * toothWave);
  if (r > rimR) return 0;
  // Center ruby pivot jewel
  if (r < outerR * 0.22) return 2;
  // Open skeleton spokes between hub and rim
  if (r > outerR * 0.34 && r < outerR * 0.72) {
    const spoke = Math.abs(Math.sin(ang * 2.5)) < 0.24;
    if (!spoke) return -1; // skeleton cutout!
  }
  return 1; // solid golden gear brass
}

export const customObject = {
  id: 'custom',
  slug: 'luxury-skeleton-gold-watch',
  name: 'Relógio Mecânico Skeleton Ouro',
  englishName: 'Luxury Skeleton Gold Watch',
  subtitle: 'Caixa de ouro 18k + cristal safira + engrenagens douradas e rubis reais por dentro',
  bounds: { w: 2.06, h: 0.72, d: 2.06 },
  gridRes: { x: 112, y: 56, z: 112 },
  physics: {
    restitution: 0.28,
    friction: 0.38,
    cohesion: 0.46,
    density: 6.4,
    soundProfile: 'metal',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const r = Math.hypot(nx, nz);
    const maxR = watchCaseRadius(nx, nz);
    // Subtle top crystal dome bevel
    const bevel = ny > 0.88 ? (ny - 0.88) * 0.28 : ny < 0.08 ? (0.08 - ny) * 0.22 : 0.0;
    if (r > maxR - bevel) return false;
    // Small hollow skeleton air pocket near center-bottom of movement
    if (ny > 0.26 && ny < 0.62 && Math.hypot(nx + 0.15, nz - 0.14) < 0.085) return false;
    return true;
  },

  sampleVolume(nx, ny, nz) {
    const r = Math.hypot(nx, nz);
    const maxR = watchCaseRadius(nx, nz);
    const ang = Math.atan2(nz, nx);
    const grain = fbm3(nx * 24, ny * 24, nz * 24, 2);

    // 1. Brushed 18k Rose-Gold Outer Case & Octagonal Bezel
    const inBezel = r > maxR - 0.075 || (ny > 0.78 && r > 0.375);
    if (inBezel) {
      // 8 tiny brushed silver bezel screws around top octagon
      const screwRing = Math.abs(r - 0.422) < 0.022 && Math.abs(Math.sin(ang * 4.0)) > 0.96 && ny > 0.84;
      if (screwRing) {
        return { r: 0.84, g: 0.87, b: 0.92, roughness: 0.16, metalness: 0.96, emissive: 0.0 };
      }
      const brush = Math.sin(r * 110 + grain * 2) * 0.04;
      return {
        r: clamp(0.94 + brush, 0, 1),
        g: clamp(0.68 + brush, 0, 1),
        b: clamp(0.36 + brush, 0, 1),
        roughness: 0.20,
        metalness: 0.95,
        emissive: 0.02,
      };
    }

    // 2. Top Sapphire Crystal Dial + Luminous Cyan Hands + Gold Hour Indices (ny > 0.78)
    if (ny > 0.78) {
      // Crisp 12 gold baton hour markers around dial rim
      const tickAngle = ((ang + Math.PI) / (Math.PI * 2)) * 12.0;
      const distTick = Math.abs(tickAngle - Math.round(tickAngle));
      if (r > 0.285 && r < 0.355 && distTick < 0.075) {
        return { r: 0.98, g: 0.82, b: 0.34, roughness: 0.14, metalness: 0.96, emissive: 0.08 };
      }
      // Luminous electric-cyan minute hand (pointing ~2 o'clock) and hour hand (~10 o'clock)
      const hand1 = Math.abs(nx * 0.5 - nz * 0.866) < 0.022 && (nx * 0.866 + nz * 0.5) > 0 && r < 0.31;
      const hand2 = Math.abs(nx * 0.8 + nz * 0.6) < 0.028 && (-nx * 0.6 + nz * 0.8) > 0 && r < 0.22;
      if (hand1 || hand2 || r < 0.036) {
        return { r: 0.38, g: 0.95, b: 1.0, roughness: 0.10, metalness: 0.25, emissive: 0.55 };
      }
      // Deep midnight-sapphire sunburst dial
      const sunray = 0.5 + 0.5 * Math.sin(ang * 24.0);
      return {
        r: lerp(0.03, 0.09, sunray),
        g: lerp(0.08, 0.22, sunray),
        b: lerp(0.24, 0.52, sunray),
        roughness: 0.07,
        metalness: 0.32,
        emissive: 0.08,
      };
    }

    // 3. Exhibition Sapphire & Gold Caseback (ny < 0.13)
    if (ny < 0.13) {
      return { r: 0.86, g: 0.64, b: 0.32, roughness: 0.22, metalness: 0.94, emissive: 0.0 };
    }

    // 4. INTERNAL 3D MECHANICAL MOVEMENT (0.13 <= ny <= 0.78)
    // Interlocking golden gears across 3 depth strata + crimson ruby jewels + blued-steel spiral mainspring!
    const g1 = gearMask(nx, nz, 0.02, -0.02, 0.16, 14, 0.2);
    const g2 = gearMask(nx, nz, 0.21, 0.10, 0.12, 11, 0.7);
    const g3 = gearMask(nx, nz, -0.18, -0.12, 0.13, 12, 1.1);
    const g4 = gearMask(nx, nz, -0.02, 0.22, 0.10, 10, 0.4);

    // Vibrant synthetic ruby jewel bearings at gear centers!
    if (g1 === 2 || g2 === 2 || g3 === 2 || g4 === 2) {
      return { r: 0.96, g: 0.08, b: 0.34, roughness: 0.08, metalness: 0.18, emissive: 0.32 };
    }

    // Precision toothed golden brass gears
    if ((ny > 0.20 && ny < 0.46 && (g1 === 1 || g3 === 1)) || (ny > 0.42 && ny < 0.72 && (g2 === 1 || g4 === 1))) {
      return { r: 0.98, g: 0.78, b: 0.20, roughness: 0.16, metalness: 0.96, emissive: 0.04 };
    }

    // Coiled thermally-blued steel mainspring barrel on upper-right quadrant
    const springR = Math.hypot(nx - 0.16, nz + 0.16);
    if (springR < 0.135 && ny > 0.22 && ny < 0.68) {
      const coil = 0.5 + 0.5 * Math.sin(springR * 170.0 + Math.atan2(nz + 0.16, nx - 0.16));
      if (coil > 0.32) {
        return { r: 0.08, g: 0.42, b: 0.98, roughness: 0.16, metalness: 0.92, emissive: 0.14 };
      }
    }

    // Geneva-striped rhodium-silver mechanical movement mainplate & bridges
    const genevaStripe = 0.5 + 0.5 * Math.sin(nx * 46.0 + ny * 18.0);
    return {
      r: lerp(0.58, 0.78, genevaStripe),
      g: lerp(0.62, 0.81, genevaStripe),
      b: lerp(0.68, 0.86, genevaStripe),
      roughness: 0.24,
      metalness: 0.90,
      emissive: 0.0,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const geo = new THREE.CylinderGeometry(0.48, 0.48, h, 48, 16);
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
        const bevel = ny > 0.88 ? (ny - 0.88) * 0.28 : ny < 0.08 ? (0.08 - ny) * 0.22 : 0.0;
        const targetR = Math.max(0.05, watchCaseRadius(dirX * 0.47, dirZ * 0.47) - bevel);
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
