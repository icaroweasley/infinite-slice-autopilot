import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './history-cli.mjs';
import { capturePreFlightFrames, renderHeadlessVideo } from './render-headless.mjs';
import { cleanupRuntimeModelDir, downloadModelToPublic } from './model-fetcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
  };

  const planPath = path.resolve(ROOT, getArg('plan', 'output/longform/plan.json'));
  const slotNum = Number(getArg('slot', '1'));
  const outRoot = path.resolve(ROOT, getArg('outDir', 'output/longform'));

  if (!fs.existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const slot = (plan.slots || []).find((s) => s.slot === slotNum);
  if (!slot) {
    throw new Error(`Slot ${slotNum} not found in plan (${plan.totalSlots} slots).`);
  }

  const pad = String(slotNum).padStart(2, '0');
  const slotDir = path.join(outRoot, `slot-${pad}`);
  fs.mkdirSync(slotDir, { recursive: true });

  const cfg = loadConfig();
  const handle = plan.handle || cfg.brand?.handle || '@atomsliced3d';

  let approved = null;
  try {
    for (let i = 0; i < slot.candidates.length; i++) {
      const asset = slot.candidates[i];
      console.log(
        `\n[longform-slot-${pad}] Pre-Flight QA Candidate ${i + 1}/${slot.candidates.length}: ` +
          `${asset.englishName} (${asset.source}:${asset.assetId} | interior=${asset.interiorStyle})`
      );
      try {
        const dl = await downloadModelToPublic(asset);
        const qa = await capturePreFlightFrames({
          modelUrl: dl.modelUrl,
          modelMeta: asset,
          cutterId: 'custom',
          cutterPrompt: slot.cutterPrompt,
          surfaceId: 'custom',
          surfacePrompt: slot.surfacePrompt,
          envId: 'custom',
          envPrompt: slot.envPrompt,
          handle,
          width: 640,
          height: 360,
        });

        if (qa.consoleErrors.length > 0) {
          throw new Error(`WebGL errors: ${qa.consoleErrors.join('; ')}`);
        }
        if ((qa.meta.vertexCount || 0) < 300) {
          throw new Error(`Mesh too simple (${qa.meta.vertexCount} verts < 300)`);
        }
        if ((qa.meta.solidRatio || 0) < 0.15) {
          throw new Error(`Solid ratio too thin/spindly (${qa.meta.solidRatio} < 0.15)`);
        }

        console.log(
          `[longform-slot-${pad}] QA PASSED! "${asset.englishName}" | solidRatio=${qa.meta.solidRatio} | verts=${qa.meta.vertexCount}`
        );
        approved = { asset, modelUrl: dl.modelUrl, qaMeta: qa.meta };
        break;
      } catch (err) {
        console.warn(`[longform-slot-${pad}] Candidate "${asset.assetId}" rejected: ${err.message?.slice(0, 220)}`);
      }
    }

    if (!approved) {
      throw new Error(`Slot ${pad}: all ${slot.candidates.length} candidates failed Pre-Flight QA.`);
    }

    const chapterLabel = `${pad} / ${String(plan.totalSlots).padStart(2, '0')} | ${approved.asset.englishName.toUpperCase()}`;
    const heroFramePath = path.join(slotDir, 'hero.jpg');
    const finalSlotMp4 = path.join(slotDir, 'clip.mp4');

    // Only show the cheerful CTA outro card on the VERY LAST object of the 10+ min marathon!
    const outroCfg = slot.isFinalSlot && cfg.ctaOutro?.enabled
      ? {
          ...cfg.ctaOutro,
          pill: 'LINK IN DESCRIPTION',
          subline: 'Slice ANYTHING in 1 click',
        }
      : false;

    const manifest = await renderHeadlessVideo({
      objectId: 'external-glb',
      modelUrl: approved.modelUrl,
      modelMeta: approved.asset,
      cutterId: 'custom',
      cutterPrompt: slot.cutterPrompt,
      surfaceId: 'custom',
      surfacePrompt: slot.surfacePrompt,
      envId: 'custom',
      envPrompt: slot.envPrompt,
      handle,
      chapterLabel,
      width: plan.width || 1280,
      height: plan.height || 720,
      fps: plan.fps || 60,
      rounds: plan.rounds || [10, 50, 100, 250, 500, 1000],
      durationScale: plan.durationScale ?? 0.85,
      showHud: true,
      ctaOutro: outroCfg,
      outputName: `longform-ep${plan.episodeNumber}-slot-${pad}`,
      heroFramePath,
    });

    // Move rendered clip cleanly into slotDir/clip.mp4 and remove stray manifest in output/
    if (fs.existsSync(manifest.videoAbsolutePath)) {
      fs.renameSync(manifest.videoAbsolutePath, finalSlotMp4);
    }
    const strayJson = manifest.videoAbsolutePath.replace(/\.mp4$/i, '.json');
    if (fs.existsSync(strayJson)) {
      try { fs.unlinkSync(strayJson); } catch {}
    }

    const slotMeta = {
      episodeNumber: plan.episodeNumber,
      slot: slotNum,
      totalSlots: plan.totalSlots,
      isFinalSlot: slot.isFinalSlot,
      chapterLabel,
      clipFile: finalSlotMp4,
      heroFrameFile: fs.existsSync(heroFramePath) ? heroFramePath : null,
      asset: approved.asset,
      cutterPrompt: slot.cutterPrompt,
      surfacePrompt: slot.surfacePrompt,
      envPrompt: slot.envPrompt,
      durationSec: manifest.durationSec,
      maxCubes: manifest.maxCubes,
      rounds: manifest.rounds,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
      fileSizeMb: Number((fs.statSync(finalSlotMp4).size / 1048576).toFixed(2)),
      solidRatio: manifest.solidRatio,
      renderedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(slotDir, 'slot-meta.json'), JSON.stringify(slotMeta, null, 2) + '\n', 'utf8');
    console.log(
      `[longform-slot-${pad}] DONE! "${approved.asset.englishName}" | ${slotMeta.durationSec}s | ${slotMeta.fileSizeMb} MB | hero=${Boolean(slotMeta.heroFrameFile)}`
    );
  } finally {
    cleanupRuntimeModelDir();
  }
}

main().catch((err) => {
  console.error('[longform-slot] FATAL:', err);
  process.exit(1);
});
