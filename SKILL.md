---
name: infinite-slice-skill
description: >-
  Autonomous 3D viral "Infinite Slicing" video studio and Instagram Reels pipeline
  (10 to 1,000 cuts with Rapier3D physics, true-scale micro-cubes, kinetic sand avalanche,
  and deterministic 60 FPS MP4 + ASMR audio rendering via Playwright and FFmpeg).
  Use when the user asks to generate, invent, batch-render, or publish Infinite Slice 3D
  vertical 9:16 videos, add new volumetric 3D objects, switch cutting surfaces/environments,
  or run an automated daily/hourly Reels content factory.
---

# Infinite Slice 3D — Autonomous Content Skill

This skill turns Claude Code or Google Antigravity into an autonomous 9:16 vertical 3D viral video factory. It preserves a **100% locked visual signature** (3/4 isometric camera, 3-point lighting, phase-locked chef's knife, 3-tier physics from `10` to `1,000 CUTS`, and `CUTS` / `@handle` / `CUBES` HUD) while letting the agent invent infinite non-repeating volumetric 3D objects across 6 cutting environments and export studio-grade 60 FPS `.mp4` videos with synced ASMR audio.

## Core Rules (Always Enforce)

1. **Never Repeat an Object:** Always check [data/history.json](./data/history.json) via `scripts/history-cli.mjs` before creating a new video.
2. **Lock the Signature Framing:** Never modify camera coordinates, knife state machine phases, or HUD layout inside `engine/src/engine/`. Only customize `config.json`, environment preset selection, and `engine/src/objects/object-builder.js`.
3. **True 3D Volumetric Interiors:** Every custom object MUST define accurate internal anatomy in `sampleVolume(nx, ny, nz)` (see [references/object-recipe-spec.md](./references/object-recipe-spec.md)).
4. **Safe Publishing:** Respect `config.json` publishing mode (`dry-run`, `n8n`, or `meta-graph`). Never post without credentials configured in `.env`.

## Fulfilling a Creator Studio Brief (`data/studio-brief.json`)

When the user configures a video in the **Creator Studio UI** (`npm run studio` → `http://127.0.0.1:5174/`) and asks you to *"executar o brief"* or *"gerar o pedido da infinite-slice-skill"*:

1. Read [data/studio-brief.json](./data/studio-brief.json) and [data/history.json](./data/history.json).
2. Read [references/ai-slots-spec.md](./references/ai-slots-spec.md) and [references/object-recipe-spec.md](./references/object-recipe-spec.md).
3. For each of the 4 creative slots (`object`, `cutter`, `surface`, `environment`):
   - If `mode === "ai-random"`: **Invent a brand-new, high-retention, never-repeated creative concept** (NEVER copy the static presets!).
   - If `mode === "ai-prompt"`: Build **exactly** what the user described in `prompt`.
   - Write bespoke, detailed procedural Three.js code into the corresponding dynamic slot file:
     - `engine/src/objects/object-builder.js` (`customObject`)
     - `engine/src/engine/custom-cutter.js` (`customCutter`)
     - `engine/src/engine/custom-surface.js` (`customSurface`)
     - `engine/src/engine/custom-environment.js` (`customEnvironment`)
   - If `mode === "preset"`: Leave that slot file untouched (the renderer uses the chosen preset).
4. Run **one command** to render the final `.mp4` with the user's exact chosen cut rounds, resolution, FPS, `@handle`, and synced 48 kHz stereo ASMR audio:
   ```bash
   node scripts/render-brief.mjs
   ```
   This automatically logs the new creation in `data/history.json` and marks `data/studio-brief.json` as `completed` so the Creator Studio UI opens the rendered `.mp4` immediately!

## Autonomous Workflow (Direct Chat without Studio UI)

### Step 1 — Check Anti-Repetition History & Pick Next Concept
Run from the skill root directory:

```bash
node scripts/history-cli.mjs list
node scripts/history-cli.mjs suggest-env
```

- Review previously rendered slugs so you never duplicate an object.
- If the user requested a built-in preset (`salmon`, `iphone`, `geode`, `rainbow-cake`, `rubiks-cube`, `gold-bar`, `billiard-8ball`, `ice-rose`, `honeycomb`, `burger`), skip Step 2 and pass `--object <preset-id>` directly in Step 3.
- Otherwise, consult [references/viral-playbook.md](./references/viral-playbook.md) and invent a brand-new high-retention object concept with strong internal visual contrast.

### Step 2 — Generate New Volumetric Object (`engine/src/objects/object-builder.js`)
Read [references/object-recipe-spec.md](./references/object-recipe-spec.md), then write the new procedural 3D volumetric recipe to `engine/src/objects/object-builder.js`, exporting `customObject` with a unique kebab-case `slug`, `englishName`, `bounds`, `contains(nx, ny, nz)`, `sampleVolume(nx, ny, nz)`, and `createOuterGeometry()`.

Verify syntax cleanly before rendering:
```bash
node scripts/history-cli.mjs check <your-unique-slug>
```

### Step 3 — Render Locked 60 FPS 9:16 `.mp4` with Synced ASMR Audio
Run the unified autonomous pipeline (starts local Vite engine, steps Playwright Chromium deterministically frame-by-frame with zero dropped frames, synthesizes exact 48kHz stereo ASMR `.wav` from impact timestamps, muxes Instagram-ready H.264 + AAC `.mp4` via FFmpeg, and logs to `data/history.json`):

```bash
# Full viral 1080x1920 60fps 6-round video (10 -> 1,000 cuts)
node scripts/run-pipeline.mjs --object custom --env luxury-obsidian

# Fast preview / test render (540x960, 30fps, ~15s)
node scripts/run-pipeline.mjs --object custom --env classic-viral --quick

# Render a built-in preset and publish automatically (if .env is configured)
node scripts/run-pipeline.mjs --object rubiks-cube --env glass-lab --publish
```

### Step 4 — Verify Output & Publish to Instagram Reels
1. Confirm the output `.mp4` file exists in `output/` and inspect its generated `.json` metadata manifest (duration, resolution, final cube count, English caption, hashtags).
2. If `--publish` was not passed during Step 3 and the user wants to publish now:
   ```bash
   node scripts/publish-reels.mjs --video output/<file>.mp4 --dry-run
   # Remove --dry-run to publish via n8n webhook or Meta Graph API configured in .env
   ```

## Available Built-In Presets

- **10 Volumetric Objects:** `salmon`, `iphone`, `geode`, `rainbow-cake`, `rubiks-cube`, `gold-bar`, `billiard-8ball`, `ice-rose`, `honeycomb`, `burger` (plus `custom` via `object-builder.js`).
- **6 Environments / Surfaces:** `classic-viral` (honey wood + dark green tiles), `glass-lab` (tempered glass + minimalist white), `tropical-leaf` (banana leaf + warm rustic wood), `luxury-obsidian` (black marble with gold veins), `pro-kitchen` (brushed stainless steel), `frozen-block` (translucent crystalline ice).

## Interactive Creator Studio UI (No-Code + 1-Click MP4 Render)

Launch the full Creator Studio UI (with free-text + preset + random selectors for **Object**, **Cutter/Knife**, **Cutting Surface**, **Environment**, **Custom Cut Rounds**, and **1-Click Headless MP4 Render + Built-in Video Vault**):
```bash
npm run studio
```
Open `http://127.0.0.1:5174/` in the browser.

## Extra CLI Flags Supported by `scripts/render-headless.mjs`

- `--object <preset|custom>` or `--objectPrompt "<any free-text object>"`
- `--cutter <chef-knife|hot-knife-1000c|katana|cleaver|lightsaber|golden-blade|crystal-blade|credit-card|steel-scraper>` or `--cutterPrompt "<any custom cutter>"`
- `--surface <honey-wood|rustic-wood|tempered-glass|banana-leaf|obsidian-marble|white-marble|brushed-steel|ice-block|pink-terrazzo|neon-grid>` or `--surfacePrompt "<any custom surface>"`
- `--env <classic-viral|glass-lab|tropical-leaf|luxury-obsidian|pro-kitchen|frozen-block|cyberpunk-neon|sunset-terracotta>` or `--envPrompt "<any custom environment>"`
- `--rounds 10,100,500,1000` (any custom cut list)
