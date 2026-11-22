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

function hashPromptSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseHexColor(norm, fallback) {
  if (norm.includes('lavand') || norm.includes('lilas') || norm.includes('lilac')) return '#a78bfa';
  if (norm.includes('rox') || norm.includes('purple') || norm.includes('violet') || norm.includes('ametist') || norm.includes('plum')) return '#6d28d9';
  if (norm.includes('sakura') || norm.includes('blush') || norm.includes('pastel pink')) return '#f472b6';
  if (norm.includes('coral') || norm.includes('salmao') || norm.includes('peach') || norm.includes('pesseg')) return '#fb7185';
  if (norm.includes('rosa') || norm.includes('pink') || norm.includes('magenta') || norm.includes('fucsia')) return '#db2777';
  if (norm.includes('borgonh') || norm.includes('burgundy') || norm.includes('vinho') || norm.includes('wine')) return '#881337';
  if (norm.includes('vermelh') || norm.includes('red') || norm.includes('rubi') || norm.includes('crimson')) return '#dc2626';
  if (norm.includes('cobre') || norm.includes('copper') || norm.includes('bronze')) return '#b45309';
  if (norm.includes('terracot') || norm.includes('argil') || norm.includes('clay')) return '#c2410c';
  if (norm.includes('laranj') || norm.includes('orange') || norm.includes('ambar') || norm.includes('amber') || norm.includes('sunset')) return '#ea580c';
  if (norm.includes('amarel') || norm.includes('yellow') || norm.includes('sunny') || norm.includes('mostard') || norm.includes('mustard') || norm.includes('saffron')) return '#eab308';
  if (norm.includes('ouro') || norm.includes('dourad') || norm.includes('gold') || norm.includes('champagn')) return '#d4a334';
  if (norm.includes('menta') || norm.includes('mint') || norm.includes('pistach') || norm.includes('sage')) return '#34d399';
  if (norm.includes('esmerald') || norm.includes('emerald') || norm.includes('jade')) return '#059669';
  if (norm.includes('oliv') || norm.includes('moss') || norm.includes('musg')) return '#4d7c0f';
  if (norm.includes('verd') || norm.includes('green') || norm.includes('bambu') || norm.includes('bamboo') || norm.includes('florest')) return '#16a34a';
  if (norm.includes('turques') || norm.includes('turquoise') || norm.includes('teal') || norm.includes('aqua')) return '#0d9488';
  if (norm.includes('ciano') || norm.includes('cyan') || norm.includes('gelo') || norm.includes('arctic') || norm.includes('glacial')) return '#0ea5e9';
  if (norm.includes('indigo') || norm.includes('navy') || norm.includes('marinh') || norm.includes('midnight')) return '#312e81';
  if (norm.includes('azul') || norm.includes('blue') || norm.includes('cobalt') || norm.includes('sapphir')) return '#2563eb';
  if (norm.includes('espress') || norm.includes('cafe') || norm.includes('coffee') || norm.includes('walnut') || norm.includes('nogueir')) return '#5c3a21';
  if (norm.includes('branc') || norm.includes('white') || norm.includes('claro') || norm.includes('creme') || norm.includes('cream') || norm.includes('bege') || norm.includes('ivory') || norm.includes('scandinav')) return '#ebe7df';
  if (norm.includes('pret') || norm.includes('black') || norm.includes('escuro') || norm.includes('obsidian') || norm.includes('charcoal') || norm.includes('volcan')) return '#14171f';
  // Deterministic unique hue for any other custom description so no two prompts ever look identical!
  if (norm && norm.length > 3) {
    const h = (hashPromptSeed(norm) % 360) / 360;
    return '#' + new THREE.Color().setHSL(h, 0.52, 0.46).getHexString();
  }
  return fallback;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeWoodTexture(baseHex, grainHex, warm = true) {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, S, S);

  const planks = 7;
  const plankH = S / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = p % 2 === 0 ? 'rgba(255,245,220,0.06)' : 'rgba(60,30,10,0.06)';
    ctx.fillRect(0, p * plankH, S, plankH);
    ctx.fillStyle = 'rgba(40,22,8,0.18)';
    ctx.fillRect(0, p * plankH, S, 2.0);
  }

  for (let i = 0; i < 820; i++) {
    const y = (i / 820) * S;
    ctx.strokeStyle = grainHex;
    ctx.globalAlpha = 0.045 + (Math.sin(i * 1.9) * 0.5 + 0.5) * 0.10;
    ctx.lineWidth = 0.8 + (i % 3) * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 48) {
      ctx.lineTo(x, y + Math.sin(x * 0.009 + i * 0.14) * (warm ? 4.4 : 2.4));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;

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

function makeNeonGridTexture(gridRgba = 'rgba(56, 189, 248, 0.28)', borderRgba = 'rgba(244, 63, 142, 0.65)') {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0f18';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = gridRgba;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
  }
  ctx.strokeStyle = borderRgba;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 504);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeEpoxyRiverTexture(woodHex = '#4b2d18', riverHex = '#0ea5e9', seed = 1) {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = woodHex;
  ctx.fillRect(0, 0, S, S);
  // Natural walnut wood grain flanks
  for (let i = 0; i < 640; i++) {
    const y = (i / 640) * S;
    ctx.strokeStyle = 'rgba(22,10,4,0.22)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 64) {
      ctx.lineTo(x, y + Math.sin(x * 0.01 + i * 0.16 + seed) * 4.0);
    }
    ctx.stroke();
  }
  // Flowing translucent resin river down the center
  const rc = new THREE.Color(riverHex);
  const lightRiver = '#' + rc.clone().offsetHSL(0.03, 0.1, 0.22).getHexString();
  const deepRiver = '#' + rc.clone().offsetHSL(-0.02, 0.05, -0.18).getHexString();
  ctx.save();
  ctx.beginPath();
  for (let y = 0; y <= S; y += 16) {
    const xL = S * 0.34 + Math.sin(y * 0.008 + seed) * 62 + Math.cos(y * 0.021) * 18;
    if (y === 0) ctx.moveTo(xL, y); else ctx.lineTo(xL, y);
  }
  for (let y = S; y >= 0; y -= 16) {
    const xR = S * 0.66 + Math.sin(y * 0.008 + seed + 0.5) * 62 - Math.cos(y * 0.018) * 18;
    ctx.lineTo(xR, y);
  }
  ctx.closePath();
  const rg = ctx.createLinearGradient(S * 0.3, 0, S * 0.7, S);
  rg.addColorStop(0, deepRiver);
  rg.addColorStop(0.48, lightRiver);
  rg.addColorStop(1, deepRiver);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Soft translucent mica swirl ribbons inside liquid glass resin
  ctx.clip();
  for (let k = 0; k < 14; k++) {
    ctx.beginPath();
    ctx.strokeStyle = k % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(186,245,255,0.18)';
    ctx.lineWidth = 10 + (k % 4) * 5;
    for (let y = 0; y <= S; y += 24) {
      const x = S * 0.38 + (k / 14) * S * 0.24 + Math.sin(y * 0.007 + k * 0.55 + seed) * 28;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeBambooTexture(baseHex = '#cfa866') {
  const S = 1024;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, S, S);
  const slats = 14;
  const sw = S / slats;
  const bc = new THREE.Color(baseHex);
  for (let i = 0; i < slats; i++) {
    const shade = ((i * 37) % 11 - 5) * 0.012;
    ctx.fillStyle = '#' + bc.clone().offsetHSL(0, 0, shade).getHexString();
    ctx.fillRect(i * sw, 0, sw - 2, S);
    ctx.fillStyle = 'rgba(72,48,18,0.24)';
    ctx.fillRect(i * sw + sw - 2, 0, 2, S);
    // Bamboo horizontal joints staggered per slat
    for (let j = 0; j < 3; j++) {
      const ny = ((i * 197 + j * 340) % S);
      ctx.fillStyle = 'rgba(92,62,24,0.34)';
      ctx.fillRect(i * sw + 1, ny, sw - 4, 6);
      ctx.fillStyle = 'rgba(255,245,215,0.20)';
      ctx.fillRect(i * sw + 1, ny + 6, sw - 4, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCheckerboardTexture(colA = '#f8f5f0', colB = '#1e293b', cells = 8) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const sz = S / cells;
  for (let r = 0; r < cells; r++) {
    for (let col = 0; col < cells; col++) {
      ctx.fillStyle = (r + col) % 2 === 0 ? colA : colB;
      ctx.fillRect(col * sz, r * sz, sz, sz);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(col * sz + 1, r * sz + 1, sz - 2, sz - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCustomTerrazzoTexture(baseHex = '#f5ece6', accentHex = '#e899a8', seed = 1) {
  const c = makeCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  const ac = new THREE.Color(accentHex);
  const chips = [
    '#' + ac.getHexString(),
    '#' + ac.clone().offsetHSL(0.18, -0.05, 0.08).getHexString(),
    '#' + ac.clone().offsetHSL(0.48, 0.05, -0.04).getHexString(),
    '#' + ac.clone().offsetHSL(0.72, -0.1, 0.10).getHexString(),
    '#d9b56c',
  ];
  for (let i = 0; i < 290; i++) {
    const h = (i * 73 + seed * 31) >>> 0;
    const x = (h * 17) % 512;
    const y = ((i * 131 + seed * 47) * 13) % 512;
    const sz = 5 + ((h + i) % 13);
    ctx.fillStyle = chips[i % chips.length];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sz, y + (i % 5) - 2);
    ctx.lineTo(x + sz * 0.65, y + sz);
    ctx.lineTo(x - sz * 0.35, y + sz * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeFlutedWallTexture(baseHex = '#d6c2a8') {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const bc = new THREE.Color(baseHex);
  const dark = '#' + bc.clone().offsetHSL(0, 0.04, -0.14).getHexString();
  const light = '#' + bc.clone().offsetHSL(0, -0.02, 0.09).getHexString();
  const slats = 16;
  const w = S / slats;
  for (let i = 0; i < slats; i++) {
    const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.28, light);
    g.addColorStop(0.72, baseHex);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fillRect(i * w, 0, w, S);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.anisotropy = 8;
  return tex;
}

function makeHexMosaicWallTexture(baseHex = '#2a4d5c') {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const bc = new THREE.Color(baseHex);
  ctx.fillStyle = '#' + bc.clone().offsetHSL(0, 0, -0.14).getHexString();
  ctx.fillRect(0, 0, S, S);
  const r = 28;
  const dx = r * 1.5;
  const dy = r * Math.sqrt(3);
  for (let row = -1; row < S / dy + 2; row++) {
    for (let col = -1; col < S / dx + 2; col++) {
      const cx = col * dx;
      const cy = row * dy + (col % 2 === 0 ? 0 : dy * 0.5);
      const jit = (Math.sin(row * 11.3 + col * 5.7) * 0.5) * 0.06;
      ctx.fillStyle = '#' + bc.clone().offsetHSL(0, 0, jit).getHexString();
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const px = cx + Math.cos(a) * (r - 2.2);
        const py = cy + Math.sin(a) * (r - 2.2);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 2.2);
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
      const seed = hashPromptSeed(norm);
      const colHex = parseHexColor(norm, '#b88c58');
      this.boardMat.color.set(colHex);
      this.rimMat.color.set(colHex).multiplyScalar(0.6);

      if (norm.includes('epoxy') || norm.includes('epoxi') || norm.includes('resin') || norm.includes('river') || norm.includes('rio')) {
        const woodHex = norm.includes('claro') || norm.includes('maple') || norm.includes('oak') ? '#b68552' : '#4a2b17';
        this.boardMat.map = makeEpoxyRiverTexture(woodHex, colHex, seed);
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.22;
        this.boardMat.metalness = 0.10;
        this.rimMat.color.set(woodHex);
        this.surfaceAudio = 'wood';
      } else if (norm.includes('bambu') || norm.includes('bamboo')) {
        this.boardMat.map = makeBambooTexture(norm.includes('verd') || norm.includes('green') ? '#6aa84f' : '#d2ab69');
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.44;
        this.boardMat.metalness = 0.04;
        this.rimMat.color.set('#7c5a2b');
        this.surfaceAudio = 'wood';
      } else if (norm.includes('terrazzo') || norm.includes('granilit')) {
        const isDark = norm.includes('pret') || norm.includes('dark') || norm.includes('charcoal');
        this.boardMat.map = makeCustomTerrazzoTexture(isDark ? '#242730' : '#f6f0ea', colHex, seed);
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.30;
        this.boardMat.metalness = 0.06;
        this.surfaceAudio = 'stone';
      } else if (norm.includes('checker') || norm.includes('xadrez') || norm.includes('diner') || norm.includes('ceramic') || norm.includes('azulej') || norm.includes('tile')) {
        const isLightAlt = norm.includes('creme') || norm.includes('white') || norm.includes('branc') || norm.includes('pastel');
        this.boardMat.map = makeCheckerboardTexture(isLightAlt ? '#faf7f2' : '#f3ece4', colHex, 8);
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.20;
        this.boardMat.metalness = 0.06;
        this.surfaceAudio = 'stone';
      } else if (norm.includes('grid') || norm.includes('circuit') || norm.includes('cyber') || norm.includes('hologra')) {
        const cc = new THREE.Color(colHex);
        const r = Math.round(cc.r * 255), g = Math.round(cc.g * 255), b = Math.round(cc.b * 255);
        this.boardMat.map = makeNeonGridTexture(`rgba(${r},${g},${b},0.35)`, `rgba(${r},${g},${b},0.85)`);
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.16;
        this.boardMat.metalness = 0.36;
        this.rimMat.emissive.set(colHex);
        this.rimMat.emissiveIntensity = 1.5;
        this.surfaceAudio = 'glass';
      } else if (norm.includes('vidro') || norm.includes('glass') || norm.includes('acrilic') || norm.includes('acrylic') || norm.includes('crystal')) {
        this.boardMat.roughness = 0.08;
        this.boardMat.metalness = 0.14;
        this.boardMat.transparent = true;
        this.boardMat.opacity = 0.72;
        this.surfaceAudio = 'glass';
      } else if (norm.includes('gelo') || norm.includes('ice') || norm.includes('glacial')) {
        this.boardMat.map = this.textures.ice;
        this.boardMat.roughness = 0.14;
        this.boardMat.transparent = true;
        this.boardMat.opacity = 0.86;
        this.surfaceAudio = 'ice';
      } else if (norm.includes('folha') || norm.includes('leaf') || norm.includes('grama') || norm.includes('palm')) {
        this.boardMat.map = this.textures.rusticWood;
        this.leafMesh.visible = true;
        this.surfaceAudio = 'leaf';
      } else if (norm.includes('marmor') || norm.includes('pedra') || norm.includes('marble') || norm.includes('stone') || norm.includes('slate') || norm.includes('granit') || norm.includes('lava') || norm.includes('volcan') || norm.includes('quartz') || norm.includes('jade') || norm.includes('onyx')) {
        const isDark = norm.includes('pret') || norm.includes('black') || norm.includes('escuro') || norm.includes('dark') || norm.includes('obsidian') || norm.includes('lava') || norm.includes('volcan') || norm.includes('slate') || norm.includes('rox') || norm.includes('purple') || norm.includes('navy') || norm.includes('emerald') || norm.includes('esmerald');
        const vein = norm.includes('ouro') || norm.includes('dourad') || norm.includes('gold')
          ? 'rgba(235,192,92,0.72)'
          : norm.includes('lava') || norm.includes('ember') || norm.includes('magma')
            ? 'rgba(255,95,20,0.88)'
            : isDark ? 'rgba(255,255,255,0.44)' : 'rgba(110,120,138,0.42)';
        const bg2 = isDark ? '#' + new THREE.Color(colHex).multiplyScalar(0.42).getHexString() : '#f6f7f9';
        this.boardMat.map = makeMarbleTexture(colHex, bg2, vein, 'rgba(255,255,255,0.18)');
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.16;
        this.boardMat.metalness = 0.22;
        this.surfaceAudio = 'stone';
      } else if (norm.includes('aco') || norm.includes('steel') || norm.includes('metal') || norm.includes('ouro') || norm.includes('gold') || norm.includes('copper') || norm.includes('cobre') || norm.includes('brass') || norm.includes('bronze') || norm.includes('prata') || norm.includes('silver') || norm.includes('inox') || norm.includes('chrome')) {
        this.boardMat.map = this.textures.steel;
        this.boardMat.roughness = 0.22;
        this.boardMat.metalness = 0.86;
        this.surfaceAudio = 'metal';
      } else {
        // Custom tinted wood species (walnut, cherry, maple, rosewood, dyed studio wood)
        const baseC = new THREE.Color(colHex);
        const grainHex = '#' + baseC.clone().multiplyScalar(0.52).getHexString();
        this.boardMat.map = makeWoodTexture(colHex, grainHex, true);
        this.boardMat.color.set('#ffffff');
        this.boardMat.roughness = 0.50;
        this.boardMat.metalness = 0.04;
        this.surfaceAudio = 'wood';
      }

      if (norm.includes('neon') || norm.includes('brilh') || norm.includes('glow') || norm.includes('lava') || norm.includes('ember')) {
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
      const wallHex = '#' + wallCol.getHexString();
      this.wallMat.color.set('#ffffff');
      if (norm.includes('flut') || norm.includes('slat') || norm.includes('ripad') || norm.includes('japandi') || norm.includes('scandinav') || norm.includes('sauna') || norm.includes('wood') || norm.includes('madeir')) {
        this.wallMat.map = makeFlutedWallTexture(wallHex);
      } else if (norm.includes('hex') || norm.includes('mosaic') || norm.includes('boutique') || norm.includes('spa') || norm.includes('jewel') || norm.includes('luxur')) {
        this.wallMat.map = makeHexMosaicWallTexture(wallHex);
      } else if (norm.includes('azulej') || norm.includes('cozinh') || norm.includes('kitchen') || norm.includes('lab') || norm.includes('tile') || norm.includes('bistro') || norm.includes('diner') || norm.includes('cafe') || norm.includes('bak')) {
        const groutHex = '#' + wallCol.clone().multiplyScalar(0.68).getHexString();
        this.wallMat.map = makeSubwayTileTexture(wallHex, groutHex, 12);
      } else if (norm.includes('steel') || norm.includes('metal') || norm.includes('industrial') || norm.includes('brass') || norm.includes('copper')) {
        this.wallMat.color.copy(wallCol);
        this.wallMat.map = this.textures.steel;
      } else {
        this.wallMat.color.copy(wallCol);
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
