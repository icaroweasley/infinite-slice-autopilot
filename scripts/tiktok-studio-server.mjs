import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const PREVIEW_DIR = path.join(ROOT, 'output', 'preview-5');
const PORT = Number(process.env.TIKTOK_STUDIO_PORT || 4789);
const REDIRECT_URI = 'https://atomslice3d.netlify.app/tiktok-callback.html';
const SCOPES = 'user.info.basic,video.upload,video.publish';
const MAX_SINGLE_CHUNK_BYTES = 64 * 1024 * 1024;
const MULTI_CHUNK_BYTES = 10 * 1024 * 1024;

const ALLOWED_ORIGINS = new Set([
  'https://atomslice3d.netlify.app',
  'http://localhost:4789',
  'http://127.0.0.1:4789',
]);

let cachedAccessToken = null;
let cachedAccessExpiry = 0;

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    process.env[k] = v;
  }
}

function upsertEnvVars(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const lines = content ? content.split(/\r?\n/) : [];
  const handled = new Set();
  const next = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    const eq = t.indexOf('=');
    if (eq < 0) return line;
    const k = t.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(updates, k)) {
      handled.add(k);
      process.env[k] = updates[k];
      return `${k}=${updates[k]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!handled.has(k)) {
      process.env[k] = v;
      next.push(`${k}=${v}`);
    }
  }
  fs.writeFileSync(ENV_PATH, next.join('\n').replace(/\n*$/, '\n'), 'utf8');
}

async function getAccessToken(forceRefresh = false) {
  loadDotEnv();
  if (!forceRefresh && cachedAccessToken && Date.now() < cachedAccessExpiry - 60_000) {
    return cachedAccessToken;
  }
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN } = process.env;
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !TIKTOK_REFRESH_TOKEN) {
    return null;
  }
  const body = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: TIKTOK_REFRESH_TOKEN,
  });
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  }
  cachedAccessToken = json.access_token;
  cachedAccessExpiry = Date.now() + (json.expires_in || 86400) * 1000;
  if (json.refresh_token && json.refresh_token !== TIKTOK_REFRESH_TOKEN) {
    upsertEnvVars({ TIKTOK_REFRESH_TOKEN: json.refresh_token });
  }
  return cachedAccessToken;
}

async function fetchAccountBundle(accessToken) {
  const [uRes, cRes] = await Promise.all([
    fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: '{}',
    }),
  ]);
  const userJson = await uRes.json();
  const creatorJson = await cRes.json();
  return {
    user: userJson?.data?.user || null,
    creatorInfo: creatorJson?.data || null,
    creatorError: creatorJson?.error || null,
  };
}

function listLocalVideos() {
  const dirs = [PREVIEW_DIR, path.join(ROOT, 'output')];
  const seen = new Set();
  const items = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      if (!name.toLowerCase().endsWith('.mp4')) continue;
      const full = path.join(d, name);
      if (seen.has(name)) continue;
      seen.add(name);
      const st = fs.statSync(full);
      const pretty = name
        .replace(/^\d+-/, '')
        .replace(/-60fps\.mp4$/i, '')
        .replace(/\.mp4$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      items.push({
        name,
        title: pretty,
        sizeBytes: st.size,
        sizeMB: Number((st.size / (1024 * 1024)).toFixed(2)),
        defaultCaption: `Slicing a ${pretty} 1,000 times 🤯🔪 What should @atomsliced3d slice next? 👇 #satisfying #asmr #3dart #oddlysatisfying #infiniteslice`,
        previewUrl: `http://127.0.0.1:${PORT}/api/video-file/${encodeURIComponent(name)}`,
      });
    }
  }
  return items;
}

