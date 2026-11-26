import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumExecutable } from './render-headless.mjs';
import { synthesizeAsmrWav } from './synth-wav.mjs';
import { publishYouTubeLongForm } from './publish-youtube.mjs';
import { loadHistory, saveHistory, recordEntry } from './history-cli.mjs';

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

function probeDurationSec(filePath) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf8' }
  ).trim();
  const sec = Number(out);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Invalid ffprobe duration for ${filePath}: "${out}"`);
  }
  return sec;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-1800); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}:\n${stderr}`));
    });
  });
}

function fmtTimestamp(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pickFourHeroFrames(slots) {
  const withHero = slots.filter((s) => s.heroFrameFile && fs.existsSync(s.heroFrameFile));
  if (withHero.length === 0) return [];
  if (withHero.length <= 4) {
    const out = [...withHero];
    while (out.length < 4) out.push(withHero[out.length % withHero.length]);
    return out;
  }
  const indices = [
    0,
    Math.floor((withHero.length - 1) * 0.34),
    Math.floor((withHero.length - 1) * 0.67),
    withHero.length - 1,
  ];
  return indices.map((i) => withHero[i]);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders both the 1280x720 High-CTR Custom YouTube Thumbnail (JPEG) and a 1280x720 Intro Card still (JPEG)
 * using Chromium so typography, shadows, badges, and 2x2 real-3D object collage look studio-grade.
 */
async function renderThumbnailAndIntroCards({ slots, episodeNumber, totalMinutesLabel, thumbPath, introCardPath }) {
  const heroes = pickFourHeroFrames(slots);
  const dataUrls = heroes.map((h) => {
    const b64 = fs.readFileSync(h.heroFrameFile).toString('base64');
    return {
      src: `data:image/jpeg;base64,${b64}`,
      name: h.asset?.englishName || '3D Object',
    };
  });

  const count = slots.length;
  const totalCutsLabel = `${(count * 1000).toLocaleString('en-US')}+ CUTS`;

  const makeHtml = (isIntro) => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px; height: 720px; overflow: hidden;
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0f172a; position: relative;
  }
  .grid {
    display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
    width: 1280px; height: 720px; gap: 8px; background: #ffe047;
  }
  .cell { position: relative; overflow: hidden; background: #1e293b; }
  .cell img {
    width: 100%; height: 100%; object-fit: cover;
    transform: scale(1.16);
    filter: contrast(1.08) saturate(1.16);
  }
  .cell-tag {
    position: absolute; left: 16px;
    background: rgba(15, 23, 42, 0.82); color: #ffffff;
    border: 2px solid rgba(255, 224, 71, 0.92);
    padding: 5px 14px; border-radius: 999px;
    font-size: 16px; font-weight: 900; letter-spacing: 0.02em;
    text-transform: uppercase;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  }
  .cell-top .cell-tag { top: 14px; }
  .cell-bot .cell-tag { bottom: 14px; }
  .vignette {
    position: absolute; inset: 0;
    background: radial-gradient(circle at center, rgba(10,14,26,0.52) 0%, rgba(10,14,26,0.14) 52%, rgba(10,14,26,0.38) 100%);
    pointer-events: none;
  }
  .center-stack {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; gap: 14px; padding: 24px;
  }
  .pill-top {
    background: linear-gradient(180deg, #ffe84d 0%, #ffc824 100%);
    color: #0f172a; border: 4px solid #ffffff;
    padding: 9px 28px; border-radius: 999px;
    font-size: 26px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase;
    box-shadow: 0 10px 28px rgba(0,0,0,0.45);
    transform: rotate(-1.5deg);
  }
  .headline {
    font-size: ${isIntro ? '76px' : '92px'}; font-weight: 950; line-height: 0.96;
    color: #ffffff; letter-spacing: -0.02em; text-transform: uppercase;
    -webkit-text-stroke: 6px #0b1020; paint-order: stroke fill;
    text-shadow: 0 12px 26px rgba(0,0,0,0.65);
  }
  .headline .gold { color: #ffe047; }
  .pill-bot {
    background: linear-gradient(90deg, #ff2e63 0%, #ff6b35 100%);
    color: #ffffff; border: 4px solid #ffffff;
    padding: 10px 30px; border-radius: 999px;
    font-size: 26px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase;
    box-shadow: 0 10px 26px rgba(255,46,99,0.5);
  }
  .ep-badge {
    position: absolute; top: 18px; right: 20px;
    background: #0f172a; color: #ffe047; border: 3px solid #ffe047;
    padding: 6px 18px; border-radius: 14px;
    font-size: 22px; font-weight: 900;
    box-shadow: 0 8px 20px rgba(0,0,0,0.45);
  }
</style>
</head>
<body>
  <div class="grid">
    ${dataUrls
      .map(
        (item, idx) => `<div class="cell ${idx < 2 ? 'cell-top' : 'cell-bot'}">
      <img src="${item.src}" />
      ${isIntro ? `<div class="cell-tag">${escapeHtml(item.name)}</div>` : ''}
    </div>`
      )
      .join('')}
  </div>
  <div class="vignette"></div>
  <div class="ep-badge">EP. #${episodeNumber}</div>
  <div class="center-stack">
    <div class="pill-top">${escapeHtml(totalMinutesLabel)} ASMR • 60 FPS</div>
    <div class="headline">${count} OBJECTS<br><span class="gold">${escapeHtml(totalCutsLabel)}</span></div>
    <div class="pill-bot">${isIntro ? 'NO TALKING • RELAXING 3D SLICING' : 'ODDLY SATISFYING 3D ASMR'}</div>
  </div>
</body>
</html>`;

  const executablePath = resolveChromiumExecutable();
  const isLinux = process.platform === 'linux';
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: isLinux
      ? ['--no-sandbox', '--disable-dev-shm-usage']
      : ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(makeHtml(false), { waitUntil: 'load' });
    await page.screenshot({ path: thumbPath, type: 'jpeg', quality: 92 });

    await page.setContent(makeHtml(true), { waitUntil: 'load' });
    await page.screenshot({ path: introCardPath, type: 'jpeg', quality: 92 });
  } finally {
    await browser.close();
  }
}

async function buildIntroMp4({ introCardPath, introMp4Path, width = 1280, height = 720, fps = 60 }) {
  const durationSec = 3.0;
  const wavPath = introMp4Path.replace(/\.mp4$/i, '.wav');
  synthesizeAsmrWav({
    durationSec,
    audioEvents: [
      { t: 0.15, type: 'roundStart', intensity: 0.85 },
      { t: 0.55, type: 'ctaChime', intensity: 0.75 },
    ],
    outputPath: wavPath,
  });

  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-framerate', String(fps),
    '-t', String(durationSec),
    '-i', introCardPath,
    '-i', wavPath,
    '-vf', `scale=${width}:${height},fade=t=in:st=0:d=0.22,fade=t=out:st=${(durationSec - 0.28).toFixed(2)}:d=0.28,format=yuv420p`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.2',
    '-preset', process.env.CI ? 'veryfast' : 'medium',
    '-crf', '18',
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    introMp4Path,
  ]);
  try { fs.unlinkSync(wavPath); } catch {}
}

function buildLongFormMetadata({ episodeNumber, slots, chapters, totalDurationSec, totalCubes }) {
  const count = slots.length;
  const mins = Math.floor(totalDurationSec / 60);
  const featured = slots
    .slice(0, 3)
    .map((s) => s.asset?.englishName)
    .filter(Boolean);

  const titleCandidates = [
    `${mins}+ Minutes of Oddly Satisfying 3D Slicing ASMR — ${count} Impossible Objects (60 FPS) #${episodeNumber}`,
    `Slicing ${featured[0] || 'Impossible Objects'}, ${featured[1] || '3D Icons'} & ${Math.max(1, count - 2)} More! (${mins} Min 3D ASMR)`,
    `${mins} Minutes of 1,000 Cuts 3D ASMR — ${count} Solid Objects Sliced Into Millions of Cubes #${episodeNumber}`,
  ];
  const title = titleCandidates[(episodeNumber - 1) % titleCandidates.length].slice(0, 100);

  const chapterLines = chapters.map((c) => `${fmtTimestamp(c.startSec)} ${c.label}`);
  const description = [
    `Sit back, relax, and enjoy ${mins}+ minutes of pure 60 FPS 3D slicing ASMR — zero talking, ${count} brand-new impossible objects, each sliced from 10 → 1,000 cuts into ${totalCubes.toLocaleString('en-US')}+ total micro-cubes! 🔪✨`,
    ``,
    `Every object features a unique 100% solid volumetric interior (rainbow cake, gold treasure, crystal geode, circuit boards, pastry layers & more) paired with custom studio acoustics.`,
    ``,
    `⏱️ CHAPTERS:`,
    ...chapterLines,
    ``,
    `💬 Which of the ${count} objects was the most satisfying? Tell us the timestamp below!`,
    ``,
    `🎨 Want to generate your own 60 FPS Infinite Slice 3D videos?`,
    `https://atomslice3d.netlify.app`,
    ``,
    `#oddlysatisfying #asmr #3dart #slicing #infiniteslice #3danimation #relaxing #notalking #satisfyingvideo #1000cuts #atomslice3d`,
  ].join('\n');

  const objTags = slots
    .slice(0, 10)
    .map((s) => (s.asset?.englishName || '').toLowerCase())
    .filter(Boolean);

  const tags = [
    'oddly satisfying',
    'asmr',
    '3d slicing',
    'satisfying video',
    '10 minutes oddly satisfying',
    'no talking asmr',
    '3d animation',
    '1000 cuts',
    'kinetic sand',
    'relaxing video',
    'sleep asmr',
    'atomslice3d',
    ...objTags,
  ].slice(0, 28);

  return { title, description, tags };
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const workDir = path.resolve(ROOT, getArg('dir', 'output/longform'));
  const planPath = path.resolve(ROOT, getArg('plan', path.join(workDir, 'plan.json')));
  const shouldPublish = hasFlag('publish');
  const dryRun = hasFlag('dry-run');
  const minDurationSec = Number(getArg('minSec', '600'));

  const plan = fs.existsSync(planPath) ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : { episodeNumber: 1, width: 1280, height: 720, fps: 60 };

  // Collect all slot-XX directories
  const slotDirs = fs
    .readdirSync(workDir)
    .filter((d) => /^slot-\d+$/.test(d))
    .sort((a, b) => Number(a.replace('slot-', '')) - Number(b.replace('slot-', '')));

  const slots = [];
  for (const d of slotDirs) {
    const metaPath = path.join(workDir, d, 'slot-meta.json');
    const clipPath = path.join(workDir, d, 'clip.mp4');
    if (!fs.existsSync(metaPath) || !fs.existsSync(clipPath)) {
      console.warn(`[longform-stitch] Skipping incomplete ${d}`);
      continue;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.clipFile = clipPath;
    const heroCandidate = path.join(workDir, d, 'hero.jpg');
    meta.heroFrameFile = fs.existsSync(heroCandidate) ? heroCandidate : null;
    meta.exactDurationSec = probeDurationSec(clipPath);
    slots.push(meta);
  }

  if (slots.length === 0) {
    throw new Error(`No completed clips found in ${workDir}`);
  }

  const episodeNumber = plan.episodeNumber || slots[0].episodeNumber || 1;
  const width = plan.width || slots[0].width || 1280;
  const height = plan.height || slots[0].height || 720;
  const fps = plan.fps || slots[0].fps || 60;

  const rawClipsTotal = slots.reduce((acc, s) => acc + s.exactDurationSec, 0);
  console.log(`[longform-stitch] Episode #${episodeNumber}: collected ${slots.length} clips (${fmtTimestamp(rawClipsTotal)} / ${rawClipsTotal.toFixed(1)}s raw).`);

  if (rawClipsTotal + 3.0 < minDurationSec) {
    const msg = `Total duration (${(rawClipsTotal + 3.0).toFixed(1)}s) is below minimum required (${minDurationSec}s = 10 min)!`;
    if (shouldPublish && !dryRun) {
      throw new Error(`[longform-stitch] ABORTING PUBLISH: ${msg}`);
    }
    console.warn(`[longform-stitch] WARNING: ${msg}`);
  }

  const thumbPath = path.join(workDir, `episode-${episodeNumber}-thumbnail.jpg`);
  const introCardPath = path.join(workDir, `episode-${episodeNumber}-intro-card.jpg`);
  const introMp4Path = path.join(workDir, `episode-${episodeNumber}-intro.mp4`);
  const finalMp4Path = path.join(workDir, `episode-${episodeNumber}-10min-60fps.mp4`);

  const estMins = Math.max(10, Math.floor((rawClipsTotal + 3.0) / 60));
  console.log('[longform-stitch] Generating 1280x720 high-CTR YouTube thumbnail & 3s hook intro...');
  await renderThumbnailAndIntroCards({
    slots,
    episodeNumber,
    totalMinutesLabel: `${estMins}+ MIN`,
    thumbPath,
    introCardPath,
  });
  await buildIntroMp4({ introCardPath, introMp4Path, width, height, fps });
  const introDur = probeDurationSec(introMp4Path);

  // Build exact YouTube Chapters timeline
  const chapters = [{ startSec: 0, label: `Intro — ${slots.length} Impossible Objects Preview` }];
  let cursor = introDur;
  let totalCubes = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const num = String(i + 1).padStart(2, '0');
    const maxCuts = Math.max(...(s.rounds || [1000])).toLocaleString('en-US');
    chapters.push({
      startSec: cursor,
      label: `${num}. ${s.asset?.englishName || '3D Object'} (10 → ${maxCuts} Cuts)`,
    });
    cursor += s.exactDurationSec;
    totalCubes += Number(s.maxCubes || 0);
  }

  // Stitch intro + all 12 clips via FFmpeg filter_complex concat + YouTube-standard -14 LUFS loudness normalization!
  const allInputs = [introMp4Path, ...slots.map((s) => s.clipFile)];
  const ffArgs = ['-y'];
  for (const inp of allInputs) {
    ffArgs.push('-i', inp);
  }

  const n = allInputs.length;
  const concatInputs = [];
  for (let i = 0; i < n; i++) {
    concatInputs.push(`[${i}:v:0][${i}:a:0]`);
  }
  const filterComplex =
    `${concatInputs.join('')}concat=n=${n}:v=1:a=1[vcat][acat];` +
    `[acat]loudnorm=I=-14:TP=-1.5:LRA=11[anorm]`;

  ffArgs.push(
    '-filter_complex', filterComplex,
    '-map', '[vcat]',
    '-map', '[anorm]',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.2',
    '-preset', process.env.CI ? 'veryfast' : 'medium',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-movflags', '+faststart',
    finalMp4Path
  );

  console.log(`[longform-stitch] Stitching ${n} segments into ${finalMp4Path}...`);
  await runFfmpeg(ffArgs);

  const finalDurationSec = probeDurationSec(finalMp4Path);
  const finalSizeMb = Number((fs.statSync(finalMp4Path).size / 1048576).toFixed(2));
  console.log(
    `[longform-stitch] STITCH COMPLETE! ${finalMp4Path} | ${fmtTimestamp(finalDurationSec)} (${finalDurationSec.toFixed(1)}s) | ${finalSizeMb} MB`
  );

  const meta = buildLongFormMetadata({
    episodeNumber,
    slots,
    chapters,
    totalDurationSec: finalDurationSec,
    totalCubes,
  });

  const episodeManifest = {
    episodeNumber,
    createdAt: new Date().toISOString(),
    finalMp4Path,
    thumbnailPath: thumbPath,
    durationSec: Number(finalDurationSec.toFixed(2)),
    durationFormatted: fmtTimestamp(finalDurationSec),
    fileSizeMb: finalSizeMb,
    width,
    height,
    fps,
    totalCubes,
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    chapters,
    objects: slots.map((s) => ({
      slot: s.slot,
      source: s.asset?.source,
      assetId: s.asset?.assetId,
      slug: s.asset?.slug,
      englishName: s.asset?.englishName,
      interiorStyle: s.asset?.interiorStyle,
      durationSec: s.exactDurationSec,
      maxCubes: s.maxCubes,
    })),
  };

  fs.writeFileSync(
    path.join(workDir, `episode-${episodeNumber}-manifest.json`),
    JSON.stringify(episodeManifest, null, 2) + '\n',
    'utf8'
  );

  if (shouldPublish || dryRun) {
    const ytRes = await publishYouTubeLongForm({
      videoPath: finalMp4Path,
      thumbnailPath: thumbPath,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      dryRun,
    });

    if (!dryRun && ytRes?.videoId) {
      // Record every individual sliced 3D model so neither Reels nor future Long-Form episodes ever repeat them!
      for (const s of slots) {
        recordEntry({
          status: 'published',
          format: 'youtube-longform-slot',
          source: `cloud-longform-ep${episodeNumber}`,
          objectId: 'external-glb',
          modelSource: s.asset?.source || '',
          modelAssetId: s.asset?.assetId || '',
          interiorStyle: s.asset?.interiorStyle || '',
          solidRatio: s.solidRatio ?? null,
          slug: s.asset?.slug || '',
          name: s.asset?.englishName || '',
          englishName: s.asset?.englishName || '',
          cutterId: 'custom',
          cutterPrompt: s.cutterPrompt || '',
          surfaceId: 'custom',
          surfacePrompt: s.surfacePrompt || '',
          envId: 'custom',
          envPrompt: s.envPrompt || '',
          rounds: s.rounds,
          maxCubes: s.maxCubes,
          durationSec: s.exactDurationSec,
          resolution: `${width}x${height}`,
          fps,
          publishedAt: new Date().toISOString(),
          publish: { youtube: ytRes },
        });
      }

      // Record the episode summary entry itself (for episode numbering & anti-duplicate schedule guard!)
      const hist = loadHistory();
      hist.entries.push({
        id: `longform-ep${episodeNumber}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        status: 'published',
        format: 'youtube-longform',
        episodeNumber,
        englishName: meta.title,
        objectCount: slots.length,
        durationSec: Number(finalDurationSec.toFixed(2)),
        durationFormatted: fmtTimestamp(finalDurationSec),
        totalCubes,
        resolution: `${width}x${height}`,
        fps,
        publish: { youtube: ytRes },
      });
      saveHistory(hist);
      console.log(`[longform-stitch] Logged ${slots.length} objects + Episode #${episodeNumber} in data/history.json!`);
    }
  }
}

main().catch((err) => {
  console.error('[longform-stitch] FATAL:', err);
  process.exit(1);
});
