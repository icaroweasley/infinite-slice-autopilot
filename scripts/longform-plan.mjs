import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHistory } from './history-cli.mjs';
import {
  buildAntiRepeatIndex,
  checkRepetition,
  extractConceptTokens,
  fetchLiveInstagramCaptions,
} from './anti-repeat.mjs';
import { getFresh3DModelCandidates } from './model-fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

const LONGFORM_CUTTERS = [
  'Mirror-polished Japanese chef knife with dark walnut handle',
  'Blue Damascus steel samurai katana with gold guard',
  '1000C glowing red-hot chef knife',
  'Solid 24k gold Chinese cleaver',
  'Neon purple plasma lightsaber',
  'Emerald green plasma lightsaber',
  'Cyan ice plasma lightsaber',
  'Luxury metallic black credit card with gold chip',
  'Translucent sapphire diamond crystal blade',
  'Rose pink crystal katana sword',
  'Copper-forged serrated precision saw',
  'Glowing lava magma cleaver',
  'Chrome steel pastry scraper blade',
  'Brushed titanium santoku knife with coral handle',
  'Ruby red glowing plasma katana',
  'Mint frosted crystal butcher cleaver',
];

const LONGFORM_SURFACES = [
  'Walnut wood and turquoise epoxy resin river board',
  'Maple wood and amethyst purple epoxy resin river board',
  'Walnut wood and coral sunset epoxy resin river board',
  'Natural green Japanese bamboo cutting board',
  'Sage green pastel Venetian terrazzo stone slab',
  'Coral peach ceramic checkerboard tile cutting board',
  'Sky blue pastel ceramic checkerboard tile cutting board',
  'Rose pink marble slab with gold veins',
  'Deep navy indigo marble slab with silver veins',
  'White Carrara marble slab with gold veins',
  'Black volcanic stone with glowing orange magma veins',
  'Frosted lavender glass slab with glow edge',
  'Frosted mint ice glass slab with glow edge',
  'Brushed copper metallic Michelin slab',
  'Warm honey oak wood butcher block',
  'Deep emerald jade stone slab with gold veins',
];

const LONGFORM_ENVS = [
  'Warm fluted wood Japanese minimalist studio',
  'Pastel blush pink Parisian patisserie tile kitchen',
  'Mint sage Nordic daylight ceramic tile studio',
  'Deep midnight navy luxury hex mosaic boutique studio',
  'Warm terracotta sunset plaster atelier',
  'Cyberpunk violet neon brushed metal studio',
  'Dusty lavender architectural minimalist studio',
  'Espresso bronze industrial copper kitchen',
  'Amalfi lemon yellow sunny Mediterranean studio',
  'Turquoise coastal spa hex mosaic studio',
  'Cream travertine warm daylight Italian kitchen',
  'Soft sky blue Scandinavian tile studio',
  'Emerald botanical ceramic fluted wall studio',
  'Peach coral warm summer tile studio',
];

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const totalSlots = Math.max(1, Math.min(20, Number(getArg('slots', '12'))));
  const backupsPerSlot = Math.max(1, Number(getArg('backups', '2')));
  const width = Number(getArg('width', '1280'));
  const height = Number(getArg('height', '720'));
  const fps = Number(getArg('fps', '60'));
  const rounds = getArg('rounds', '10,50,100,250,500,1000').split(',').map(Number);
  const durationScale = Number(getArg('scale', '0.85'));
  const outPath = path.resolve(ROOT, getArg('out', 'output/longform/plan.json'));

  const hist = loadHistory();
  const liveIgCaptions = await fetchLiveInstagramCaptions();
  const antiRepeat = buildAntiRepeatIndex(hist.entries || [], liveIgCaptions);

  const prevLongformCount = (hist.entries || []).filter((e) => e.format === 'youtube-longform').length;
  const episodeNumber = prevLongformCount + 1;

  // Fetch enough unique non-repeated models for primary + backup candidates across all slots
  const neededModels = totalSlots * (1 + backupsPerSlot) + 12;
  console.log(`[longform-plan] Episode #${episodeNumber}: fetching ${neededModels} fresh non-repeated 3D models for ${totalSlots} slots...`);
  const pool = await getFresh3DModelCandidates(antiRepeat, neededModels);

  // Deduplicate strictly across the whole episode (no two slots or backups share assetId or core noun!)
  const usedIds = new Set();
  const usedNouns = new Set();
  const uniquePool = [];
  for (const asset of pool) {
    const rep = checkRepetition(asset, antiRepeat);
    if (rep.repeated) continue;
    const aid = String(asset.assetId || '').toLowerCase();
    if (usedIds.has(aid)) continue;
    const nouns = [...extractConceptTokens(`${asset.englishName || ''} ${asset.slug || ''}`)];
    if (nouns.some((n) => usedNouns.has(n))) continue;
    usedIds.add(aid);
    nouns.forEach((n) => usedNouns.add(n));
    uniquePool.push(asset);
  }

  if (uniquePool.length < totalSlots) {
    throw new Error(`Not enough unique fresh 3D models found (${uniquePool.length} < ${totalSlots})`);
  }

  const cutters = shuffle(LONGFORM_CUTTERS);
  const surfaces = shuffle(LONGFORM_SURFACES);
  const envs = shuffle(LONGFORM_ENVS);

  // First deal primary model to each slot (best priority first), then deal backups from the remainder!
  const primaries = uniquePool.slice(0, totalSlots);
  const backupPool = uniquePool.slice(totalSlots);

  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    const slotNum = i + 1;
    const candidates = [primaries[i]];
    for (let b = 0; b < backupsPerSlot; b++) {
      const idx = i + b * totalSlots;
      if (backupPool[idx]) candidates.push(backupPool[idx]);
    }
    slots.push({
      slot: slotNum,
      isFinalSlot: slotNum === totalSlots,
      cutterPrompt: cutters[i % cutters.length],
      surfacePrompt: surfaces[i % surfaces.length],
      envPrompt: envs[i % envs.length],
      candidates,
    });
  }

  const plan = {
    createdAt: new Date().toISOString(),
    episodeNumber,
    dateTag: new Date().toISOString().slice(0, 10),
    totalSlots,
    width,
    height,
    fps,
    rounds,
    durationScale,
    handle: '@atomsliced3d',
    slots,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');

  console.log(`[longform-plan] Saved Episode #${episodeNumber} plan -> ${outPath}`);
  for (const s of slots) {
    console.log(
      `  Slot ${String(s.slot).padStart(2, '0')}/${totalSlots}: ${s.candidates[0].englishName} ` +
        `(${s.candidates[0].source}:${s.candidates[0].assetId} | +${s.candidates.length - 1} backups)`
    );
  }
}

main().catch((err) => {
  console.error('[longform-plan] FATAL:', err);
  process.exit(1);
});
