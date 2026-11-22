import * as THREE from 'three';
import { customCutter } from './custom-cutter.js';

export const CUTTER_LIST = [
  { id: 'chef-knife',      name: 'Japanese Chef Knife (Gyuto)', subtitle: 'Brushed steel blade + riveted ebony grip', blurHex: 0xdff2ff },
  { id: 'hot-knife-1000c', name: '1000°C Glowing Knife 🔥',     subtitle: 'Incandescent red-orange molten steel edge', blurHex: 0xff6b1a },
  { id: 'katana',          name: 'Samurai Katana ⚔️',           subtitle: 'Mirror-curved blade + gold tsuba guard', blurHex: 0xe6f4ff },
  { id: 'cleaver',         name: 'Heavy Chinese Cleaver',       subtitle: 'Wide rectangular butcher steel blade', blurHex: 0xd8e2ec },
  { id: 'lightsaber',      name: 'Plasma Lightsaber ⚡',         subtitle: 'Glowing cyan laser beam + metallic hilt', blurHex: 0x38bdf8 },
  { id: 'golden-blade',    name: '24k Solid Gold Blade ✨',      subtitle: 'Mirror-polished gold + obsidian grip', blurHex: 0xffd65c },
  { id: 'crystal-blade',   name: 'Crystal Ice Blade ❄️',        subtitle: 'Translucent diamond/ice blue edge', blurHex: 0x7dd3fc },
  { id: 'credit-card',     name: 'Razor Black Metal Card 💳',   subtitle: 'Luxury black & gold card slicing like butter', blurHex: 0xf5d07a },
  { id: 'steel-scraper',   name: 'Steel Pastry Scraper',        subtitle: 'Ultra-thin straight ASMR chrome blade', blurHex: 0xe2e8f0 },
];

export const RANDOM_CUTTER_PROMPTS = [
  '1000°C glowing red-hot knife',
  'Blue Damascus steel samurai katana',
  'Neon purple plasma lightsaber',
  '24k solid gold cleaver',
  'Luxury black & gold metal credit card',
  'Translucent arctic ice crystal blade',
  'Serrated metallic precision saw',
  'Glowing emerald crystal sword',
  'Dark forged steel Viking axe',
];

function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseColorFromText(norm, fallbackHex) {
  if (norm.includes('vermelh') || norm.includes('red') || norm.includes('fogo') || norm.includes('1000')) return 0xff3b1f;
  if (norm.includes('laranj') || norm.includes('orange') || norm.includes('lava')) return 0xff7b1a;
  if (norm.includes('ouro') || norm.includes('dourad') || norm.includes('gold')) return 0xf5c542;
  if (norm.includes('rox') || norm.includes('purple') || norm.includes('violet')) return 0xa855f7;
  if (norm.includes('rosa') || norm.includes('pink') || norm.includes('magenta')) return 0xf43f8e;
  if (norm.includes('verd') || norm.includes('green') || norm.includes('esmerald')) return 0x22c55e;
  if (norm.includes('ciano') || norm.includes('cyan') || norm.includes('gelo') || norm.includes('cristal') || norm.includes('diamant')) return 0x38bdf8;
  if (norm.includes('azul') || norm.includes('blue')) return 0x2563eb;
  if (norm.includes('pret') || norm.includes('black') || norm.includes('obsidian')) return 0x1e222a;
  return fallbackHex;
}

/**
 * Builds the 3D cutting tool geometry + ghost blade geometry for motion-blur curtain.
 * STRICT CONTRACT: Cutting edge always lies along local y = 0, spanning roughly z in [-1.5, +1.5],
 * and handle extends toward local -Z so the phase-locked state machine works with EVERY cutter!
 */