function resolveVideoPath(name) {
  const safe = path.basename(String(name || ''));
  for (const d of [PREVIEW_DIR, path.join(ROOT, 'output')]) {
    const p = path.join(d, safe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function computeChunkPlan(videoSize) {
  if (videoSize <= MAX_SINGLE_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1, chunks: [{ start: 0, end: videoSize - 1 }] };
  }
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

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://atomslice3d.netlify.app');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(req, res, status, payload) {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  loadDotEnv();

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(req, res, 200, {
        ok: true,
        hasClientKey: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
        hasRefreshToken: Boolean(process.env.TIKTOK_REFRESH_TOKEN),
        redirectUri: REDIRECT_URI,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth-url') {
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      if (!clientKey) {
        return sendJson(req, res, 400, { error: 'Missing TIKTOK_CLIENT_KEY in .env' });
      }
      const state = `studio_${crypto.randomBytes(10).toString('hex')}`;
      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
      authUrl.searchParams.set('client_key', clientKey);
      authUrl.searchParams.set('scope', SCOPES);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('state', state);
      return sendJson(req, res, 200, { authUrl: authUrl.toString(), state, scopes: SCOPES });
    }

    if (req.method === 'POST' && url.pathname === '/api/exchange-code') {
      const { code } = await readBody(req);
      if (!code) return sendJson(req, res, 400, { error: 'Missing authorization code' });
      const body = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      });
      const tokRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const tok = await tokRes.json();
      if (!tokRes.ok || tok.error || !tok.access_token) {
        return sendJson(req, res, 400, { error: 'Token exchange failed', details: tok });
      }
      cachedAccessToken = tok.access_token;
      cachedAccessExpiry = Date.now() + (tok.expires_in || 86400) * 1000;
      upsertEnvVars({
        TIKTOK_REFRESH_TOKEN: tok.refresh_token,
        TIKTOK_OPEN_ID: tok.open_id || '',
      });
      const bundle = await fetchAccountBundle(cachedAccessToken);
      return sendJson(req, res, 200, { ok: true, scope: tok.scope, openId: tok.open_id, ...bundle });
    }

    if (req.method === 'GET' && url.pathname === '/api/creator-info') {
      const at = await getAccessToken();
      if (!at) return sendJson(req, res, 401, { connected: false, error: 'Not connected to TikTok yet' });
      const bundle = await fetchAccountBundle(at);
      return sendJson(req, res, 200, { connected: true, ...bundle });
    }

    if (req.method === 'POST' && url.pathname === '/api/disconnect') {
      cachedAccessToken = null;
      cachedAccessExpiry = 0;
      return sendJson(req, res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/videos') {
      return sendJson(req, res, 200, { videos: listLocalVideos() });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/video-file/')) {
      const name = decodeURIComponent(url.pathname.slice('/api/video-file/'.length));
      const filePath = resolveVideoPath(name);
      if (!filePath) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const stat = fs.statSync(filePath);
      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10) || 0;
        const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const body = await readBody(req);
      const at = await getAccessToken();
      if (!at) return sendJson(req, res, 401, { error: 'Connect your TikTok account first.' });

      const filePath = resolveVideoPath(body.videoName);
      if (!filePath) return sendJson(req, res, 404, { error: `Video not found: ${body.videoName}` });

      const fileBuf = fs.readFileSync(filePath);
      const plan = computeChunkPlan(fileBuf.length);
      const mode = body.mode === 'inbox' ? 'inbox' : 'direct';

      let endpoint;
      let initPayload;

      if (mode === 'direct') {
        if (!body.privacyLevel) {
          return sendJson(req, res, 400, { error: 'Please select a privacy level before publishing.' });
        }
        const postInfo = {
          title: String(body.caption || '').slice(0, 2200),
          privacy_level: String(body.privacyLevel),
          disable_comment: !body.allowComment,
          disable_duet: !body.allowDuet,
          disable_stitch: !body.allowStitch,
          video_cover_timestamp_ms: 1500,
        };
        if (body.commercialToggle) {
          if (body.brandOrganic) postInfo.brand_organic_toggle = true;
          if (body.brandContent) postInfo.brand_content_toggle = true;
        }
        endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
        initPayload = {
          post_info: postInfo,
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

      console.log(`[studio] Init ${mode} upload for ${path.basename(filePath)} (${(fileBuf.length / 1048576).toFixed(1)} MB)...`);
      const initRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${at}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(initPayload),
      });
      const initJson = await initRes.json();
      if (!initRes.ok || (initJson.error && initJson.error.code && initJson.error.code !== 'ok') || !initJson.data?.upload_url) {
        return sendJson(req, res, 400, { error: 'TikTok upload init failed', details: initJson });
      }

      const { publish_id: publishId, upload_url: uploadUrl } = initJson.data;
      for (let i = 0; i < plan.chunks.length; i++) {
        const { start, end } = plan.chunks[i];
        const slice = fileBuf.subarray(start, end + 1);
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(slice.length),
            'Content-Range': `bytes ${start}-${end}/${fileBuf.length}`,
          },
          body: slice,
        });
        if (!putRes.ok && putRes.status !== 201 && putRes.status !== 206) {
          return sendJson(req, res, 502, { error: `Chunk ${i + 1} upload failed (${putRes.status})` });
        }
      }

      console.log(`[studio] Uploaded binary chunks for publish_id=${publishId}`);
      return sendJson(req, res, 200, { ok: true, mode, publishId });
    }

    if (req.method === 'POST' && url.pathname === '/api/status') {
      const { publishId } = await readBody(req);
      const at = await getAccessToken();
      if (!at) return sendJson(req, res, 401, { error: 'Not connected' });
      const stRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${at}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      });
      const stJson = await stRes.json();
      return sendJson(req, res, 200, stJson);
    }

    sendJson(req, res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[studio] ERROR:', err.message);
    sendJson(req, res, 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  loadDotEnv();
  console.log(`\n[tiktok-studio] Local API bridge running on http://127.0.0.1:${PORT}`);
  console.log(`[tiktok-studio] Open your official web studio at:\n  https://atomslice3d.netlify.app/tiktok-studio.html\n`);
});
