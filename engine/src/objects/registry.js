import { salmonObject } from './presets/salmon.js';
import { iphoneObject } from './presets/iphone.js';
import { amethystGeodeObject } from './presets/amethyst-geode.js';
import { rainbowCakeObject } from './presets/rainbow-cake.js';
import { rubiksCubeObject } from './presets/rubiks-cube.js';
import { goldBarObject } from './presets/gold-bar.js';
import { billiard8BallObject } from './presets/billiard-8ball.js';
import { iceRoseObject } from './presets/ice-rose.js';
import { honeycombObject } from './presets/honeycomb.js';
import { burgerObject } from './presets/burger.js';
import { customObject } from './object-builder.js';

export const BUILTIN_OBJECT_LIST = [
  salmonObject,
  iphoneObject,
  amethystGeodeObject,
  rainbowCakeObject,
  rubiksCubeObject,
  goldBarObject,
  billiard8BallObject,
  iceRoseObject,
  honeycombObject,
  burgerObject,
];

export const OBJECT_LIST = [...BUILTIN_OBJECT_LIST, customObject];

export const OBJECT_MAP = Object.fromEntries(OBJECT_LIST.map((obj) => [obj.id, obj]));

/**
 * Splits total cuts across X, Y, Z proportional to object dimensions (W, H, D)
 * so every sliced piece stays close to a true cube across 10 -> 1,000 cuts.
 */
export function computeAxisCuts(totalCuts, bounds) {
  const sum = bounds.w + bounds.h + bounds.d;
  let nx = Math.max(1, Math.round(totalCuts * (bounds.w / sum)));
  let ny = Math.max(1, Math.round(totalCuts * (bounds.h / sum)));
  let nz = totalCuts - nx - ny;
  if (nz < 1) {
    nz = 1;
    if (nx >= ny && nx > 1) nx--;
    else if (ny > 1) ny--;
  }
  return { nx, ny, nz };
}

/**
 * Estimates the object's volumetric fill ratio (0..1) via fast deterministic sampling.
 */
export function estimateFillRatio(objDef) {
  if (objDef._cachedFillRatio !== undefined) return objDef._cachedFillRatio;
  const sx = 24;
  const sy = 16;
  const sz = 20;
  let inside = 0;
  const total = sx * sy * sz;
  for (let ix = 0; ix < sx; ix++) {
    const nx = (ix + 0.5) / sx - 0.5;
    for (let iy = 0; iy < sy; iy++) {
      const ny = (iy + 0.5) / sy;
      for (let iz = 0; iz < sz; iz++) {
        const nz = (iz + 0.5) / sz - 0.5;
        if (objDef.contains(nx, ny, nz)) inside++;
      }
    }
  }
  objDef._cachedFillRatio = Math.max(0.15, inside / total);
  return objDef._cachedFillRatio;
}
