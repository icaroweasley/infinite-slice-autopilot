import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo } from './render-headless.mjs';
import { loadConfig, loadHistory, recordEntry } from './history-cli.mjs';
import { buildEnglishCaption, publishReel } from './publish-reels.mjs';
import { hasYouTubeCredentials, publishYouTubeShort } from './publish-youtube.mjs';
import {
  AI_OBJECT_SUGGESTIONS,
  AI_CUTTER_SUGGESTIONS,
  AI_SURFACE_SUGGESTIONS,
  AI_ENV_SUGGESTIONS,
} from '../engine/src/data/ai-suggestions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SLOT_FILES = {
  object: path.join(ROOT, 'engine', 'src', 'objects', 'object-builder.js'),
  cutter: path.join(ROOT, 'engine', 'src', 'engine', 'custom-cutter.js'),
  surface: path.join(ROOT, 'engine', 'src', 'engine', 'custom-surface.js'),
  environment: path.join(ROOT, 'engine', 'src', 'engine', 'custom-environment.js'),
};

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function detectAiProvider() {
  const forced = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  if (forced === 'fallback') return 'fallback';
  if (forced === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (forced === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'fallback';
}

function buildAiSystemPrompt(usedSlugs, usedScenes = [], previousError = '') {
  const specObj = fs.readFileSync(path.join(ROOT, 'references', 'object-recipe-spec.md'), 'utf8');
  const specSlots = fs.readFileSync(path.join(ROOT, 'references', 'ai-slots-spec.md'), 'utf8');

  return `You are an elite Three.js procedural 3D artist running an autonomous viral "Infinite Slicing" 9:16 Reels/Shorts studio (@atomslice3d).

TASK:
Invent ONE completely original, never-repeated, MEGA-VIRAL 4-part scene engineered for 1M–44M view retention (inspired by top viral 3D slicing channels):
1. A universally recognizable, hyper-appetizing or iconic everyday 3D volumetric Object with a jaw-dropping, ultra-detailed internal anatomy when sliced open!
   - PRIORITIZE proven viral categories (NEVER repeat anything in ALREADY USED SLUGS below):
     * Vibrant fresh fruits & produce (e.g., Red Chili Pepper with white pith & seeds, Ruby Pomegranate packed with jewel arils, Green Bartlett Pear with core, Purple Cabbage with layered concentric veins, Yellow Banana, Fresh Cucumber with watery seed core, Red Onion with purple rings, Juicy Orange with citrus segments, Cantaloupe Melon, Lime, Red Apple, Kiwi with green flesh & black seed ring, Coconut with white meat, Dragon Fruit, Sweet Potato).
     * Crave-worthy foods & desserts (e.g., Fresh Salmon Fillet with white fat marbling, Berry Lattice Pie, Neapolitan Ice Cream Sandwich, Glazed Pink Donut with sprinkles, Croissant with flaky layers, Frosted Layer Cake, Sushi Roll, Matcha Mille-Crepe, Ramen Egg, Cheesecake slice).
     * Viral curiosity & iconic objects (e.g., Anatomically Stylized Pink Brain, Glass Apple with molten core, Vintage Pokéball, Nintendo Switch, Luxury Watch, Emerald Crystal Block, Neon Soap Bar, "Is It Cake?" Clay Brick).
   - IMPORTANT FOR OUR 1024x1024 ULTRA-HD SURFACE BAKER:
     * Use high-segment smooth geometry (e.g., SphereGeometry(0.5, 64, 48), CylinderGeometry(..., 64, 28)) with valid UVs!
     * Use smoothstep() transitions for stripes, seeds, rings, and veins so the 1024x1024 outer texture and 512x512 cut caps look razor-sharp and photorealistic — ZERO pixelated hard jumps!
2. A WILDLY CREATIVE, UNIQUE 3D Cutter/Blade (edge strictly along local y=0, z in [-1.5, +1.5], handle extending to -Z) — MUST BE 100% DIFFERENT from every previous scene listed below! Invent original blades: hammered Damascus santoku, frosted sapphire crystal sword, copper mezzaluna blade, rose-gold ceramic chef blade, glowing emerald plasma edge, obsidian volcanic dagger, holographic prism blade, frosted acrylic pastry blade, brass Meiji cleaver, titanium surgical scalpel, etc. NEVER repeat the same silhouette or color twice!
3. A WILDLY CREATIVE, UNIQUE procedural Cutting Surface (1024x1024 or 512x512 CanvasTexture + PBR material on boardMat/rimMat) — MUST BE 100% DIFFERENT from every previous scene listed below! Invent bespoke textures: turquoise epoxy resin walnut river, sage-green Venetian terrazzo, pastel terracotta checkerboard ceramic, rose-quartz veined marble, warm fluted bamboo, lavender frosted glass, hammered brushed copper slab, deep malachite stone, cobalt Moroccan zellige tile, cream travertine slab, etc. NEVER repeat an old preset look!
4. A WILDLY CREATIVE, UNIQUE bright Studio Environment (scene.background + wallMat + counterMat + 3-point lighting) — MUST BE 100% DIFFERENT from every previous scene listed below! Invent fresh color palettes & architectural backdrops (Mediterranean pastel lime plaster, Japanese hinoki fluted wood slats, Parisian blush patisserie tiles, Midnight indigo velvet & brass, Kyoto matcha ceramic studio, Amalfi lemon & azure mosaic, Dusty lavender minimalist atelier, Warm copper espresso bar, Mint Nordic daylight studio) while ALWAYS keeping hero lighting bright, crisp, and high-contrast!

ALREADY USED SLUGS (DO NOT REPEAT ANY OF THESE OR OBVIOUS DUPLICATES):
${usedSlugs.length ? usedSlugs.join(', ') : '(none yet)'}

PREVIOUSLY USED SCENES (DO NOT REPEAT ANY OF THESE BLADES, BOARDS, OR STUDIO PALETTES):
${usedScenes.length ? usedScenes.slice(-24).join('\n') : '(none yet)'}

TECHNICAL CONTRACTS (MUST FOLLOW 100% STRICTLY):
${specObj}
---
${specSlots}

CRITICAL RULES FOR ZERO ERRORS:
- Output ONLY a single valid JSON object (no markdown fences, no prose) with exact keys:
  {
    "slug": "unique-kebab-case",
    "conceptSummary": "1-sentence English summary naming object + unique blade + unique board + unique studio palette",
    "objectCode": "full ES module code for engine/src/objects/object-builder.js exporting customObject (imports * as THREE from 'three' and helpers from './noise.js')",
    "cutterCode": "full ES module code for engine/src/engine/custom-cutter.js exporting customCutter (imports * as THREE from 'three')",
    "surfaceCode": "full ES module code for engine/src/engine/custom-surface.js exporting customSurface (imports * as THREE from 'three')",
    "environmentCode": "full ES module code for engine/src/engine/custom-environment.js exporting customEnvironment (imports * as THREE from 'three')"
  }
- Inside objectCode: export const customObject = { id: 'custom', slug, name, englishName, subtitle, bounds, gridRes, physics, contains(nx,ny,nz), sampleVolume(nx,ny,nz), createOuterGeometry() }.
- Ensure createOuterGeometry() translates geometry so its bottom rests at y = 0, preserves valid UV attributes, and never returns NaN.
- Ensure sampleVolume() ALWAYS returns { r, g, b, roughness, metalness, emissive } with numbers in [0, 1].
- Ensure cutterCode's build() returns { toolGroup, bladeGeo, bladeMatsToFade, blurHex }.
${previousError ? `\nPREVIOUS BUILD FAILED WITH THIS ERROR — FIX IT:\n${previousError}` : ''}`;
}

const CLOUD_EN_OBJECTS = [
  'Giant Glossy Red Strawberry with emerald green leaves',
  'Sweet Striped Watermelon with juicy red seeded flesh',
  'Ripe Tropical Mango with sunset blush skin',
  'Pepperoni Pizza with melted mozzarella and golden crust',
  'Stack of 100 Dollar Bills bound with a gold band',
  'Stack of 6 golden pancakes with melting butter and maple syrup',
  'Swiss chocolate bar blocks stuffed with molten caramel',
  'Seared Wagyu A5 Marble Steak with fine white marbling',
  'Artisan Swiss Cheese Block with real hollow 3D holes',
  'Fresh Atlantic Salmon Fillet with white marbling lines',
  'Uramaki Salmon Sushi Roll with sesame rice and nori',
  'Clay Brick hiding a rainbow layer cake inside',
  'Vibrant Pink Dragon Fruit with white seed-speckled core',
  'Ripe Juicy Red Apple with crisp white core and seeds',
  'Fresh Green Kiwi Fruit with emerald flesh and black seed ring',
  'Bright Tangerine Orange with juicy citrus segments inside',
  'Ruby Pomegranate packed with glossy red crystal seeds',
  'Red Hot Chili Pepper with spicy white pith and seeds',
  'Cracked Obsidian Volcano with glowing magma core',
  'Mirror Pokeball with cyan plasma core',
  'Nintendo Switch OLED with copper circuit board inside',
  'Ripe Avocado with glossy wooden pit',
  'Galaxy Purple Translucent Soap with gold mica veins',
  'Blue Cut Diamond with radiant glowing core',
];

const CLOUD_EN_CUTTERS = [
  'Mirror-polished Japanese chef knife with dark walnut handle',
  'Blue Damascus steel samurai katana with gold guard',
  '1000C glowing red-hot chef knife',
  'Solid 24k gold Chinese cleaver',
  'Neon purple plasma lightsaber',
  'Emerald green plasma lightsaber',
  'Luxury metallic black credit card with gold chip',
  'Translucent sapphire diamond crystal blade',
  'Rose pink crystal katana sword',
  'Copper-forged serrated precision saw',
  'Glowing lava magma cleaver',
  'Chrome steel pastry scraper blade',
];

const CLOUD_EN_SURFACES = [
  'Walnut wood and turquoise epoxy resin river board',
  'Maple wood and amethyst purple epoxy resin river board',
  'Natural green Japanese bamboo cutting board',
  'Sage green pastel Venetian terrazzo stone slab',
  'Coral peach ceramic checkerboard tile cutting board',
  'Rose pink marble slab with gold veins',
  'Deep navy indigo marble slab with silver veins',
  'Black volcanic stone with glowing orange magma veins',
  'Frosted lavender glass slab with glow edge',
  'Brushed copper metallic Michelin slab',
  'Warm honey oak wood butcher block',
  'Deep emerald jade stone slab with gold veins',
];

const CLOUD_EN_ENVS = [
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
];

async function discoverActiveGeminiModels(apiKey) {
  const preferred = (process.env.GEMINI_MODEL || '').trim();
  const candidates = [];
  if (preferred) candidates.push(preferred);

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(listUrl);
    if (res.ok) {
      const json = await res.json();
      const valid = (json.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''))
        .filter((n) => n.startsWith('gemini-') && !n.includes('embedding') && !n.includes('tts') && !n.includes('image') && !n.includes('live'));

      // Prioritize newest stable/preview Gemini 3/2.5 Flash & Pro models
      const score = (name) => {
        let s = 0;
        if (name.includes('gemini-3.5-flash') || name.includes('gemini-3.8-flash')) s += 100;
        else if (name.includes('gemini-3-flash')) s += 90;
        else if (name.includes('gemini-2.5-flash') && !name.includes('lite')) s += 80;
        else if (name.includes('gemini-3') && name.includes('pro')) s += 75;
        else if (name.includes('gemini-2.5-pro')) s += 70;
        else if (name.includes('flash')) s += 50;
        if (name.includes('lite')) s -= 15;
        if (name.includes('exp')) s -= 10;
        return s;
      };
      valid.sort((a, b) => score(b) - score(a));
      for (const m of valid.slice(0, 4)) {
        if (!candidates.includes(m)) candidates.push(m);
      }
    }
  } catch (e) {
    console.warn(`[autopilot] Model discovery warning: ${e.message}`);
  }

  for (const fb of ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro']) {
    if (!candidates.includes(fb)) candidates.push(fb);
  }
  return candidates;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const models = await discoverActiveGeminiModels(apiKey);
  let lastErr = 'No Gemini models responded';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    console.log(`[autopilot] Calling Gemini model: ${model}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.0,
          responseMimeType: 'application/json',
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      lastErr = `Gemini ${model} (${res.status}): ${JSON.stringify(json).slice(0, 320)}`;
      console.warn(`[autopilot] ${lastErr}`);
      if (res.status === 404 || res.status === 400 || res.status === 429) continue;
      throw new Error(lastErr);
    }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastErr = `Gemini ${model} returned empty response`;
      continue;
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    console.log(`[autopilot] SUCCESS: Gemini ${model} invented 4 brand-new custom 3D modules!`);
    return JSON.parse(cleaned);
  }

  throw new Error(lastErr);
}

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  const raw = json.content?.[0]?.text || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

function validateBuild() {
  try {
    execSync('npx vite build --config engine/vite.config.js', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, error: '' };
  } catch (err) {
    const out = `${err.stdout?.toString() || ''}\n${err.stderr?.toString() || ''}`.slice(-1000);
    return { ok: false, error: out };
  }
}

function pickUnusedSuggestion(list, usedStrings) {
  const fresh = list.filter((idea) => {
    const low = idea.toLowerCase();
    return !usedStrings.some((u) => u && u.length > 3 && low.includes(u));
  });
  const pool = fresh.length > 0 ? fresh : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const getFlag = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const dryRun = hasFlag('dry-run');
  const shouldPublish = hasFlag('publish');
  const cleanup = hasFlag('cleanup');
  const quick = hasFlag('quick');

  const cfg = loadConfig();
  const hist = loadHistory();
  const usedSlugs = hist.entries.map((e) => (e.slug || '').toLowerCase()).filter(Boolean);
  const usedStrings = [
    ...usedSlugs,
    ...hist.entries.map((e) => (e.name || e.englishName || '').toLowerCase()).filter(Boolean),
  ];
  const usedCutters = hist.entries.map((e) => (e.cutterPrompt || e.cutterId || '').toLowerCase()).filter(Boolean);
  const usedSurfaces = hist.entries.map((e) => (e.surfacePrompt || e.surfaceId || '').toLowerCase()).filter(Boolean);
  const usedEnvs = hist.entries.map((e) => (e.envPrompt || e.envId || '').toLowerCase()).filter(Boolean);
  const usedScenes = hist.entries.map((e) =>
    e.conceptSummary ||
    `${e.englishName || e.name || e.slug} | blade=${e.cutterPrompt || e.cutterId || 'unknown'} | board=${e.surfacePrompt || e.surfaceId || 'unknown'} | studio=${e.envPrompt || e.envId || 'unknown'}`
  );

  const provider = detectAiProvider();
  console.log(`\n=== Infinite Slice 24/7 Cloud Autopilot ===`);
  console.log(`Provider: ${provider.toUpperCase()} | Previous creations: ${usedSlugs.length} | Mode: ${quick ? 'QUICK' : 'PRODUCTION'} | Publish: ${shouldPublish && !dryRun ? 'LIVE' : 'DRY-RUN'}`);
  console.log(
    `[env-check] GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'present' : 'MISSING'} | ` +
    `IG_ACCESS_TOKEN=${process.env.IG_ACCESS_TOKEN ? 'present' : 'MISSING'} | ` +
    `IG_USER_ID=${process.env.IG_USER_ID ? 'present' : 'MISSING'} | ` +
    `YT_SHORTS=${hasYouTubeCredentials() ? 'present' : 'not-set'} | ` +
    `CLOUDINARY=${process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET ? 'present' : 'not-set'} | ` +
    `N8N_WEBHOOK_URL=${process.env.N8N_WEBHOOK_URL ? 'present' : 'not-set'}`
  );

  // Fail-fast before spending minutes rendering if --publish is requested without any publishing credentials
  if (shouldPublish && !dryRun && !process.env.N8N_WEBHOOK_URL && !process.env.IG_ACCESS_TOKEN && !hasYouTubeCredentials()) {
    throw new Error(
      'Cannot run with --publish: neither IG_ACCESS_TOKEN, YouTube credentials, nor N8N_WEBHOOK_URL is set! ' +
      'Add IG_ACCESS_TOKEN (or UPLOAD_POST_API_KEY / YT_REFRESH_TOKEN) under GitHub -> Settings -> Secrets and variables -> Actions -> Repository secrets.'
    );
  }

  // Choose high-retention 4-round viral pacing if not explicitly forced
  const roundPresets = [
    [10, 50, 250, 1000],
    [10, 100, 500, 1000],
    [10, 50, 100, 1000],
  ];
  const roundsArg = getFlag('rounds', quick ? '10,100,1000' : null);
  const rounds = roundsArg
    ? roundsArg.split(',').map(Number)
    : roundPresets[Math.floor(Math.random() * roundPresets.length)];

  const resStr = getFlag('res', quick ? '540x960' : `${cfg.render.width || 720}x${cfg.render.height || 1280}`);
  const [width, height] = resStr.split('x').map(Number);
  const fps = Number(getFlag('fps', quick ? '30' : String(cfg.render.fps || 30)));
  const durationScale = quick ? 0.55 : Number(getFlag('scale', '0.78'));

  let renderOpts = {
    handle: getFlag('handle', cfg.brand?.handle || '@atomslice3d'),
    width,
    height,
    fps,
    rounds,
    durationScale,
    showHud: true,
  };

  let aiSucceeded = false;
  let conceptSummary = '';
  const backups = Object.fromEntries(
    Object.entries(SLOT_FILES).map(([k, p]) => [k, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null])
  );
  const restoreSlotBackups = () => {
    for (const [k, content] of Object.entries(backups)) {
      if (content !== null) fs.writeFileSync(SLOT_FILES[k], content, 'utf8');
    }
  };
  const buildFallbackOpts = (base) => {
    const objPrompt = pickUnusedSuggestion(CLOUD_EN_OBJECTS, usedStrings);
    const cutterPrompt = pickUnusedSuggestion(CLOUD_EN_CUTTERS, usedCutters);
    const surfacePrompt = pickUnusedSuggestion(CLOUD_EN_SURFACES, usedSurfaces);
    const envPrompt = pickUnusedSuggestion(CLOUD_EN_ENVS, usedEnvs);
    conceptSummary = `${objPrompt} | blade=${cutterPrompt} | board=${surfacePrompt} | studio=${envPrompt}`;
    console.log(`[autopilot] Concept:\n  Object:  ${objPrompt}\n  Cutter:  ${cutterPrompt}\n  Surface: ${surfacePrompt}\n  Env:     ${envPrompt}`);
    return {
      ...base,
      objectId: 'prompt-custom',
      objectPrompt: objPrompt,
      cutterId: 'custom',
      cutterPrompt,
      surfaceId: 'custom',
      surfacePrompt,
      envId: 'custom',
      envPrompt,
    };
  };

  if (provider === 'gemini' || provider === 'claude') {
    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[autopilot] Asking ${provider.toUpperCase()} to invent & code 4 bespoke 3D modules (attempt ${attempt}/2)...`);
        const prompt = buildAiSystemPrompt(usedSlugs, usedScenes, lastErr);
        const generated = provider === 'gemini' ? await callGemini(prompt) : await callClaude(prompt);

        if (!generated.objectCode || !generated.cutterCode || !generated.surfaceCode || !generated.environmentCode) {
          throw new Error('AI JSON missing one of the 4 required module code fields');
        }

        fs.writeFileSync(SLOT_FILES.object, generated.objectCode, 'utf8');
        fs.writeFileSync(SLOT_FILES.cutter, generated.cutterCode, 'utf8');
        fs.writeFileSync(SLOT_FILES.surface, generated.surfaceCode, 'utf8');
        fs.writeFileSync(SLOT_FILES.environment, generated.environmentCode, 'utf8');

        console.log(`[autopilot] Validating generated 3D modules with Vite build ("${generated.conceptSummary || generated.slug}")...`);
        const check = validateBuild();
        if (!check.ok) {
          throw new Error(`Vite build failed:\n${check.error}`);
        }

        console.log(`[autopilot] AI 3D modules compiled cleanly! Ready to render.`);
        conceptSummary = generated.conceptSummary || generated.slug || '';
        renderOpts = {
          ...renderOpts,
          objectId: 'custom',
          cutterId: 'ai-custom',
          surfaceId: 'ai-custom',
          envId: 'ai-custom',
        };
        aiSucceeded = true;
        break;
      } catch (err) {
        lastErr = err.message || String(err);
        console.warn(`[autopilot] Attempt ${attempt} failed: ${lastErr.slice(0, 260)}`);
        restoreSlotBackups();
      }
    }
  }

  if (!aiSucceeded) {
    console.log('[autopilot] Using built-in zero-API semantic 3D composer (picking fresh non-repeated English concept)...');
    renderOpts = buildFallbackOpts(renderOpts);
  }

  // Render deterministic MP4 + synced 48kHz ASMR audio (auto-fallback if AI code crashes at WebGL runtime!)
  let manifest;
  try {
    manifest = await renderHeadlessVideo(renderOpts);
  } catch (renderErr) {
    if (aiSucceeded) {
      console.warn(`[autopilot] AI-generated 3D modules failed at WebGL runtime (${renderErr.message?.slice(0, 240)}) — falling back cleanly to procedural Ultra-HD composer!`);
      restoreSlotBackups();
      aiSucceeded = false;
      renderOpts = buildFallbackOpts(renderOpts);
      manifest = await renderHeadlessVideo(renderOpts);
    } else {
      throw renderErr;
    }
  } finally {
    // Keep engine slot files clean in git working tree after render finishes
    restoreSlotBackups();
  }
  const caption = buildEnglishCaption(manifest, cfg);

  recordEntry({
    source: `cloud-autopilot:${aiSucceeded ? provider : 'fallback'}`,
    objectId: manifest.objectId,
    slug: manifest.slug,
    name: manifest.name,
    englishName: manifest.englishName,
    cutterId: manifest.cutterId,
    cutterPrompt: renderOpts.cutterPrompt || '',
    surfaceId: manifest.surfaceId,
    surfacePrompt: renderOpts.surfacePrompt || '',
    envId: manifest.envId,
    envPrompt: renderOpts.envPrompt || '',
    conceptSummary,
    rounds: manifest.rounds,
    maxCubes: manifest.maxCubes,
    durationSec: manifest.durationSec,
    resolution: `${manifest.width}x${manifest.height}`,
    fps: manifest.fps,
    videoFile: manifest.videoFile,
    caption,
  });

  if (shouldPublish || dryRun) {
    let pub = { provider: 'skipped' };
    if (dryRun || process.env.IG_ACCESS_TOKEN || process.env.N8N_WEBHOOK_URL) {
      pub = await publishReel({
        videoPath: manifest.videoFile,
        dryRun,
        captionOverride: caption,
      });
    }
    // Cross-post automatically to YouTube Shorts if YouTube credentials are configured
    if (dryRun || hasYouTubeCredentials()) {
      try {
        await publishYouTubeShort({
          videoPath: manifest.videoFile,
          manifest,
          dryRun,
        });
      } catch (ytErr) {
        console.error('[autopilot] YouTube Shorts cross-post warning:', ytErr.message);
      }
    }
    if (cleanup && shouldPublish && !dryRun && pub.provider !== 'dry-run') {
      if (fs.existsSync(manifest.videoAbsolutePath)) {
        fs.unlinkSync(manifest.videoAbsolutePath);
        console.log(`[autopilot] Cleaned up uploaded MP4 to save cloud disk space.`);
      }
    }
  } else {
    console.log('\n[autopilot] Rendered locally (pass --publish to upload to Instagram Reels, or --dry-run to preview caption).');
  }
}

main().catch((err) => {
  console.error('[autopilot] FATAL:', err);
  process.exit(1);
});
