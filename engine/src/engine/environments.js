import * as THREE from 'three';
import { customSurface } from './custom-surface.js';
import { customEnvironment } from './custom-environment.js';

export const BOARD_W = 4.55;
export const BOARD_D = 3.35;
export const BOARD_H = 0.24;

// --- DECOUPLED CUTTING SURFACES (Tábua / Superfície de Corte) ---
export const SURFACE_LIST = [
  { id: 'honey-wood',      name: 'Madeira Clara (Carvalho)', subtitle: 'Tábua clássica viral com veios naturais', surfaceAudio: 'wood' },
  { id: 'rustic-wood',     name: 'Madeira Rústica Escura',   subtitle: 'Nogueira escura artesanal', surfaceAudio: 'wood' },
  { id: 'tempered-glass',  name: 'Vidro Temperado',          subtitle: 'Placa translúcida com borda verde jade', surfaceAudio: 'glass' },
  { id: 'banana-leaf',     name: 'Folha de Bananeira 🌿',    subtitle: 'Folha tropical gigante sobre madeira', surfaceAudio: 'leaf' },
  { id: 'obsidian-marble', name: 'Mármore Preto & Ouro',     subtitle: 'Pedra obsidian polida com veios dourados', surfaceAudio: 'stone' },
  { id: 'white-marble',    name: 'Mármore Carrara Branco',   subtitle: 'Pedra branca luxuosa com veios cinza', surfaceAudio: 'stone' },
  { id: 'brushed-steel',   name: 'Aço Inox Escovado',        subtitle: 'Superfície industrial de chef profissional', surfaceAudio: 'metal' },
  { id: 'ice-block',       name: 'Bloco de Gelo ❄️',         subtitle: 'Gelo cristalino translúcido brilhante', surfaceAudio: 'ice' },
  { id: 'pink-terrazzo',   name: 'Pedra Terrazzo Pastel',    subtitle: 'Base clara moderna com lascas coloridas', surfaceAudio: 'stone' },
  { id: 'neon-grid',       name: 'Base Cyberpunk Neon',      subtitle: 'Preto fosco com borda luminosa ciano', surfaceAudio: 'glass' },
];

// --- DECOUPLED STUDIO BACKGROUNDS & LIGHTING (Ambiente / Cenário) ---
export const ENVIRONMENT_LIST = [
  { id: 'classic-viral',    name: 'Cozinha Viral (Azulejos)',   subtitle: 'Azulejos verde escuro + luz quente', defaultSurface: 'honey-wood' },
  { id: 'glass-lab',        name: 'Laboratório Branco',         subtitle: 'Minimalista claro + luz limpa de estúdio', defaultSurface: 'tempered-glass' },
  { id: 'tropical-leaf',    name: 'Cabana Tropical Quente',     subtitle: 'Madeira rústica + luz dourada solar', defaultSurface: 'banana-leaf' },
  { id: 'luxury-obsidian',  name: 'Estúdio Obsidian Luxo',      subtitle: 'Fundo preto fosco + luz de recorte ouro', defaultSurface: 'obsidian-marble' },
  { id: 'pro-kitchen',      name: 'Cozinha Industrial',         subtitle: 'Aço escovado escuro + luz fria precisa', defaultSurface: 'brushed-steel' },
  { id: 'frozen-block',     name: 'Estúdio Ártico Congelado',   subtitle: 'Ambiente azul gelado cristalino', defaultSurface: 'ice-block' },
  { id: 'cyberpunk-neon',   name: 'Estúdio Cyberpunk Neon',     subtitle: 'Fundo escuro com luzes ciano & magenta', defaultSurface: 'neon-grid' },
  { id: 'sunset-terracotta',name: 'Pôr do Sol Terracota',       subtitle: 'Fundo âmbar aconchegante + luz dourada', defaultSurface: 'white-marble' },
];

export const RANDOM_SURFACE_PROMPTS = [
  'Mármore roxo com veios dourados',
  'Tábua de bambu verde natural',
  'Placa de vidro azul neon',
  'Pedra vulcânica preta com rachaduras',
  'Placa de ouro escovado luxo',
  'Mármore rosa pastel',
];

