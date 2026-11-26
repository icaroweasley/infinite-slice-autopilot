import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { synthesizeAsmrWav } from './synth-wav.mjs';
import { loadConfig } from './history-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function resolveChromiumExecutable() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const cacheRoots = [
    path.join(localAppData, 'ms-playwright'),
    path.join(home, '.cache', 'ms-playwright'),
    path.join(home, 'Library', 'Caches', 'ms-playwright'),
  ];

  for (const cacheRoot of cacheRoots) {
    if (!cacheRoot || !fs.existsSync(cacheRoot)) continue;
    const dirs = fs.readdirSync(cacheRoot).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      const candidates = [
        path.join(cacheRoot, d, 'chrome-win', 'chrome.exe'),
        path.join(cacheRoot, d, 'chrome-win64', 'chrome.exe'),
        path.join(cacheRoot, d, 'chrome-linux', 'chrome'),
        path.join(cacheRoot, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  const systemPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    'No Chrome/Chromium executable found. Set CHROMIUM_PATH in .env or run `npx playwright install chromium`.'
  );
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to run ffmpeg: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-800)}`));
    });
  });
}

function writePipe(stream, buf) {
  return new Promise((resolve, reject) => {
    if (stream.write(buf)) {
      resolve();
    } else {
      const onDrain = () => {
        stream.off('error', onError);
        resolve();
      };
      const onError = (err) => {
        stream.off('drain', onDrain);
        reject(err);
      };
      stream.once('drain', onDrain);
      stream.once('error', onError);
    }
  });
}

function safeSlug(str) {
  return (str || 'slice')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'slice';
}

/**
 * Deterministic Offline 9:16 Video Renderer:
 * Supports presets AND free-text custom Object, Cutter, Surface, Environment, and custom Cut Rounds!
 */
export async function renderHeadlessVideo({
  objectId = 'salmon',
  objectPrompt = '',
  modelUrl = '',
  modelMeta = null,
  cutterId = 'chef-knife',
  cutterPrompt = '',
  surfaceId = '',
  surfacePrompt = '',
  envId = 'classic-viral',
  envPrompt = '',
  handle,
  chapterLabel = '',
  width,
  height,
  fps,
  rounds,
  durationScale = 1.0,
  jpegQuality,
  showHud,
  ctaOutro,
  outputName,
  heroFramePath = '',
  serverUrl,
  onProgress,
} = {}) {
  const cfg = loadConfig();
  const W = width || cfg.render.width || 1080;
  const H = height || cfg.render.height || 1920;
  const FPS = fps || cfg.render.fps || 60;
  const QUALITY = jpegQuality || cfg.render.jpegQuality || 0.94;
  const HANDLE = handle ?? cfg.brand.handle ?? '@cubiccutlab';
  const ROUNDS = (rounds && rounds.length > 0) ? rounds : (cfg.render.rounds || [10, 50, 100, 250, 500, 1000]);
  const SHOW_HUD = showHud ?? cfg.render.showHud ?? true;
  const CTA_OUTRO = ctaOutro === false ? null : (ctaOutro ?? (cfg.ctaOutro?.enabled ? cfg.ctaOutro : null));

  const outDir = path.resolve(ROOT, cfg.render.outputDir || 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const executablePath = resolveChromiumExecutable();
  console.log(`[render] Browser: ${executablePath}`);
  console.log(`[render] Target: object=${modelMeta?.englishName || objectPrompt || objectId} | cutter=${cutterPrompt || cutterId} | surface=${surfacePrompt || surfaceId || 'default'} | env=${envPrompt || envId} | ${W}x${H} @ ${FPS}fps | rounds=[${ROUNDS.join(',')}]`);

  let viteServer = null;
  let url = '';
  if (serverUrl) {
    url = `${serverUrl.replace(/\/$/, '')}/?headless=1`;
  } else {
    viteServer = await createServer({
      configFile: path.join(ROOT, 'engine', 'vite.config.js'),
      server: { port: 0, host: '127.0.0.1' },
      logLevel: 'silent',
    });
    await viteServer.listen();
    const addr = viteServer.httpServer.address();
    url = `http://127.0.0.1:${addr.port}/?headless=1`;
  }

  let browser = null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const objTag = safeSlug(modelMeta?.slug || objectPrompt || objectId);
  const envTag = safeSlug(envPrompt || envId);
  const baseFile = outputName || `infinite-slice-${objTag}-${envTag}-${stamp}`;
  const tempVideoPath = path.join(outDir, `${baseFile}.video.tmp.mp4`);
  const tempWavPath = path.join(outDir, `${baseFile}.audio.tmp.wav`);
  const finalMp4Path = path.join(outDir, `${baseFile}.mp4`);
  const manifestPath = path.join(outDir, `${baseFile}.json`);

  // Estimate expected total frames cleanly for UI progress bar
  const estDuration = ROUNDS.reduce((acc, c) => acc + ((c >= 500 ? 11.4 : 10.4) * durationScale), 0);
  const estTotalFrames = Math.max(30, Math.round(estDuration * FPS));

  try {
    onProgress?.({ stage: 'boot', percent: 3, message: 'Booting WebGL2 & Rapier3D engine…' });
    const isLinux = process.platform === 'linux';
    const launchArgs = isLinux
      ? [
          '--use-gl=angle',
          '--use-angle=swiftshader-webgl',
          '--enable-unsafe-swiftshader',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ]
      : [
          '--use-gl=angle',
          '--enable-webgl',
          '--ignore-gpu-blocklist',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ];

    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: launchArgs,
    });

    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__HEADLESS_READY__ === true || Boolean(window.__HEADLESS_ERROR__), {
      timeout: 30000,
    });

    const bootErr = await page.evaluate(() => window.__HEADLESS_ERROR__ || null);
    if (bootErr) throw new Error(`Headless engine boot failed: ${bootErr}`);

    const meta = await page.evaluate(
      (opts) => window.__HEADLESS_API__.configure(opts),
      {
        objectId,
        objectPrompt,
        modelUrl,
        modelMeta,
        cutterId,
        cutterPrompt,
        surfaceId,
        surfacePrompt,
        envId,
        envPrompt,
        handle: HANDLE,
        chapterLabel,
        width: W,
        height: H,
        rounds: ROUNDS,
        durationScale,
        showHud: SHOW_HUD,
        ctaOutro: CTA_OUTRO,
      }
    );

    console.log(`[render] Object loaded: "${meta.englishName}" (slug: ${meta.slug})`);

    const ffmpegVideo = spawn(
      'ffmpeg',
      [
        '-y',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-framerate', String(FPS),
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-profile:v', 'high',
        '-level', '4.2',
        '-preset', process.env.CI ? 'veryfast' : 'medium',
        '-crf', '18',
        '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
        '-r', String(FPS),
        tempVideoPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let ffmpegErr = '';
    ffmpegVideo.stderr.on('data', (d) => { ffmpegErr += d.toString(); });

    const dt = 1.0 / FPS;
    const maxFrames = Math.ceil(FPS * 240);
    let frameCount = 0;
    const t0 = Date.now();
    let heroSaved = false;
    let round0DoneAt = -1;

    while (frameCount < maxFrames) {
      const frame = await page.evaluate(
        ([stepDt, q]) => window.__HEADLESS_API__.stepAndCapture(stepDt, q),
        [dt, QUALITY]
      );

      const jpgBuf = Buffer.from(frame.base64, 'base64');
      if (heroFramePath && !heroSaved) {
        if (frame.roundIndex === 0 && frame.cutsDone >= frame.cutsTarget) {
          if (round0DoneAt < 0) round0DoneAt = frame.simTime;
          // Capture clean HUD-free 3D WebGL frame ~0.35s after Round 1 slices finish & fall open revealing the solid colorful interior!
          if (frame.simTime - round0DoneAt >= 0.35) {
            const cleanB64 = await page.evaluate((q) => window.__HEADLESS_API__.captureClean3D(q), 0.94);
            fs.mkdirSync(path.dirname(heroFramePath), { recursive: true });
            fs.writeFileSync(heroFramePath, Buffer.from(cleanB64, 'base64'));
            heroSaved = true;
          }
        }
      }
      await writePipe(ffmpegVideo.stdin, jpgBuf);
      frameCount++;

      if (frameCount % Math.max(10, Math.floor(FPS / 2)) === 0 || frame.done) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const pct = Math.min(86, Math.max(5, Math.round((frameCount / estTotalFrames) * 84)));
        const statusMsg = `Round ${frame.roundIndex + 1}/${ROUNDS.length} (${frame.cutsDone}/${frame.cutsTarget} CUTS) • ${frameCount} frames (${frame.simTime.toFixed(1)}s)`;
        onProgress?.({ stage: 'frames', percent: pct, frames: frameCount, message: statusMsg });
        process.stdout.write(`\r[render] ${statusMsg} in ${elapsed}s   `);
      }

      if (frame.done) break;
    }
    if (heroFramePath && !heroSaved) {
      const cleanB64 = await page.evaluate((q) => window.__HEADLESS_API__.captureClean3D(q), 0.94);
      fs.mkdirSync(path.dirname(heroFramePath), { recursive: true });
      fs.writeFileSync(heroFramePath, Buffer.from(cleanB64, 'base64'));
      heroSaved = true;
    }
    process.stdout.write('\n');

    ffmpegVideo.stdin.end();
    await new Promise((resolve, reject) => {
      ffmpegVideo.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg video pipe failed (${code}):\n${ffmpegErr.slice(-800)}`));
      });
    });

    const summary = await page.evaluate(() => window.__HEADLESS_API__.getSummary());
    if (consoleErrors.length > 0) {
      console.warn(`[render] Warning: ${consoleErrors.length} page console error(s): ${consoleErrors[0]}`);
    }

    onProgress?.({ stage: 'audio', percent: 90, frames: frameCount, message: `Sintetizando áudio ASMR 48 kHz (${summary.audioEvents.length} eventos)…` });
    console.log(`[render] Synthesizing 48kHz stereo ASMR audio (${summary.audioEvents.length} synced events)...`);
    synthesizeAsmrWav({
      durationSec: summary.durationSec,
      audioEvents: summary.audioEvents,
      outputPath: tempWavPath,
    });

    onProgress?.({ stage: 'mux', percent: 95, frames: frameCount, message: 'Finalizando MP4 H.264 + AAC…' });
    console.log(`[render] Muxing final MP4 -> ${finalMp4Path}`);
    await runFfmpeg([
      '-y',
      '-i', tempVideoPath,
      '-i', tempWavPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-shortest',
      '-movflags', '+faststart',
      finalMp4Path,
    ]);

    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);

    const fileSizeMb = Number((fs.statSync(finalMp4Path).size / (1024 * 1024)).toFixed(2));
    const manifest = {
      renderedAt: new Date().toISOString(),
      filename: path.basename(finalMp4Path),
      videoFile: path.relative(ROOT, finalMp4Path).replace(/\\/g, '/'),
      videoAbsolutePath: finalMp4Path,
      fileSizeMb,
      width: W,
      height: H,
      fps: FPS,
      frames: frameCount,
      durationSec: summary.durationSec,
      handle: HANDLE,
      cutterId: cutterPrompt ? 'custom' : cutterId,
      cutterPrompt: cutterPrompt || '',
      surfaceId: surfacePrompt ? 'custom' : (surfaceId || 'default'),
      surfacePrompt: surfacePrompt || '',
      envId: envPrompt ? 'custom' : summary.envId,
      envPrompt: envPrompt || '',
      rounds: ROUNDS,
      objectId: summary.object.id,
      objectPrompt: objectPrompt || '',
      modelAssetId: modelMeta?.assetId || meta?.modelAssetId || '',
      solidRatio: meta?.solidRatio ?? null,
      slug: summary.object.slug,
      name: summary.object.name,
      englishName: summary.object.englishName,
      subtitle: summary.object.subtitle,
      maxCubes: summary.maxCubes,
      audioEventCount: summary.audioEvents.length,
      heroFramePath: heroSaved ? heroFramePath : null,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`[render] DONE! ${finalMp4Path} (${fileSizeMb} MB, ${summary.durationSec}s @ ${FPS}fps, ${summary.maxCubes.toLocaleString('en-US')} max cubes)`);
    onProgress?.({ stage: 'done', percent: 100, frames: frameCount, message: 'MP4 Video Ready!', manifest });
    return manifest;
  } finally {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
  }
}

/**
 * Fast Pre-Flight Visual QA Capture (~3-5 seconds):
 * Renders 2 snapshots of any scene (0 CUTS intact silhouette + 10 CUTS sliced open interior)
 * plus solid voxel metrics so automated QA can reject ugly/broken/hollow scenes BEFORE rendering!
 */
export async function capturePreFlightFrames({
  objectId = 'salmon',
  objectPrompt = '',
  modelUrl = '',
  modelMeta = null,
  cutterId = 'chef-knife',
  cutterPrompt = '',
  surfaceId = '',
  surfacePrompt = '',
  envId = 'classic-viral',
  envPrompt = '',
  handle = '@atomslice3d',
  width = 360,
  height = 640,
} = {}) {
  const executablePath = resolveChromiumExecutable();
  const viteServer = await createServer({
    configFile: path.join(ROOT, 'engine', 'vite.config.js'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'silent',
  });
  await viteServer.listen();
  const addr = viteServer.httpServer.address();
  const url = `http://127.0.0.1:${addr.port}/?headless=1`;

  let browser = null;
  try {
    const isLinux = process.platform === 'linux';
    const launchArgs = isLinux
      ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage']
      : ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'];
    browser = await chromium.launch({ executablePath, headless: true, args: launchArgs });
    const page = await browser.newPage({ viewport: { width, height } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(e.message));

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__HEADLESS_READY__ === true || Boolean(window.__HEADLESS_ERROR__), { timeout: 30000 });
    const bootErr = await page.evaluate(() => window.__HEADLESS_ERROR__ || null);
    if (bootErr) throw new Error(`Pre-flight boot failed: ${bootErr}`);

    const meta = await page.evaluate(
      (opts) => window.__HEADLESS_API__.configure(opts),
      {
        objectId, objectPrompt, modelUrl, modelMeta,
        cutterId, cutterPrompt, surfaceId, surfacePrompt, envId, envPrompt,
        handle, width, height,
        rounds: [10],
        durationScale: 1.0,
        showHud: true,
        ctaOutro: null,
      }
    );

    // Frame 1: intact hero object at t = 0.08s
    const intact = await page.evaluate(() => {
      window.__HEADLESS_API__.stepAndCapture(0.04, 0.88);
      return window.__HEADLESS_API__.stepAndCapture(0.04, 0.90);
    });

    // Step forward cleanly at 30fps to t ~ 7.7s (mid-Z-slice of 10-cut round) where front slices drop open showing the solid interior!
    const sliced = await page.evaluate(() => {
      for (let i = 0; i < 230; i++) {
        window.__HEADLESS_API__.stepOnly(1 / 30);
      }
      return window.__HEADLESS_API__.stepAndCapture(1 / 30, 0.90);
    });

    return {
      meta,
      consoleErrors,
      intactJpegB64: intact.base64,
      slicedJpegB64: sliced.base64,
    };
  } finally {
    if (browser) await browser.close();
    await viteServer.close();
  }
}

// CLI execution (supports both flags and --jobFile <json>)
// Guard with globalThis flag so Vite loading engine/vite.config.js (which imports render-headless.mjs)
// NEVER recursively re-triggers CLI execution when invoked directly via `node scripts/render-headless.mjs`!
if (
  !globalThis.__INFINITE_SLICE_CLI_RUNNING__ &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  globalThis.__INFINITE_SLICE_CLI_RUNNING__ = true;
  const args = process.argv.slice(2);
  const getFlag = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const jobFile = getFlag('jobFile', null);
  let opts;
  if (jobFile && fs.existsSync(jobFile)) {
    opts = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  } else {
    const quick = hasFlag('quick');
    const resStr = getFlag('res', quick ? '540x960' : undefined);
    const [w, h] = resStr ? resStr.split('x').map(Number) : [undefined, undefined];
    const roundsArg = getFlag('rounds', quick ? '10,100,1000' : undefined);
    const rounds = roundsArg ? roundsArg.split(',').map(Number) : undefined;
    opts = {
      objectId: getFlag('object', 'salmon'),
      objectPrompt: getFlag('objectPrompt', ''),
      cutterId: getFlag('cutter', 'chef-knife'),
      cutterPrompt: getFlag('cutterPrompt', ''),
      surfaceId: getFlag('surface', ''),
      surfacePrompt: getFlag('surfacePrompt', ''),
      envId: getFlag('env', 'classic-viral'),
      envPrompt: getFlag('envPrompt', ''),
      handle: getFlag('handle', undefined),
      width: w,
      height: h,
      fps: getFlag('fps', quick ? '30' : undefined) ? Number(getFlag('fps', quick ? '30' : undefined)) : undefined,
      rounds,
      durationScale: quick ? 0.55 : Number(getFlag('scale', '1.0')),
      ctaOutro: hasFlag('no-cta') ? false : undefined,
      outputName: getFlag('out', undefined),
      serverUrl: getFlag('serverUrl', undefined),
    };
  }

  renderHeadlessVideo(opts).catch((err) => {
    console.error('[render] FATAL:', err);
    process.exit(1);
  });
}
