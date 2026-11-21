import * as THREE from 'three';
import { clamp, lerp, smoothstep, fract, hash3, fbm3 } from './noise.js';

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function slugify(str) {
  return normalizeText(str)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'custom-object';
}

const COLOR_DICT = [
  { keys: ['vermelh', 'red', 'morango', 'rubi', 'crimson', 'cereja'], rgb: [0.92, 0.14, 0.20] },
  { keys: ['laranj', 'orange', 'tangerin', 'cenoura', 'abobor'], rgb: [0.98, 0.46, 0.08] },
  { keys: ['amarel', 'yellow', 'limao', 'banana', 'milho'], rgb: [0.99, 0.84, 0.10] },
  { keys: ['verd', 'green', 'esmerald', 'matcha', 'abacat', 'menta', 'lim'], rgb: [0.14, 0.74, 0.30] },
  { keys: ['ciano', 'cyan', 'turques', 'aqua', 'gelo', 'ice', 'agua'], rgb: [0.14, 0.82, 0.96] },
  { keys: ['azul', 'blue', 'safir', 'marinh', 'oceano'], rgb: [0.12, 0.42, 0.94] },
  { keys: ['rox', 'purple', 'violet', 'ametist', 'uva', 'lavand'], rgb: [0.58, 0.20, 0.92] },
  { keys: ['rosa', 'pink', 'magenta', 'fucsia', 'chiclete'], rgb: [0.96, 0.26, 0.62] },
  { keys: ['our', 'dourad', 'gold'], rgb: [0.98, 0.78, 0.18], metal: 0.94 },
  { keys: ['prat', 'silver', 'cromad', 'aco', 'aluminio', 'metal'], rgb: [0.78, 0.82, 0.88], metal: 0.90 },
  { keys: ['cobre', 'copper', 'bronze'], rgb: [0.86, 0.46, 0.20], metal: 0.88 },
  { keys: ['pret', 'black', 'obsidian', 'carvao', 'escuro', 'dark'], rgb: [0.08, 0.09, 0.11] },
  { keys: ['branc', 'white', 'leite', 'neve', 'creme', 'baunilh'], rgb: [0.96, 0.95, 0.92] },
  { keys: ['marrom', 'brown', 'chocolat', 'cacau', 'madeir', 'cafe'], rgb: [0.34, 0.18, 0.10] },
  { keys: ['terracot', 'tijol', 'brick', 'argila'], rgb: [0.74, 0.28, 0.16] },
];

export const RANDOM_OBJECT_PROMPTS = [
  'Abacate com caroço',
  'Nintendo Switch OLED',
  'Barra de Chocolate recheada com caramelo',
  'Peça de Sushi Uramaki de Salmão',
  'Bife Wagyu marmorizado',
  'Torre de Panquecas com manteiga e mel',
  'Pokébola com núcleo de cristal',
  'Queijo Suíço com furos',
  'Tijolo que na verdade é bolo arco-íris',
  'Rocha de Lava com magma incandescente',
  'Diamante Azul Lapidado',
  'Sabonete artesanal roxo e dourado',
  'Melancia doce com sementes',
  'Bolo Matcha em camadas',
  'Bloco de Esmeralda brilhante',
];

