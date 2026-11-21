import * as THREE from 'three';
import { customSurface } from './custom-surface.js';
import { customEnvironment } from './custom-environment.js';

export const BOARD_W = 4.55;
export const BOARD_D = 3.35;
export const BOARD_H = 0.24;

// --- DECOUPLED CUTTING SURFACES ---
export const SURFACE_LIST = [
  { id: 'honey-wood',      name: 'Honey Oak Wood',           subtitle: 'Classic viral oak cutting board with natural grain', surfaceAudio: 'wood' },
  { id: 'rustic-wood',     name: 'Dark Walnut Wood',         subtitle: 'Artisan dark rustic walnut slab', surfaceAudio: 'wood' },
  { id: 'tempered-glass',  name: 'Tempered Glass',           subtitle: 'Translucent jade-edged glass cutting board', surfaceAudio: 'glass' },
  { id: 'banana-leaf',     name: 'Banana Leaf 🌿',           subtitle: 'Giant tropical leaf resting on dark wood', surfaceAudio: 'leaf' },
  { id: 'obsidian-marble', name: 'Black & Gold Marble',      subtitle: 'Polished obsidian stone with liquid gold veins', surfaceAudio: 'stone' },
  { id: 'white-marble',    name: 'White Carrara Marble',     subtitle: 'Luxury white marble with delicate grey veins', surfaceAudio: 'stone' },
  { id: 'brushed-steel',   name: 'Brushed Stainless Steel',  subtitle: 'Industrial Michelin-kitchen chef surface', surfaceAudio: 'metal' },
  { id: 'ice-block',       name: 'Arctic Ice Block ❄️',      subtitle: 'Translucent gleaming crystalline ice slab', surfaceAudio: 'ice' },
  { id: 'pink-terrazzo',   name: 'Pastel Terrazzo Stone',    subtitle: 'Modern pale stone speckled with colorful chips', surfaceAudio: 'stone' },
  { id: 'neon-grid',       name: 'Cyberpunk Neon Base',      subtitle: 'Matte black board with glowing cyan edge', surfaceAudio: 'glass' },
];

// --- DECOUPLED STUDIO BACKGROUNDS & LIGHTING ---
export const ENVIRONMENT_LIST = [
  { id: 'classic-viral',    name: 'Viral Tile Kitchen',       subtitle: 'Dark emerald subway tiles + warm studio light', defaultSurface: 'honey-wood' },
  { id: 'glass-lab',        name: 'White Minimalist Lab',     subtitle: 'Crisp bright tiles + clean studio softbox', defaultSurface: 'tempered-glass' },
  { id: 'tropical-leaf',    name: 'Warm Tropical Cabin',      subtitle: 'Rustic wood + golden sunlight glow', defaultSurface: 'banana-leaf' },
  { id: 'luxury-obsidian',  name: 'Luxury Obsidian Studio',   subtitle: 'Matte obsidian backdrop + golden rim light', defaultSurface: 'obsidian-marble' },
  { id: 'pro-kitchen',      name: 'Industrial Steel Kitchen', subtitle: 'Brushed dark steel + crisp precision light', defaultSurface: 'brushed-steel' },
  { id: 'frozen-block',     name: 'Frozen Arctic Studio',     subtitle: 'Crystalline icy blue studio atmosphere', defaultSurface: 'ice-block' },
  { id: 'cyberpunk-neon',   name: 'Cyberpunk Neon Studio',    subtitle: 'Dark studio with vivid cyan & magenta lights', defaultSurface: 'neon-grid' },
  { id: 'sunset-terracotta',name: 'Terracotta Sunset Atelier',subtitle: 'Warm amber studio + golden sunset glow', defaultSurface: 'white-marble' },
];

export const RANDOM_SURFACE_PROMPTS = [
  'Deep purple marble with gold veins',
  'Natural green Japanese bamboo board',
  'Neon blue glowing glass slab',
  'Black volcanic stone with ember cracks',
  'Luxury brushed 24k gold plate',
  'Pastel pink marble block',
];

export const RANDOM_ENV_PROMPTS = [
  'Cyberpunk neon purple and cyan studio',
  'Cozy warm cream retro kitchen',
  'Futuristic blue lighting lab',
  'Dramatic dark crimson studio',
  'Emerald green forest studio',
];

