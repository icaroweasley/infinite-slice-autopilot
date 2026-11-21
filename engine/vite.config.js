import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo } from '../scripts/render-headless.mjs';
import { recordEntry, loadConfig, loadHistory } from '../scripts/history-cli.mjs';
import { buildEnglishCaption, publishReel } from '../scripts/publish-reels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const BRIEF_PATH = path.join(ROOT, 'data', 'studio-brief.json');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function infiniteSliceStudioApiPlugin() {
  const jobs = new Map();
  let activeJobId = null;

  return {
    name: 'infinite-slice-studio-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        try {
          const urlObj = new URL(req.url, 'http://127.0.0.1');
          const pathname = urlObj.pathname;

          // 1. POST /api/render — start real headless Playwright + FFmpeg MP4 render
          if (req.method === 'POST' && pathname === '/api/render') {
            if (activeJobId && jobs.get(activeJobId)?.status === 'running') {
              return sendJson(res, 409, { error: 'Já existe uma renderização em andamento. Aguarde concluir.' });
            }

            const body = await readJsonBody(req);
            const jobId = `job-${Date.now()}`;
            const addr = server.httpServer?.address();
            const localPort = typeof addr === 'object' && addr ? addr.port : 5174;
            const serverUrl = `http://127.0.0.1:${localPort}`;

            const job = {
              id: jobId,
              status: 'running',
              stage: 'boot',
              percent: 1,
              frames: 0,
              message: 'Iniciando renderização headless…',
              manifest: null,
              caption: '',
              error: null,
              startedAt: Date.now(),
            };
            jobs.set(jobId, job);
            activeJobId = jobId;

            // Fire and forget async render in Node process (reusing this Vite server for instant boot!)
            renderHeadlessVideo({
              objectId: body.objectId || 'salmon',
              objectPrompt: body.objectPrompt || '',
              cutterId: body.cutterId || 'chef-knife',
              cutterPrompt: body.cutterPrompt || '',
              surfaceId: body.surfaceId || '',
              surfacePrompt: body.surfacePrompt || '',
              envId: body.envId || 'classic-viral',
              envPrompt: body.envPrompt || '',
              handle: body.handle ?? '@cubiccutlab',
              width: Number(body.width) || 1080,
              height: Number(body.height) || 1920,
              fps: Number(body.fps) || 60,
              rounds: Array.isArray(body.rounds) && body.rounds.length > 0 ? body.rounds.map(Number) : [10, 50, 100, 250, 500, 1000],
              durationScale: Number(body.durationScale) || 1.0,
              showHud: body.showHud !== false,
              serverUrl,
              onProgress: (p) => {
                job.stage = p.stage || job.stage;
                job.percent = p.percent ?? job.percent;
                job.frames = p.frames ?? job.frames;
                job.message = p.message || job.message;
              },
            })
              .then((manifest) => {
                const cfg = loadConfig();
                const caption = buildEnglishCaption(manifest, cfg);
                recordEntry({
                  objectId: manifest.objectId,
                  slug: manifest.slug,
                  name: manifest.name,
                  englishName: manifest.englishName,
                  cutterId: manifest.cutterId,
                  cutterPrompt: manifest.cutterPrompt,
                  surfaceId: manifest.surfaceId,
                  surfacePrompt: manifest.surfacePrompt,
                  envId: manifest.envId,
                  envPrompt: manifest.envPrompt,
                  rounds: manifest.rounds,
                  maxCubes: manifest.maxCubes,
                  durationSec: manifest.durationSec,
                  resolution: `${manifest.width}x${manifest.height}`,
                  fps: manifest.fps,
                  videoFile: manifest.videoFile,
                  caption,
                });
                job.status = 'done';
                job.stage = 'done';
                job.percent = 100;
                job.manifest = manifest;
                job.caption = caption;
                job.message = `MP4 pronto (${manifest.fileSizeMb} MB)!`;
                activeJobId = null;
              })
              .catch((err) => {
                job.status = 'error';
                job.error = err.message || String(err);
                job.message = `Erro: ${job.error}`;
                activeJobId = null;
              });

            return sendJson(res, 202, { jobId });
          }

          // 2. GET /api/render/:id — poll live progress
          if (req.method === 'GET' && pathname.startsWith('/api/render/')) {
            const jobId = pathname.slice('/api/render/'.length);
            const job = jobs.get(jobId);
            if (!job) return sendJson(res, 404, { error: 'Job not found' });
            return sendJson(res, 200, job);
          }

          // 3. GET /api/videos — list rendered MP4 vault in output/
          if (req.method === 'GET' && pathname === '/api/videos') {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            const files = fs
              .readdirSync(OUTPUT_DIR)
              .filter((f) => f.endsWith('.mp4') && !f.endsWith('.tmp.mp4'));
            const cfg = loadConfig();

            const items = files
              .map((filename) => {
                const full = path.join(OUTPUT_DIR, filename);
                const stat = fs.statSync(full);
                const jsonPath = full.replace(/\.mp4$/i, '.json');
                let manifest = null;
                if (fs.existsSync(jsonPath)) {
                  try { manifest = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}
                }
                const caption = manifest ? buildEnglishCaption(manifest, cfg) : '';
                return {
                  filename,
                  sizeMb: Number((stat.size / (1024 * 1024)).toFixed(2)),
                  mtimeMs: stat.mtimeMs,
                  url: `/api/video/${encodeURIComponent(filename)}`,
                  downloadUrl: `/api/video/${encodeURIComponent(filename)}?download=1`,
                  manifest,
                  caption,
                };
              })
              .sort((a, b) => b.mtimeMs - a.mtimeMs);

            return sendJson(res, 200, { videos: items });
          }

          // 4. GET /api/video/:filename — stream MP4 with HTTP Range support
          if (req.method === 'GET' && pathname.startsWith('/api/video/')) {
            const filename = path.basename(decodeURIComponent(pathname.slice('/api/video/'.length)));
            const full = path.join(OUTPUT_DIR, filename);
            if (!fs.existsSync(full) || !filename.endsWith('.mp4')) {
              res.statusCode = 404;
              return res.end('Video not found');
            }
            const stat = fs.statSync(full);
            const isDownload = urlObj.searchParams.get('download') === '1';
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'bytes');
            if (isDownload) {
              res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            }

            const range = req.headers.range;
            if (range) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
              res.statusCode = 206;
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
              res.setHeader('Content-Length', end - start + 1);
              fs.createReadStream(full, { start, end }).pipe(res);
            } else {
              res.statusCode = 200;
              res.setHeader('Content-Length', stat.size);
              fs.createReadStream(full).pipe(res);
            }
            return;
          }

          // 5. POST /api/publish — trigger publish-reels.mjs (or dry-run preview)
          if (req.method === 'POST' && pathname === '/api/publish') {
            const body = await readJsonBody(req);
            const filename = path.basename(body.filename || '');
            const result = await publishReel({
              videoPath: path.join('output', filename),
              dryRun: Boolean(body.dryRun),
              captionOverride: body.caption || undefined,
            });
            return sendJson(res, 200, result);
          }

          // 6. POST /api/brief — save structured AI creation brief to data/studio-brief.json
          if (req.method === 'POST' && pathname === '/api/brief') {
            const body = await readJsonBody(req);
            const brief = {
              id: `brief-${Date.now()}`,
              createdAt: new Date().toISOString(),
              status: 'pending_ai',
              object: body.object || { mode: 'ai-random', prompt: '' },
              cutter: body.cutter || { mode: 'ai-random', prompt: '' },
              surface: body.surface || { mode: 'ai-random', prompt: '' },
              environment: body.environment || { mode: 'ai-random', prompt: '' },
              rounds: Array.isArray(body.rounds) && body.rounds.length > 0 ? body.rounds.map(Number) : [10, 50, 100, 250, 500, 1000],
              render: body.render || { handle: '@cubiccutlab', width: 1080, height: 1920, fps: 60, durationScale: 1.0, showHud: true },
              result: null,
            };
            fs.mkdirSync(path.dirname(BRIEF_PATH), { recursive: true });
            fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2) + '\n', 'utf8');
            return sendJson(res, 201, { brief });
          }

          // 7. GET /api/brief — read current brief status (for live watcher in Studio UI)
          if (req.method === 'GET' && pathname === '/api/brief') {
            if (!fs.existsSync(BRIEF_PATH)) {
              return sendJson(res, 200, { brief: null });
            }
            const brief = JSON.parse(fs.readFileSync(BRIEF_PATH, 'utf8'));
            return sendJson(res, 200, { brief });
          }

          // 8. GET /api/history — returns history slugs so AI suggestion picker never repeats!
          if (req.method === 'GET' && pathname === '/api/history') {
            const hist = loadHistory();
            return sendJson(res, 200, {
              total: hist.entries.length,
              usedSlugs: hist.entries.map((e) => (e.slug || '').toLowerCase()),
              usedNames: hist.entries.map((e) => (e.name || e.englishName || '').toLowerCase()),
            });
          }

          return sendJson(res, 404, { error: 'Unknown API endpoint' });
        } catch (err) {
          return sendJson(res, 500, { error: err.message || String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [infiniteSliceStudioApiPlugin()],
  server: {
    port: 5174,
    strictPort: false,
  },
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
});
