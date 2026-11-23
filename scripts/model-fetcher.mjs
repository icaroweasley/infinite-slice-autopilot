import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepetition } from './anti-repeat.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const RUNTIME_MODEL_DIR = path.join(ROOT, 'engine', 'public', 'runtime-model');

const USER_AGENT = 'AtomSlice3D-Autopilot/2.0';

/**
 * Curated VIP Catalog of 70+ Photorealistic, Studio-Scanned CC0 3D Models
 * (Poly Haven + Khronos glTF Sample Assets — 100% free, zero API key required!)
 * Each entry pairs a real recognizable 3D model with a jaw-dropping solid volumetric interior.
 */
export const CURATED_3D_MODELS = [
  // === ULTRA-VIRAL "IS IT CAKE?!" & ICONIC EVERYDAY OBJECTS ===
  { source: 'polyhaven', assetId: 'rubber_duck_toy', slug: '3d-yellow-rubber-duck', englishName: 'Yellow Rubber Duck', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'croissant', slug: '3d-flaky-golden-croissant', englishName: 'Flaky Golden Croissant', interiorStyle: 'croissant-pastry', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'bananas', slug: '3d-ripe-yellow-bananas', englishName: 'Ripe Yellow Bananas', interiorStyle: 'banana', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'lemon', slug: '3d-juicy-yellow-lemon', englishName: 'Juicy Yellow Lemon', interiorStyle: 'citrus-lemon', soundProfile: 'culinary', rotateZ: Math.PI / 2, priority: 10 },
  { source: 'polyhaven', assetId: 'treasure_chest', slug: '3d-pirate-treasure-chest', englishName: 'Pirate Treasure Chest', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 10 },
  { source: 'polyhaven', assetId: 'Camera_01', slug: '3d-vintage-slr-camera', englishName: 'Vintage SLR Camera', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 10 },
  { source: 'polyhaven', assetId: 'gamepad', slug: '3d-pro-gaming-controller', englishName: 'Gaming Controller', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 10 },
  { source: 'khronos', assetId: 'MaterialsVariantsShoe', slug: '3d-designer-sneaker', englishName: 'Designer Sneaker', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'alarm_clock_01', slug: '3d-retro-alarm-clock', englishName: 'Retro Alarm Clock', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 10 },
  { source: 'polyhaven', assetId: 'baseball_01', slug: '3d-pro-baseball', englishName: 'Pro Stitched Baseball', interiorStyle: 'baseball-core', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'american_football', slug: '3d-american-football', englishName: 'Leather American Football', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 10 },
  { source: 'polyhaven', assetId: 'food_lime_01', slug: '3d-fresh-green-lime', englishName: 'Fresh Green Lime', interiorStyle: 'citrus-lime', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'food_pears_asian_01', slug: '3d-asian-golden-pear', englishName: 'Golden Asian Pear', interiorStyle: 'pear-flesh', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'food_lychee_01', slug: '3d-exotic-lychee-fruit', englishName: 'Exotic Lychee Fruit', interiorStyle: 'lychee-core', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'yellow_onion', slug: '3d-golden-yellow-onion', englishName: 'Golden Yellow Onion', interiorStyle: 'onion-rings', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'sweet_potato', slug: '3d-sweet-potato', englishName: 'Sweet Potato', interiorStyle: 'sweet-potato', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'food_ginger_01', slug: '3d-fresh-ginger-root', englishName: 'Fresh Ginger Root', interiorStyle: 'ginger-root', soundProfile: 'culinary', priority: 8 },
  { source: 'khronos', assetId: 'DamagedHelmet', slug: '3d-scifi-cyber-helmet', englishName: 'Sci-Fi Cyber Helmet', interiorStyle: 'tech-pcb', soundProfile: 'metal', priority: 9 },
  { source: 'khronos', assetId: 'MosquitoInAmber', slug: '3d-jurassic-amber-fossil', englishName: 'Jurassic Amber Fossil', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 9 },
  { source: 'khronos', assetId: 'ToyCar', slug: '3d-vintage-toy-car', englishName: 'Vintage Toy Race Car', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 9 },
  { source: 'khronos', assetId: 'ChronographWatch', slug: '3d-luxury-chronograph-watch', englishName: 'Luxury Chronograph Watch', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 9 },
  { source: 'khronos', assetId: 'BarramundiFish', slug: '3d-barramundi-fish', englishName: 'Silver Barramundi Fish', interiorStyle: 'amethyst-crystal', soundProfile: 'culinary', priority: 8 },
  { source: 'khronos', assetId: 'SunglassesKhronos', slug: '3d-luxury-sunglasses', englishName: 'Luxury Sunglasses', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 8 },
  { source: 'khronos', assetId: 'ScatteringSkull', slug: '3d-crystal-skull', englishName: 'Crystal Sculpture Skull', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 9 },
  { source: 'khronos', assetId: 'TrafficCone', slug: '3d-orange-traffic-cone', englishName: 'Orange Traffic Cone', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 8 },
  { source: 'khronos', assetId: 'DiffuseTransmissionTeacup', slug: '3d-porcelain-teacup', englishName: 'Porcelain Teacup', interiorStyle: 'cake-chocolate', soundProfile: 'crystal', priority: 8 },
  { source: 'polyhaven', assetId: 'garden_gnome', slug: '3d-ceramic-garden-gnome', englishName: 'Ceramic Garden Gnome', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 9 },
  { source: 'polyhaven', assetId: 'boombox', slug: '3d-80s-retro-boombox', englishName: '80s Retro Boombox', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 9 },
  { source: 'polyhaven', assetId: 'pocket_watch', slug: '3d-gold-pocket-watch', englishName: 'Antique Gold Pocket Watch', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 9 },
  { source: 'polyhaven', assetId: 'classic_laptop', slug: '3d-classic-laptop', englishName: 'Classic Laptop Computer', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 9 },
  { source: 'polyhaven', assetId: 'Television_01', slug: '3d-retro-crt-television', englishName: 'Retro CRT Television', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 9 },
  { source: 'polyhaven', assetId: 'Ukulele_01', slug: '3d-wooden-ukulele', englishName: 'Acoustic Wooden Ukulele', interiorStyle: 'marble-damascus', soundProfile: 'culinary', priority: 8 },
  { source: 'polyhaven', assetId: 'marble_bust_01', slug: '3d-roman-marble-bust', englishName: 'Roman Marble Bust Statue', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 9 },
  { source: 'polyhaven', assetId: 'bronze_shark_statue', slug: '3d-bronze-shark-statue', englishName: 'Bronze Shark Sculpture', interiorStyle: 'amethyst-crystal', soundProfile: 'metal', priority: 9 },
  { source: 'polyhaven', assetId: 'bronze_whale_statue', slug: '3d-bronze-whale-statue', englishName: 'Bronze Whale Sculpture', interiorStyle: 'amethyst-crystal', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'carved_wooden_elephant', slug: '3d-carved-elephant-statue', englishName: 'Carved Elephant Statue', interiorStyle: 'marble-damascus', soundProfile: 'culinary', priority: 8 },
  { source: 'polyhaven', assetId: 'concrete_cat_statue', slug: '3d-lucky-cat-statue', englishName: 'Stone Cat Statue', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 8 },
  { source: 'polyhaven', assetId: 'horse_statue_01', slug: '3d-golden-horse-statue', englishName: 'Sculpted Horse Statue', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'lion_head', slug: '3d-royal-lion-sculpture', englishName: 'Royal Lion Head Sculpture', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'lambis_shell', slug: '3d-tropical-seashell', englishName: 'Tropical Conch Seashell', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 8 },
  { source: 'polyhaven', assetId: 'seadogs_compass', slug: '3d-pirate-brass-compass', englishName: 'Antique Brass Compass', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'vintage_lighter', slug: '3d-chrome-zippo-lighter', englishName: 'Vintage Metal Lighter', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'CashRegister_01', slug: '3d-antique-cash-register', englishName: 'Antique Cash Register', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'cassette_player', slug: '3d-retro-cassette-deck', englishName: 'Retro Cassette Player', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 8 },
  { source: 'polyhaven', assetId: 'vintage_video_camera', slug: '3d-vintage-camcorder', englishName: 'Vintage Video Camcorder', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 8 },
  { source: 'polyhaven', assetId: 'vintage_microwave', slug: '3d-retro-microwave', englishName: 'Retro Mint Microwave', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 8 },
  { source: 'polyhaven', assetId: 'lifebuoy', slug: '3d-marine-lifebuoy-ring', englishName: 'Red & White Lifebuoy Ring', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 8 },
  { source: 'polyhaven', assetId: 'dartboard', slug: '3d-pub-dartboard', englishName: 'Classic Target Dartboard', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 8 },
  { source: 'polyhaven', assetId: 'Megaphone_01', slug: '3d-loud-megaphone', englishName: 'Retro Megaphone', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 8 },
  { source: 'polyhaven', assetId: 'binoculars', slug: '3d-field-binoculars', englishName: 'Military Field Binoculars', interiorStyle: 'tech-pcb', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'korean_fire_extinguisher_01', slug: '3d-red-fire-extinguisher', englishName: 'Red Fire Extinguisher', interiorStyle: 'cake-rainbow', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'old_gas_mask', slug: '3d-vintage-gas-mask', englishName: 'Vintage Gas Mask', interiorStyle: 'amethyst-crystal', soundProfile: 'tech', priority: 8 },
  { source: 'polyhaven', assetId: 'vintage_electric_kettle', slug: '3d-chrome-electric-kettle', englishName: 'Vintage Chrome Kettle', interiorStyle: 'marble-damascus', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'Lantern_01', slug: '3d-camping-lantern', englishName: 'Classic Brass Lantern', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'antique_ceramic_vase_01', slug: '3d-porcelain-vase', englishName: 'Antique Porcelain Vase', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 7 },
  { source: 'polyhaven', assetId: 'brass_goblets', slug: '3d-royal-gold-goblet', englishName: 'Royal Brass Goblets', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'Drill_01', slug: '3d-cordless-power-drill', englishName: 'Cordless Power Drill', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 7 },
  { source: 'polyhaven', assetId: 'lightbulb_led', slug: '3d-glowing-lightbulb', englishName: 'Glass LED Lightbulb', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 8 },
  { source: 'polyhaven', assetId: 'vintage_suitcase', slug: '3d-leather-suitcase', englishName: 'Vintage Leather Suitcase', interiorStyle: 'treasure-gold', soundProfile: 'culinary', priority: 7 },
  { source: 'polyhaven', assetId: 'magnifying_glass_01', slug: '3d-detective-magnifying-glass', englishName: 'Brass Magnifying Glass', interiorStyle: 'amethyst-crystal', soundProfile: 'crystal', priority: 7 },
  { source: 'polyhaven', assetId: 'retro_multimeter', slug: '3d-retro-multimeter', englishName: 'Analog Retro Multimeter', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 7 },
  { source: 'polyhaven', assetId: 'vintage_oil_lamp', slug: '3d-genie-oil-lamp', englishName: 'Antique Genie Oil Lamp', interiorStyle: 'treasure-gold', soundProfile: 'metal', priority: 8 },
  { source: 'polyhaven', assetId: 'mantel_clock_01', slug: '3d-wooden-mantel-clock', englishName: 'Antique Mantel Clock', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'filmstrip_projector_8mm', slug: '3d-8mm-film-projector', englishName: 'Vintage 8mm Film Projector', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'spray_paint_bottles', slug: '3d-graffiti-spray-can', englishName: 'Graffiti Spray Paint Can', interiorStyle: 'cake-rainbow', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'brass_blowtorch', slug: '3d-brass-blowtorch', englishName: 'Vintage Brass Blowtorch', interiorStyle: 'marble-damascus', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'korean_public_payphone_01', slug: '3d-retro-public-payphone', englishName: 'Retro Public Payphone', interiorStyle: 'tech-pcb', soundProfile: 'tech', priority: 7 },
  { source: 'polyhaven', assetId: 'vintage_stapler', slug: '3d-metal-office-stapler', englishName: 'Vintage Metal Stapler', interiorStyle: 'clockwork', soundProfile: 'metal', priority: 7 },
  { source: 'polyhaven', assetId: 'rubber_boots', slug: '3d-yellow-rain-boots', englishName: 'Rubber Rain Boots', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 7 },
  { source: 'polyhaven', assetId: 'football', slug: '3d-classic-soccer-ball', englishName: 'Classic Soccer Ball', interiorStyle: 'cake-rainbow', soundProfile: 'culinary', priority: 8 },
];