function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseHexColor(norm, fallback) {
  if (norm.includes('rox') || norm.includes('purple') || norm.includes('violet')) return '#6d28d9';
  if (norm.includes('rosa') || norm.includes('pink') || norm.includes('magenta')) return '#db2777';
  if (norm.includes('vermelh') || norm.includes('red') || norm.includes('rubi')) return '#b91c1c';
  if (norm.includes('laranj') || norm.includes('orange') || norm.includes('terracot') || norm.includes('ambar')) return '#c2410c';
  if (norm.includes('ouro') || norm.includes('dourad') || norm.includes('gold')) return '#d4a334';
  if (norm.includes('verd') || norm.includes('green') || norm.includes('bambu') || norm.includes('florest')) return '#1e6b3a';
  if (norm.includes('ciano') || norm.includes('cyan') || norm.includes('gelo')) return '#0ea5e9';
  if (norm.includes('azul') || norm.includes('blue')) return '#1d4ed8';
  if (norm.includes('branc') || norm.includes('white') || norm.includes('claro') || norm.includes('creme') || norm.includes('bege')) return '#e7e4dc';
  if (norm.includes('pret') || norm.includes('black') || norm.includes('escuro') || norm.includes('obsidian')) return '#111318';
  return fallback;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeWoodTexture(baseHex, grainHex, warm = true) {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  const planks = 6;
  const plankH = 512 / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = p % 2 === 0 ? 'rgba(255,245,220,0.06)' : 'rgba(60,30,10,0.06)';
    ctx.fillRect(0, p * plankH, 512, plankH);
    ctx.fillStyle = 'rgba(40,22,8,0.18)';
    ctx.fillRect(0, p * plankH, 512, 1.5);
  }

  for (let i = 0; i < 420; i++) {
    const y = (i / 420) * 512;
    ctx.strokeStyle = grainHex;
    ctx.globalAlpha = 0.05 + (Math.sin(i * 1.9) * 0.5 + 0.5) * 0.11;
    ctx.lineWidth = 0.8 + (i % 3) * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.015 + i * 0.17) * (warm ? 3.2 : 1.8));
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeSubwayTileTexture(tileColor, groutColor, variation = 14) {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 4;
  const tw = 512 / cols;
  const th = 512 / rows;
  const gap = 4;
  const baseCol = new THREE.Color(tileColor);

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (tw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * tw + offset;
      const y = r * th;
      const jitter = (Math.sin(r * 19.3 + col * 7.7) * 0.5 + 0.5 - 0.5) * (variation / 255);
      const tc = baseCol.clone().offsetHSL(0, 0, jitter);
      const grad = ctx.createLinearGradient(x, y, x, y + th);
      grad.addColorStop(0, '#' + tc.clone().offsetHSL(0, 0, 0.025).getHexString());
      grad.addColorStop(0.5, '#' + tc.getHexString());
      grad.addColorStop(1, '#' + tc.clone().offsetHSL(0, 0, -0.02).getHexString());
      ctx.fillStyle = grad;
      ctx.fillRect(x + gap * 0.5, y + gap * 0.5, tw - gap, th - gap);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 2.2);
  tex.anisotropy = 8;
  return tex;
}

