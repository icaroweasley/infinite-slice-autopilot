import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const DEFAULT_REDIRECT_URI = 'https://atomslice3d.netlify.app/tiktok-callback.html';
const DEFAULT_SCOPES = 'user.info.basic,video.upload,video.publish';

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

function upsertEnvVars(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const lines = content ? content.split(/\r?\n/) : [];
  const handled = new Set();

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return line;
    const key = trimmed.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      handled.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  for (const [k, v] of Object.entries(updates)) {
    if (!handled.has(k)) {
      nextLines.push(`${k}=${v}`);
    }
  }

  fs.writeFileSync(ENV_PATH, nextLines.join('\n').replace(/\n*$/, '\n'), 'utf8');
}

function extractCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      const code = u.searchParams.get('code');
      if (code) return code;
    } catch {
      // fall through
    }
  }
  if (raw.includes('code=')) {
    const m = raw.match(/(?:^|[?&])code=([^&\s]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function exchangeCodeForTokens({ clientKey, clientSecret, code, redirectUri }) {
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
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
    throw new Error(`TikTok token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchUserInfo(accessToken) {
  try {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,username',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const json = await res.json();
    return json?.data?.user || null;
  } catch {
    return null;
  }
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = getArg('redirect') || process.env.TIKTOK_REDIRECT_URI || DEFAULT_REDIRECT_URI;
  const scopes = getArg('scopes') || process.env.TIKTOK_SCOPES || DEFAULT_SCOPES;

  if (!clientKey || !clientSecret) {
    console.error('ERROR: Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env');
    console.error('Add them to e:\\jogo antigravity\\infinite-slice-skill\\.env first:');
    console.error('  TIKTOK_CLIENT_KEY=your_client_key');
    console.error('  TIKTOK_CLIENT_SECRET=your_client_secret');
    process.exit(1);
  }

  let codeArg = getArg('code');

  if (!codeArg) {
    const state = crypto.randomBytes(12).toString('hex');
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    console.log('\n=== TikTok OAuth 2.0 Setup (AtomSlice 3D Studio) ===\n');
    console.log('1) Open this URL in your browser and authorize your TikTok account:\n');
    console.log(authUrl.toString());
    console.log('\n2) After authorizing, your browser will redirect to:');
    console.log(`   ${redirectUri}?code=...`);
    console.log('   Click "Copy Authorization Code" (or copy the full callback URL) and paste it below.\n');

    if (args.includes('--url-only')) {
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      codeArg = await rl.question('Paste TikTok authorization code (or full callback URL): ');
    } finally {
      rl.close();
    }
  }

  const code = extractCode(codeArg);
  if (!code) {
    console.error('ERROR: Empty authorization code.');
    process.exit(1);
  }

  console.log('\n[tiktok-auth] Exchanging authorization code for tokens...');
  const tokens = await exchangeCodeForTokens({ clientKey, clientSecret, code, redirectUri });

  const user = await fetchUserInfo(tokens.access_token);
  const envUpdates = {
    TIKTOK_REFRESH_TOKEN: tokens.refresh_token,
    TIKTOK_OPEN_ID: tokens.open_id || '',
    TIKTOK_REDIRECT_URI: redirectUri,
  };
  if (!process.env.TIKTOK_MODE) {
    envUpdates.TIKTOK_MODE = 'inbox';
  }
  upsertEnvVars(envUpdates);

  console.log('\n[tiktok-auth] SUCCESS! Tokens saved to .env (TIKTOK_REFRESH_TOKEN, TIKTOK_OPEN_ID).');
  if (user) {
    console.log(`[tiktok-auth] Connected Account: ${user.display_name || 'N/A'} (@${user.username || 'N/A'}) | open_id=${tokens.open_id}`);
  } else {
    console.log(`[tiktok-auth] Connected open_id=${tokens.open_id}`);
  }
  console.log(`[tiktok-auth] Granted scopes: ${tokens.scope || scopes}`);
  console.log(`[tiktok-auth] Refresh token validity: ~${Math.round((tokens.refresh_expires_in || 31536000) / 86400)} days`);
  console.log('\nNext test command:');
  console.log('  node scripts/publish-tiktok.mjs --video output/preview-5/03-super-mario-figure-60fps.mp4 --mode inbox\n');
}

main().catch((err) => {
  console.error('[tiktok-auth] FATAL:', err.message);
  process.exit(1);
});
