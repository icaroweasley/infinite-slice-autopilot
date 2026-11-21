import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasYouTubeCredentials, publishYouTubeShort } from './publish-youtube.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'data', 'youtube-repost-state.json');

const GRID_VIDEOS = [
  { file: 'output/ripe-avocado-remastered-60fps.mp4', englishName: 'Ripe Hass Avocado', rounds: [10, 50, 250, 1000], maxCubes: 13747220 },
  { file: 'output/grid-1-burger-60fps.mp4', englishName: 'Gourmet Cheeseburger', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-2-geode-60fps.mp4', englishName: 'Purple Amethyst Geode', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-3-rubiks-cube-60fps.mp4', englishName: "Rubik's Cube", rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-4-rainbow-cake-60fps.mp4', englishName: 'Rainbow Layer Cake', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-5-gold-bar-60fps.mp4', englishName: '24K Solid Gold Bar', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-6-billiard-8ball-60fps.mp4', englishName: 'Glossy Billiard 8-Ball', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-7-ice-rose-60fps.mp4', englishName: 'Frozen Ice Rose', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
  { file: 'output/grid-8-honeycomb-60fps.mp4', englishName: 'Golden Honeycomb Block', rounds: [10, 50, 250, 1000], maxCubes: 13750000 },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 9;

if (!dryRun && !hasYouTubeCredentials()) {
  console.error('No YouTube credentials found in .env!');
  console.error('Option 1 (Immediate PUBLIC Shorts): set UPLOAD_POST_API_KEY and UPLOAD_POST_USER in .env');
  console.error('Option 2 (Direct YouTube API v3): run `npm run youtube-auth` (requires Google API Compliance Audit for public uploads).');
  process.exit(1);
}

let state = { uploaded: {} };
if (fs.existsSync(STATE_PATH)) {
  try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch {}
}

let count = 0;
for (const item of GRID_VIDEOS) {
  if (count >= limit) break;
  if (state.uploaded[item.file]) {
    console.log(`[skip] Already uploaded to YouTube: ${item.file}`);
    continue;
  }
  const abs = path.join(ROOT, item.file);
  if (!fs.existsSync(abs)) {
    console.warn(`[warn] Missing local file: ${item.file}`);
    continue;
  }
  console.log(`\n[${count + 1}] Uploading ${item.englishName} (${item.file})...`);
  const res = await publishYouTubeShort({
    videoPath: item.file,
    manifest: { ...item, handle: '@atomslice3d' },
    dryRun,
  });
  if (!dryRun && res.provider !== 'skipped') {
    state.uploaded[item.file] = { at: new Date().toISOString(), ...res };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  }
  count++;
}

console.log(`\nDone! Processed ${count} YouTube Shorts.`);
