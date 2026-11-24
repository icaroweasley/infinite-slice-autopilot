import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './history-cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024; // 64 MB
const MULTI_CHUNK_BYTES = 10 * 1024 * 1024; // 10 MB (within TikTok 5 MB - 64 MB rule)

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
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

function persistRotatedRefreshToken(newRefreshToken) {
  if (!newRefreshToken || !fs.existsSync(ENV_PATH)) return;
  if (newRefreshToken === process.env.TIKTOK_REFRESH_TOKEN) return;
  try {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
    let replaced = false;
    const next = lines.map((line) => {
      if (line.trim().startsWith('TIKTOK_REFRESH_TOKEN=')) {
        replaced = true;
        return `TIKTOK_REFRESH_TOKEN=${newRefreshToken}`;
      }
      return line;
    });
    if (!replaced) next.push(`TIKTOK_REFRESH_TOKEN=${newRefreshToken}`);
    fs.writeFileSync(ENV_PATH, next.join('\n').replace(/\n*$/, '\n'), 'utf8');
    process.env.TIKTOK_REFRESH_TOKEN = newRefreshToken;
    console.log('[tiktok] Updated rotated TIKTOK_REFRESH_TOKEN in local .env');
  } catch {
    // Non-fatal in read-only CI environments
  }
}

export function buildTikTokCaption(manifest = {}, config = {}) {
  const objName = manifest.englishName || manifest.name || 'Impossible 3D Object';
  const maxCuts = Math.max(...(manifest.rounds || [1000])).toLocaleString('en-US');
  const maxCubes = (manifest.maxCubes || 0).toLocaleString('en-US');
  const handle = manifest.handle || config.brand?.handle || '@atomslice3d';

  const hooks = [
    `Slicing a ${objName} ${maxCuts} times 🤯🔪`,
    `${objName} vs ${maxCuts} cuts 😳✨`,
    `10 → ${maxCuts} cuts on a ${objName} 🔪`,
  ];
  const hash = [...objName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hook = hooks[hash % hooks.length];
  const cubesLine = maxCubes && maxCubes !== '0' ? `Final count: ${maxCubes} micro-cubes! ` : '';
  const cta = `What should ${handle} slice next? 👇`;
  const tags = `#satisfying #asmr #3dart #oddlysatisfying #slicing #infiniteslice #fyp`;

  return `${hook} ${cubesLine}${cta} ${tags}`.slice(0, 2200);
}

export function hasTikTokCredentials() {
  loadDotEnv();
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY &&
      process.env.TIKTOK_CLIENT_SECRET &&
      process.env.TIKTOK_REFRESH_TOKEN
  );
}

async function getTikTokAccessToken() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
  if (!clientKey || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`TikTok token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    persistRotatedRefreshToken(json.refresh_token);
  }
  return json.access_token;
}

async function queryCreatorInfo(accessToken) {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: '{}',
  });
  const json = await res.json();
  if (!res.ok || (json.error && json.error.code && json.error.code !== 'ok')) {
    throw new Error(`TikTok creator_info query failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.data || {};
}

function computeChunkPlan(videoSize) {
  if (videoSize <= MAX_SINGLE_CHUNK_BYTES) {
    return {
      chunkSize: videoSize,
      totalChunkCount: 1,
      chunks: [{ start: 0, end: videoSize - 1 }],
    };
  }

  // TikTok spec: chunk_size in [5MB, 64MB], total_chunk_count = floor(video_size / chunk_size),
  // trailing remainder merged into the final chunk (up to 128 MB).
  const chunkSize = MULTI_CHUNK_BYTES;
  const totalChunkCount = Math.floor(videoSize / chunkSize);
  const chunks = [];
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    const end = i === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    chunks.push({ start, end });
  }
  return { chunkSize, totalChunkCount, chunks };
}

async function uploadChunksToTikTok(uploadUrl, fileBuf, chunks) {
  const totalSize = fileBuf.length;
  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i];
    const slice = fileBuf.subarray(start, end + 1);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      },
      body: slice,
    });
    if (!res.ok && res.status !== 201 && res.status !== 206) {
      throw new Error(`TikTok chunk ${i + 1}/${chunks.length} PUT failed (${res.status}): ${await res.text()}`);
    }
    console.log(`[tiktok] Uploaded chunk ${i + 1}/${chunks.length} (bytes ${start}-${end}/${totalSize})`);
  }
}

