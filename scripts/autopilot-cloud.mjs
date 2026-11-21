import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo } from './render-headless.mjs';
import { loadConfig, loadHistory, recordEntry } from './history-cli.mjs';
import { buildEnglishCaption, publishReel } from './publish-reels.mjs';
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

function buildAiSystemPrompt(usedSlugs, previousError = '') {
  const specObj = fs.readFileSync(path.join(ROOT, 'references', 'object-recipe-spec.md'), 'utf8');
  const specSlots = fs.readFileSync(path.join(ROOT, 'references', 'ai-slots-spec.md'), 'utf8');

  return `You are an elite Three.js procedural 3D artist running an autonomous viral "Infinite Slicing" 9:16 Reels studio.

TASK:
Invent ONE completely original, never-repeated, ultra-high-retention 4-part scene:
1. A unique 3D volumetric Object with a jaw-dropping internal surprise when sliced open.
2. A bespoke 3D Cutter/Knife/Tool (edge strictly along local y=0, z in [-1.5, +1.5], handle extending to -Z).
3. A bespoke procedural Cutting Surface (512x512 CanvasTexture + PBR material on boardMat/rimMat).
4. A bespoke Studio Environment (scene.background + wallMat + counterMat + 3-point lighting).

ALREADY USED SLUGS (DO NOT REPEAT ANY OF THESE OR OBVIOUS DUPLICATES):
${usedSlugs.length ? usedSlugs.join(', ') : '(none yet)'}

TECHNICAL CONTRACTS (MUST FOLLOW 100% STRICTLY):
${specObj}
---
${specSlots}

CRITICAL RULES FOR ZERO ERRORS:
- Output ONLY a single valid JSON object (no markdown fences, no prose) with exact keys:
  {
    "slug": "unique-kebab-case",
    "conceptSummary": "1-sentence English summary",
    "objectCode": "full ES module code for engine/src/objects/object-builder.js exporting customObject (imports * as THREE from 'three' and helpers from './noise.js')",
    "cutterCode": "full ES module code for engine/src/engine/custom-cutter.js exporting customCutter (imports * as THREE from 'three')",
    "surfaceCode": "full ES module code for engine/src/engine/custom-surface.js exporting customSurface (imports * as THREE from 'three')",
    "environmentCode": "full ES module code for engine/src/engine/custom-environment.js exporting customEnvironment (imports * as THREE from 'three')"
  }
- Inside objectCode: export const customObject = { id: 'custom', slug, name, englishName, subtitle, bounds, gridRes, physics, contains(nx,ny,nz), sampleVolume(nx,ny,nz), createOuterGeometry() }.
- Ensure createOuterGeometry() translates geometry so its bottom rests at y = 0 and never returns NaN.
- Ensure sampleVolume() ALWAYS returns { r, g, b, roughness, metalness, emissive } with numbers in [0, 1].
- Ensure cutterCode's build() returns { toolGroup, bladeGeo, bladeMatsToFade, blurHex }.
${previousError ? `\nPREVIOUS BUILD FAILED WITH THIS ERROR — FIX IT:\n${previousError}` : ''}`;
}

const CLOUD_EN_OBJECTS = [
  'Vibrant Pink Dragon Fruit with white seed-speckled core',
  'Ripe Avocado with glossy wooden pit',
  'Cracked Obsidian Volcano with glowing magma core',
  'Luxury Gold Mechanical Watch with internal gears',
  'Transparent Crystal Heart filled with molten gold',
  'Wagyu A5 Marble Steak with fine white marbling',
  'Artisan Swiss Cheese Block with real hollow 3D holes',
  'Matcha Mille-Crepe Cake with 14 alternating layers',
  'Giant Neon Jawbreaker with 12 concentric candy rings',
  'Stack of 100 Dollar Bills bound with a gold band',
  'Blue Cut Diamond with radiant glowing core',
  'Mirror Pokeball with cyan plasma core',
  'Clay Brick hiding a rainbow layer cake inside',
  'Arctic Ice Block with frozen pirate gold coins',
  'Ripe Red Pomegranate packed with ruby seeds',
  'Nintendo Switch OLED with copper circuit board inside',
  'Galaxy Purple Translucent Soap with gold mica veins',
  'Italian Tiramisu Cake with espresso and cocoa layers',
];

const CLOUD_EN_CUTTERS = [
  '1000C glowing red-hot chef knife',
  'Damascus steel samurai katana with gold guard',
  'Neon purple plasma lightsaber',
  'Solid 24k gold Chinese cleaver',
  'Luxury metallic black credit card with gold chip',
  'Translucent blue diamond crystal blade',
  'Obsidian magma wakizashi with glowing lava edge',
  'Emerald green neon lightsaber',
];

const CLOUD_EN_SURFACES = [
  'Deep purple marble slab with liquid gold veins',
  'Walnut wood and turquoise epoxy resin river board',
  'Black volcanic stone with glowing ember veins',
  'Frosted glass slab with cyan LED edge glow',
  'Polished pink quartz stone block',
  'Brushed copper architectural plate',
  'Striped Japanese bamboo cutting board',
  'Cracked glacial arctic ice slab',
];