export function buildCutterTool(cutterId = 'chef-knife', customPrompt = '') {
  if (cutterId === 'ai-custom') {
    return customCutter.build();
  }

  const norm = normalizeText(customPrompt);
  let style = cutterId;

  // Resolve free-text prompt to structural archetype + custom color/glow overrides
  let customColor = null;
  let forceGlow = false;
  if (cutterId === 'custom' || (customPrompt && customPrompt.trim().length > 0)) {
    if (norm.includes('sabre') || norm.includes('laser') || norm.includes('plasma') || norm.includes('luz')) style = 'lightsaber';
    else if (norm.includes('cutelo') || norm.includes('cleaver') || norm.includes('machad') || norm.includes('axe')) style = 'cleaver';
    else if (norm.includes('1000') || norm.includes('quente') || norm.includes('fogo') || norm.includes('brasa') || norm.includes('lava')) style = 'hot-knife-1000c';
    else if (norm.includes('katana') || norm.includes('samurai') || norm.includes('espada') || norm.includes('sword')) style = 'katana';
    else if (norm.includes('cartao') || norm.includes('card') || norm.includes('carta')) style = 'credit-card';
    else if (norm.includes('espatula') || norm.includes('regua') || norm.includes('scraper')) style = 'steel-scraper';
    else if (norm.includes('serra') || norm.includes('saw')) style = 'saw';
    else if (norm.includes('cristal') || norm.includes('gelo') || norm.includes('diamant')) style = 'crystal-blade';
    else if (norm.includes('ouro') || norm.includes('dourad') || norm.includes('gold')) style = 'golden-blade';
    else style = 'chef-knife';

    customColor = parseColorFromText(norm, null);
    forceGlow = norm.includes('neon') || norm.includes('brilh') || norm.includes('laser') || norm.includes('1000') || norm.includes('lava') || norm.includes('fogo');
  }

  const toolGroup = new THREE.Group();
  let bladeGeo;
  let bladeMat;
  let edgeMat;
  let blurHex = 0xdff2ff;
  const bladeMatsToFade = [];

  if (style === 'lightsaber') {
    const saberCol = customColor ?? 0x38bdf8;
    blurHex = saberCol;

    // Plasma beam cylinder laid along local Z at y = 0.08
    bladeGeo = new THREE.CylinderGeometry(0.055, 0.055, 3.05, 18);
    bladeGeo.rotateX(Math.PI * 0.5);
    bladeGeo.translate(0, 0.06, -0.02);

    bladeMat = new THREE.MeshStandardMaterial({
      color: saberCol,
      emissive: saberCol,
      emissiveIntensity: 1.45,
      roughness: 0.12,
      metalness: 0.0,
    });
    const coreMesh = new THREE.Mesh(bladeGeo, bladeMat);
    toolGroup.add(coreMesh);
    bladeMatsToFade.push(bladeMat);

    // Outer translucent plasma glow sheath
    const auraGeo = new THREE.CylinderGeometry(0.115, 0.115, 3.12, 18);
    auraGeo.rotateX(Math.PI * 0.5);
    auraGeo.translate(0, 0.06, -0.02);
    edgeMat = new THREE.MeshBasicMaterial({
      color: saberCol,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    toolGroup.add(new THREE.Mesh(auraGeo, edgeMat));

    // Metallic chrome lightsaber hilt extending to -Z
    const hiltGeo = new THREE.CylinderGeometry(0.09, 0.095, 1.25, 20);
    hiltGeo.rotateX(Math.PI * 0.5);
    hiltGeo.translate(0, 0.06, -2.18);
    const hiltMat = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.95, roughness: 0.18 });
    const hilt = new THREE.Mesh(hiltGeo, hiltMat);
    hilt.castShadow = true;
    toolGroup.add(hilt);

    // Dark grip rings
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.5, metalness: 0.3 });
    for (const gz of [-1.72, -2.05, -2.38, -2.62]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.10, 18), gripMat);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.set(0, 0.06, gz);
      toolGroup.add(ring);
    }
  } else if (style === 'credit-card') {
    const cardCol = customColor ?? 0x14171f;
    blurHex = customColor ?? 0xf5d07a;

    // Sleek rigid metallic Black Card standing vertically on edge (y = 0..1.18, z = -1.1..+1.1)
    bladeGeo = new THREE.BoxGeometry(0.024, 1.15, 2.15);
    bladeGeo.translate(0, 0.575, 0);
    bladeMat = new THREE.MeshStandardMaterial({
      color: cardCol,
      metalness: 0.86,
      roughness: 0.22,
      emissive: forceGlow ? cardCol : 0x000000,
      emissiveIntensity: forceGlow ? 0.6 : 0,
    });
    const cardMesh = new THREE.Mesh(bladeGeo, bladeMat);
    cardMesh.castShadow = true;
    toolGroup.add(cardMesh);
    bladeMatsToFade.push(bladeMat);

    // Gold EMV chip + metallic gold trim border
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf6c94c, metalness: 0.96, roughness: 0.16 });
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.24, 0.32), goldMat);
    chip.position.set(0, 0.62, 0.45);
    toolGroup.add(chip);

    edgeMat = goldMat;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 2.16), goldMat);
    rim.position.set(0, 0.02, 0);
    toolGroup.add(rim);
  } else if (style === 'cleaver') {
    const col = customColor ?? 0xd8e0e8;
    blurHex = customColor ?? 0xd8e2ec;

    // Tall heavy rectangular Chinese butcher cleaver blade
    const shape = new THREE.Shape();
    shape.moveTo(-1.42, 0.0);
    shape.lineTo(1.22, 0.0);
    shape.quadraticCurveTo(1.34, 0.04, 1.36, 0.18);
    shape.lineTo(1.36, 1.02);
    shape.lineTo(-1.42, 1.02);
    shape.closePath();

    // Hanging hole near top tip corner
    const hole = new THREE.Path();
    hole.absarc(1.06, 0.82, 0.095, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2 });
    bladeGeo.translate(0, 0, -0.016);
    bladeGeo.rotateY(-Math.PI * 0.5);

    bladeMat = new THREE.MeshStandardMaterial({
      color: col,
      metalness: 0.92,
      roughness: 0.22,
      emissive: forceGlow ? col : 0x000000,
      emissiveIntensity: forceGlow ? 0.9 : 0,
    });
    const m = new THREE.Mesh(bladeGeo, bladeMat);
    m.castShadow = true;
    toolGroup.add(m);
    bladeMatsToFade.push(bladeMat);

    edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.98, roughness: 0.05 });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 2.55), edgeMat);
    edge.position.set(0, 0.015, -0.08);
    toolGroup.add(edge);
    bladeMatsToFade.push(edgeMat);

    // Warm dark rosewood cylindrical handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.125, 1.25, 16),
      new THREE.MeshStandardMaterial({ color: 0x4a2512, roughness: 0.50, metalness: 0.05 })
    );
    handle.rotation.x = Math.PI * 0.5;
    handle.position.set(0, 0.72, -2.05);
    handle.castShadow = true;
    toolGroup.add(handle);
  } else if (style === 'katana') {
    const col = customColor ?? 0xf0f6ff;
    blurHex = customColor ?? 0xe6f4ff;

    // Long slender slightly curved Samurai Katana blade
    const shape = new THREE.Shape();
    shape.moveTo(-1.55, 0.0);
    shape.lineTo(1.25, 0.0);
    shape.quadraticCurveTo(1.62, 0.04, 1.78, 0.22);
    shape.lineTo(-1.55, 0.26);
    shape.closePath();

    bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2 });
    bladeGeo.translate(0, 0, -0.011);
    bladeGeo.rotateY(-Math.PI * 0.5);

    bladeMat = new THREE.MeshStandardMaterial({
      color: col,
      metalness: 0.98,
      roughness: 0.07,
      emissive: forceGlow ? col : 0x000000,
      emissiveIntensity: forceGlow ? 0.9 : 0,
    });
    const m = new THREE.Mesh(bladeGeo, bladeMat);
    m.castShadow = true;
    toolGroup.add(m);
    bladeMatsToFade.push(bladeMat);

    edgeMat = bladeMat;

    // Ornate Gold Tsuba Guard
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xebb834, metalness: 0.94, roughness: 0.22 });
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20), goldMat);
    tsuba.rotation.x = Math.PI * 0.5;
    tsuba.position.set(0, 0.14, -1.58);
    tsuba.castShadow = true;
    toolGroup.add(tsuba);

    // Traditional wrapped Tsuka handle (crimson & black)
    const tsuka = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.20, 1.48),
      new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.72, metalness: 0.05 })
    );
    tsuka.position.set(0, 0.14, -2.35);
    tsuka.castShadow = true;
    toolGroup.add(tsuka);

    const wrapMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.65 });
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.09, 0.09), wrapMat);
      d.rotation.x = Math.PI * 0.25;
      d.position.set(0, 0.14, -1.78 - i * 0.21);
      toolGroup.add(d);
    }
  } else if (style === 'steel-scraper') {
    const col = customColor ?? 0xe2e8f0;
    blurHex = customColor ?? 0xe2e8f0;

    bladeGeo = new THREE.BoxGeometry(0.018, 0.86, 2.85);
    bladeGeo.translate(0, 0.43, 0);
    bladeMat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.95, roughness: 0.14 });
    const m = new THREE.Mesh(bladeGeo, bladeMat);
    m.castShadow = true;
    toolGroup.add(m);
    bladeMatsToFade.push(bladeMat);
    edgeMat = bladeMat;

    // Rolled tubular top grip along spine
    const topGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.90, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.42, metalness: 0.4 })
    );
    topGrip.rotation.x = Math.PI * 0.5;
    topGrip.position.set(0, 0.90, 0);
    topGrip.castShadow = true;
    toolGroup.add(topGrip);
  } else {
    // Classic Gyuto Chef Knife / 1000°C Hot Knife / Golden Blade / Crystal Blade / Saw
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-1.52, 0.0);
    if (style === 'saw') {
      for (let t = -1.45; t < 1.30; t += 0.16) {
        bladeShape.lineTo(t, 0.0);
        bladeShape.lineTo(t + 0.08, 0.085);
      }
      bladeShape.lineTo(1.52, 0.06);
    } else {
      bladeShape.lineTo(0.88, 0.0);
      bladeShape.quadraticCurveTo(1.34, 0.02, 1.56, 0.14);
    }
    bladeShape.quadraticCurveTo(1.30, 0.40, 0.72, 0.45);
    bladeShape.lineTo(-1.52, 0.48);
    bladeShape.closePath();

    bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    bladeGeo.translate(0, 0, -0.013);
    bladeGeo.rotateY(-Math.PI * 0.5);

    const isHot = style === 'hot-knife-1000c';
    const isGold = style === 'golden-blade';
    const isCrystal = style === 'crystal-blade';

    const mainCol =
      isHot ? (customColor ?? 0xff5514) :
      isGold ? 0xffd24c :
      isCrystal ? (customColor ?? 0x7dd3fc) :
      (customColor ?? 0xe6edf5);

    blurHex =
      isHot ? 0xff6b1a :
      isGold ? 0xffd65c :
      isCrystal ? 0x7dd3fc :
      (customColor ?? 0xdff2ff);

    bladeMat = new THREE.MeshStandardMaterial({
      color: mainCol,
      metalness: isCrystal ? 0.18 : isHot ? 0.45 : 0.94,
      roughness: isCrystal ? 0.06 : isHot ? 0.28 : 0.15,
      emissive: isHot ? 0xff3b00 : isCrystal ? 0x0ea5e9 : forceGlow ? mainCol : 0x000000,
      emissiveIntensity: isHot ? 1.85 : isCrystal ? 0.45 : forceGlow ? 1.1 : 0.0,
    });

    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.castShadow = true;
    bladeMesh.receiveShadow = true;
    toolGroup.add(bladeMesh);
    bladeMatsToFade.push(bladeMat);

    edgeMat = new THREE.MeshStandardMaterial({
      color: isHot ? 0xfff08a : 0xffffff,
      metalness: isHot ? 0.2 : 0.98,
      roughness: 0.05,
      emissive: isHot ? 0xffaa00 : 0x000000,
      emissiveIntensity: isHot ? 2.4 : 0.0,
    });
    const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.026, 2.52), edgeMat);
    edgeMesh.position.set(0, 0.014, -0.22);
    toolGroup.add(edgeMesh);
    bladeMatsToFade.push(edgeMat);

    // Bolster & Riveted Handle
    const bolsterMat = new THREE.MeshStandardMaterial({
      color: isGold ? 0xf6c94c : 0xcfd6de,
      metalness: 0.90,
      roughness: 0.22,
    });
    const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.24), bolsterMat);
    bolster.position.set(0, 0.31, -1.62);
    bolster.castShadow = true;
    toolGroup.add(bolster);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.27, 1.38),
      new THREE.MeshStandardMaterial({ color: isGold ? 0x111216 : 0x221a16, roughness: 0.44, metalness: 0.08 })
    );
    handle.position.set(0, 0.33, -2.38);
    handle.castShadow = true;
    toolGroup.add(handle);

    const rivetGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.165, 12);
    rivetGeo.rotateZ(Math.PI * 0.5);
    for (const rz of [-1.96, -2.36, -2.76]) {
      const rivet = new THREE.Mesh(rivetGeo, bolsterMat);
      rivet.position.set(0, 0.33, rz);
      toolGroup.add(rivet);
    }
  }

  return {
    toolGroup,
    bladeGeo,
    bladeMatsToFade,
    blurHex,
  };
}
