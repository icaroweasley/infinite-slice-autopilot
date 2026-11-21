import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'data', 'history.json');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const BUILTIN_SLUGS = [
  'salmon',
  'iphone',
  'geode',
  'rainbow-cake',
  'rubiks-cube',
  'gold-bar',
  'billiard-8ball',
  'ice-rose',
  'honeycomb',
  'burger',
];

export function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

export function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { version: 1, brand: '@cubiccutlab', entries: [] };
  }
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
}

export function saveHistory(data) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function isSlugUsed(slug) {
  const hist = loadHistory();
  const norm = slug.trim().toLowerCase();
  return hist.entries.some((e) => (e.slug || '').toLowerCase() === norm);
}

export function suggestNextEnvironment() {
  const cfg = loadConfig();
  const hist = loadHistory();
  const pool = cfg.environments?.pool || ['classic-viral'];
  if (!cfg.environments?.rotate || hist.entries.length === 0) {
    return cfg.environments?.default || pool[0];
  }
  const lastEnv = hist.entries[hist.entries.length - 1]?.envId;
  const idx = pool.indexOf(lastEnv);
  return pool[(idx + 1) % pool.length];
}

export function suggestNextBuiltin() {
  const hist = loadHistory();
  const used = new Set(hist.entries.map((e) => (e.slug || e.objectId || '').toLowerCase()));
  const next = BUILTIN_SLUGS.find((s) => !used.has(s));
  return next || null;
}

export function recordEntry(entry) {
  const hist = loadHistory();
  hist.entries.push({
    id: `slice-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'rendered',
    ...entry,
  });
  saveHistory(hist);
  return hist.entries[hist.entries.length - 1];
}

export function markPublished(videoPathOrSlug, publishResult) {
  const hist = loadHistory();
  const target = [...hist.entries]
    .reverse()
    .find(
      (e) =>
        e.videoFile === videoPathOrSlug ||
        path.basename(e.videoFile || '') === path.basename(videoPathOrSlug) ||
        e.slug === videoPathOrSlug
    );
  if (target) {
    target.status = 'published';
    target.publishedAt = new Date().toISOString();
    target.publish = publishResult;
    saveHistory(hist);
  }
  return target || null;
}

// CLI entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'list') {
    const hist = loadHistory();
    if (hist.entries.length === 0) {
      console.log('History is empty (0 objects rendered so far).');
    } else {
      console.log(`Total rendered/published objects: ${hist.entries.length}`);
      for (const e of hist.entries) {
        console.log(`- [${e.status}] ${e.slug} ("${e.englishName || e.name}") | env=${e.envId} | cubes=${e.maxCubes} | ${e.videoFile}`);
      }
    }
  } else if (cmd === 'check') {
    if (!arg) {
      console.error('Usage: node scripts/history-cli.mjs check <slug>');
      process.exit(1);
    }
    const used = isSlugUsed(arg);
    if (used) {
      console.log(`DUPLICATE: "${arg}" already exists in data/history.json. Pick a new object!`);
      process.exit(2);
    } else {
      console.log(`OK: "${arg}" is unique and available.`);
    }
  } else if (cmd === 'suggest-env') {
    console.log(suggestNextEnvironment());
  } else if (cmd === 'next-builtin') {
    const next = suggestNextBuiltin();
    console.log(next || 'ALL_BUILTINS_USED');
  } else if (cmd === 'stats') {
    const hist = loadHistory();
    const published = hist.entries.filter((e) => e.status === 'published').length;
    console.log(JSON.stringify({ total: hist.entries.length, published, nextEnv: suggestNextEnvironment(), nextBuiltin: suggestNextBuiltin() }, null, 2));
  } else {
    console.log('Commands: list | check <slug> | suggest-env | next-builtin | stats');
  }
}