const CLOUD_EN_ENVS = [
  'Cyberpunk Japanese kitchen at night with cyan and magenta neon lights',
  'Dark Michelin restaurant kitchen with brushed steel and warm spotlight',
  'Minimalist Scandinavian studio with soft morning light',
  'Futuristic ultra-white surgical lab studio',
  'Luxury black jewelry studio with golden rim light',
  'Deep purple galaxy studio with violet rim lighting',
  'Cozy terracotta sunset atelier with warm amber light',
  'Icy blue crystal cave with cool cinematic reflections',
];

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
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
  if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
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

  const provider = detectAiProvider();
  console.log(`\n=== Infinite Slice 24/7 Cloud Autopilot ===`);
  console.log(`Provider: ${provider.toUpperCase()} | Previous creations: ${usedSlugs.length} | Mode: ${quick ? 'QUICK' : 'PRODUCTION'} | Publish: ${shouldPublish && !dryRun ? 'LIVE' : 'DRY-RUN'}`);
  console.log(
    `[env-check] GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'present' : 'MISSING'} | ` +
    `IG_ACCESS_TOKEN=${process.env.IG_ACCESS_TOKEN ? 'present' : 'MISSING'} | ` +
    `IG_USER_ID=${process.env.IG_USER_ID ? 'present' : 'MISSING'} | ` +
    `CLOUDINARY=${process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET ? 'present' : 'not-set'} | ` +
    `N8N_WEBHOOK_URL=${process.env.N8N_WEBHOOK_URL ? 'present' : 'not-set'}`
  );

  // Fail-fast before spending minutes rendering if --publish is requested without credentials
  if (shouldPublish && !dryRun && !process.env.N8N_WEBHOOK_URL && !process.env.IG_ACCESS_TOKEN) {
    throw new Error(
      'Cannot run with --publish: neither IG_ACCESS_TOKEN nor N8N_WEBHOOK_URL is set! ' +
      'Add IG_ACCESS_TOKEN (and IG_USER_ID if using an EAA... token) under GitHub -> Settings -> Secrets and variables -> Actions -> Repository secrets.'
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

  if (provider === 'gemini' || provider === 'claude') {
    // Backup current 4 AI slot files before generation
    const backups = Object.fromEntries(
      Object.entries(SLOT_FILES).map(([k, p]) => [k, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null])
    );

    let lastErr = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[autopilot] Asking ${provider.toUpperCase()} to invent & code 4 bespoke 3D modules (attempt ${attempt}/2)...`);
        const prompt = buildAiSystemPrompt(usedSlugs, lastErr);
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
        // Restore backups before retry or fallback
        for (const [k, content] of Object.entries(backups)) {
          if (content !== null) fs.writeFileSync(SLOT_FILES[k], content, 'utf8');
        }
      }
    }
  }

  if (!aiSucceeded) {
    console.log('[autopilot] Using built-in zero-API semantic 3D composer (picking fresh non-repeated English concept)...');
    const objPrompt = pickUnusedSuggestion(CLOUD_EN_OBJECTS, usedStrings);
    const cutterPrompt = pickUnusedSuggestion(CLOUD_EN_CUTTERS, []);
    const surfacePrompt = pickUnusedSuggestion(CLOUD_EN_SURFACES, []);
    const envPrompt = pickUnusedSuggestion(CLOUD_EN_ENVS, []);
    console.log(`[autopilot] Concept:\n  Object:  ${objPrompt}\n  Cutter:  ${cutterPrompt}\n  Surface: ${surfacePrompt}\n  Env:     ${envPrompt}`);
    renderOpts = {
      ...renderOpts,
      objectId: 'prompt-custom',
      objectPrompt: objPrompt,
      cutterId: 'custom',
      cutterPrompt,
      surfaceId: 'custom',
      surfacePrompt,
      envId: 'custom',
      envPrompt,
    };
  }

  // Render deterministic MP4 + synced 48kHz ASMR audio
  const manifest = await renderHeadlessVideo(renderOpts);
  const caption = buildEnglishCaption(manifest, cfg);

  recordEntry({
    source: `cloud-autopilot:${aiSucceeded ? provider : 'fallback'}`,
    objectId: manifest.objectId,
    slug: manifest.slug,
    name: manifest.name,
    englishName: manifest.englishName,
    cutterId: manifest.cutterId,
    surfaceId: manifest.surfaceId,
    envId: manifest.envId,
    rounds: manifest.rounds,
    maxCubes: manifest.maxCubes,
    durationSec: manifest.durationSec,
    resolution: `${manifest.width}x${manifest.height}`,
    fps: manifest.fps,
    videoFile: manifest.videoFile,
    caption,
  });

  if (shouldPublish || dryRun) {
    const pub = await publishReel({
      videoPath: manifest.videoFile,
      dryRun,
      captionOverride: caption,
    });
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
