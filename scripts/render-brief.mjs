import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeadlessVideo } from './render-headless.mjs';
import { recordEntry, loadConfig } from './history-cli.mjs';
import { buildEnglishCaption, publishReel } from './publish-reels.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIEF_PATH = path.join(ROOT, 'data', 'studio-brief.json');

async function main() {
  if (!fs.existsSync(BRIEF_PATH)) {
    console.error('[render-brief] No brief found at data/studio-brief.json. Create one in the Creator Studio UI first.');
    process.exit(1);
  }

  const brief = JSON.parse(fs.readFileSync(BRIEF_PATH, 'utf8'));
  const cfg = loadConfig();

  // Resolve each of the 4 slots: if AI authored it (`ai-prompt` or `ai-random`), load the dedicated AI slot file!
  const objectId = brief.object?.mode === 'preset' ? (brief.object.presetId || 'salmon') : 'custom';
  const cutterId = brief.cutter?.mode === 'preset' ? (brief.cutter.presetId || 'chef-knife') : 'ai-custom';
  const surfaceId = brief.surface?.mode === 'preset' ? (brief.surface.presetId || 'honey-wood') : 'ai-custom';
  const envId = brief.environment?.mode === 'preset' ? (brief.environment.presetId || 'classic-viral') : 'ai-custom';

  const rounds = Array.isArray(brief.rounds) && brief.rounds.length > 0 ? brief.rounds : [10, 50, 100, 250, 500, 1000];
  const r = brief.render || {};

  brief.status = 'rendering';
  brief.updatedAt = new Date().toISOString();
  fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2) + '\n', 'utf8');

  console.log('\n=== Rendering Studio Brief (AI Custom Slots) ===');
  console.log(`Brief ID: ${brief.id}`);
  console.log(`Slots -> object=${objectId} | cutter=${cutterId} | surface=${surfaceId} | env=${envId}`);
  console.log(`Rounds: [${rounds.join(', ')}] | ${r.width || 1080}x${r.height || 1920} @ ${r.fps || 60}fps`);

  try {
    const manifest = await renderHeadlessVideo({
      objectId,
      cutterId,
      surfaceId,
      envId,
      handle: r.handle ?? cfg.brand?.handle ?? '@cubiccutlab',
      width: Number(r.width) || 1080,
      height: Number(r.height) || 1920,
      fps: Number(r.fps) || 60,
      rounds,
      durationScale: Number(r.durationScale) || 1.0,
      showHud: r.showHud !== false,
    });

    const caption = buildEnglishCaption(manifest, cfg);
    recordEntry({
      briefId: brief.id,
      objectId: manifest.objectId,
      slug: manifest.slug,
      name: manifest.name,
      englishName: manifest.englishName,
      cutterId,
      surfaceId,
      envId,
      rounds: manifest.rounds,
      maxCubes: manifest.maxCubes,
      durationSec: manifest.durationSec,
      resolution: `${manifest.width}x${manifest.height}`,
      fps: manifest.fps,
      videoFile: manifest.videoFile,
      caption,
    });

    brief.status = 'completed';
    brief.completedAt = new Date().toISOString();
    brief.result = {
      filename: manifest.filename,
      videoFile: manifest.videoFile,
      fileSizeMb: manifest.fileSizeMb,
      durationSec: manifest.durationSec,
      maxCubes: manifest.maxCubes,
      caption,
    };
    fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2) + '\n', 'utf8');

    console.log(`\n[render-brief] SUCCESS! Brief marked completed -> ${manifest.videoFile}`);

    if (process.argv.includes('--publish')) {
      await publishReel({ videoPath: manifest.videoFile, captionOverride: caption });
    }
  } catch (err) {
    brief.status = 'error';
    brief.error = err.message || String(err);
    fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2) + '\n', 'utf8');
    console.error('[render-brief] FAILED:', err);
    process.exit(1);
  }
}

main();