function makeRoundedBoxGeo(w, h, d, power = 12) {
  const geo = new THREE.BoxGeometry(w, h, d, 32, 18, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i) + h * 0.5;
    let z = pos.getZ(i);
    const ax = Math.abs((x / w) * 2.0);
    const az = Math.abs((z / d) * 2.0);
    const p = Math.pow(Math.pow(ax, power) + Math.pow(az, power), 1 / power);
    if (p > 1.001) {
      x /= p;
      z /= p;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeSphereGeo(w, h, d) {
  const geo = new THREE.SphereGeometry(0.5, 44, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i) * 0.98;
    const uy = pos.getY(i);
    const uz = pos.getZ(i) * 0.98;
    pos.setXYZ(i, ux * w, clamp((uy + 0.49) * h, 0, h), uz * d);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeCylinderGeo(w, h, d) {
  const geo = new THREE.CylinderGeometry(0.48, 0.48, h, 44, 24);
  geo.translate(0, h * 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * w, pos.getY(i), pos.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a full procedural volumetric 3D object from ANY free-text prompt (Portuguese or English).
 * Includes rich anatomical templates for popular viral ideas + a universal semantic composer for anything else!
 */
export function generateObjectFromPrompt(rawPrompt) {
  const prompt = (rawPrompt || '').trim();
  const norm = normalizeText(prompt);
  const slug = slugify(prompt);

  // --- Rich Viral Archetype Templates ---

  // 1. Avocado (Abacate com caroço)
  if (norm.includes('abacat') || norm.includes('avocado')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Ripe Avocado',
      subtitle: 'Casca verde escura + polpa cremosa + caroço marrom central',
      bounds: { w: 2.15, h: 1.24, d: 1.56 },
      gridRes: { x: 96, y: 60, z: 72 },
      physics: { restitution: 0.14, friction: 0.64, cohesion: 0.72, density: 1.0, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const dx = nx / 0.48;
        const dy = (ny - 0.48) / 0.49;
        const dz = nz / 0.48;
        const pear = 1.0 - 0.16 * smoothstep(0.1, 0.48, nx);
        return (dx * dx) + (dy * dy + dz * dz) / (pear * pear) <= 1.0;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 18, ny * 18, nz * 18, 2);
        const dx = nx / 0.48;
        const dy = (ny - 0.48) / 0.49;
        const dz = nz / 0.48;
        const pear = 1.0 - 0.16 * smoothstep(0.1, 0.48, nx);
        const r = Math.sqrt(dx * dx + (dy * dy + dz * dz) / (pear * pear));
        // Brown wooden central pit
        const pitR = Math.hypot((nx + 0.08) / 0.18, (ny - 0.48) / 0.24, nz / 0.20);
        if (pitR < 1.0) {
          const woodRing = 0.5 + 0.5 * Math.sin(pitR * 22 + n * 3);
          return { r: lerp(0.32, 0.48, woodRing), g: lerp(0.16, 0.26, woodRing), b: lerp(0.08, 0.14, woodRing), roughness: 0.48, metalness: 0.02, emissive: 0 };
        }
        // Dark bumpy skin
        if (r > 0.89) {
          return { r: 0.07 + n * 0.04, g: 0.17 + n * 0.06, b: 0.06 + n * 0.03, roughness: 0.72, metalness: 0.02, emissive: 0 };
        }
        // Rich green edge grading smoothly into creamy buttery yellow interior
        const fleshT = smoothstep(0.42, 0.88, r);
        return {
          r: lerp(0.92, 0.34, fleshT),
          g: lerp(0.90, 0.68, fleshT),
          b: lerp(0.46, 0.16, fleshT),
          roughness: 0.34,
          metalness: 0.0,
          emissive: 0.0,
        };
      },
      createOuterGeometry() {
        const { w, h, d } = this.bounds;
        const geo = new THREE.SphereGeometry(0.5, 48, 34);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const ux = pos.getX(i) * 0.96;
          const uy = pos.getY(i);
          const uz = pos.getZ(i) * 0.96;
          const pear = 1.0 - 0.16 * smoothstep(0.1, 0.48, ux);
          pos.setXYZ(i, ux * w, clamp((uy * pear + 0.48) * h, 0, h), uz * pear * d);
        }
        geo.computeVertexNormals();
        return geo;
      },
    };
  }

  // 2. Nintendo Switch (Joy-Cons vermelho + azul + tela OLED + placa verde interna)
  if (norm.includes('switch') || norm.includes('nintendo') || norm.includes('console') || norm.includes('gameboy')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Nintendo Switch Console',
      subtitle: 'Joy-Cons Neon Azul/Vermelho + Tela OLED + PCB & cobre por dentro',
      bounds: { w: 2.52, h: 0.50, d: 1.28 },
      gridRes: { x: 128, y: 44, z: 68 },
      physics: { restitution: 0.28, friction: 0.44, cohesion: 0.45, density: 1.9, soundProfile: 'tech' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const ax = Math.abs(nx * 2);
        const az = Math.abs(nz * 2);
        if (ax > 1 || az > 1) return false;
        return Math.pow(ax, 12) + Math.pow(az, 12) <= 1.02;
      },
      sampleVolume(nx, ny, nz) {
        // Left Neon Blue Joy-Con
        if (nx < -0.34) {
          const isStick = ny > 0.85 && Math.hypot((nx + 0.42) * 2.2, (nz + 0.14) * 1.4) < 0.12;
          if (isStick) return { r: 0.08, g: 0.09, b: 0.11, roughness: 0.4, metalness: 0.1, emissive: 0 };
          if (ny > 0.16 && ny < 0.84 && nx > -0.45 && Math.abs(nz) < 0.36) {
            return { r: 0.06, g: 0.46, b: 0.22, roughness: 0.32, metalness: 0.15, emissive: 0 };
          }
          return { r: 0.04, g: 0.70, b: 0.96, roughness: 0.32, metalness: 0.05, emissive: 0.04 };
        }
        // Right Neon Red Joy-Con
        if (nx > 0.34) {
          const isBtn = ny > 0.85 && Math.hypot((nx - 0.42) * 2.2, (nz - 0.14) * 1.4) < 0.12;
          if (isBtn) return { r: 0.08, g: 0.09, b: 0.11, roughness: 0.4, metalness: 0.1, emissive: 0 };
          if (ny > 0.16 && ny < 0.84 && nx < 0.45 && Math.abs(nz) < 0.36) {
            return { r: 0.06, g: 0.46, b: 0.22, roughness: 0.32, metalness: 0.15, emissive: 0 };
          }
          return { r: 0.98, g: 0.22, b: 0.24, roughness: 0.32, metalness: 0.05, emissive: 0.04 };
        }
        // Center Tablet OLED Screen (top)
        if (ny > 0.82) {
          if (Math.abs(nx) > 0.29 || Math.abs(nz) > 0.41) {
            return { r: 0.04, g: 0.045, b: 0.055, roughness: 0.08, metalness: 0.1, emissive: 0 };
          }
          const sky = nz < 0.12;
          if (sky) return { r: 0.18, g: 0.62, b: 0.98, roughness: 0.08, metalness: 0.05, emissive: 0.28 };
          return { r: 0.22, g: 0.78, b: 0.26, roughness: 0.08, metalness: 0.05, emissive: 0.24 };
        }
        // Bottom shell
        if (ny < 0.14) return { r: 0.14, g: 0.15, b: 0.17, roughness: 0.45, metalness: 0.12, emissive: 0 };
        // Internal electronics: copper heatpipe + battery + emerald PCB + gold traces
        if (Math.abs(nz + 0.08) < 0.08 && ny > 0.44 && ny < 0.68) {
          return { r: 0.88, g: 0.46, b: 0.18, roughness: 0.22, metalness: 0.92, emissive: 0 };
        }
        if (nx < -0.04) return { r: 0.10, g: 0.11, b: 0.13, roughness: 0.5, metalness: 0.2, emissive: 0 };
        const gold = Math.abs(Math.sin(nx * 85)) > 0.95 || Math.abs(Math.sin(nz * 70)) > 0.95;
        return gold
          ? { r: 0.96, g: 0.78, b: 0.20, roughness: 0.22, metalness: 0.92, emissive: 0 }
          : { r: 0.05, g: 0.44, b: 0.20, roughness: 0.30, metalness: 0.14, emissive: 0 };
      },
      createOuterGeometry() {
        return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 12);
      },
    };
  }

  // 3. Swiss Cheese (Queijo Suíço com furos ocos reais!)
  if (norm.includes('queij') || norm.includes('cheese')) {
    const holes = [
      [-0.22, 0.48, 0.14, 0.14],
      [0.18, 0.55, -0.10, 0.15],
      [0.02, 0.32, 0.24, 0.12],
      [-0.08, 0.72, -0.22, 0.12],
      [0.30, 0.38, 0.18, 0.11],
      [-0.30, 0.62, -0.12, 0.11],
    ];
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Swiss Cheese Block',
      subtitle: 'Queijo amarelo dourado com furos ocos reais em 3D',
      bounds: { w: 2.24, h: 1.06, d: 1.56 },
      gridRes: { x: 96, y: 52, z: 72 },
      physics: { restitution: 0.14, friction: 0.66, cohesion: 0.72, density: 1.08, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1 || Math.abs(nx) > 0.5 || Math.abs(nz) > 0.5) return false;
        for (const [hx, hy, hz, hr] of holes) {
          if (Math.hypot((nx - hx) * 1.1, (ny - hy) * 0.85, (nz - hz) * 1.1) < hr) return false;
        }
        return true;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 16, ny * 16, nz * 16, 2);
        const rind = ny < 0.05 || ny > 0.95 || Math.abs(nx) > 0.47 || Math.abs(nz) > 0.47;
        return rind
          ? { r: 0.90, g: 0.68, b: 0.14, roughness: 0.52, metalness: 0.0, emissive: 0 }
          : { r: lerp(0.96, 1.0, n), g: lerp(0.78, 0.86, n), b: lerp(0.18, 0.30, n), roughness: 0.36, metalness: 0.0, emissive: 0.02 };
      },
      createOuterGeometry() {
        return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 16);
      },
    };
  }

  // 4. Chocolate Bar (Barra de Chocolate com quadradinhos e recheio caramelo)
  if (norm.includes('chocolat')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Caramel Filled Chocolate Bar',
      subtitle: 'Tablete de chocolate ao leite com recheio cremoso de caramelo',
      bounds: { w: 2.38, h: 0.72, d: 1.48 },
      gridRes: { x: 108, y: 44, z: 72 },
      physics: { restitution: 0.18, friction: 0.54, cohesion: 0.66, density: 1.3, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1 || Math.abs(nx) > 0.5 || Math.abs(nz) > 0.5) return false;
        // Molded 4x3 chocolate pip grooves on top
        const gx = Math.abs(fract((nx + 0.5) * 4) - 0.5);
        const gz = Math.abs(fract((nz + 0.5) * 3) - 0.5);
        const groove = smoothstep(0.36, 0.50, Math.max(gx, gz));
        return ny <= 1.0 - groove * 0.24;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 18, ny * 18, nz * 18, 2);
        const isCaramelCore = ny > 0.22 && ny < 0.68 && Math.abs(nx) < 0.43 && Math.abs(nz) < 0.42;
        if (isCaramelCore) {
          // Creamy caramel + crunchy hazelnut flecks
          const nut = smoothstep(0.72, 0.86, n);
          return {
            r: lerp(0.84, 0.96, nut),
            g: lerp(0.50, 0.80, nut),
            b: lerp(0.14, 0.46, nut),
            roughness: 0.22,
            metalness: 0.02,
            emissive: 0.02,
          };
        }
        return { r: 0.24 + n * 0.04, g: 0.12 + n * 0.02, b: 0.06 + n * 0.02, roughness: 0.24, metalness: 0.04, emissive: 0 };
      },
      createOuterGeometry() {
        const { w, h, d } = this.bounds;
        const geo = new THREE.BoxGeometry(w, h, d, 56, 14, 42);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const yRaw = pos.getY(i) + h * 0.5;
          const z = pos.getZ(i);
          const gx = Math.abs(fract((x / w + 0.5) * 4) - 0.5);
          const gz = Math.abs(fract((z / d + 0.5) * 3) - 0.5);
          const groove = smoothstep(0.36, 0.50, Math.max(gx, gz));
          pos.setXYZ(i, x, (yRaw / h) * (1.0 - groove * 0.24) * h, z);
        }
        geo.computeVertexNormals();
        return geo;
      },
    };
  }

  // 5. Sushi Roll (Uramaki de Salmão)
  if (norm.includes('sushi') || norm.includes('uramaki') || norm.includes('temaki')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Salmon Sushi Roll',
      subtitle: 'Arroz com gergelim + alga nori + recheio de salmão, cream cheese e abacate',
      bounds: { w: 2.30, h: 1.08, d: 1.24 },
      gridRes: { x: 100, y: 56, z: 60 },
      physics: { restitution: 0.12, friction: 0.72, cohesion: 0.78, density: 1.05, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1 || Math.abs(nx) > 0.5) return false;
        const r = Math.hypot((ny - 0.5) / 0.5, nz / 0.5);
        return r <= 1.0;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 28, ny * 28, nz * 28, 2);
        const r = Math.hypot((ny - 0.5) / 0.5, nz / 0.5);
        // Outer white sticky rice + black sesame seeds
        if (r > 0.66) {
          const sesame = r > 0.92 && Math.sin(nx * 55) * Math.sin(ny * 45 + nz * 45) > 0.86;
          if (sesame) return { r: 0.08, g: 0.08, b: 0.09, roughness: 0.45, metalness: 0, emissive: 0 };
          return { r: lerp(0.92, 0.99, n), g: lerp(0.92, 0.98, n), b: lerp(0.89, 0.95, n), roughness: 0.52, metalness: 0, emissive: 0 };
        }
        // Dark green nori seaweed ring
        if (r > 0.56) {
          return { r: 0.05, g: 0.16, b: 0.08, roughness: 0.62, metalness: 0, emissive: 0 };
        }
        // Inner fillings: Salmon (top-right), Avocado (bottom-left), Cream Cheese (bottom-right)
        if (ny >= 0.48) {
          const vein = Math.abs(fract(nx * 6 + ny * 3) - 0.5) < 0.08;
          return vein
            ? { r: 0.99, g: 0.90, b: 0.84, roughness: 0.25, metalness: 0, emissive: 0 }
            : { r: 0.96, g: 0.42, b: 0.24, roughness: 0.26, metalness: 0, emissive: 0 };
        }
        if (nz < 0) {
          return { r: 0.44, g: 0.78, b: 0.24, roughness: 0.34, metalness: 0, emissive: 0 };
        }
        return { r: 0.98, g: 0.96, b: 0.90, roughness: 0.28, metalness: 0, emissive: 0 };
      },
      createOuterGeometry() {
        const { w, h, d } = this.bounds;
        const geo = new THREE.CylinderGeometry(0.5, 0.5, w, 40, 20);
        geo.rotateZ(Math.PI * 0.5);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          pos.setXYZ(i, pos.getX(i), clamp((pos.getY(i) + 0.5) * h, 0, h), pos.getZ(i) * d);
        }
        geo.computeVertexNormals();
        return geo;
      },
    };
  }

  // 6. Pokéball (Pokébola com núcleo de energia brilhante)
  if (norm.includes('pokeb') || norm.includes('pokemon')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Pokeball with Crystal Core',
      subtitle: 'Topo vermelho + base branca + faixa preta + núcleo energético ciano',
      bounds: { w: 1.66, h: 1.60, d: 1.66 },
      gridRes: { x: 100, y: 100, z: 100 },
      physics: { restitution: 0.34, friction: 0.36, cohesion: 0.48, density: 1.6, soundProfile: 'plastic' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const r = Math.hypot(nx / 0.49, (ny - 0.49) / 0.50, nz / 0.49);
        return r <= 1.0;
      },
      sampleVolume(nx, ny, nz) {
        const r = Math.hypot(nx / 0.49, (ny - 0.49) / 0.50, nz / 0.49);
        // Glowing electric energy core inside!
        if (r < 0.34) {
          return { r: 0.28, g: 0.92, b: 1.0, roughness: 0.12, metalness: 0.1, emissive: 0.45 };
        }
        if (r < 0.74) {
          const ring = Math.sin(r * 35) > 0;
          return ring
            ? { r: 0.72, g: 0.76, b: 0.82, roughness: 0.24, metalness: 0.88, emissive: 0 }
            : { r: 0.16, g: 0.18, b: 0.24, roughness: 0.38, metalness: 0.65, emissive: 0 };
        }
        // Front center button
        if (nz > 0.36 && Math.hypot(nx, ny - 0.50) < 0.13) {
          return Math.hypot(nx, ny - 0.50) < 0.08
            ? { r: 0.98, g: 0.98, b: 1.0, roughness: 0.12, metalness: 0.1, emissive: 0.22 }
            : { r: 0.06, g: 0.06, b: 0.08, roughness: 0.22, metalness: 0.2, emissive: 0 };
        }
        if (Math.abs(ny - 0.50) < 0.065) {
          return { r: 0.06, g: 0.06, b: 0.08, roughness: 0.24, metalness: 0.15, emissive: 0 };
        }
        return ny > 0.50
          ? { r: 0.92, g: 0.12, b: 0.16, roughness: 0.14, metalness: 0.08, emissive: 0 }
          : { r: 0.96, g: 0.96, b: 0.97, roughness: 0.14, metalness: 0.06, emissive: 0 };
      },
      createOuterGeometry() {
        return makeSphereGeo(this.bounds.w, this.bounds.h, this.bounds.d);
      },
    };
  }

  // 7. Lava / Magma Rock (Rocha vulcânica com magma incandescente por dentro)
  if (norm.includes('lava') || norm.includes('magma') || norm.includes('vulc')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Molten Magma Obsidian Rock',
      subtitle: 'Crosta vulcânica rachada escondendo núcleo de lava incandescente',
      bounds: { w: 2.12, h: 1.18, d: 1.72 },
      gridRes: { x: 96, y: 56, z: 76 },
      physics: { restitution: 0.24, friction: 0.62, cohesion: 0.56, density: 2.8, soundProfile: 'crystal' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const crag = (fbm3(nx * 6, ny * 6, nz * 6, 3) - 0.5) * 0.18;
        return Math.hypot(nx / 0.47, (ny - 0.04) / 0.90, nz / 0.47) + crag <= 0.98;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 14, ny * 14, nz * 14, 3);
        const r = Math.hypot(nx / 0.47, (ny - 0.04) / 0.90, nz / 0.47);
        const crack = Math.abs(n - 0.5) < 0.045;
        if (r > 0.72 && !crack) {
          return { r: 0.10 + n * 0.08, g: 0.09 + n * 0.06, b: 0.10 + n * 0.06, roughness: 0.90, metalness: 0.08, emissive: 0 };
        }
        const heat = clamp(1.0 - r * 1.05 + n * 0.35, 0, 1);
        return {
          r: 1.0,
          g: lerp(0.18, 0.92, heat),
          b: lerp(0.02, 0.32, heat * heat),
          roughness: 0.32,
          metalness: 0.04,
          emissive: lerp(0.35, 0.85, heat),
        };
      },
      createOuterGeometry() {
        return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 6);
      },
    };
  }

  // 8. Stacked Pancakes (Panquecas com manteiga e mel)
  if (norm.includes('panquec') || norm.includes('pancak') || norm.includes('waffle')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Stacked Butter Pancakes',
      subtitle: '6 panquecas douradas com manteiga derretendo e calda de bordo',
      bounds: { w: 1.98, h: 1.24, d: 1.98 },
      gridRes: { x: 96, y: 64, z: 96 },
      physics: { restitution: 0.10, friction: 0.74, cohesion: 0.78, density: 0.85, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const r = Math.hypot(nx, nz);
        if (ny > 0.88) return Math.abs(nx) < 0.14 && Math.abs(nz) < 0.14; // Butter pat on top!
        const layerWave = Math.sin(ny * 6 * Math.PI) * 0.035;
        return r <= 0.46 + layerWave;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 24, ny * 24, nz * 24, 2);
        if (ny > 0.88) return { r: 0.99, g: 0.88, b: 0.34, roughness: 0.22, metalness: 0, emissive: 0.02 };
        const layerFrac = fract(ny * 6.8);
        const r = Math.hypot(nx, nz);
        // Dripping amber maple syrup on top rim & sides
        if (ny > 0.82 && r < 0.38) return { r: 0.68, g: 0.30, b: 0.04, roughness: 0.10, metalness: 0.05, emissive: 0.04 };
        // Golden toasted crust between every pancake
        if (layerFrac < 0.16 || layerFrac > 0.84) {
          return { r: 0.72 + n * 0.10, g: 0.42 + n * 0.08, b: 0.14 + n * 0.04, roughness: 0.56, metalness: 0, emissive: 0 };
        }
        // Fluffy pale vanilla pancake sponge inside
        return { r: 0.96, g: 0.86, b: 0.60, roughness: 0.78, metalness: 0, emissive: 0 };
      },
      createOuterGeometry() {
        return makeCylinderGeo(this.bounds.w, this.bounds.h * 0.88, this.bounds.d);
      },
    };
  }

  // 9. Wagyu Steak (Bife marmorizado)
  if (norm.includes('bife') || norm.includes('wagyu') || norm.includes('carne') || norm.includes('steak')) {
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Marbled Wagyu Steak',
      subtitle: 'Crosta selada por fora + marmoreio A5 vermelho e branco por dentro',
      bounds: { w: 2.36, h: 0.84, d: 1.54 },
      gridRes: { x: 104, y: 48, z: 72 },
      physics: { restitution: 0.14, friction: 0.66, cohesion: 0.72, density: 1.1, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        if (ny < 0 || ny > 1) return false;
        const ax = Math.abs(nx * 2);
        const az = Math.abs(nz * 2);
        return Math.pow(ax, 8) + Math.pow(az, 8) <= 1.02;
      },
      sampleVolume(nx, ny, nz) {
        const n1 = fbm3(nx * 14, ny * 14, nz * 14, 3);
        const n2 = fbm3(nx * 24 + 5, ny * 24 + 2, nz * 24 + 7, 2);
        const crust = ny < 0.07 || ny > 0.93 || Math.hypot(nx * 1.9, nz * 1.9) > 0.94;
        if (crust) return { r: 0.26 + n1 * 0.08, g: 0.14 + n1 * 0.04, b: 0.09 + n1 * 0.03, roughness: 0.56, metalness: 0.02, emissive: 0 };
        const marble = smoothstep(0.56, 0.72, Math.abs(Math.sin(nx * 16 + nz * 12 + n1 * 6)) * 0.6 + n2 * 0.55);
        return {
          r: lerp(0.76, 0.98, marble),
          g: lerp(0.14, 0.88, marble),
          b: lerp(0.16, 0.82, marble),
          roughness: lerp(0.32, 0.24, marble),
          metalness: 0.02,
          emissive: 0,
        };
      },
      createOuterGeometry() {
        return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 8);
      },
    };
  }

  // 10. Brick "Is It Cake?" (Tijolo que é bolo)
  if (norm.includes('tijol') || norm.includes('brick')) {
    const layers = [
      [0.96, 0.24, 0.44],
      [0.99, 0.86, 0.24],
      [0.18, 0.80, 0.62],
      [0.36, 0.42, 0.96],
      [0.86, 0.24, 0.88],
    ];
    return {
      id: 'prompt-custom',
      slug,
      name: prompt,
      englishName: 'Hyper-Real Brick Cake',
      subtitle: 'Tijolo rústico de barro por fora que revela bolo colorido por dentro',
      bounds: { w: 2.34, h: 0.98, d: 1.38 },
      gridRes: { x: 104, y: 52, z: 68 },
      physics: { restitution: 0.10, friction: 0.74, cohesion: 0.78, density: 0.9, soundProfile: 'culinary' },
      contains(nx, ny, nz) {
        return ny >= 0 && ny <= 1 && Math.abs(nx) <= 0.5 && Math.abs(nz) <= 0.5;
      },
      sampleVolume(nx, ny, nz) {
        const n = fbm3(nx * 24, ny * 24, nz * 24, 2);
        const shell = Math.abs(nx) > 0.455 || Math.abs(nz) > 0.455 || ny > 0.91 || ny < 0.06;
        if (shell) {
          return { r: 0.68 + n * 0.12, g: 0.26 + n * 0.06, b: 0.15 + n * 0.04, roughness: 0.88, metalness: 0, emissive: 0 };
        }
        const pos = ((ny - 0.06) / 0.85) * layers.length;
        const idx = Math.min(layers.length - 1, Math.floor(pos));
        const local = pos - idx;
        if (local < 0.18) return { r: 0.98, g: 0.96, b: 0.92, roughness: 0.36, metalness: 0, emissive: 0 };
        const c = layers[idx];
        return { r: c[0], g: c[1], b: c[2], roughness: 0.74, metalness: 0, emissive: 0.02 };
      },
      createOuterGeometry() {
        return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 20);
      },
    };
  }

  // --- Universal Semantic Composer (generates ANY arbitrary user prompt!) ---
  const seed = hashString(norm || 'mystery');
  const matchedColors = [];
  let isMetallic = false;
  for (const entry of COLOR_DICT) {
    if (entry.keys.some((k) => norm.includes(k))) {
      matchedColors.push(entry.rgb);
      if (entry.metal) isMetallic = true;
    }
  }
  const isRainbow = norm.includes('arco') || norm.includes('rainbow') || norm.includes('colorid');
  const isNeon = norm.includes('neon') || norm.includes('brilh') || norm.includes('glow') || norm.includes('laser');
  const isCrystal = norm.includes('cristal') || norm.includes('diamant') || norm.includes('gelo') || norm.includes('vidro') || norm.includes('gema') || norm.includes('esmerald') || norm.includes('rubi');
  const isTech = norm.includes('tech') || norm.includes('robo') || norm.includes('chip') || norm.includes('pc') || norm.includes('relog') || norm.includes('celular') || norm.includes('tablet');
  const isHollow = norm.includes('oco') || norm.includes('hollow') || norm.includes('cavidad');

  // Pick crisp exterior & contrasting interior colors from prompt or deterministic vivid palette
  const fallbackPalette = [
    [0.92, 0.20, 0.34],
    [0.12, 0.72, 0.94],
    [0.98, 0.62, 0.10],
    [0.58, 0.24, 0.94],
    [0.16, 0.80, 0.42],
    [0.96, 0.30, 0.64],
  ];
  const extCol = matchedColors[0] || fallbackPalette[seed % fallbackPalette.length];
  const intCol1 = matchedColors[1] || fallbackPalette[(seed + 2) % fallbackPalette.length];
  const intCol2 = matchedColors[2] || [0.98, 0.95, 0.88];

  // Shape inference
  let shapeKind = 'box';
  if (norm.includes('bola') || norm.includes('esfer') || norm.includes('ball') || norm.includes('planeta') || norm.includes('ovo') || norm.includes('maca') || norm.includes('laranja')) {
    shapeKind = 'sphere';
  } else if (norm.includes('cilindr') || norm.includes('lata') || norm.includes('copo') || norm.includes('vela') || norm.includes('tronco') || norm.includes('torre')) {
    shapeKind = 'cylinder';
  }

  const bounds =
    shapeKind === 'sphere' ? { w: 1.66, h: 1.60, d: 1.66 } :
    shapeKind === 'cylinder' ? { w: 1.76, h: 1.32, d: 1.76 } :
    isTech ? { w: 2.36, h: 0.56, d: 1.42 } :
    { w: 2.18, h: 1.06, d: 1.54 };

  const soundProfile = isCrystal ? 'crystal' : isMetallic ? 'metal' : isTech ? 'tech' : 'culinary';

  return {
    id: 'prompt-custom',
    slug,
    name: prompt || 'Objeto Personalizado',
    englishName: prompt || 'Custom 3D Object',
    subtitle: `Gerado dinamicamente • Interior volumétrico (${soundProfile})`,
    bounds,
    gridRes: { x: 100, y: 60, z: 72 },
    physics: {
      restitution: isCrystal || isTech ? 0.28 : 0.16,
      friction: isCrystal || isMetallic ? 0.38 : 0.62,
      cohesion: isCrystal || isMetallic ? 0.48 : 0.70,
      density: isMetallic ? 5.0 : 1.2,
      soundProfile,
    },
    contains(nx, ny, nz) {
      if (ny < 0 || ny > 1) return false;
      if (shapeKind === 'sphere') {
        const r = Math.hypot(nx / 0.49, (ny - 0.49) / 0.50, nz / 0.49);
        if (r > 1.0) return false;
        if (isHollow && r < 0.34) return false;
        return true;
      }
      if (shapeKind === 'cylinder') {
        const r = Math.hypot(nx / 0.48, nz / 0.48);
        if (r > 1.0) return false;
        if (isHollow && r < 0.28 && ny > 0.18 && ny < 0.85) return false;
        return true;
      }
      const ax = Math.abs(nx * 2);
      const az = Math.abs(nz * 2);
      if (ax > 1 || az > 1) return false;
      if (isHollow && Math.hypot(nx, ny - 0.5, nz) < 0.24) return false;
      return Math.pow(ax, 12) + Math.pow(az, 12) <= 1.02;
    },
    sampleVolume(nx, ny, nz) {
      const n = fbm3(nx * 16 + (seed % 11), ny * 16, nz * 16, 3);
      const distEdge =
        shapeKind === 'sphere' ? 1.0 - Math.hypot(nx / 0.49, (ny - 0.49) / 0.50, nz / 0.49) :
        shapeKind === 'cylinder' ? Math.min(1.0 - Math.hypot(nx / 0.48, nz / 0.48), ny, 1.0 - ny) :
        Math.min(0.5 - Math.abs(nx), 0.5 - Math.abs(nz), ny, 1.0 - ny);

      // Crisp outer shell
      if (distEdge < 0.085) {
        return {
          r: clamp(extCol[0] * (0.92 + n * 0.16), 0, 1),
          g: clamp(extCol[1] * (0.92 + n * 0.16), 0, 1),
          b: clamp(extCol[2] * (0.92 + n * 0.16), 0, 1),
          roughness: isCrystal ? 0.10 : isMetallic ? 0.22 : 0.34,
          metalness: isMetallic ? 0.90 : 0.08,
          emissive: isNeon ? 0.22 : 0.0,
        };
      }

      // Rich contrasting volumetric interior!
      if (isRainbow) {
        const hue = fract(ny * 1.1 + 0.05);
        const col = new THREE.Color().setHSL(hue, 0.92, 0.52);
        return { r: col.r, g: col.g, b: col.b, roughness: 0.45, metalness: 0.04, emissive: isNeon ? 0.25 : 0.04 };
      }
      if (isCrystal) {
        const facet = Math.abs(Math.sin(nx * 24 + ny * 18) * Math.cos(nz * 22 - ny * 16));
        return {
          r: lerp(intCol1[0], 0.98, facet * 0.55),
          g: lerp(intCol1[1], 0.98, facet * 0.55),
          b: lerp(intCol1[2], 1.0, facet * 0.55),
          roughness: 0.09,
          metalness: 0.14,
          emissive: 0.22 * facet + 0.08,
        };
      }
      if (isTech) {
        const trace = Math.abs(Math.sin(nx * 80)) > 0.94 || Math.abs(Math.sin(nz * 70)) > 0.94;
        return trace
          ? { r: 0.96, g: 0.78, b: 0.20, roughness: 0.20, metalness: 0.92, emissive: 0.0 }
          : { r: 0.06, g: 0.45, b: 0.22, roughness: 0.30, metalness: 0.16, emissive: 0.0 };
      }

      // Layered / marbled vivid interior contrast
      const stripe = Math.sin(ny * 22.0 + n * 3.0) > 0.1;
      const c = stripe ? intCol1 : intCol2;
      return {
        r: clamp(c[0] * (0.92 + n * 0.14), 0, 1),
        g: clamp(c[1] * (0.92 + n * 0.14), 0, 1),
        b: clamp(c[2] * (0.92 + n * 0.14), 0, 1),
        roughness: isMetallic ? 0.24 : 0.42,
        metalness: isMetallic ? 0.85 : 0.05,
        emissive: isNeon ? 0.30 : 0.02,
      };
    },
    createOuterGeometry() {
      if (shapeKind === 'sphere') return makeSphereGeo(this.bounds.w, this.bounds.h, this.bounds.d);
      if (shapeKind === 'cylinder') return makeCylinderGeo(this.bounds.w, this.bounds.h, this.bounds.d);
      return makeRoundedBoxGeo(this.bounds.w, this.bounds.h, this.bounds.d, 12);
    },
  };
}
