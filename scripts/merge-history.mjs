import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'data', 'history.json');

/**
 * Conflict-free Git commit & push for data/history.json in concurrent GitHub Actions runs.
 * Always merges the newly appended entry on top of the latest origin/main data/history.json
 * so two back-to-back runs can NEVER collide with a rebase conflict!
 */
function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const localHist = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
const localEntries = Array.isArray(localHist.entries) ? localHist.entries : [];

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    run('git fetch origin main');
    const remoteRaw = run('git show origin/main:data/history.json');
    const remoteHist = JSON.parse(remoteRaw);
    const remoteEntries = Array.isArray(remoteHist.entries) ? remoteHist.entries : [];

    // Merge remote + any local entries not yet present on remote (preserve order, dedupe by id)
    const seenIds = new Set(remoteEntries.map((e) => e.id));
    const merged = [...remoteEntries];
    let addedCount = 0;
    for (const e of localEntries) {
      if (!seenIds.has(e.id)) {
        merged.push(e);
        seenIds.add(e.id);
        addedCount++;
      }
    }

    if (addedCount === 0) {
      console.log('[merge-history] No new entries to push.');
      process.exit(0);
    }

    run('git reset --hard origin/main');
    remoteHist.entries = merged;
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(remoteHist, null, 2) + '\n', 'utf8');
    run('git add data/history.json');
    run(`git commit -m "chore: log autonomous reel in history.json (+${addedCount})"`);
    run('git push origin HEAD:main');
    console.log(`[merge-history] Safely merged & pushed +${addedCount} entry to origin/main (total: ${merged.length}).`);
    process.exit(0);
  } catch (err) {
    console.warn(`[merge-history] Attempt ${attempt}/3 failed: ${err.message?.slice(0, 240)}`);
    if (attempt === 3) {
      console.error('[merge-history] FATAL: could not push history.json after 3 attempts.');
      process.exit(1);
    }
  }
}
