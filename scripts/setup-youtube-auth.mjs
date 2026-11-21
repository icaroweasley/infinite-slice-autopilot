import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline/promises';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;

function upsertEnv(updates) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  for (const [key, val] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${val}`);
    } else {
      content += `${content.endsWith('\n') || !content ? '' : '\n'}${key}=${val}\n`;
    }
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

function openBrowser(url) {
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n=== YouTube Shorts Official OAuth 2.0 Setup (Zero Password Needed!) ===\n');
  console.log('Prerequisite (Google Cloud Console -> APIs & Services -> Credentials):');
  console.log('  1. Enable "YouTube Data API v3"');
  console.log('  2. Create an OAuth Client ID of type "Desktop app"');
  console.log('  3. Copy Client ID & Client Secret below.\n');

  const clientId = (process.env.YT_CLIENT_ID || await rl.question('YT_CLIENT_ID: ')).trim();
  const clientSecret = (process.env.YT_CLIENT_SECRET || await rl.question('YT_CLIENT_SECRET: ')).trim();
  rl.close();

  if (!clientId || !clientSecret) {
    console.error('Missing Client ID or Client Secret.');
    process.exit(1);
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
      if (u.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const err = u.searchParams.get('error');
      const authCode = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (err || !authCode) {
        res.end('<h2>Authorization failed. You can close this tab.</h2>');
        server.close();
        reject(new Error(err || 'No authorization code returned'));
        return;
      }
      res.end('<h2>YouTube authorized! You can close this tab and return to the terminal.</h2>');
      server.close();
      resolve(authCode);
    });
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      console.log(`\nOpening Google OAuth consent screen in your browser...\nIf it does not open automatically, visit:\n${authUrl.toString()}\n`);
      openBrowser(authUrl.toString());
    });
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.refresh_token) {
    throw new Error(`Failed to exchange code for refresh_token: ${JSON.stringify(tokenJson)}`);
  }

  upsertEnv({
    YT_CLIENT_ID: clientId,
    YT_CLIENT_SECRET: clientSecret,
    YT_REFRESH_TOKEN: tokenJson.refresh_token,
  });

  console.log('\n[OK] Saved YT_CLIENT_ID, YT_CLIENT_SECRET, and YT_REFRESH_TOKEN to local .env (gitignored)!');
  console.log('Next step: add those exact 3 secrets in GitHub -> Settings -> Secrets -> Actions to enable 24/7 YouTube Shorts auto-posting.');
}

main().catch((err) => {
  console.error('[youtube-auth] ERROR:', err.message);
  process.exit(1);
});
