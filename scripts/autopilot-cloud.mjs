import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo, capturePreFlightFrames } from './render-headless.mjs';
import { loadConfig, loadHistory, saveHistory, recordEntry } from './history-cli.mjs';
import { buildEnglishCaption, publishReel } from './publish-reels.mjs';
import { hasYouTubeCredentials, publishYouTubeShort } from './publish-youtube.mjs';
import { hasTikTokCredentials, publishTikTokVideo } from './publish-tiktok.mjs';
import {
  buildAntiRepeatIndex,
  checkRepetition,
  fetchLiveInstagramCaptions,
} from './anti-repeat.mjs';
import {
  getFresh3DModelCandidates,
  downloadModelToPublic,
  cleanupRuntimeModelDir,
} from './model-fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

const VALID_INTERIOR_STYLES = [
  'cake-rainbow',
  'cake-chocolate',
  'cake-carrot',
  'croissant-pastry',
  'citrus-lemon',
  'citrus-lime',
  'banana',
  'pear-flesh',
  'onion-rings',
  'lychee-core',
  'sweet-potato',
  'ginger-root',
  'tech-pcb',
  'clockwork',
  'treasure-gold',
  'baseball-core',
  'amethyst-crystal',
  'marble-damascus',
  'galaxy-nebula',
  'magma-core',
  'matcha-cream',
];

const CLOUD_EN_CUTTERS = [
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

const CLOUD_EN_SURFACES = [
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
  'Cream travertine warm daylight Italian kitchen',
  'Soft sky blue Scandinavian tile studio',
  'Emerald botanical ceramic fluted wall studio',
  'Peach coral warm summer tile studio',
];

/**
 * Picks the least-recently-used item from a pool so consecutive Reels NEVER repeat
 * the same knife, cutting board, or studio wall color.
 */
function pickLeastRecentlyUsed(pool, recentList) {
  const rec = recentList.map((s) => String(s || '').toLowerCase());
  let bestItem = pool[0];
  let bestScore = -1;

  for (const item of pool) {
    const low = item.toLowerCase();
    // Distance from end of history (higher = not used recently; Infinity = never used)
    let lastIdx = -1;
    for (let i = rec.length - 1; i >= 0; i--) {
      if (rec[i] === low || (rec[i].length > 12 && low.includes(rec[i].slice(0, 18)))) {
        lastIdx = i;
        break;
      }
    }
    const age = lastIdx < 0 ? 10000 + Math.random() * 50 : (rec.length - 1 - lastIdx) + Math.random() * 0.5;
    if (age > bestScore) {
      bestScore = age;
      bestItem = item;
    }
  }
  return bestItem;
}

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

      const score = (name) => {
        let s = 0;
        if (name.includes('gemini-3.5-flash') || name.includes('gemini-3.8-flash')) s += 100;
        else if (name.includes('gemini-3-flash')) s += 90;
        else if (name.includes('gemini-2.5-flash') && !name.includes('lite')) s += 85;
        else if (name.includes('gemini-2.5-pro')) s += 75;
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
    console.warn(`[autopilot] Gemini model discovery warning: ${e.message}`);
  }

  for (const fb of ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-pro']) {
    if (!candidates.includes(fb)) candidates.push(fb);
  }
  return candidates;
}

async function callGeminiJson(parts, apiKey, models) {
  let lastErr = 'No Gemini models responded';
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.9,
            responseMimeType: 'application/json',
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        lastErr = `Gemini ${model} (${res.status}): ${JSON.stringify(json).slice(0, 240)}`;
        console.warn(`[autopilot] ${lastErr}`);
        continue;
      }
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      return { model, data: JSON.parse(cleaned) };
    } catch (err) {
      lastErr = `Gemini ${model}: ${err.message}`;
    }
  }
  throw new Error(lastErr);
}

/**
 * Asks Gemini (Creative Director) to choose the most viral unused real 3D model from our
 * pre-filtered never-repeated CC0 catalog AND pair it with an original blade, board, studio,
 * and viral Reels hook!
 */