// Exclude architectural/huge/flat/boring Poly Haven assets during dynamic expansion
const POLYHAVEN_SKIP_RE = /(tree|plant|bush|grass|branch|rock|cliff|boulder|wall|fence|door|window|chair|table|sofa|couch|bed|shelf|cabinet|desk|bench|stool|pillar|column|arch|roof|floor|rug|carpet|curtain|frame|poster|sign|cart|truck|wheelchair|crutch|broom|ladder|pipe|cable|wire|hose|scaffold|trash|bag|crate|barrel|pallet|chandelier|lamp_post|streetlight|aircon|stove|fridge)/i;

function titleCaseFromId(id) {
  return String(id || '')
    .replace(/_0?\d+$/g, '')
    .replace(/^food_/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function inferInteriorForDynamicAsset(id, categories = [], tags = []) {
  const txt = `${id} ${categories.join(' ')} ${tags.join(' ')}`.toLowerCase();
  if (/clock|watch|compass|timer|projector/.test(txt)) return { interiorStyle: 'clockwork', soundProfile: 'metal' };
  if (/camera|radio|tv|phone|electronic|computer|laptop|cassette|speaker|console|game|meter|drill/.test(txt)) {
    return { interiorStyle: 'tech-pcb', soundProfile: 'tech' };
  }
  if (/gold|brass|chest|crown|goblet|trophy|coin|lamp|lantern/.test(txt)) {
    return { interiorStyle: 'treasure-gold', soundProfile: 'metal' };
  }
  if (/glass|crystal|vase|bottle|bulb|shell|statue|bust|marble|ceramic|porcelain/.test(txt)) {
    return { interiorStyle: 'amethyst-crystal', soundProfile: 'crystal' };
  }
  if (/cake|pastry|bread|cookie|dessert|sweet/.test(txt)) {
    return { interiorStyle: 'cake-chocolate', soundProfile: 'culinary' };
  }
  // Surprise "IS IT CAKE?!" rainbow sponge or Damascus marble alternating deterministically
  return id.length % 2 === 0
    ? { interiorStyle: 'cake-rainbow', soundProfile: 'culinary' }
    : { interiorStyle: 'marble-damascus', soundProfile: 'culinary' };
}

/**
 * Returns ALL unused real 3D models (Curated VIP 70+ first, plus dynamically discovered
 * Poly Haven CC0 models if VIP pool gets low) strictly filtered by our anti-repeat index!
 */
export async function getFresh3DModelCandidates(antiRepeatIndex, { includeDynamic = false } = {}) {
  const freshVip = CURATED_3D_MODELS.filter((m) => !checkRepetition(m, antiRepeatIndex).repeated);
  if (!includeDynamic && freshVip.length >= 8) {
    return freshVip;
  }

  // Dynamic expansion from live Poly Haven CC0 API (500+ models)
  const seenIds = new Set(CURATED_3D_MODELS.map((m) => m.assetId.toLowerCase()));
  const dynamicFresh = [];
  try {
    const res = await fetch('https://api.polyhaven.com/assets?t=models', {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.ok) {
      const all = await res.json();
      for (const [assetId, info] of Object.entries(all)) {
        if (seenIds.has(assetId.toLowerCase())) continue;
        if (POLYHAVEN_SKIP_RE.test(assetId)) continue;
        const cats = (info.categories || []).map((c) => c.toLowerCase());
        const goodCat = cats.some((c) => /food|fruit|kitchen|toy|sport|electronic|music|decor|prop|tool/.test(c));
        if (!goodCat) continue;

        const englishName = titleCaseFromId(assetId);
        const { interiorStyle, soundProfile } = inferInteriorForDynamicAsset(assetId, cats, info.tags || []);
        const candidate = {
          source: 'polyhaven',
          assetId,
          slug: `3d-${assetId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          englishName,
          interiorStyle,
          soundProfile,
          priority: 5,
        };
        if (!checkRepetition(candidate, antiRepeatIndex).repeated) {
          dynamicFresh.push(candidate);
        }
      }
    }
  } catch (err) {
    console.warn(`[model-fetcher] Poly Haven dynamic discovery warning: ${err.message}`);
  }

  return [...freshVip, ...dynamicFresh];
}

async function downloadFileTo(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

/**
 * Cleans engine/public/runtime-model/ and downloads the selected CC0 3D model (.glb or .gltf + textures)
 * locally so headless Chromium loads it instantly over 127.0.0.1 with zero CORS or network flakiness.
 */
export async function downloadModelToPublic(asset) {
  cleanupRuntimeModelDir();
  fs.mkdirSync(RUNTIME_MODEL_DIR, { recursive: true });

  if (asset.source === 'khronos') {
    const glbUrl = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/${encodeURIComponent(asset.assetId)}/glTF-Binary/${encodeURIComponent(asset.assetId)}.glb`;
    const dest = path.join(RUNTIME_MODEL_DIR, 'model.glb');
    console.log(`[model-fetcher] Downloading Khronos CC0 GLB: ${asset.assetId}...`);
    const bytes = await downloadFileTo(glbUrl, dest);
    console.log(`[model-fetcher] Ready: /runtime-model/model.glb (${(bytes / 1024).toFixed(0)} KB)`);
    return {
      modelUrl: '/runtime-model/model.glb',
      bytes,
    };
  }

  if (asset.source === 'polyhaven') {
    console.log(`[model-fetcher] Fetching Poly Haven CC0 manifest: ${asset.assetId}...`);
    const filesRes = await fetch(`https://api.polyhaven.com/files/${encodeURIComponent(asset.assetId)}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!filesRes.ok) throw new Error(`Poly Haven /files/${asset.assetId} returned HTTP ${filesRes.status}`);
    const filesJson = await filesRes.json();

    const gltfEntry = filesJson.gltf?.['1k']?.gltf || filesJson.gltf?.['2k']?.gltf;
    if (!gltfEntry || !gltfEntry.url) {
      throw new Error(`Poly Haven asset "${asset.assetId}" has no 1k/2k gltf entry`);
    }

    const gltfFileName = path.basename(new URL(gltfEntry.url).pathname);
    let totalBytes = await downloadFileTo(gltfEntry.url, path.join(RUNTIME_MODEL_DIR, gltfFileName));

    const includes = gltfEntry.include || {};
    for (const [relPath, incInfo] of Object.entries(includes)) {
      if (!incInfo?.url) continue;
      // Normalize safe relative path strictly inside RUNTIME_MODEL_DIR
      const safeRel = relPath.replace(/^[/\\]+/, '').replace(/\.\./g, '');
      const dest = path.join(RUNTIME_MODEL_DIR, safeRel);
      totalBytes += await downloadFileTo(incInfo.url, dest);
    }

    console.log(`[model-fetcher] Ready: /runtime-model/${gltfFileName} (${(totalBytes / 1024).toFixed(0)} KB total across ${Object.keys(includes).length + 1} files)`);
    return {
      modelUrl: `/runtime-model/${gltfFileName}`,
      bytes: totalBytes,
    };
  }

  throw new Error(`Unsupported 3D model source: "${asset.source}"`);
}

export function cleanupRuntimeModelDir() {
  if (fs.existsSync(RUNTIME_MODEL_DIR)) {
    fs.rmSync(RUNTIME_MODEL_DIR, { recursive: true, force: true });
  }
}