function makeMarbleTexture(bgA, bgB, veinColor, veinColor2) {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, bgA);
  grad.addColorStop(0.5, bgB);
  grad.addColorStop(1, bgA);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let v = 0; v < 12; v++) {
    ctx.beginPath();
    let x = (v * 67) % 512;
    let y = 0;
    ctx.moveTo(x, y);
    for (let step = 0; step <= 48; step++) {
      y = (step / 48) * 512;
      x += Math.sin(step * 0.35 + v * 2.1) * 14 + Math.cos(step * 0.8 + v) * 5;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = v % 3 === 0 ? veinColor : veinColor2;
    ctx.lineWidth = v % 3 === 0 ? 2.4 : 1.1;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeTerrazzoTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5ece6';
  ctx.fillRect(0, 0, 512, 512);
  const chips = ['#e899a8', '#e5b869', '#7eb8b0', '#c7826b', '#5d6b7a'];
  for (let i = 0; i < 260; i++) {
    const x = (i * 73 + 17) % 512;
    const y = (i * 131 + 29) % 512;
    const sz = 5 + (i % 11);
    ctx.fillStyle = chips[i % chips.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sz, y + (i % 5) - 2);
    ctx.lineTo(x + sz * 0.6, y + sz);
    ctx.lineTo(x - sz * 0.3, y + sz * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeBrushedMetalTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9ea6b0';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const v = 135 + Math.floor((Math.sin(y * 1.7) * 0.5 + 0.5) * 38 + (Math.sin(y * 7.3) * 0.5 + 0.5) * 18);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 7})`;
    ctx.fillRect(0, y, 512, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeBananaLeafTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#1e5b27');
  grad.addColorStop(0.5, '#2d7a36');
  grad.addColorStop(1, '#1c5324');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = -30; i < 65; i++) {
    const x = i * 11;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(128,215,104,0.22)' : 'rgba(12,48,18,0.26)';
    ctx.lineWidth = i % 3 === 0 ? 2.1 : 1.1;
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 90, 0);
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 90, 512);
    ctx.stroke();
  }

  const rib = ctx.createLinearGradient(0, 244, 0, 268);
  rib.addColorStop(0, 'rgba(38,108,42,0.1)');
  rib.addColorStop(0.5, 'rgba(168,224,118,0.88)');
  rib.addColorStop(1, 'rgba(38,108,42,0.1)');
  ctx.fillStyle = rib;
  ctx.fillRect(0, 244, 512, 24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeIceTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#bfe8ff');
  grad.addColorStop(0.5, '#dff5ff');
  grad.addColorStop(1, '#9ad5f7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 28; i++) {
    const x0 = (i * 89) % 512;
    const y0 = (i * 137) % 512;
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(i * 1.4) * 95, y0 + Math.sin(i * 1.4) * 95);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeNeonGridTexture() {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0f18';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(244, 63, 142, 0.65)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 504);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Manages cutting surface (Board/Leaf/Glass/Marble/Ice) and Studio Environment (Backdrop + Lighting)
 * independently so users can mix & match any combination or type custom descriptions!
 */
export class EnvironmentManager {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.currentPresetId = 'classic-viral';
    this.currentSurfaceId = 'honey-wood';
    this.surfaceAudio = 'wood';
    this.recoilOffset = 0;
    this.recoilVel = 0;

    this.textures = {
      honeyWood: makeWoodTexture('#c89c67', '#7b4f26', true),
      rusticWood: makeWoodTexture('#5c3921', '#2a1609', true),
      darkTiles: makeSubwayTileTexture('#1b302a', '#0c1613', 14),
      lightTiles: makeSubwayTileTexture('#e8edf2', '#cfd7df', 8),
      obsidian: makeMarbleTexture('#0b0c10', '#161820', 'rgba(235,192,92,0.62)', 'rgba(198,154,68,0.28)'),
      whiteMarble: makeMarbleTexture('#f4f5f7', '#e8ebef', 'rgba(120,130,145,0.42)', 'rgba(160,170,185,0.22)'),
      steel: makeBrushedMetalTexture(),
      bananaLeaf: makeBananaLeafTexture(),
      ice: makeIceTexture(),
      terrazzo: makeTerrazzoTexture(),
      neonGrid: makeNeonGridTexture(),
    };

    this.boardGroup = new THREE.Group();
    this.group.add(this.boardGroup);

    const boardGeo = new THREE.BoxGeometry(BOARD_W, BOARD_H, BOARD_D);
    this.boardMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
    this.boardMesh = new THREE.Mesh(boardGeo, this.boardMat);
    this.boardMesh.position.y = -BOARD_H * 0.5;
    this.boardMesh.receiveShadow = true;
    this.boardMesh.castShadow = true;
    this.boardGroup.add(this.boardMesh);

    const rimGeo = new THREE.BoxGeometry(BOARD_W + 0.05, BOARD_H * 0.35, BOARD_D + 0.05);
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x3b2816, roughness: 0.6, metalness: 0.1 });
    this.rimMesh = new THREE.Mesh(rimGeo, this.rimMat);
    this.rimMesh.position.y = -BOARD_H + BOARD_H * 0.175;
    this.rimMesh.receiveShadow = true;
    this.boardGroup.add(this.rimMesh);

    const leafGeo = new THREE.PlaneGeometry(BOARD_W * 0.98, BOARD_D * 0.96, 28, 20);
    leafGeo.rotateX(-Math.PI * 0.5);
    const lpos = leafGeo.attributes.position;
    for (let i = 0; i < lpos.count; i++) {
      const lx = lpos.getX(i);
      const lz = lpos.getZ(i);
      const edge = Math.max(Math.abs(lx / (BOARD_W * 0.49)), Math.abs(lz / (BOARD_D * 0.48)));
      const curl = Math.max(0, edge - 0.80) * 0.16;
      lpos.setY(i, curl * curl * 2.0);
    }
    leafGeo.computeVertexNormals();
    this.leafMat = new THREE.MeshStandardMaterial({
      map: this.textures.bananaLeaf,
      roughness: 0.36,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    this.leafMesh = new THREE.Mesh(leafGeo, this.leafMat);
    this.leafMesh.position.y = 0.002;
    this.leafMesh.receiveShadow = true;
    this.leafMesh.visible = false;
    this.boardGroup.add(this.leafMesh);

    const counterGeo = new THREE.BoxGeometry(24, 0.8, 20);
    this.counterMat = new THREE.MeshStandardMaterial({ color: 0x161b1c, roughness: 0.62, metalness: 0.12 });
    this.counterMesh = new THREE.Mesh(counterGeo, this.counterMat);
    this.counterMesh.position.set(0, -BOARD_H - 0.4, 0.5);
    this.counterMesh.receiveShadow = true;
    this.group.add(this.counterMesh);

    const backWallGeo = new THREE.PlaneGeometry(24, 14);
    this.wallMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.08 });
    this.backWall = new THREE.Mesh(backWallGeo, this.wallMat);
    this.backWall.position.set(0, 6.2, -3.55);
    this.backWall.receiveShadow = true;
    this.group.add(this.backWall);

    const sideWallGeo = new THREE.PlaneGeometry(20, 14);
    this.sideWall = new THREE.Mesh(sideWallGeo, this.wallMat);
    this.sideWall.rotation.y = Math.PI * 0.5;
    this.sideWall.position.set(-4.35, 6.2, 2.0);
    this.sideWall.receiveShadow = true;
    this.group.add(this.sideWall);

    this.applyPreset('classic-viral', true);
  }

  triggerImpactRecoil(strength = 0.012) {
    this.recoilVel = -strength * 14.0;
  }

  update(dt) {
    const k = 260;
    const d = 28;
    const acc = -k * this.recoilOffset - d * this.recoilVel;
    this.recoilVel += acc * dt;
    this.recoilOffset += this.recoilVel * dt;
    if (Math.abs(this.recoilOffset) < 0.0001 && Math.abs(this.recoilVel) < 0.0001) {
      this.recoilOffset = 0;
      this.recoilVel = 0;
    }
    this.boardGroup.position.y = this.recoilOffset;
  }

  getSurfaceAudio() {
    return this.surfaceAudio;
  }

  /**
   * Applies ONLY the cutting surface (board / leaf / glass / marble / steel / ice / custom prompt).
   */
  applySurface(surfaceId, customPrompt = '') {
    this.currentSurfaceId = surfaceId;
    this.leafMesh.visible = false;
    this.boardMat.map = null;
    this.boardMat.transparent = false;
    this.boardMat.opacity = 1.0;
    this.boardMat.emissive.setHex(0x000000);
    this.boardMat.emissiveIntensity = 0;
    this.rimMat.emissive.setHex(0x000000);
    this.rimMat.emissiveIntensity = 0;

    if (surfaceId === 'ai-custom') {
      customSurface.apply({
        boardMat: this.boardMat,
        rimMat: this.rimMat,
        leafMesh: this.leafMesh,
      });
      this.surfaceAudio = customSurface.surfaceAudio || 'stone';
      return;
    }

    if (surfaceId === 'custom' && customPrompt.trim()) {
      const norm = normalizeText(customPrompt);
      const colHex = parseHexColor(norm, '#b88c58');
      this.boardMat.color.set(colHex);
      this.rimMat.color.set(colHex).multiplyScalar(0.6);

      if (norm.includes('vidro') || norm.includes('glass')) {
        this.boardMat.roughness = 0.08;
        this.boardMat.metalness = 0.14;
        this.boardMat.transparent = true;
        this.boardMat.opacity = 0.72;
        this.surfaceAudio = 'glass';
      } else if (norm.includes('gelo') || norm.includes('ice')) {
        this.boardMat.map = this.textures.ice;
        this.boardMat.roughness = 0.14;
        this.boardMat.transparent = true;
        this.boardMat.opacity = 0.86;
        this.surfaceAudio = 'ice';
      } else if (norm.includes('folha') || norm.includes('leaf') || norm.includes('grama')) {
        this.boardMat.map = this.textures.rusticWood;
        this.leafMesh.visible = true;
        this.surfaceAudio = 'leaf';
      } else if (norm.includes('marmor') || norm.includes('pedra') || norm.includes('marble') || norm.includes('lava')) {
        const isDark = norm.includes('pret') || norm.includes('escuro') || norm.includes('obsidian') || norm.includes('lava') || norm.includes('rox');
        const vein = norm.includes('ouro') || norm.includes('dourad') ? 'rgba(235,192,92,0.68)' : norm.includes('lava') ? 'rgba(255,90,20,0.85)' : 'rgba(255,255,255,0.45)';
        this.boardMat.map = makeMarbleTexture(colHex, isDark ? '#1a1c24' : '#f3f4f6', vein, 'rgba(255,255,255,0.18)');
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.18;
        this.boardMat.metalness = 0.22;
        this.surfaceAudio = 'stone';
      } else if (norm.includes('aco') || norm.includes('metal') || norm.includes('ouro') || norm.includes('prata') || norm.includes('inox')) {
        this.boardMat.map = this.textures.steel;
        this.boardMat.roughness = 0.24;
        this.boardMat.metalness = 0.86;
        this.surfaceAudio = 'metal';
      } else {
        this.boardMat.map = this.textures.honeyWood;
        this.boardMat.roughness = 0.54;
        this.boardMat.metalness = 0.04;
        this.surfaceAudio = 'wood';
      }

      if (norm.includes('neon') || norm.includes('brilh') || norm.includes('lava')) {
        this.rimMat.emissive.set(colHex);
        this.rimMat.emissiveIntensity = 1.4;
      }
      this.boardMat.needsUpdate = true;
      return;
    }

    if (surfaceId === 'honey-wood') {
      this.boardMat.color.set('#e8cda8');
      this.boardMat.map = this.textures.honeyWood;
      this.boardMat.roughness = 0.52;
      this.boardMat.metalness = 0.04;
      this.rimMat.color.set('#754f2b');
      this.surfaceAudio = 'wood';
    } else if (surfaceId === 'rustic-wood') {
      this.boardMat.color.set('#966742');
      this.boardMat.map = this.textures.rusticWood;
      this.boardMat.roughness = 0.68;
      this.boardMat.metalness = 0.02;
      this.rimMat.color.set('#3d2312');
      this.surfaceAudio = 'wood';
    } else if (surfaceId === 'tempered-glass') {
      this.boardMat.color.set('#c4ece6');
      this.boardMat.roughness = 0.08;
      this.boardMat.metalness = 0.12;
      this.boardMat.transparent = true;
      this.boardMat.opacity = 0.72;
      this.rimMat.color.set('#55baa9');
      this.surfaceAudio = 'glass';
    } else if (surfaceId === 'banana-leaf') {
      this.boardMat.color.set('#7a5030');
      this.boardMat.map = this.textures.rusticWood;
      this.boardMat.roughness = 0.72;
      this.boardMat.metalness = 0.02;
      this.rimMat.color.set('#3d2312');
      this.leafMesh.visible = true;
      this.surfaceAudio = 'leaf';
    } else if (surfaceId === 'obsidian-marble') {
      this.boardMat.color.set('#ffffff');
      this.boardMat.map = this.textures.obsidian;
      this.boardMat.roughness = 0.14;
      this.boardMat.metalness = 0.28;
      this.rimMat.color.set('#c99a3c');
      this.surfaceAudio = 'stone';
    } else if (surfaceId === 'white-marble') {
      this.boardMat.color.set('#ffffff');
      this.boardMat.map = this.textures.whiteMarble;
      this.boardMat.roughness = 0.18;
      this.boardMat.metalness = 0.12;
      this.rimMat.color.set('#cbd5e1');
      this.surfaceAudio = 'stone';
    } else if (surfaceId === 'brushed-steel') {
      this.boardMat.color.set('#dce4ec');
      this.boardMat.map = this.textures.steel;
      this.boardMat.roughness = 0.26;
      this.boardMat.metalness = 0.82;
      this.rimMat.color.set('#46505c');
      this.surfaceAudio = 'metal';
    } else if (surfaceId === 'ice-block') {
      this.boardMat.color.set('#d5f2ff');
      this.boardMat.map = this.textures.ice;
      this.boardMat.roughness = 0.14;
      this.boardMat.metalness = 0.08;
      this.boardMat.transparent = true;
      this.boardMat.opacity = 0.86;
      this.boardMat.emissive.set('#134669');
      this.boardMat.emissiveIntensity = 0.35;
      this.rimMat.color.set('#72c8f5');
      this.surfaceAudio = 'ice';
    } else if (surfaceId === 'pink-terrazzo') {
      this.boardMat.color.set('#ffffff');
      this.boardMat.map = this.textures.terrazzo;
      this.boardMat.roughness = 0.34;
      this.boardMat.metalness = 0.04;
      this.rimMat.color.set('#e2a5b2');
      this.surfaceAudio = 'stone';
    } else if (surfaceId === 'neon-grid') {
      this.boardMat.color.set('#ffffff');
      this.boardMat.map = this.textures.neonGrid;
      this.boardMat.roughness = 0.18;
      this.boardMat.metalness = 0.35;
      this.rimMat.color.set('#38bdf8');
      this.rimMat.emissive.set('#38bdf8');
      this.rimMat.emissiveIntensity = 1.6;
      this.surfaceAudio = 'glass';
    }

    this.boardMat.needsUpdate = true;
  }

  /**
   * Applies the studio background walls, countertop, and 3-point lighting.
   * When syncDefaultSurface = true (backward compatibility with CLI --env), also applies its signature cutting surface.
   */
  applyPreset(id, syncDefaultSurface = true, customPrompt = '') {
    this.currentPresetId = id;
    this.wallMat.map = null;
    this.counterMat.map = null;
    const { hemi, key, fill, rim } = this.lights;

    if (id === 'ai-custom') {
      customEnvironment.apply({
        scene: this.scene,
        wallMat: this.wallMat,
        counterMat: this.counterMat,
        lights: this.lights,
      });
      return;
    }

    if (id === 'custom' && customPrompt.trim()) {
      const norm = normalizeText(customPrompt);
      const baseHex = parseHexColor(norm, '#243242');
      const baseCol = new THREE.Color(baseHex);
      const isLight = norm.includes('branc') || norm.includes('white') || norm.includes('claro') || norm.includes('creme') || norm.includes('bege') || norm.includes('minimal') || norm.includes('scandinav') || norm.includes('morning');
      const isNeon = norm.includes('neon') || norm.includes('cyber');
      const isWarm = norm.includes('quente') || norm.includes('sol') || norm.includes('gold') || norm.includes('dourad') || norm.includes('warm') || norm.includes('amber') || norm.includes('sunset') || norm.includes('terracot');

      // Keep moody backgrounds refined without ever going pitch-black
      const bgCol = baseCol.clone().multiplyScalar(isLight ? 0.96 : 0.56);
      const bgHsl = { h: 0, s: 0, l: 0 };
      bgCol.getHSL(bgHsl);
      if (!isLight && bgHsl.l < 0.11) bgCol.setHSL(bgHsl.h, Math.min(bgHsl.s, 0.35), 0.11);
      this.scene.background = bgCol;

      const counterCol = baseCol.clone().multiplyScalar(isLight ? 0.94 : 0.52);
      const cHsl = { h: 0, s: 0, l: 0 };
      counterCol.getHSL(cHsl);
      if (!isLight && cHsl.l < 0.13) counterCol.setHSL(cHsl.h, Math.min(cHsl.s, 0.30), 0.13);
      this.counterMat.color.copy(counterCol);
      this.counterMat.roughness = 0.46;
      this.counterMat.metalness = 0.14;

      const wallCol = baseCol.clone().multiplyScalar(isLight ? 0.98 : 0.74);
      const wHsl = { h: 0, s: 0, l: 0 };
      wallCol.getHSL(wHsl);
      if (!isLight && wHsl.l < 0.17) wallCol.setHSL(wHsl.h, Math.min(wHsl.s, 0.30), 0.17);
      this.wallMat.color.copy(wallCol);
      if (norm.includes('azulej') || norm.includes('cozinh') || norm.includes('kitchen') || norm.includes('lab') || norm.includes('tile')) {
        this.wallMat.map = isLight ? this.textures.lightTiles : this.textures.darkTiles;
      }
      this.wallMat.roughness = 0.34;
      this.wallMat.metalness = 0.08;

      // Commercial hero lighting: ALWAYS bright, crisp, and vibrant on mobile screens
      this.scene.environmentIntensity = isLight ? 0.78 : 0.66;
      hemi.color.set('#ffffff');
      hemi.groundColor.set(isLight ? '#d8d4cc' : '#524b42');
      hemi.intensity = isLight ? 1.38 : 1.18;

      key.color.set(isWarm ? '#fff1d6' : '#ffffff');
      key.intensity = isLight ? 3.15 : 3.45;

      const fillCol = baseCol.clone().offsetHSL(0.06, 0.12, 0.45);
      const fHsl = { h: 0, s: 0, l: 0 };
      fillCol.getHSL(fHsl);
      fillCol.setHSL(fHsl.h, Math.min(fHsl.s, isNeon ? 0.65 : 0.25), Math.max(0.76, fHsl.l));
      fill.color.copy(fillCol);
      fill.intensity = isNeon ? 1.65 : 1.35;

      const rimCol = isWarm ? new THREE.Color('#ffd48a') : baseCol.clone().offsetHSL(0.45, 0.22, 0.45);
      const rHsl = { h: 0, s: 0, l: 0 };
      rimCol.getHSL(rHsl);
      rimCol.setHSL(rHsl.h, Math.min(rHsl.s, isNeon ? 0.78 : 0.45), Math.max(0.72, rHsl.l));
      rim.color.copy(rimCol);
      rim.intensity = isNeon ? 1.9 : 1.55;

      this.wallMat.needsUpdate = true;
      this.counterMat.needsUpdate = true;
      return;
    }

    if (id === 'classic-viral') {
      this.scene.background = new THREE.Color('#182b26');
      this.scene.environmentIntensity = 0.66;
      this.counterMat.color.set('#222a2d');
      this.counterMat.roughness = 0.50;
      this.counterMat.metalness = 0.12;
      this.wallMat.color.set('#ffffff');
      this.wallMat.map = this.textures.darkTiles;
      this.wallMat.roughness = 0.24;
      this.wallMat.metalness = 0.10;
      hemi.color.set('#f2faf8'); hemi.groundColor.set('#4c4134'); hemi.intensity = 1.22;
      key.color.set('#fff6e8'); key.intensity = 3.25;
      fill.color.set('#cdeaf4'); fill.intensity = 1.28;
      rim.color.set('#ffe2b8'); rim.intensity = 1.35;
    } else if (id === 'glass-lab') {
      this.scene.background = new THREE.Color('#e4ebf2');
      this.scene.environmentIntensity = 0.78;
      this.counterMat.color.set('#f2f5f9');
      this.counterMat.roughness = 0.34;
      this.counterMat.metalness = 0.04;
      this.wallMat.color.set('#f8fafc');
      this.wallMat.map = this.textures.lightTiles;
      this.wallMat.roughness = 0.26;
      this.wallMat.metalness = 0.04;
      hemi.color.set('#ffffff'); hemi.groundColor.set('#d5e0ea'); hemi.intensity = 1.35;
      key.color.set('#ffffff'); key.intensity = 2.85;
      fill.color.set('#d4e9ff'); fill.intensity = 1.25;
      rim.color.set('#b4f7ec'); rim.intensity = 1.15;
    } else if (id === 'tropical-leaf') {
      this.scene.background = new THREE.Color('#342416');
      this.scene.environmentIntensity = 0.68;
      this.counterMat.color.set('#4a311e');
      this.counterMat.map = this.textures.rusticWood;
      this.counterMat.roughness = 0.72;
      this.counterMat.metalness = 0.02;
      this.wallMat.color.set('#413122');
      this.wallMat.roughness = 0.80;
      this.wallMat.metalness = 0.02;
      hemi.color.set('#fff0d1'); hemi.groundColor.set('#553b22'); hemi.intensity = 1.25;
      key.color.set('#ffd99e'); key.intensity = 3.45;
      fill.color.set('#bce8b3'); fill.intensity = 1.15;
      rim.color.set('#ffbe6e'); rim.intensity = 1.45;
    } else if (id === 'luxury-obsidian') {
      this.scene.background = new THREE.Color('#14161e');
      this.scene.environmentIntensity = 0.68;
      this.counterMat.color.set('#1c1f29');
      this.counterMat.roughness = 0.38;
      this.counterMat.metalness = 0.22;
      this.wallMat.color.set('#222531');
      this.wallMat.roughness = 0.68;
      this.wallMat.metalness = 0.12;
      hemi.color.set('#eef2ff'); hemi.groundColor.set('#4a3d2a'); hemi.intensity = 1.12;
      key.color.set('#fff5e0'); key.intensity = 3.55;
      fill.color.set('#b8c7eb'); fill.intensity = 1.22;
      rim.color.set('#ffd47d'); rim.intensity = 1.85;
    } else if (id === 'pro-kitchen') {
      this.scene.background = new THREE.Color('#1f2630');
      this.scene.environmentIntensity = 0.72;
      this.counterMat.color.set('#323b47');
      this.counterMat.roughness = 0.36;
      this.counterMat.metalness = 0.56;
      this.wallMat.color.set('#36414f');
      this.wallMat.map = this.textures.steel;
      this.wallMat.roughness = 0.42;
      this.wallMat.metalness = 0.48;
      hemi.color.set('#f0f7ff'); hemi.groundColor.set('#3d4957'); hemi.intensity = 1.24;
      key.color.set('#ffffff'); key.intensity = 3.25;
      fill.color.set('#bedcf7'); fill.intensity = 1.28;
      rim.color.set('#ffe4c4'); rim.intensity = 1.35;
    } else if (id === 'frozen-block') {
      this.scene.background = new THREE.Color('#16324a');
      this.scene.environmentIntensity = 0.74;
      this.counterMat.color.set('#1e405e');
      this.counterMat.roughness = 0.25;
      this.counterMat.metalness = 0.16;
      this.wallMat.color.set('#21486b');
      this.wallMat.roughness = 0.38;
      this.wallMat.metalness = 0.10;
      hemi.color.set('#d9f3ff'); hemi.groundColor.set('#285275'); hemi.intensity = 1.30;
      key.color.set('#eefaff'); key.intensity = 3.20;
      fill.color.set('#99d6ff'); fill.intensity = 1.35;
      rim.color.set('#ccf7ff'); rim.intensity = 1.55;
    } else if (id === 'cyberpunk-neon') {
      this.scene.background = new THREE.Color('#130f26');
      this.scene.environmentIntensity = 0.65;
      this.counterMat.color.set('#1e1738');
      this.counterMat.roughness = 0.28;
      this.counterMat.metalness = 0.38;
      this.wallMat.color.set('#261d45');
      this.wallMat.roughness = 0.44;
      this.wallMat.metalness = 0.22;
      hemi.color.set('#d5f9ff'); hemi.groundColor.set('#58218a'); hemi.intensity = 1.15;
      key.color.set('#faf8ff'); key.intensity = 3.15;
      fill.color.set('#7dd3fc'); fill.intensity = 1.65;
      rim.color.set('#fb7185'); rim.intensity = 1.95;
    } else if (id === 'sunset-terracotta') {
      this.scene.background = new THREE.Color('#4f2b21');
      this.scene.environmentIntensity = 0.72;
      this.counterMat.color.set('#754032');
      this.counterMat.roughness = 0.54;
      this.counterMat.metalness = 0.04;
      this.wallMat.color.set('#914e3b');
      this.wallMat.roughness = 0.68;
      this.wallMat.metalness = 0.02;
      hemi.color.set('#fff3e0'); hemi.groundColor.set('#6b331c'); hemi.intensity = 1.28;
      key.color.set('#ffdda6'); key.intensity = 3.35;
      fill.color.set('#fecdd3'); fill.intensity = 1.18;
      rim.color.set('#fdba74'); rim.intensity = 1.55;
    }

    this.wallMat.needsUpdate = true;
    this.counterMat.needsUpdate = true;

    if (syncDefaultSurface) {
      const def = ENVIRONMENT_LIST.find((e) => e.id === id);
      if (def?.defaultSurface) {
        this.applySurface(def.defaultSurface);
      }
    }
  }
}