async function askGeminiCreativeDirection(freshPool, recentCutters, recentSurfaces, recentEnvs, apiKey, models) {
  const shortlist = freshPool.slice(0, 22).map((m) => ({
    assetId: m.assetId,
    englishName: m.englishName,
    defaultInterior: m.interiorStyle,
  }));

  const prompt = `You are the viral Creative Director for @atomslice3d (9:16 3D "10 -> 1,000 CUTS" satisfying slicing Reels/Shorts).

Pick ONE asset from the FRESH NEVER-POSTED 3D MODELS list below that will get the highest watch-time retention and shares, and design a vibrant, joyful, high-contrast studio scene around it!

FRESH NEVER-POSTED 3D MODELS (YOU MUST PICK ONE EXACT assetId FROM THIS LIST):
${JSON.stringify(shortlist, null, 2)}

AVAILABLE SOLID INTERIOR STYLES:
${VALID_INTERIOR_STYLES.join(', ')}

RECENTLY USED BLADES (DO NOT REPEAT THESE):
${recentCutters.slice(-10).join(' | ') || '(none)'}

RECENTLY USED CUTTING BOARDS (DO NOT REPEAT THESE):
${recentSurfaces.slice(-10).join(' | ') || '(none)'}

RECENTLY USED STUDIOS (DO NOT REPEAT THESE):
${recentEnvs.slice(-10).join(' | ') || '(none)'}

RULES:
- Output ONLY valid JSON with exact keys:
  {
    "assetId": "exact assetId from the fresh list above",
    "englishName": "Punchy 2-4 word viral English title (e.g. Yellow Rubber Duck, Pirate Treasure Chest)",
    "interiorStyle": "one of the valid interior styles above that creates the most jaw-dropping reveal inside this object",
    "cutterPrompt": "1 vivid English phrase for a brand-new blade (e.g. Solid 24k gold Chinese cleaver, Cyan ice plasma lightsaber, Rose pink crystal katana sword, Copper-forged serrated precision saw, 1000C glowing red-hot chef knife)",
    "surfacePrompt": "1 vivid English phrase for a bright contrasting cutting board (e.g. Walnut wood and turquoise epoxy resin river board, Coral peach ceramic checkerboard tile cutting board, Sage green pastel Venetian terrazzo stone slab, Rose pink marble slab with gold veins)",
    "envPrompt": "1 vivid English phrase for a bright colorful studio backdrop (e.g. Pastel blush pink Parisian patisserie tile kitchen, Amalfi lemon yellow sunny Mediterranean studio, Mint sage Nordic daylight ceramic tile studio, Dusty lavender architectural minimalist studio)",
    "viralHook": "1 punchy scroll-stopping English Reels opening line <= 90 chars mentioning the object (e.g. Wait until you see what's inside this Yellow Rubber Duck at 1,000 cuts 🤯)"
  }`;

  const { model, data } = await callGeminiJson([{ text: prompt }], apiKey, models);
  console.log(`[autopilot] Gemini (${model}) selected: ${data.assetId} ("${data.englishName}") | interior=${data.interiorStyle}`);
  return data;
}

/**
 * Gemini Vision Art-Director QA Gate:
 * Inspects the actual rendered 0-CUTS intact silhouette + 10-CUTS sliced-open interior
 * BEFORE spending 20+ minutes rendering 60fps MP4 — rejects any broken/ugly/hollow model!
 */