export const RANDOM_ENV_PROMPTS = [
  'Estúdio neon roxo e ciano',
  'Cozinha retrô creme aconchegante',
  'Laboratório futurista azul',
  'Estúdio vermelho dramático escuro',
  'Ambiente floresta verde esmeralda',
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
      const baseHex = parseHexColor(norm, '#1a2430');
      const baseCol = new THREE.Color(baseHex);
      const isLight = norm.includes('branc') || norm.includes('claro') || norm.includes('creme') || norm.includes('bege') || norm.includes('minimal');
      const isNeon = norm.includes('neon') || norm.includes('cyber');

      this.scene.background = baseCol.clone().multiplyScalar(isLight ? 0.95 : 0.42);
      this.counterMat.color.copy(baseCol).multiplyScalar(isLight ? 0.92 : 0.36);
      this.counterMat.roughness = 0.50;
      this.counterMat.metalness = 0.12;

      this.wallMat.color.copy(baseCol).multiplyScalar(isLight ? 0.98 : 0.58);
      if (norm.includes('azulej') || norm.includes('cozinh') || norm.includes('lab')) {
        this.wallMat.map = isLight ? this.textures.lightTiles : this.textures.darkTiles;
      }
      this.wallMat.roughness = 0.36;
      this.wallMat.metalness = 0.08;

      hemi.color.set(isLight ? '#ffffff' : '#dbeafe');
      hemi.groundColor.copy(baseCol).multiplyScalar(0.35);
      hemi.intensity = isLight ? 1.1 : 0.85;
      key.color.set(norm.includes('quente') || norm.includes('sol') ? '#ffd699' : '#ffffff');
      key.intensity = 2.65;
      fill.color.copy(baseCol).offsetHSL(0.08, 0.15, 0.25);
      fill.intensity = isNeon ? 1.45 : 0.90;
      rim.color.copy(baseCol).offsetHSL(0.45, 0.25, 0.30);
      rim.intensity = isNeon ? 1.65 : 1.05;

      this.wallMat.needsUpdate = true;
      this.counterMat.needsUpdate = true;
      return;
    }

    if (id === 'classic-viral') {
      this.scene.background = new THREE.Color('#0f1a18');
      this.counterMat.color.set('#14181a');
      this.counterMat.roughness = 0.55;
      this.counterMat.metalness = 0.14;
      this.wallMat.color.set('#ffffff');
      this.wallMat.map = this.textures.darkTiles;
      this.wallMat.roughness = 0.24;
      this.wallMat.metalness = 0.12;
      hemi.color.set('#dcebe7'); hemi.groundColor.set('#261d15'); hemi.intensity = 0.85;
      key.color.set('#fff3e0'); key.intensity = 2.65;
      fill.color.set('#9fd0dd'); fill.intensity = 0.85;
      rim.color.set('#ffd9a8'); rim.intensity = 1.0;
    } else if (id === 'glass-lab') {
      this.scene.background = new THREE.Color('#dfe6ed');
      this.counterMat.color.set('#eef2f6');
      this.counterMat.roughness = 0.34;
      this.counterMat.metalness = 0.04;
      this.wallMat.color.set('#f5f8fb');
      this.wallMat.map = this.textures.lightTiles;
      this.wallMat.roughness = 0.26;
      this.wallMat.metalness = 0.04;
      hemi.color.set('#ffffff'); hemi.groundColor.set('#cad6e0'); hemi.intensity = 1.15;
      key.color.set('#ffffff'); key.intensity = 2.3;
      fill.color.set('#c4e0ff'); fill.intensity = 0.95;
      rim.color.set('#9bf2e5'); rim.intensity = 0.9;
    } else if (id === 'tropical-leaf') {
      this.scene.background = new THREE.Color('#23180f');
      this.counterMat.color.set('#342114');
      this.counterMat.map = this.textures.rusticWood;
      this.counterMat.roughness = 0.78;
      this.counterMat.metalness = 0.02;
      this.wallMat.color.set('#2c2217');
      this.wallMat.roughness = 0.85;
      this.wallMat.metalness = 0.02;
      hemi.color.set('#ffe4b8'); hemi.groundColor.set('#2c1c0f'); hemi.intensity = 0.95;
      key.color.set('#ffcf87'); key.intensity = 3.0;
      fill.color.set('#96d98c'); fill.intensity = 0.75;
      rim.color.set('#ffaa4a'); rim.intensity = 1.15;
    } else if (id === 'luxury-obsidian') {
      this.scene.background = new THREE.Color('#09090c');
      this.counterMat.color.set('#0e0f14');
      this.counterMat.roughness = 0.42;
      this.counterMat.metalness = 0.22;
      this.wallMat.color.set('#14151b');
      this.wallMat.roughness = 0.78;
      this.wallMat.metalness = 0.12;
      hemi.color.set('#d2d6e6'); hemi.groundColor.set('#1a140c'); hemi.intensity = 0.65;
      key.color.set('#fff0d2'); key.intensity = 2.8;
      fill.color.set('#7a88b5'); fill.intensity = 0.65;
      rim.color.set('#ffcb6b'); rim.intensity = 1.5;
    } else if (id === 'pro-kitchen') {
      this.scene.background = new THREE.Color('#14181e');
      this.counterMat.color.set('#232a32');
      this.counterMat.roughness = 0.40;
      this.counterMat.metalness = 0.62;
      this.wallMat.color.set('#262e38');
      this.wallMat.map = this.textures.steel;
      this.wallMat.roughness = 0.45;
      this.wallMat.metalness = 0.55;
      hemi.color.set('#e8f2ff'); hemi.groundColor.set('#1b222a'); hemi.intensity = 0.9;
      key.color.set('#f7fbff'); key.intensity = 2.65;
      fill.color.set('#9ec6f0'); fill.intensity = 0.9;
      rim.color.set('#ffdfba'); rim.intensity = 1.0;
    } else if (id === 'frozen-block') {
      this.scene.background = new THREE.Color('#0c1e2e');
      this.counterMat.color.set('#10263a');
      this.counterMat.roughness = 0.25;
      this.counterMat.metalness = 0.18;
      this.wallMat.color.set('#122e46');
      this.wallMat.roughness = 0.42;
      this.wallMat.metalness = 0.1;
      hemi.color.set('#bce8ff'); hemi.groundColor.set('#0e2538'); hemi.intensity = 1.0;
      key.color.set('#e3f7ff'); key.intensity = 2.6;
      fill.color.set('#66c2ff'); fill.intensity = 1.05;
      rim.color.set('#b8f4ff'); rim.intensity = 1.3;
    } else if (id === 'cyberpunk-neon') {
      this.scene.background = new THREE.Color('#090714');
      this.counterMat.color.set('#110d20');
      this.counterMat.roughness = 0.28;
      this.counterMat.metalness = 0.42;
      this.wallMat.color.set('#16102b');
      this.wallMat.roughness = 0.48;
      this.wallMat.metalness = 0.25;
      hemi.color.set('#a5f3fc'); hemi.groundColor.set('#3b0764'); hemi.intensity = 0.8;
      key.color.set('#f5f3ff'); key.intensity = 2.4;
      fill.color.set('#38bdf8'); fill.intensity = 1.45;
      rim.color.set('#f43f8e'); rim.intensity = 1.75;
    } else if (id === 'sunset-terracotta') {
      this.scene.background = new THREE.Color('#3b1f18');
      this.counterMat.color.set('#5e3226');
      this.counterMat.roughness = 0.56;
      this.counterMat.metalness = 0.04;
      this.wallMat.color.set('#7a3e2e');
      this.wallMat.roughness = 0.72;
      this.wallMat.metalness = 0.02;
      hemi.color.set('#ffedd5'); hemi.groundColor.set('#431407'); hemi.intensity = 1.0;
      key.color.set('#ffd28e'); key.intensity = 2.9;
      fill.color.set('#fda4af'); fill.intensity = 0.85;
      rim.color.set('#fb923c'); rim.intensity = 1.35;
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
