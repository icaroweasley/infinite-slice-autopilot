# Infinite Slice 3D — Autonomous Viral Reels Skill (Antigravity & Claude Code)

> Programmatic 9:16 vertical 3D slicing engine (`10 → 50 → 100 → 250 → 500 → 1,000 CUTS`) with **Rapier3D WASM rigid bodies**, **true-scale 52,000 micro-cubes**, **100,000-grain kinetic sand avalanche**, **3D volumetric interiors**, **procedural 48kHz ASMR audio**, **deterministic 60 FPS headless `.mp4` export (Playwright + FFmpeg)**, and **automated English Instagram Reels publishing**.

---

## Quick Start (3 Steps)

### 1. Prerequisites
- **Node.js 20+**
- **FFmpeg** installed on PATH (`ffmpeg -version`)
- **Google Chrome / Edge** or Playwright Chromium (installed automatically if needed)

### 2. Install Dependencies & Register Skill
```bash
npm install
npm run install-skill
```
`npm run install-skill` copies/links this Skill into **Google Antigravity** (`~/.gemini/config/skills/infinite-slice-skill`) and **Claude Code** (`~/.claude/skills/infinite-slice-skill`) so you can simply tell your AI agent:
> *"Invent a new viral object that we haven't sliced yet, render a 1080×1920 60fps MP4 on the Glass Lab surface, and prepare the English Instagram Reels post."*

### 3. Configure Brand & Publishing
1. Edit [`config.json`](./config.json) to set your Instagram `@handle`, default environments, resolution (`1080x1920` or `720x1280`), and hashtags.
2. Copy `.env.example` to `.env` and fill in either:
   - **`N8N_WEBHOOK_URL`** (easiest: sends the `.mp4` + English caption JSON straight to your n8n / Make workflow), OR
   - **`IG_USER_ID` + `IG_ACCESS_TOKEN` + `CLOUDINARY_*`** (direct Meta Graph API Reels publishing).

---

## Commands

| Command | Description |
| :--- | :--- |
| `npm run studio` | Launches the interactive 3D Studio in your browser (`http://127.0.0.1:5173`) |
| `node scripts/run-pipeline.mjs --object salmon --env classic-viral` | Renders a full 6-round 60 FPS `.mp4` with synced 48kHz ASMR audio + logs history |
| `node scripts/run-pipeline.mjs --object rubiks-cube --env glass-lab --quick` | Fast test render (`540×960`, 30 FPS, `10 → 100 → 1000` cuts) in seconds |
| `node scripts/run-pipeline.mjs --auto` | Picks the next unrendered built-in object + rotating environment automatically |
| `node scripts/history-cli.mjs list` | Lists all objects already rendered/published (anti-repetition ledger) |
| `node scripts/publish-reels.mjs --video output/<file>.mp4 --dry-run` | Preview the generated English caption & publish payload safely |

---

## 10 Included Volumetric 3D Objects + Infinite AI Generation
- **Built-in Library:** `salmon`, `iphone`, `geode`, `rainbow-cake`, `rubiks-cube`, `gold-bar`, `billiard-8ball`, `ice-rose`, `honeycomb`, `burger`.
- **Infinite Custom Objects:** Your AI agent writes new procedural 3D recipes into `engine/src/objects/object-builder.js` while keeping the camera, lighting, knife synchronization, 3-tier physics, and HUD 100% locked.

## 6 Cutting Surfaces & Studio Environments
`classic-viral` • `glass-lab` • `tropical-leaf` • `luxury-obsidian` • `pro-kitchen` • `frozen-block`

## Automating Scheduled Posting
- **In Google Antigravity:** Use the `/schedule` slash command (e.g., 3x/day at `09:00`, `15:00`, `21:00`) instructing the agent to run the `infinite-slice-skill` workflow autonomously.
- **In Windows Task Scheduler / Linux cron:** Run `node scripts/run-pipeline.mjs --auto --publish` on your preferred schedule.