async function runGeminiVisionQA(englishName, intactJpegB64, slicedJpegB64, apiKey, models) {
  const prompt = `You are the strict Visual Quality Gate for @atomslice3d (viral 3D slicing Reels).
Image 1 shows the uncut 3D model of "${englishName}" on a cutting board.
Image 2 shows the exact same model mid-slice revealing its solid interior.

Inspect BOTH images carefully and return ONLY valid JSON:
{
  "pass": true or false,
  "score": integer 1 to 10,
  "reason": "short 1-sentence visual verdict"
}

FAIL (pass: false) ONLY if:
- The object looks like a plain untextured rectangular box, a broken flat sheet, invisible/tiny, or clipped wildly off-screen.
- The sliced interior in Image 2 looks hollow/empty/broken instead of a solid colorful interior.

PASS (pass: true) if the 3D object is clearly recognizable, sits nicely on the cutting board, and looks solid and visually engaging!`;

  const parts = [
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: intactJpegB64 } },
    { inlineData: { mimeType: 'image/jpeg', data: slicedJpegB64 } },
  ];

  const { model, data } = await callGeminiJson(parts, apiKey, models);
  console.log(`[autopilot] Gemini Vision QA (${model}): pass=${data.pass} score=${data.score}/10 — ${data.reason}`);
  return data;
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

  // 1. Build ironclad anti-repetition index from BOTH data/history.json AND live Instagram posts!
  const liveCaptions = await fetchLiveInstagramCaptions();
  const antiRepeat = buildAntiRepeatIndex(hist.entries, liveCaptions);

  const recentCutters = hist.entries.map((e) => e.cutterPrompt || e.cutterId || '').filter(Boolean);
  const recentSurfaces = hist.entries.map((e) => e.surfacePrompt || e.surfaceId || '').filter(Boolean);
  const recentEnvs = hist.entries.map((e) => e.envPrompt || e.envId || '').filter(Boolean);

  console.log(`\n=== Infinite Slice 24/7 Cloud Autopilot v2 (Real CC0 3D Solidifier + Visual QA Gate) ===`);
  console.log(
    `History entries: ${hist.entries.length} | Live IG captions checked: ${liveCaptions.length} | ` +
    `Locked concepts: ${antiRepeat.usedConcepts.size} | Mode: ${quick ? 'QUICK' : 'PRODUCTION'} | Publish: ${shouldPublish && !dryRun ? 'LIVE' : 'DRY-RUN'}`
  );
  console.log(
    `[env-check] GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? 'present' : 'not-set'} | ` +
    `IG_ACCESS_TOKEN=${process.env.IG_ACCESS_TOKEN ? 'present' : 'MISSING'} | ` +
    `IG_USER_ID=${process.env.IG_USER_ID ? 'present' : 'MISSING'} | ` +
    `FB_PAGE_ID=${process.env.FB_PAGE_ID ? 'present' : 'auto-detect'} | ` +
    `YT_SHORTS=${hasYouTubeCredentials() ? 'present' : 'not-set'}`
  );

  // Fail-fast before rendering if --publish is requested without credentials
  if (shouldPublish && !dryRun && !process.env.N8N_WEBHOOK_URL && !process.env.IG_ACCESS_TOKEN && !hasYouTubeCredentials()) {
    throw new Error('Cannot run with --publish: IG_ACCESS_TOKEN (or N8N_WEBHOOK_URL / YouTube credentials) is missing!');
  }

  // 2. Fetch ALL guaranteed-fresh, NEVER-REPEATED real CC0 3D models (VIP 70+ + Dynamic Poly Haven 250+)
  const freshPool = await getFresh3DModelCandidates(antiRepeat, { includeDynamic: true });
  if (freshPool.length === 0) {
    throw new Error('Anti-repeat safety stop: 0 unused 3D models left in catalog!');
  }
  console.log(`[autopilot] Fresh NEVER-POSTED real 3D models available: ${freshPool.length} (top 5: ${freshPool.slice(0, 5).map((m) => m.assetId).join(', ')})`);

  // Blend top-tier legends (priority >= 9) + rotating live Mega-Catalog gems (priority 8) so EVERY day mixes all 12 sources!
  const tierS = freshPool.filter((m) => (m.priority || 5) >= 9).sort(() => Math.random() - 0.5);
  const tierA = freshPool.filter((m) => (m.priority || 5) === 8).sort(() => Math.random() - 0.5);
  const tierB = freshPool.filter((m) => (m.priority || 5) < 8).sort(() => Math.random() - 0.5);
  const orderedPool = [];
  let iS = 0, iA = 0;
  while (iS < tierS.length || iA < tierA.length) {
    if (iS < tierS.length) orderedPool.push(tierS[iS++]);
    if (iS < tierS.length) orderedPool.push(tierS[iS++]);
    if (iA < tierA.length) orderedPool.push(tierA[iA++]);
  }
  orderedPool.push(...tierB);

  // 3. Optional Gemini Creative Director (picks best unused 3D model + fresh blade/board/studio + hook)
  const apiKey = process.env.GEMINI_API_KEY || '';
  const geminiModels = apiKey ? await discoverActiveGeminiModels(apiKey) : [];
  let aiDirection = null;

  if (apiKey) {
    try {
      const dir = await askGeminiCreativeDirection(orderedPool, recentCutters, recentSurfaces, recentEnvs, apiKey, geminiModels);
      const matched = orderedPool.find((m) => m.assetId.toLowerCase() === String(dir.assetId || '').toLowerCase());
      if (matched) {
        const repCheck = checkRepetition(matched, antiRepeat);
        if (!repCheck.repeated) {
          aiDirection = { ...dir, asset: matched };
        } else {
          console.warn(`[autopilot] Blocked Gemini repeat pick "${dir.assetId}": ${repCheck.reason}`);
        }
      } else {
        console.warn(`[autopilot] Gemini returned assetId "${dir.assetId}" not in fresh list — ignoring.`);
      }
    } catch (err) {
      console.warn(`[autopilot] Gemini creative director skipped (${err.message?.slice(0, 180)}) — using curated CC0 3D model selector!`);
    }
  }

  // Build ordered shortlist of up to 4 verified-fresh candidates for Pre-Flight QA Gate
  const candidateQueue = [];
  if (aiDirection?.asset) {
    candidateQueue.push({
      asset: {
        ...aiDirection.asset,
        englishName: aiDirection.englishName || aiDirection.asset.englishName,
        interiorStyle: VALID_INTERIOR_STYLES.includes(aiDirection.interiorStyle)
          ? aiDirection.interiorStyle
          : aiDirection.asset.interiorStyle,
      },
      cutterPrompt: aiDirection.cutterPrompt || pickLeastRecentlyUsed(CLOUD_EN_CUTTERS, recentCutters),
      surfacePrompt: aiDirection.surfacePrompt || pickLeastRecentlyUsed(CLOUD_EN_SURFACES, recentSurfaces),
      envPrompt: aiDirection.envPrompt || pickLeastRecentlyUsed(CLOUD_EN_ENVS, recentEnvs),
      viralHook: aiDirection.viralHook || '',
      sourceTag: 'cloud-autopilot:3d-gemini',
    });
  }
  for (const asset of orderedPool) {
    if (candidateQueue.length >= 4) break;
    if (candidateQueue.some((c) => c.asset.assetId === asset.assetId)) continue;
    candidateQueue.push({
      asset,
      cutterPrompt: pickLeastRecentlyUsed(CLOUD_EN_CUTTERS, recentCutters),
      surfacePrompt: pickLeastRecentlyUsed(CLOUD_EN_SURFACES, recentSurfaces),
      envPrompt: pickLeastRecentlyUsed(CLOUD_EN_ENVS, recentEnvs),
      viralHook: '',
      sourceTag: 'cloud-autopilot:3d-cc0',
    });
  }

  // 4. MANDATORY PRE-FLIGHT VISUAL & SOLIDITY QA GATE (NEVER renders or posts ugly/hollow/repeated scenes!)
  let approved = null;
  try {
    for (let i = 0; i < candidateQueue.length; i++) {
      const cand = candidateQueue[i];
      // Triple-check anti-repeat lock before downloading!
      const rep = checkRepetition(cand.asset, antiRepeat);
      if (rep.repeated) {
        console.warn(`[autopilot] HARD BLOCK candidate #${i + 1} (${cand.asset.assetId}): ${rep.reason}`);
        continue;
      }

      console.log(`\n[autopilot] Pre-Flight QA Candidate ${i + 1}/${candidateQueue.length}: ${cand.asset.englishName} (${cand.asset.source}:${cand.asset.assetId} | interior=${cand.asset.interiorStyle})`);
      try {
        const dl = await downloadModelToPublic(cand.asset);
        const qa = await capturePreFlightFrames({
          modelUrl: dl.modelUrl,
          modelMeta: cand.asset,
          cutterId: 'custom',
          cutterPrompt: cand.cutterPrompt,
          surfaceId: 'custom',
          surfacePrompt: cand.surfacePrompt,
          envId: 'custom',
          envPrompt: cand.envPrompt,
          handle: getFlag('handle', cfg.brand?.handle || '@atomslice3d'),
          width: 360,
          height: 640,
        });

        // Programmatic solidity & mesh quality gates
        if (qa.consoleErrors.length > 0) {
          throw new Error(`WebGL/Console errors during pre-flight: ${qa.consoleErrors.join('; ')}`);
        }
        if ((qa.meta.vertexCount || 0) < 300) {
          throw new Error(`Mesh too simple (${qa.meta.vertexCount} verts < 300)`);
        }
        if ((qa.meta.solidRatio || 0) < 0.15) {
          throw new Error(`Solid voxel ratio too thin/spindly (${qa.meta.solidRatio} < 0.15 — only chunky satisfying 3D shapes allowed!)`);
        }

        // Optional Gemini Vision QA Art-Director Check (when GEMINI_API_KEY is available)
        if (apiKey && geminiModels.length > 0) {
          try {
            const verdict = await runGeminiVisionQA(
              cand.asset.englishName,
              qa.intactJpegB64,
              qa.slicedJpegB64,
              apiKey,
              geminiModels
            );
            if (verdict && (verdict.pass === false || (typeof verdict.score === 'number' && verdict.score < 6))) {
              console.warn(`[autopilot] Vision QA REJECTED "${cand.asset.englishName}": ${verdict.reason}`);
              continue;
            }
          } catch (visionErr) {
            console.warn(`[autopilot] Vision QA skipped (${visionErr.message?.slice(0, 140)}) — programmatic solid-mesh QA passed!`);
          }
        }

        console.log(`[autopilot] QA PASSED! "${cand.asset.englishName}" | solidRatio=${qa.meta.solidRatio} | verts=${qa.meta.vertexCount}`);
        approved = { ...cand, modelUrl: dl.modelUrl, qaMeta: qa.meta };
        break;
      } catch (candErr) {
        console.warn(`[autopilot] Candidate "${cand.asset.assetId}" failed pre-flight: ${candErr.message?.slice(0, 220)}`);
      }
    }

    if (!approved) {
      throw new Error('ALL 3D model candidates failed Pre-Flight QA — aborting safely without publishing!');
    }

    // 5. Render High-Retention ~23-25s 60 FPS MP4 (3 punchy rounds -> 70-85%+ Reels/Shorts watch-time & loops!)
    //    (Daily 11+ min YouTube Long-Form uses 6 slow ASMR rounds separately in daily-youtube-longform.yml)
    const roundPresets = [
      [10, 100, 1000],
      [10, 150, 1000],
      [10, 250, 1000],
    ];
    const roundsArg = getFlag('rounds', quick ? '10,100,1000' : null);
    const rounds = roundsArg
      ? roundsArg.split(',').map(Number)
      : roundPresets[Math.floor(Math.random() * roundPresets.length)];

    const resStr = getFlag('res', quick ? '540x960' : `${cfg.render.width || 720}x${cfg.render.height || 1280}`);
    const [width, height] = resStr.split('x').map(Number);
    const fps = Number(getFlag('fps', quick ? '30' : String(cfg.render.fps || 60)));
    const durationScale = quick ? 0.55 : Number(getFlag('scale', '0.70'));

    const conceptSummary =
      `${approved.asset.englishName} [${approved.asset.source}:${approved.asset.assetId} | interior=${approved.asset.interiorStyle}] ` +
      `| blade=${approved.cutterPrompt} | board=${approved.surfacePrompt} | studio=${approved.envPrompt}`;

    console.log(`\n[autopilot] Rendering Approved Scene:\n  ${conceptSummary}`);

    const manifest = await renderHeadlessVideo({
      objectId: 'external-glb',
      modelUrl: approved.modelUrl,
      modelMeta: approved.asset,
      cutterId: 'custom',
      cutterPrompt: approved.cutterPrompt,
      surfaceId: 'custom',
      surfacePrompt: approved.surfacePrompt,
      envId: 'custom',
      envPrompt: approved.envPrompt,
      handle: getFlag('handle', cfg.brand?.handle || '@atomslice3d'),
      width,
      height,
      fps,
      rounds,
      durationScale,
      showHud: true,
    });

    // Build caption (preserving Gemini's viral hook if present, else standard English caption)
    let caption = buildEnglishCaption(manifest, cfg);
    if (approved.viralHook && approved.viralHook.length >= 16 && approved.viralHook.length <= 130) {
      const lines = caption.split('\n');
      lines[0] = approved.viralHook;
      caption = lines.join('\n');
    }

    // Record in anti-repetition data/history.json BEFORE publishing
    const entry = recordEntry({
      source: approved.sourceTag,
      objectId: 'external-glb',
      modelSource: approved.asset.source,
      modelAssetId: approved.asset.assetId,
      interiorStyle: approved.asset.interiorStyle,
      solidRatio: manifest.solidRatio,
      slug: manifest.slug,
      name: manifest.name,
      englishName: manifest.englishName,
      cutterId: 'custom',
      cutterPrompt: approved.cutterPrompt,
      surfaceId: 'custom',
      surfacePrompt: approved.surfacePrompt,
      envId: 'custom',
      envPrompt: approved.envPrompt,
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
      const ytMissing = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN'].filter((k) => !process.env[k]);
      const ttMissing = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN'].filter((k) => !process.env[k]);
      console.log(
        `[autopilot] Channels configured -> IG:${Boolean(process.env.IG_ACCESS_TOKEN || process.env.N8N_WEBHOOK_URL)} ` +
          `| FB:${Boolean(process.env.FB_PAGE_ID && (process.env.FB_PAGE_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN))} ` +
          `| YouTube:${hasYouTubeCredentials()}${ytMissing.length ? ` (missing: ${ytMissing.join(',')})` : ''} ` +
          `| TikTok:${hasTikTokCredentials()}${ttMissing.length ? ` (missing: ${ttMissing.join(',')})` : ''}`
      );

      let pub = { provider: 'skipped' };
      if (dryRun || process.env.IG_ACCESS_TOKEN || process.env.N8N_WEBHOOK_URL) {
        pub = await publishReel({
          videoPath: manifest.videoFile,
          dryRun,
          captionOverride: caption,
        });
      }
      if (dryRun || hasYouTubeCredentials()) {
        try {
          const ytRes = await publishYouTubeShort({
            videoPath: manifest.videoFile,
            manifest,
            dryRun,
          });
          if (!dryRun && ytRes?.videoId) {
            const hNow = loadHistory();
            const target = hNow.entries.find((e) => e.id === entry.id);
            if (target) {
              target.publish = { ...(target.publish || {}), youtube: ytRes };
              saveHistory(hNow);
            }
          }
        } catch (ytErr) {
          console.error('[autopilot] YouTube Shorts cross-post warning:', ytErr.message);
        }
      } else {
        console.warn(`[autopilot] YouTube Shorts SKIPPED — add GitHub Secrets: ${ytMissing.join(', ')}`);
      }
      if (dryRun || hasTikTokCredentials()) {
        try {
          const ttRes = await publishTikTokVideo({
            videoPath: manifest.videoFile,
            manifest,
            dryRun,
          });
          if (!dryRun && ttRes?.publishId) {
            const hNow = loadHistory();
            const target = hNow.entries.find((e) => e.id === entry.id);
            if (target) {
              target.publish = { ...(target.publish || {}), tiktok: ttRes };
              saveHistory(hNow);
            }
          }
        } catch (ttErr) {
          console.error('[autopilot] TikTok cross-post warning:', ttErr.message);
        }
      }
      if (cleanup && shouldPublish && !dryRun && pub.provider !== 'dry-run') {
        if (fs.existsSync(manifest.videoAbsolutePath)) {
          fs.unlinkSync(manifest.videoAbsolutePath);
          console.log(`[autopilot] Cleaned up uploaded MP4 to save cloud disk space.`);
        }
      }
    } else {
      console.log('\n[autopilot] Rendered locally (pass --publish to upload to Instagram + Facebook Reels, or --dry-run to preview).');
    }
  } finally {
    cleanupRuntimeModelDir();
  }
}

main().catch((err) => {
  console.error('[autopilot] FATAL:', err);
  process.exit(1);
});
