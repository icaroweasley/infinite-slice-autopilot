import * as THREE from 'three';
import { clamp, lerp, smoothstep, hash3 } from '../noise.js';

function sdRoundedRect(nx, nz, hx, hz, r) {
  const qx = Math.abs(nx) - (hx - r);
  const qz = Math.abs(nz) - (hz - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

const CORNER_R = 0.135;

export const iphoneObject = {
  id: 'iphone',
  name: 'iPhone Pro',
  englishName: 'iPhone 16 Pro Teardown',
  subtitle: 'Tela OLED + placa-mãe verde + bobina de cobre + bateria',
  bounds: { w: 2.42, h: 0.52, d: 1.38 },
  gridRes: { x: 128, y: 48, z: 80 },
  physics: {
    restitution: 0.28,
    friction: 0.44,
    cohesion: 0.42,
    density: 2.1,
    soundProfile: 'tech',
  },

  contains(nx, ny, nz) {
    if (ny < 0.0 || ny > 1.0) return false;
    const sd = sdRoundedRect(nx, nz, 0.5, 0.5, CORNER_R);
    // Subtle titanium edge chamfer at top & bottom
    const chamfer = (ny < 0.06 || ny > 0.94) ? 0.012 : 0.0;
    return sd <= -chamfer;
  },

  sampleVolume(nx, ny, nz) {
    const sd = sdRoundedRect(nx, nz, 0.5, 0.5, CORNER_R);
    const edgeDist = -sd; // 0 at outer edge, increasing inward

    // 1. Brushed Natural Titanium Outer Frame
    if (edgeDist < 0.052) {
      const brushed = Math.sin(ny * 85.0 + nx * 18.0) * 0.03;
      // Antenna lines
      const isAntenna = (Math.abs(Math.abs(nx) - 0.36) < 0.012) && ny > 0.15 && ny < 0.85;
      if (isAntenna) {
        return { r: 0.36, g: 0.35, b: 0.33, roughness: 0.45, metalness: 0.2, emissive: 0.0 };
      }
      return {
        r: clamp(0.68 + brushed, 0, 1),
        g: clamp(0.66 + brushed, 0, 1),
        b: clamp(0.61 + brushed, 0, 1),
        roughness: 0.26,
        metalness: 0.88,
        emissive: 0.0,
      };
    }

    // 2. Top Glass OLED Screen (ny > 0.82)
    if (ny > 0.82) {
      // Glossy black screen bezel
      if (edgeDist < 0.088) {
        return { r: 0.025, g: 0.028, b: 0.035, roughness: 0.06, metalness: 0.12, emissive: 0.0 };
      }
      // Dynamic Island pill on left edge (landscape orientation)
      if (nx > -0.40 && nx < -0.345 && Math.abs(nz) < 0.12) {
        return { r: 0.015, g: 0.015, b: 0.02, roughness: 0.04, metalness: 0.1, emissive: 0.0 };
      }
      // Crisp glowing OLED Pro wallpaper (deep sapphire -> violet -> electric cyan wave)
      const wave = 0.5 + 0.5 * Math.sin(nx * 5.2 + nz * 4.1);
      const wave2 = 0.5 + 0.5 * Math.cos(nx * 3.8 - nz * 6.5);
      // App icon color hints along lower area
      const gx = (nx + 0.30) * 14.0;
      const gz = (nz + 0.35) * 10.0;
      const ix = Math.floor(gx);
      const iz = Math.floor(gz);
      const fx = gx - ix;
      const fz = gz - iz;
      const isIcon = nx > -0.26 && nx < 0.28 && Math.abs(nz) < 0.34 && fx > 0.18 && fx < 0.82 && fz > 0.18 && fz < 0.82;
      if (isIcon && ((ix + iz) % 2 === 0)) {
        const h = hash3(ix * 3.1, 7.0, iz * 5.7);
        const cr = h < 0.33 ? 0.15 : h < 0.66 ? 0.95 : 0.22;
        const cg = h < 0.33 ? 0.78 : h < 0.66 ? 0.36 : 0.52;
        const cb = h < 0.33 ? 0.98 : h < 0.66 ? 0.25 : 0.96;
        return { r: cr, g: cg, b: cb, roughness: 0.08, metalness: 0.05, emissive: 0.28 };
      }
      return {
        r: lerp(0.06, 0.38, wave * wave2),
        g: lerp(0.11, 0.55, wave),
        b: lerp(0.24, 0.92, 0.4 + 0.6 * wave2),
        roughness: 0.06,
        metalness: 0.08,
        emissive: 0.24,
      };
    }

    // 3. Bottom Frosted Titanium Back Glass (ny < 0.14)
    if (ny < 0.14) {
      const distCenter = Math.hypot(nx * 1.4, nz);
      const isLogo = distCenter < 0.11;
      return {
        r: isLogo ? 0.46 : 0.24,
        g: isLogo ? 0.46 : 0.25,
        b: isLogo ? 0.48 : 0.27,
        roughness: isLogo ? 0.12 : 0.38,
        metalness: isLogo ? 0.75 : 0.35,
        emissive: 0.0,
      };
    }

    // 4. INTERNAL 3D ELECTRONICS ANATOMY (0.14 <= ny <= 0.82)

    // 4a. Central Wound Copper MagSafe Inductive Coil (lower-mid layer)
    const coilR = Math.hypot((nx - 0.01) * 1.65, nz);
    if (ny >= 0.16 && ny <= 0.40 && coilR >= 0.17 && coilR <= 0.34) {
      const wireRing = 0.5 + 0.5 * Math.sin(coilR * 165.0);
      return {
        r: lerp(0.70, 0.96, wireRing),
        g: lerp(0.32, 0.54, wireRing),
        b: lerp(0.12, 0.24, wireRing),
        roughness: 0.20,
        metalness: 0.92,
        emissive: 0.02,
      };
    }

    // 4b. Left Half: Matte Black L-Shaped Lithium-Ion Battery Pack
    if (nx < -0.02 && nz > -0.26) {
      // Yellow/Amber Kapton insulation tape edge around battery
      const kaptonBorder = (nx > -0.055 || nz < -0.225 || ny > 0.76);
      if (kaptonBorder) {
        return { r: 0.92, g: 0.68, b: 0.10, roughness: 0.34, metalness: 0.15, emissive: 0.0 };
      }
      // Subtle layered lithium foil striations inside battery
      const layerStripe = 0.5 + 0.5 * Math.sin(ny * 75.0);
      return {
        r: lerp(0.08, 0.15, layerStripe),
        g: lerp(0.09, 0.16, layerStripe),
        b: lerp(0.11, 0.19, layerStripe),
        roughness: 0.52,
        metalness: 0.22,
        emissive: 0.0,
      };
    }

    // 4c. Taptic Engine (Bottom-left metallic block)
    if (nx < -0.10 && nz <= -0.26) {
      return {
        r: 0.56,
        g: 0.58,
        b: 0.62,
        roughness: 0.30,
        metalness: 0.82,
        emissive: 0.0,
      };
    }

    // 4d. Right & Upper Zone: Emerald Green Multi-Layer Logic Board PCB + Gold Traces + Silicon SoC
    // A-Series Silicon Processor Chip
    if (nx > 0.11 && nx < 0.28 && Math.abs(nz) < 0.15 && ny > 0.42 && ny < 0.76) {
      const pinRing = (nx < 0.13 || nx > 0.26 || Math.abs(nz) > 0.125);
      if (pinRing) {
        return { r: 0.88, g: 0.82, b: 0.42, roughness: 0.22, metalness: 0.92, emissive: 0.0 };
      }
      return { r: 0.07, g: 0.08, b: 0.10, roughness: 0.36, metalness: 0.25, emissive: 0.0 };
    }

    // Triple Camera Optical Module (far right corner)
    if (nx > 0.29 && nz < -0.05 && ny > 0.22 && ny < 0.78) {
      const lens1 = Math.hypot((nx - 0.36) * 1.5, nz + 0.26);
      const lens2 = Math.hypot((nx - 0.36) * 1.5, nz + 0.11);
      if (lens1 < 0.065 || lens2 < 0.065) {
        return { r: 0.08, g: 0.18, b: 0.34, roughness: 0.08, metalness: 0.65, emissive: 0.06 };
      }
      return { r: 0.22, g: 0.23, b: 0.26, roughness: 0.35, metalness: 0.72, emissive: 0.0 };
    }

    // Multi-layer Emerald Green PCB with crisp gold circuit traces and silver SMD chips
    const traceX = Math.abs(Math.sin(nx * 88.0 + Math.floor(ny * 8.0) * 1.7));
    const traceZ = Math.abs(Math.sin(nz * 72.0 + Math.floor(ny * 8.0) * 2.3));
    const isGoldTrace = (traceX > 0.955 || traceZ > 0.96) && (Math.abs(Math.sin(ny * 36.0)) > 0.35);
    if (isGoldTrace) {
      return { r: 0.96, g: 0.78, b: 0.22, roughness: 0.20, metalness: 0.92, emissive: 0.0 };
    }

    const smdHash = hash3(Math.floor(nx * 24), Math.floor(ny * 10), Math.floor(nz * 20));
    if (smdHash > 0.88) {
      return { r: 0.76, g: 0.78, b: 0.82, roughness: 0.24, metalness: 0.85, emissive: 0.0 };
    }
    if (smdHash > 0.82) {
      return { r: 0.72, g: 0.45, b: 0.20, roughness: 0.38, metalness: 0.30, emissive: 0.0 };
    }

    // Base rich emerald PCB substrate
    const pcbLayer = 0.5 + 0.5 * Math.sin(ny * 50.0);
    return {
      r: lerp(0.04, 0.09, pcbLayer),
      g: lerp(0.38, 0.54, pcbLayer),
      b: lerp(0.16, 0.24, pcbLayer),
      roughness: 0.30,
      metalness: 0.14,
      emissive: 0.0,
    };
  },

  createOuterGeometry() {
    const { w, h, d } = this.bounds;
    const rx = CORNER_R * w;
    const rz = CORNER_R * d;
    const hw = w * 0.5;
    const hd = d * 0.5;

    // Build rounded rectangle shape in XZ plane (Shape is XY, then rotated to XZ)
    const shape = new THREE.Shape();
    const r = Math.min(rx, rz);
    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    const bevel = h * 0.06;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: h - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.7,
      bevelSegments: 3,
      curveSegments: 16,
    });
    // Rotate so extrusion runs upward along +Y from y=0 to y=h
    geo.rotateX(-Math.PI * 0.5);
    geo.translate(0, bevel, 0);
    geo.computeVertexNormals();
    return geo;
  },
};
