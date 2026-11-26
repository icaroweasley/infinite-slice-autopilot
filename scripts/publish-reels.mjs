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

function articleFor(phrase) {
  const clean = String(phrase || '').trim();
  return /^[aeiou8]/i.test(clean) ? 'an' : 'a';
}

function formatCompactCubes(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return String(num);
}

export function buildEnglishCaption(manifest, config) {
  const objName = manifest.englishName || manifest.name || 'this object';
  const aAn = articleFor(objName);
  const maxCuts = Math.max(...(manifest.rounds || [1000])).toLocaleString('en-US');
  const compactCubes = formatCompactCubes(manifest.maxCubes);
  const handle = manifest.handle || config.brand?.handle || '@atomslice3d';
  const hashtags = (config.publishing?.hashtags || [
    '#oddlysatisfying',
    '#asmr',
    '#3dart',
    '#satisfying',
    '#3danimation',
  ])
    .slice(0, 5)
    .join(' ');

  const hash = [...objName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hooks = [
    `Wait until you see what's inside this ${objName} at ${maxCuts} cuts 😳🔪`,
    `10 → ${maxCuts} cuts on ${aAn} ${objName} = ${compactCubes} micro-cubes 🤯🔊`,
    `Headphones ON 🎧 Slicing ${aAn} ${objName} ${maxCuts} times into dust 🔪✨`,
    `Is this ${objName} real or CAKE? Wait for 0:06 👀✨`,
  ];
  const hook = hooks[hash % hooks.length];

  const ctas = [
    `Rate that final 1,000-cut crunch 1–10 👇`,
    `Drop 1 object below — top comment gets sliced tomorrow 👇`,
    `Send this to someone who needs 20 seconds of pure stress relief 😌↗️`,
    `Did you guess what was inside before 0:06? Comment YES or NO 👇`,
  ];
  const cta = ctas[(hash + 1) % ctas.length];

  return `${hook}\n\n${cta}\n\n🎬 Watch our daily 11+ min 60 FPS 3D ASMR on YouTube (${handle}) • Create your own via link in bio 🔗\n\n${hashtags}`;
}

export function buildInstagramFirstComment(manifest) {
  const objName = manifest.englishName || manifest.name || 'this';
  const hash = [...objName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const prompts = [
    `Be honest — did you expect what was inside this ${objName}? 😳 What impossible object should I slice next? 👇`,
    `Rate that 1,000-cut ASMR crunch from 1 to 10 🎧👇 Top comment gets sliced tomorrow!`,
    `Most people don't make it to the 1,000-cut reveal 🤯 Drop the next object you want to see sliced 👇`,
  ];
  return prompts[hash % prompts.length];
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
  const token = (process.env.IG_ACCESS_TOKEN || '').trim();
  if (!token) {
    throw new Error('IG_ACCESS_TOKEN must be set in .env / GitHub Secrets for Instagram publishing.');
  }

  // Auto-detect Instagram Login token (starts with "IG") vs Facebook Graph token (starts with "EAA")
  const isIgLogin = token.startsWith('IG');
  const apiBase = (process.env.IG_API_BASE || (isIgLogin ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0')).replace(/\/$/, '');

  let igUserId = (process.env.IG_USER_ID || '').trim();
  if (!igUserId) {
    if (isIgLogin) {
      const meRes = await fetch(`${apiBase}/me?fields=user_id,id,username&access_token=${encodeURIComponent(token)}`);
      const meJson = await meRes.json();
      if (!meRes.ok) {
        throw new Error(`Failed to resolve IG_USER_ID via /me: ${JSON.stringify(meJson)}`);
      }
      igUserId = meJson.user_id || meJson.id || 'me';
      console.log(`[publish] Auto-resolved Instagram account: @${meJson.username || 'unknown'} (id: ${igUserId})`);
    } else {
      throw new Error('IG_USER_ID must be set in .env / GitHub Secrets when using a Facebook Graph (EAA...) token.');
    }
  }

  let videoUrl = process.env.PUBLIC_VIDEO_BASE_URL
    ? `${process.env.PUBLIC_VIDEO_BASE_URL.replace(/\/$/, '')}/${path.basename(videoPath)}`
    : await uploadToCloudinary(videoPath);

  let creationId = null;

  // Pick a vibrant mid-slice cover frame (~5.8s, right when Round 1 opens the colorful solid interior!)
  const thumbOffsetMs = Math.round(
    Math.min(6200, Math.max(4200, Number(manifest.durationSec || 24) * 235))
  );

  if (videoUrl) {
    // 1A. Create Reels media container from public HTTPS video URL (Cloudinary or custom CDN)
    console.log(`[publish] Creating Reels container on ${apiBase} via public video_url (cover=${thumbOffsetMs}ms)...`);
    const createParams = new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
      thumb_offset: String(thumbOffsetMs),
      access_token: token,
    });
    const createRes = await fetch(`${apiBase}/${igUserId}/media?${createParams}`, { method: 'POST' });
    const createJson = await createRes.json();
    if (!createRes.ok || !createJson.id) {
      throw new Error(`Meta Graph container error: ${JSON.stringify(createJson)}`);
    }
    creationId = createJson.id;
  } else {
    // 1B. Direct Resumable Binary Upload to Meta with automatic 3x transient retry (no external CDN needed!)
    const fileBuf = fs.readFileSync(videoPath);
    let lastUpErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[publish] No Cloudinary/CDN configured — using direct Meta resumable binary upload on ${apiBase} (cover=${thumbOffsetMs}ms, attempt ${attempt}/3)...`);
      const createParams = new URLSearchParams({
        media_type: 'REELS',
        upload_type: 'resumable',
        caption,
        share_to_feed: 'true',
        thumb_offset: String(thumbOffsetMs),
        access_token: token,
      });
      const createRes = await fetch(`${apiBase}/${igUserId}/media?${createParams}`, { method: 'POST' });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.id || !createJson.uri) {
        lastUpErr = new Error(
          `Meta resumable container init failed: ${JSON.stringify(createJson)}. ` +
          `If your token does not support direct resumable upload, configure CLOUDINARY_CLOUD_NAME + CLOUDINARY_UPLOAD_PRESET.`
        );
        if (attempt < 3) {
          console.warn(`[publish] Container init warning (attempt ${attempt}/3): ${lastUpErr.message.slice(0, 200)} — retrying in 6s...`);
          await new Promise((r) => setTimeout(r, 6000));
          continue;
        }
        throw lastUpErr;
      }
      creationId = createJson.id;
      const uploadUri = createJson.uri;
      console.log(`[publish] Streaming ${(fileBuf.length / (1024 * 1024)).toFixed(2)} MB binary directly to ${uploadUri}...`);
      const upRes = await fetch(uploadUri, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          offset: '0',
          file_size: String(fileBuf.length),
          'Content-Type': 'application/octet-stream',
        },
        body: fileBuf,
      });
      const upText = await upRes.text();
      if (upRes.ok) {
        console.log(`[publish] Binary upload accepted: ${upText.slice(0, 160)}`);
        videoUrl = uploadUri;
        lastUpErr = null;
        break;
      }
      lastUpErr = new Error(`Meta binary rupload failed (${upRes.status}): ${upText.slice(0, 400)}`);
      if (attempt < 3) {
        console.warn(`[publish] Transient rupload error (attempt ${attempt}/3): ${lastUpErr.message} — retrying fresh container in 8s...`);
        await new Promise((r) => setTimeout(r, 8000));
      }
    }
    if (lastUpErr) throw lastUpErr;
  }

  // 2. Poll container processing status until FINISHED (max ~4 minutes)
  let status = 'IN_PROGRESS';
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(
      `${apiBase}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
    );
    const pollJson = await pollRes.json();
    status = pollJson.status_code || 'UNKNOWN';
    console.log(`[publish] IG container ${creationId} status: ${status}${pollJson.status ? ` (${pollJson.status})` : ''}`);
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
  const pubRes = await fetch(`${apiBase}/${igUserId}/media_publish?${pubParams}`, { method: 'POST' });
  const pubJson = await pubRes.json();
  if (!pubRes.ok || !pubJson.id) {
    throw new Error(`Meta Graph media_publish error: ${JSON.stringify(pubJson)}`);
  }

  // 4. Auto-post an engaging conversation-starter 1st comment (breaks the "0 comments" dead-zone!)
  let firstCommentId = null;
  try {
    const commentText = buildInstagramFirstComment(manifest);
    const cRes = await fetch(`${apiBase}/${pubJson.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        message: commentText,
        access_token: token,
      }),
    });
    const cJson = await cRes.json();
    if (cRes.ok && cJson.id) {
      firstCommentId = cJson.id;
      console.log(`[publish] Auto-posted 1st engagement comment on Reel ${pubJson.id} (commentId=${firstCommentId})`);
    } else {
      console.warn(`[publish] 1st comment warning: ${JSON.stringify(cJson).slice(0, 200)}`);
    }
  } catch (cErr) {
    console.warn(`[publish] 1st comment skipped: ${cErr.message}`);
  }

  return { provider: isIgLogin ? 'instagram-api' : 'meta-graph', creationId, mediaId: pubJson.id, videoUrl, firstCommentId };
}

/**
 * Resolves the linked Facebook Page ID + Page Access Token for simultaneous Facebook Reels publishing.
 * Supports either explicit FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN env/secrets OR automatic discovery from
 * IG_ACCESS_TOKEN when it has pages_show_list + pages_manage_posts permissions.
 */
async function resolveFacebookPageCredentials() {
  const explicitId = (process.env.FB_PAGE_ID || '').trim();
  const explicitToken = (process.env.FB_PAGE_ACCESS_TOKEN || '').trim();
  if (explicitId && explicitToken) {
    return { pageId: explicitId, pageToken: explicitToken, pageName: explicitId };
  }

  const userToken = (process.env.IG_ACCESS_TOKEN || '').trim();
  if (!userToken || userToken.startsWith('IGAA') || userToken.startsWith('IGQ')) {
    return null;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id}&access_token=${encodeURIComponent(userToken)}`
    );
    const json = await res.json();
    const pages = Array.isArray(json.data) ? json.data : [];
    if (pages.length === 0) return null;

    const targetIgId = (process.env.IG_USER_ID || '').trim();
    const matched =
      (explicitId && pages.find((p) => p.id === explicitId)) ||
      (targetIgId && pages.find((p) => p.instagram_business_account?.id === targetIgId)) ||
      pages[0];

    if (matched?.id && matched?.access_token) {
      return { pageId: matched.id, pageToken: matched.access_token, pageName: matched.name || matched.id };
    }
  } catch (err) {
    console.warn(`[publish-fb] Page auto-discovery skipped: ${err.message}`);
  }
  return null;
}

/**
 * Publishes the exact same 9:16 MP4 directly to the linked Facebook Page as a native Facebook Reel
 * using Meta's official 3-phase /{page-id}/video_reels API (start -> rupload -> finish).
 */
export async function publishFacebookReel({ videoPath, caption }) {
  const creds = await resolveFacebookPageCredentials();
  if (!creds) {
    console.log(
      '[publish-fb] Skipped Facebook Page cross-post (add pages_show_list + pages_manage_posts to your Meta token, or set FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN).'
    );
    return { status: 'skipped' };
  }

  const { pageId, pageToken, pageName } = creds;
  const apiBase = 'https://graph.facebook.com/v21.0';
  const fileBuf = fs.readFileSync(videoPath);

  let videoId = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[publish-fb] Starting Facebook Page Reel upload to "${pageName}" (${pageId}) (attempt ${attempt}/3)...`);
    // Phase 1: start
    const startRes = await fetch(`${apiBase}/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        upload_phase: 'start',
        access_token: pageToken,
      }),
    });
    const startJson = await startRes.json();
    if (!startRes.ok || !startJson.video_id || !startJson.upload_url) {
      lastErr = new Error(`FB video_reels start failed (${startRes.status}): ${JSON.stringify(startJson).slice(0, 320)}`);
      if (attempt < 3) {
        console.warn(`[publish-fb] ${lastErr.message} — retrying in 6s...`);
        await new Promise((r) => setTimeout(r, 6000));
        continue;
      }
      throw lastErr;
    }

    videoId = startJson.video_id;
    const uploadUrl = startJson.upload_url;

    // Phase 2: binary upload to rupload.facebook.com
    console.log(`[publish-fb] Streaming ${(fileBuf.length / (1024 * 1024)).toFixed(2)} MB to Facebook Reels (${videoId})...`);
    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: '0',
        file_size: String(fileBuf.length),
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuf,
    });
    const upText = await upRes.text();
    if (!upRes.ok) {
      lastErr = new Error(`FB video_reels rupload failed (${upRes.status}): ${upText.slice(0, 320)}`);
      if (attempt < 3) {
        console.warn(`[publish-fb] ${lastErr.message} — retrying fresh session in 8s...`);
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw lastErr;
    }

    // Phase 3: finish & publish
    const finishRes = await fetch(`${apiBase}/${pageId}/video_reels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        upload_phase: 'finish',
        video_id: videoId,
        video_state: 'PUBLISHED',
        description: caption,
        access_token: pageToken,
      }),
    });
    const finishJson = await finishRes.json();
    if (!finishRes.ok || finishJson.error) {
      lastErr = new Error(`FB video_reels finish failed (${finishRes.status}): ${JSON.stringify(finishJson).slice(0, 320)}`);
      if (attempt < 3) {
        console.warn(`[publish-fb] ${lastErr.message} — retrying in 8s...`);
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      throw lastErr;
    }

    console.log(`[publish-fb] Facebook Page Reel PUBLISHED on "${pageName}"! videoId=${videoId}`);
    return { status: 'published', pageId, pageName, videoId, postId: finishJson.post_id || null };
  }
  throw lastErr || new Error('Facebook Reel upload failed');
}

export async function publishReel({ videoPath, manifestPath, dryRun = false, captionOverride, crosspostFacebook = true } = {}) {
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
  if (!dryRun && !process.env.N8N_WEBHOOK_URL && !process.env.IG_ACCESS_TOKEN) {
    throw new Error(
      'Publishing failed: neither IG_ACCESS_TOKEN nor N8N_WEBHOOK_URL is set. ' +
      'Make sure IG_ACCESS_TOKEN is saved under GitHub Settings -> Secrets and variables -> Actions -> Repository secrets.'
    );
  }
  const mode = dryRun ? 'dry-run' : (process.env.N8N_WEBHOOK_URL ? 'n8n' : 'meta-graph');

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

  // Automatically cross-post the exact same Reel to the linked Facebook Page (when FB permissions/token are present)
  let facebook = null;
  if (crosspostFacebook && mode === 'meta-graph') {
    try {
      facebook = await publishFacebookReel({ videoPath: absVideo, caption });
    } catch (fbErr) {
      console.error(`[publish-fb] Facebook Page cross-post warning (IG post succeeded): ${fbErr.message}`);
      facebook = { status: 'error', error: fbErr.message };
    }
  }

  markPublished(manifest.videoFile || absVideo, { ...result, facebook, caption });
  console.log(`[publish] Published successfully via ${result.provider}!`, result);
  return { ...result, facebook, caption };
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
