import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveChromiumExecutable } from './render-headless.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILL_NAME = 'infinite-slice-skill';

function checkTool(cmd, label) {
  try {
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().split('\n')[0].trim();
    console.log(`  [OK] ${label}: ${out}`);
    return true;
  } catch {
    console.log(`  [MISSING] ${label}`);
    return false;
  }
}

function linkOrCopySkill(targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  if (fs.existsSync(targetDir)) {
    const stat = fs.lstatSync(targetDir);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetDir);
    } else {
      console.log(`  [SKIP] Already exists as directory: ${targetDir}`);
      return;
    }
  }
  try {
    // Directory junction on Windows requires no elevated privileges; symlink on macOS/Linux
    fs.symlinkSync(ROOT, targetDir, process.platform === 'win32' ? 'junction' : 'dir');
    console.log(`  [LINKED] ${targetDir} -> ${ROOT}`);
  } catch (err) {
    console.warn(`  [WARN] Symlink failed (${err.message}); copying SKILL.md & references instead...`);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'SKILL.md'), path.join(targetDir, 'SKILL.md'));
  }
}

console.log('\n=== Infinite Slice 3D Skill Installer (Antigravity & Claude Code) ===\n');
console.log('1. Checking runtime prerequisites:');
checkTool('node -v', 'Node.js');
checkTool('ffmpeg -version', 'FFmpeg');
try {
  const chrome = resolveChromiumExecutable();
  console.log(`  [OK] Chromium/Chrome: ${chrome}`);
} catch (err) {
  console.log(`  [WARN] ${err.message}`);
}

console.log('\n2. Installing Skill into Antigravity & Claude Code:');
const home = os.homedir();
const targets = [
  path.join(home, '.gemini', 'config', 'skills', SKILL_NAME),   // Google Antigravity Global Skills
  path.join(home, '.claude', 'skills', SKILL_NAME),             // Claude Code Global Skills
];

// Also link into parent workspace .agents/skills if requested via --workspace
if (process.argv.includes('--workspace')) {
  targets.push(path.join(path.dirname(ROOT), '.agents', 'skills', SKILL_NAME));
}

for (const t of targets) {
  linkOrCopySkill(t);
}

console.log('\n3. Setup complete! Next steps:');
console.log('  - Edit config.json to set your @handle and preferred environments.');
console.log('  - Copy .env.example to .env if you want automated Instagram Reels / n8n publishing.');
console.log('  - Test interactive studio: npm run studio');
console.log('  - Test headless MP4 render: node scripts/run-pipeline.mjs --object rubiks-cube --env glass-lab --quick\n');
