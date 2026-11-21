# Volumetric 3D Object Recipe Specification (`engine/src/objects/object-builder.js`)

When inventing a brand-new viral object for Infinite Slice 3D, write a single ES module exporting `customObject` inside `engine/src/objects/object-builder.js`.

**CRITICAL RULE:** Never alter the locked 3/4 isometric camera, 3-point lighting, knife state machine, or HUD. Only change the object recipe (and optionally select one of the 6 environment presets).

## Required Export Contract

```js
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fract, hash3, fbm3 } from './noise.js';

export const customObject = {
  id: 'custom',
  slug: 'unique-kebab-slug',          // Must NOT exist in data/history.json
  name: 'Display Name',
  englishName: 'Viral English Name',  // Used in Instagram Reels captions
  subtitle: 'Short internal reveal description',
  bounds: { w: 2.2, h: 0.9, d: 1.5 }, // World units, rests flush on y = 0, centered on X=0, Z=0
  gridRes: { x: 96, y: 48, z: 64 },   // 3D Data3DTexture baking resolution
  physics: {
    restitution: 0.18,                // 0.08 soft food -> 0.35 hard crystal/tech
    friction: 0.60,                   // 0.35 slick -> 0.78 grippy cake/dough
    cohesion: 0.65,                   // Kinetic sand angle of repose (0.40 - 0.80)
    density: 1.2,
    soundProfile: 'culinary',         // 'culinary' | 'tech' | 'crystal' | 'metal' | 'plastic'
  },

  // Normalized coords: nx in [-0.5, 0.5], ny in [0, 1], nz in [-0.5, 0.5]
  contains(nx, ny, nz) {
    // Return true if point is solid material; return false for sculpted edges or hollow cavities!
  },

  // Returns exact internal/external sRGB (0..1) and PBR properties at any 3D point
  sampleVolume(nx, ny, nz) {
    return {
      r: 0.9,
      g: 0.4,
      b: 0.2,
      roughness: 0.3,
      metalness: 0.05,
      emissive: 0.0,
    };
  },

  // Smooth outer BufferGeometry strictly matching contains(nx, ny, nz), resting flush at y = 0
  createOuterGeometry() {
    // Tip: Deform a subdivided BoxGeometry / SphereGeometry / ExtrudeGeometry so y sits in [0, h]
  },
};
```

## Design Rules for Maximum Retention (First 2 Seconds + Reveal)

1. **Instant Silhouette Recognition:** Keep `w` between `1.6` and `2.5`, `h` between `0.48` and `1.35`, `d` between `1.2` and `1.85` so the object fills ~60% of the locked 9:16 portrait frame.
2. **True 3D Internal Surprise:** Never paint only the exterior! Build distinct 3D internal structures in `sampleVolume(nx, ny, nz)` that reward slicing:
   - Multi-layer strata (cake, burger, sushi, tiramisu, watermelon seeds + red flesh + white rind + green skin).
   - Technical/forbidden interiors (motherboard traces, copper coils, batteries, hollow crystal chambers, neon resin cores, golden gears inside a watch).
   - Contrast between outer crust and interior so the exposed Z-cross-section cap pops immediately on Cut #1 of the Z-axis.
3. **Hollow Cavities Supported:** Returning `false` in `contains(nx, ny, nz)` inside the core (like an avocado pit cavity, geode chamber, or hollow chocolate egg) automatically carves a true hollow cross-section cap and reduces physical cube count accurately!
4. **Match Sound & Environment:**
   - Food / fruit / pastry → `soundProfile: 'culinary'`, pairs well with `classic-viral`, `tropical-leaf`, or `pro-kitchen`.
   - Tech / gadgets / gold / watches → `soundProfile: 'tech'` or `'metal'`, pairs well with `luxury-obsidian`, `glass-lab`, or `pro-kitchen`.
   - Ice / crystals / gems / billiards → `soundProfile: 'crystal'` or `'plastic'`, pairs well with `frozen-block`, `glass-lab`, or `luxury-obsidian`.
