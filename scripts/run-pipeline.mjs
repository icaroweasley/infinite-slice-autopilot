import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo } from './render-headless.mjs';
import {
  isSlugUsed,
  suggestNextEnvironment,
  suggestNextBuiltin,
  recordEntry,
  loadConfig,
} from './history-cli.mjs';
import { publishReel, buildEnglishCaption } from './publish-reels.mjs';

const args = process.argv.slice(2);
const getFlag = (name, def) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

async function main() {
  const cfg = loadConfig();
  const isAuto = hasFlag('auto');
  const quick = hasFlag('quick');
  const force = hasFlag('force');
  const shouldPublish = hasFlag('publish') || cfg.publishing?.enabled === true;
  const dryRun = hasFlag('dry-run');

  let objectId = getFlag('object', isAuto ? null : 'salmon');
  if (!objectId && isAuto) {
    const next = suggestNextBuiltin();
    if (!next) {
      console.error('[pipeline] All 10 built-in objects have already been rendered! Ask your AI agent (Antigravity / Claude Code) to invent a new custom object in engine/src/objects/object-builder.js and run with --object custom.');
      process.exit(2);
    }
    objectId = next;
  }

  let envId = getFlag('env', 'auto');
  if (envId === 'auto') {
    envId = suggestNextEnvironment();
  }

  // Anti-repetition check for built-in objects (for custom, checked after reading slug from manifest too)
  if (!force && objectId !== 'custom' && isSlugUsed(objectId)) {
    console.error(`[pipeline] DUPLICATE BLOCKED: "${objectId}" is already in data/history.json! Pick another object or pass --force to re-render.`);
    process.exit(2);
  }

  const resStr = getFlag('res', quick ? '540x960' : undefined);
  const [w, h] = resStr ? resStr.split('x').map(Number) : [undefined, undefined];
  const roundsStr = getFlag('rounds', quick ? '10,100,1000' : undefined);
  const rounds = roundsStr ? roundsStr.split(',').map(Number) : undefined;
  const fpsVal = getFlag('fps', quick ? '30' : undefined);

  console.log(`\n=== Infinite Slice 3D Autonomous Pipeline ===`);
  console.log(`Object: ${objectId} | Env: ${envId} | Mode: ${quick ? 'QUICK TEST' : 'FULL VIRAL 60FPS'}`);

  const manifest = await renderHeadlessVideo({
    objectId,
    envId,
    handle: getFlag('handle', undefined),
    width: w,
    height: h,
    fps: fpsVal ? Number(fpsVal) : undefined,
    rounds,
    durationScale: quick ? 0.55 : Number(getFlag('scale', '1.0')),
    outputName: getFlag('out', undefined),
  });

  const caption = buildEnglishCaption(manifest, cfg);
  const entry = recordEntry({
    objectId: manifest.objectId,
    slug: manifest.slug,
    name: manifest.name,
    englishName: manifest.englishName,
    envId: manifest.envId,
    rounds: manifest.rounds,
    maxCubes: manifest.maxCubes,
    durationSec: manifest.durationSec,
    resolution: `${manifest.width}x${manifest.height}`,
    fps: manifest.fps,
    videoFile: manifest.videoFile,
    caption,
  });

  console.log(`[pipeline] Recorded in data/history.json -> id=${entry.id}, slug="${entry.slug}"`);

  if (shouldPublish || dryRun) {
    await publishReel({
      videoPath: manifest.videoFile,
      dryRun,
      captionOverride: caption,
    });
  } else {
    console.log('\n[pipeline] Generated English Caption Preview:\n---\n' + caption + '\n---');
    console.log(`[pipeline] Ready to publish with: node scripts/publish-reels.mjs --video "${manifest.videoFile}"`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[pipeline] FAILED:', err);
    process.exit(1);
  });
}
