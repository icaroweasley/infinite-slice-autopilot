# AI Creative Slots Specification (`data/studio-brief.json`)

When the user configures a video in the **Creator Studio UI** (`http://127.0.0.1:5174/`) and clicks **"Salvar Pedido para a IA"** (or asks you to *"Executa o brief da infinite-slice-skill"*), read `data/studio-brief.json` and `data/history.json`.

## How to Fulfill Each Field

Each of the 4 creative slots (`object`, `cutter`, `surface`, `environment`) has:
- `mode: "ai-random"` → **You MUST invent a brand-new, high-retention, NEVER-REPEATED idea** (check `data/history.json` first; do NOT reuse boring default presets!).
- `mode: "ai-prompt"` → Build **specifically** what the user wrote in `prompt` with rich 3D detail and true internal anatomy.
- `mode: "preset"` → Keep the selected built-in `presetId` untouched (no need to rewrite that slot file).

## The 4 Bespoke AI Slot Files

1. **Object (`engine/src/objects/object-builder.js`)** — exports `customObject`
   - Must follow [object-recipe-spec.md](./object-recipe-spec.md): unique `slug`, `name`, `englishName`, `bounds`, `gridRes` (96–128 for crisp edges), `physics`, `contains(nx, ny, nz)`, `sampleVolume(nx, ny, nz)` (rich 3D internal surprise!), and `createOuterGeometry()`.
2. **Cutter (`engine/src/engine/custom-cutter.js`)** — exports `customCutter`
   - `{ id: 'ai-custom', name, subtitle, blurHex, build() -> { toolGroup, bladeGeo, bladeMatsToFade, blurHex } }`
   - **CRITICAL:** Cutting edge MUST lie along local `y = 0`, `z ∈ [-1.5, +1.5]`, and handle MUST extend toward `-Z` so all 3 cutting axes stay 100% phase-locked!
3. **Cutting Surface (`engine/src/engine/custom-surface.js`)** — exports `customSurface`
   - `{ id: 'ai-custom', name, subtitle, surfaceAudio: 'wood'|'glass'|'leaf'|'stone'|'metal'|'ice', apply({ boardMat, rimMat, leafMesh }) }`
   - Procedural 512×512 `CanvasTexture` + PBR material properties on `boardMat` & `rimMat`.
4. **Studio Environment (`engine/src/engine/custom-environment.js`)** — exports `customEnvironment`
   - `{ id: 'ai-custom', name, subtitle, apply({ scene, wallMat, counterMat, lights: { hemi, key, fill, rim } }) }`
   - Sets `scene.background`, `wallMat`, `counterMat`, and 3-point lighting mood.

## Final Step: Render the Brief in 1 Command

After writing the requested slot files, run:
```bash
node scripts/render-brief.mjs
```
This automatically reads `data/studio-brief.json`, renders the exact `.mp4` with the user's chosen cut rounds, resolution, FPS, `@handle`, and 48 kHz stereo ASMR audio via Playwright + FFmpeg, records it in `data/history.json`, and updates `data/studio-brief.json` to `status: "completed"` so the Creator Studio UI pops open the finished video automatically!