async function pollPublishStatus(accessToken, publishId, maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 1 ? 2500 : 4000));
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const json = await res.json();
    if (!res.ok || (json.error && json.error.code && json.error.code !== 'ok')) {
      throw new Error(`TikTok status fetch failed (${res.status}): ${JSON.stringify(json)}`);
    }
    const status = json.data?.status;
    console.log(`[tiktok] Status poll ${attempt}/${maxAttempts}: ${status}`);
    if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') {
      return json.data;
    }
    if (status === 'FAILED') {
      throw new Error(`TikTok processing FAILED: ${JSON.stringify(json.data)}`);
    }
  }
  return { status: 'PROCESSING_UPLOAD', publish_id: publishId };
}

export async function publishTikTokVideo({
  videoPath,
  manifest = {},
  captionOverride,
  modeOverride,
  privacyOverride,
  dryRun = false,
}) {
  loadDotEnv();
  const absVideo = path.isAbsolute(videoPath) ? videoPath : path.resolve(ROOT, videoPath);
  if (!fs.existsSync(absVideo)) {
    throw new Error(`Video not found: ${absVideo}`);
  }

  const cfg = loadConfig();
  const caption = (captionOverride || buildTikTokCaption(manifest, cfg)).slice(0, 2200);
  const mode = (modeOverride || process.env.TIKTOK_MODE || 'inbox').toLowerCase();
  const requestedPrivacy = (privacyOverride || process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE').toUpperCase();

  if (dryRun) {
    console.log(`\n[tiktok DRY-RUN] Would upload via mode="${mode}" (privacy=${requestedPrivacy}):`, absVideo);
    console.log('Caption:', caption);
    return { provider: 'dry-run', mode, caption };
  }

  const accessToken = await getTikTokAccessToken();
  if (!accessToken) {
    return { provider: 'skipped', reason: 'No TikTok credentials configured' };
  }

  const fileBuf = fs.readFileSync(absVideo);
  const plan = computeChunkPlan(fileBuf.length);
  console.log(
    `[tiktok] Starting ${mode.toUpperCase()} upload (${(fileBuf.length / (1024 * 1024)).toFixed(1)} MB, ${plan.totalChunkCount} chunk(s))...`
  );

  let endpoint;
  let initPayload;
  let effectivePrivacy = requestedPrivacy;

  if (mode === 'direct') {
    let creatorInfo = {};
    try {
      creatorInfo = await queryCreatorInfo(accessToken);
      const allowed = Array.isArray(creatorInfo.privacy_level_options) ? creatorInfo.privacy_level_options : [];
      if (allowed.length > 0 && !allowed.includes(effectivePrivacy)) {
        const fallback = allowed.includes('SELF_ONLY') ? 'SELF_ONLY' : allowed[0];
        console.warn(
          `[tiktok] Requested privacy "${effectivePrivacy}" not allowed yet (allowed: ${allowed.join(', ')}). Falling back to "${fallback}".`
        );
        effectivePrivacy = fallback;
      }
    } catch (infoErr) {
      console.warn('[tiktok] creator_info check warning:', infoErr.message);
    }

    endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    initPayload = {
      post_info: {
        title: caption,
        privacy_level: effectivePrivacy,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1500,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileBuf.length,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    };
  } else {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';
    initPayload = {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileBuf.length,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    };
  }

  const initRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(initPayload),
  });
  const initJson = await initRes.json();
  if (!initRes.ok || (initJson.error && initJson.error.code && initJson.error.code !== 'ok') || !initJson.data?.upload_url) {
    throw new Error(`TikTok ${mode} init failed (${initRes.status}): ${JSON.stringify(initJson)}`);
  }

  const { publish_id: publishId, upload_url: uploadUrl } = initJson.data;
  console.log(`[tiktok] Initialized publish_id=${publishId}`);

  await uploadChunksToTikTok(uploadUrl, fileBuf, plan.chunks);
  const finalStatus = await pollPublishStatus(accessToken, publishId);

  console.log(`[tiktok] Done! mode=${mode} | publish_id=${publishId} | status=${finalStatus.status}`);
  return {
    provider: 'tiktok-api',
    mode,
    privacyLevel: mode === 'direct' ? effectivePrivacy : 'INBOX_DRAFT',
    publishId,
    status: finalStatus.status,
    publicPostIds: finalStatus.publicaly_available_post_id || [],
  };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : null;
  };
  const video = getArg('video');
  const dryRun = args.includes('--dry-run');
  if (!video) {
    console.error(
      'Usage: node scripts/publish-tiktok.mjs --video output/file.mp4 [--mode inbox|direct] [--privacy SELF_ONLY|PUBLIC_TO_EVERYONE] [--caption "..."] [--dry-run]'
    );
    process.exit(1);
  }
  publishTikTokVideo({
    videoPath: video,
    captionOverride: getArg('caption'),
    modeOverride: getArg('mode'),
    privacyOverride: getArg('privacy'),
    dryRun,
  }).catch((err) => {
    console.error('[tiktok] ERROR:', err.message);
    process.exit(1);
  });
}
