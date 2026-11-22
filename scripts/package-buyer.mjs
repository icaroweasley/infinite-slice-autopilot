import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_BUYER = path.join(ROOT, 'dist-buyer');
const STAGE_DIR = path.join(DIST_BUYER, 'infinite-slice-skill');
const ZIP_PATH = path.join(DIST_BUYER, 'infinite-slice-skill-buyer-edition.zip');

/**
 * Packages a clean, commercial Buyer Edition (.zip) containing ONLY the 1-by-1
 * Creator Studio + Antigravity/Claude Code Skill — stripping private .env, private
 * output videos, private history entries, and private 24/7 cloud autopilot workflows.
 */
const EXCLUDE_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-buyer',
  'output',
  'sales-site',
  'sales-site.zip',
  'brand-kit',
  '.git',
  '.github',
  '.env',
  'CLOUD-AUTOPILOT.md',
  'autopilot-cloud.mjs',
  'package-buyer.mjs',
  'repost-youtube-grid.mjs',
  'youtube-repost-state.json',
]);

function copyFiltered(src, dst) {
  const stat = fs.statSync(src);
  const base = path.basename(src);
  if (EXCLUDE_NAMES.has(base) || base.endsWith('.zip')) return;

  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyFiltered(path.join(src, child), path.join(dst, child));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

console.log('\n=== Packaging Commercial Buyer Edition (infinite-slice-skill) ===');
if (fs.existsSync(DIST_BUYER)) fs.rmSync(DIST_BUYER, { recursive: true, force: true });
fs.mkdirSync(STAGE_DIR, { recursive: true });

copyFiltered(ROOT, STAGE_DIR);

// Create fresh clean empty history.json & output folder for the buyer
fs.mkdirSync(path.join(STAGE_DIR, 'output'), { recursive: true });
fs.writeFileSync(
  path.join(STAGE_DIR, 'data', 'history.json'),
  JSON.stringify({ version: 1, brand: '@yourhandle', entries: [] }, null, 2) + '\n',
  'utf8'
);
const briefFile = path.join(STAGE_DIR, 'data', 'studio-brief.json');
if (fs.existsSync(briefFile)) fs.unlinkSync(briefFile);

// Reset buyer config.json & UI defaults to generic @yourhandle (zero private handle leakage)
const buyerCfgPath = path.join(STAGE_DIR, 'config.json');
if (fs.existsSync(buyerCfgPath)) {
  const bCfg = JSON.parse(fs.readFileSync(buyerCfgPath, 'utf8'));
  if (bCfg.brand) bCfg.brand.handle = '@yourhandle';
  fs.writeFileSync(buyerCfgPath, JSON.stringify(bCfg, null, 2) + '\n', 'utf8');
}
for (const rel of ['engine/index.html', 'engine/src/engine/scene-core.js', 'scripts/publish-reels.mjs']) {
  const p = path.join(STAGE_DIR, rel);
  if (fs.existsSync(p)) {
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('@atomslice3d', '@yourhandle'), 'utf8');
  }
}

// Strip private autopilot scripts from buyer package.json
const buyerPkgPath = path.join(STAGE_DIR, 'package.json');
const pkg = JSON.parse(fs.readFileSync(buyerPkgPath, 'utf8'));
delete pkg.scripts.autopilot;
delete pkg.scripts['package-buyer'];
fs.writeFileSync(buyerPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// Compress into ready-to-sell .zip
if (process.platform === 'win32') {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${STAGE_DIR}' -DestinationPath '${ZIP_PATH}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`cd "${DIST_BUYER}" && zip -r "${ZIP_PATH}" infinite-slice-skill`, { stdio: 'inherit' });
}

const sizeKb = Math.round(fs.statSync(ZIP_PATH).size / 1024);
console.log(`\n[OK] Clean Buyer Edition packaged -> ${ZIP_PATH} (${sizeKb} KB)`);
console.log('Includes: Creator Studio 3D UI, 10 built-in objects, 4 AI custom slots, SKILL.md, Playwright+FFmpeg MP4 renderer, 48kHz ASMR, install-skill.mjs.');
console.log('Excluded: Private .env, private history.json entries, output/*.mp4, and private 24/7 cloud autopilot.\n');
