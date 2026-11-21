import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './history-cli.mjs';

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

export function buildYouTubeMetadata(manifest, config) {
  const objName = manifest.englishName || manifest.name || 'Impossible Object';
  const maxCuts = Math.max(...(manifest.rounds || [1000])).toLocaleString('en-US');
  const maxCubes = (manifest.maxCubes || 0).toLocaleString('en-US');
  const handle = manifest.handle || config.brand?.handle || '@atomslice3d';

  const titles = [
    `${objName} vs ${maxCuts} Cuts 🤯 #shorts`,
    `Slicing a ${objName} ${maxCuts} Times! 🔪 #shorts`,
    `10 → ${maxCuts} Cuts on a ${objName} 😳 #shorts`,
  ];
  const hash = [...objName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const title = titles[hash % titles.length].slice(0, 100);

  const description = [
    `10 → ${maxCuts} cuts on a ${objName}${maxCubes && maxCubes !== '0' ? ` — final count: ${maxCubes} micro-cubes` : ''}! 🔪✨`,
    ``,
    `What impossible object should ${handle} slice next? Comment below 👇`,
    ``,
    `Create your own 60 FPS 3D slicing videos with Infinite Slice 3D:`,
    `https://atomslice3d.netlify.app`,
    ``,
    `#shorts #satisfying #asmr #3dart #oddlysatisfying #slicing #infiniteslice #3danimation`,
  ].join('\n');

  const tags = [
    'shorts',
    'satisfying',
    'oddly satisfying',
    'asmr',
    '3d animation',
    'slicing',
    '1000 cuts',
    objName.toLowerCase(),
    'atomslice3d',
  ];

  const tiktokCaption = `${title.replace(/\s*#shorts/i, '').trim()} — ${maxCubes && maxCubes !== '0' ? `${maxCubes} cubes ` : ''}#satisfying #asmr #3dart #oddlysatisfying #fyp #infiniteslice`;

  return { title, description, tags, tiktokCaption };
}

/**
 * Method A: Upload-Post.com (Google-audited YouTube Shorts + optional TikTok API)
 * Requires: UPLOAD_POST_API_KEY and UPLOAD_POST_USER (profile username created in Upload-Post dashboard).
 * Optional: UPLOAD_POST_PLATFORMS (comma-separated, e.g. "youtube" or "youtube,tiktok"; default "youtube").
 */
async function publishViaUploadPost(videoPath, meta) {
  const apiKey = process.env.UPLOAD_POST_API_KEY;
  const user = process.env.UPLOAD_POST_USER;
  if (!apiKey || !user) return null;

  const platforms = (process.env.UPLOAD_POST_PLATFORMS || 'youtube')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  console.log(`[social] Uploading via Upload-Post API -> platforms=[${platforms.join(', ')}]...`);
  const fileBuf = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append('user', user);
  for (const p of platforms) {
    form.append('platform[]', p);
  }
  form.append('title', meta.title);
  form.append('description', meta.description);
  form.append('privacyStatus', 'public');
  if (platforms.includes('tiktok')) {
    form.append('tiktok_title', meta.tiktokCaption);
    form.append('privacy_level', process.env.TIKTOK_PRIVACY_LEVEL || 'PUBLIC_TO_EVERYONE');
  }
  form.append('video', new Blob([fileBuf], { type: 'video/mp4' }), path.basename(videoPath));

  const res = await fetch('https://api.upload-post.com/api/upload', {
    method: 'POST',
    headers: { Authorization: `Apikey ${apiKey}` },
    body: form,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Upload-Post failed (${res.status}): ${JSON.stringify(json)}`);
  }
  console.log('[social] Published via Upload-Post:', JSON.stringify(json));
  return { provider: 'upload-post', platforms, response: json };
}

/**
 * Method B: Official Google YouTube Data API v3 (OAuth 2.0 Refresh Token)
 * 100% free (10,000 quota units/day = 6 Shorts/day).
 * Note: New Google Cloud projects require submitting Google's free YouTube API Compliance Audit
 * (https://support.google.com/youtube/contact/yt_api_form) before uploads can be set to PUBLIC.
 */
async function getGoogleAccessToken() {
  const clientId = process.env.YT_CLIENT_ID;
  const clientSecret = process.env.YT_CLIENT_SECRET;
  const refreshToken = process.env.YT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`YouTube OAuth token refresh failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function publishViaYouTubeDataApi(videoPath, meta, privacyStatus = 'public') {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return null;

  const fileBuf = fs.readFileSync(videoPath);
  console.log(`[youtube] Starting official YouTube Data API v3 resumable upload (${(fileBuf.length / (1024 * 1024)).toFixed(1)} MB)...`);

  const snippet = {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: '24', // Entertainment
      defaultLanguage: 'en',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(fileBuf.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(snippet),
    }
  );

  if (!initRes.ok) {
    throw new Error(`YouTube resumable init failed (${initRes.status}): ${await initRes.text()}`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube resumable init returned no upload location header');
  }

  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(fileBuf.length),
      'Content-Type': 'video/mp4',
    },
    body: fileBuf,
  });
  const upJson = await upRes.json();
  if (!upRes.ok || !upJson.id) {
    throw new Error(`YouTube binary upload failed (${upRes.status}): ${JSON.stringify(upJson)}`);
  }

  const url = `https://www.youtube.com/shorts/${upJson.id}`;
  console.log(`[youtube] Uploaded! Video ID: ${upJson.id} | Status: ${upJson.status?.privacyStatus} | URL: ${url}`);
  return { provider: 'youtube-api', videoId: upJson.id, privacyStatus: upJson.status?.privacyStatus, url };
}

export function hasYouTubeCredentials() {
  loadDotEnv();
  return Boolean(
    (process.env.UPLOAD_POST_API_KEY && process.env.UPLOAD_POST_USER) ||
    (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN)
  );
}

export async function publishYouTubeShort({ videoPath, manifest = {}, titleOverride, descriptionOverride, dryRun = false }) {
  loadDotEnv();
  const absVideo = path.isAbsolute(videoPath) ? videoPath : path.resolve(ROOT, videoPath);
  if (!fs.existsSync(absVideo)) {
    throw new Error(`Video not found: ${absVideo}`);
  }

  const cfg = loadConfig();
  const meta = buildYouTubeMetadata(manifest, cfg);
  if (titleOverride) meta.title = titleOverride.slice(0, 100);
  if (descriptionOverride) meta.description = descriptionOverride;

  if (dryRun) {
    console.log('\n[youtube DRY-RUN] Would upload Short:', absVideo);
    console.log('Title:', meta.title);
    console.log('Description:\n' + meta.description);
    return { provider: 'dry-run', meta };
  }

  if (process.env.UPLOAD_POST_API_KEY && process.env.UPLOAD_POST_USER) {
    return publishViaUploadPost(absVideo, meta);
  }

  if (process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET && process.env.YT_REFRESH_TOKEN) {
    return publishViaYouTubeDataApi(absVideo, meta, process.env.YT_PRIVACY_STATUS || 'public');
  }

  return { provider: 'skipped', reason: 'No YouTube credentials configured' };
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
    console.error('Usage: node scripts/publish-youtube.mjs --video output/file.mp4 [--title "..."] [--dry-run]');
    process.exit(1);
  }
  publishYouTubeShort({
    videoPath: video,
    titleOverride: getArg('title'),
    descriptionOverride: getArg('description'),
    dryRun,
  }).catch((err) => {
    console.error('[youtube] ERROR:', err.message);
    process.exit(1);
  });
}
