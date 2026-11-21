import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, markPublished } from './history-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

export function buildEnglishCaption(manifest, config) {
  const objName = manifest.englishName || manifest.name || 'this object';
  const maxCuts = Math.max(...(manifest.rounds || [1000])).toLocaleString('en-US');
  const maxCubes = (manifest.maxCubes || 0).toLocaleString('en-US');
  const handle = manifest.handle || config.brand?.handle || '@cubiccutlab';
  const hashtags = (config.publishing?.hashtags || ['#satisfying', '#3dart', '#asmr', '#reels']).join(' ');

  const hooks = [
    `Slicing a ${objName} ${maxCuts} times… wait for the inside 😳🔪`,
    `10 → ${maxCuts} cuts on a ${objName}. Final count: ${maxCubes} cubes 🤯`,
    `Watch what happens to a ${objName} at ${maxCuts} cuts 🔊✨`,
    `Cutting a ${objName} like butter until it turns to dust 🔪✨`,
  ];
  const hash = [...objName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hook = hooks[hash % hooks.length];

  return `${hook}\n\nWhat impossible object should ${handle} slice next? Comment below 👇\n\n${hashtags}`;
}

async function uploadToCloudinary(videoPath) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) return null;

  const fileBuf = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append('file', new Blob([fileBuf], { type: 'video/mp4' }), path.basename(videoPath));
  form.append('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(`Cloudinary upload failed: ${JSON.stringify(json)}`);
  }
  return json.secure_url;
}

async function publishViaN8n(videoPath, manifest, caption) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('N8N_WEBHOOK_URL is not set in .env');

  const fileBuf = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append('video', new Blob([fileBuf], { type: 'video/mp4' }), path.basename(videoPath));
  form.append('metadata', JSON.stringify({ ...manifest, caption }));

  const res = await fetch(webhookUrl, { method: 'POST', body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`n8n webhook failed (${res.status}): ${text.slice(0, 400)}`);
  return { provider: 'n8n', status: res.status, response: text.slice(0, 400) };
}

async function publishViaMetaGraph(videoPath, manifest, caption) {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUserId || !token) {
    throw new Error('IG_USER_ID and IG_ACCESS_TOKEN must be set in .env for Meta Graph API publishing.');
  }

  let videoUrl = process.env.PUBLIC_VIDEO_BASE_URL
    ? `${process.env.PUBLIC_VIDEO_BASE_URL.replace(/\/$/, '')}/${path.basename(videoPath)}`
    : await uploadToCloudinary(videoPath);

  if (!videoUrl) {
    throw new Error('Meta Graph API requires a public HTTPS video URL. Configure CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET or PUBLIC_VIDEO_BASE_URL in .env.');
  }

  // 1. Create Reels media container
  const createParams = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true',
    access_token: token,
  });
  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media?${createParams}`, { method: 'POST' });
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    throw new Error(`Meta Graph container error: ${JSON.stringify(createJson)}`);
  }
  const creationId = createJson.id;

  // 2. Poll container processing status until FINISHED (max ~2 minutes)
  let status = 'IN_PROGRESS';
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(
      `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    const pollJson = await pollRes.json();
    status = pollJson.status_code || 'UNKNOWN';
    console.log(`[publish] IG container ${creationId} status: ${status}`);
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`IG container failed with status: ${status} (${JSON.stringify(pollJson)})`);
    }
  }
  if (status !== 'FINISHED') {
    throw new Error(`Timed out waiting for IG container ${creationId} (last status: ${status})`);
  }

  // 3. Publish Reel
  const pubParams = new URLSearchParams({
    creation_id: creationId,
    access_token: token,
  });
  const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish?${pubParams}`, { method: 'POST' });
  const pubJson = await pubRes.json();
  if (!pubRes.ok || !pubJson.id) {
    throw new Error(`Meta Graph media_publish error: ${JSON.stringify(pubJson)}`);
  }
  return { provider: 'meta-graph', creationId, mediaId: pubJson.id, videoUrl };
}

export async function publishReel({ videoPath, manifestPath, dryRun = false, captionOverride } = {}) {
  loadDotEnv();
  const cfg = loadConfig();
  const absVideo = path.resolve(ROOT, videoPath);
  if (!fs.existsSync(absVideo)) {
    throw new Error(`Video file not found: ${absVideo}`);
  }

  const autoManifest = manifestPath
    ? path.resolve(ROOT, manifestPath)
    : absVideo.replace(/\.mp4$/i, '.json');
  const manifest = fs.existsSync(autoManifest)
    ? JSON.parse(fs.readFileSync(autoManifest, 'utf8'))
    : { videoFile: path.relative(ROOT, absVideo), englishName: path.basename(absVideo, '.mp4') };

  const caption = captionOverride || buildEnglishCaption(manifest, cfg);
  const mode = dryRun ? 'dry-run' : (process.env.N8N_WEBHOOK_URL ? 'n8n' : process.env.IG_ACCESS_TOKEN ? 'meta-graph' : 'dry-run');

  if (mode === 'dry-run') {
    console.log('\n[publish] === DRY-RUN PREVIEW (No credentials configured or --dry-run set) ===');
    console.log(`Video:   ${absVideo} (${(fs.statSync(absVideo).size / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`Caption:\n---\n${caption}\n---`);
    console.log('To publish live, add N8N_WEBHOOK_URL or IG_USER_ID + IG_ACCESS_TOKEN to .env.\n');
    return { provider: 'dry-run', caption, videoPath: absVideo };
  }

  const result = mode === 'n8n'
    ? await publishViaN8n(absVideo, manifest, caption)
    : await publishViaMetaGraph(absVideo, manifest, caption);

  markPublished(manifest.videoFile || absVideo, { ...result, caption });
  console.log(`[publish] Published successfully via ${result.provider}!`, result);
  return { ...result, caption };
}

// CLI entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getFlag = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };
  const videoPath = getFlag('video', null);
  if (!videoPath) {
    console.error('Usage: node scripts/publish-reels.mjs --video output/<file>.mp4 [--dry-run] [--caption "..."]');
    process.exit(1);
  }
  publishReel({
    videoPath,
    dryRun: args.includes('--dry-run'),
    captionOverride: getFlag('caption', undefined),
  }).catch((err) => {
    console.error('[publish] ERROR:', err.message);
    process.exit(1);
  });
}
