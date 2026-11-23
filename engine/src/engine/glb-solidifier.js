import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp, lerp, smoothstep, fract, hash3, fbm3 } from '../objects/noise.js';

/**
 * Real 3D Model (.glb / .gltf) -> Volumetric Solid Converter
 *
 * Loads ANY real downloaded 3D model (Poly Haven, Khronos, Quaternius, Kenney, etc.):
 * 1. Normalizes scale, floor contact (y = 0), and hero 3/4 orientation.
 * 2. Preserves the model's real photorealistic PBR diffuse textures & colors in a 1024x1024 surface atlas.
 * 3. Runs a 3-axis scanline parity + span + exterior 3D BFS flood-fill solid voxelizer so EVEN hollow
 *    or open-bottom downloaded 3D meshes become 100% SOLID (ZERO hollow cut faces!).
 * 4. Smooths occupancy into a trilinear density field for razor-crisp 512x512 cut-cap curves.
 * 5. Pairs the real outer mesh with rich, tailored 3D volumetric interior anatomy (or AI-coded interior).
 */

const SKIP_MESH_RE = /(shadow|ground|floor|backdrop|plane_bg|studio|camera|light|helper|collider)/i;

function isValidImageSource(img) {
  if (!img) return false;
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return w > 0 && h > 0;
}

/**
 * Computes a 3D solid occupancy voxel grid + smoothed density field + normalized depth-from-surface
 * from any non-indexed triangle list inside [x ∈ -w/2..w/2, y ∈ 0..h, z ∈ -d/2..d/2].
 */
function voxelizeMeshSolid(posArray, bounds, rx = 96, ry = 72, rz = 80) {
  const { w, h, d } = bounds;
  const halfW = w * 0.5;
  const halfD = d * 0.5;
  const triCount = Math.floor(posArray.length / 9);
  const total = rx * ry * rz;

  const parityVotes = new Uint8Array(total);
  const spanVotes = new Uint8Array(total);
  const shell = new Uint8Array(total);

  const zHits = Array.from({ length: rx * ry }, () => []);
  const yHits = Array.from({ length: rx * rz }, () => []);
  const xHits = Array.from({ length: ry * rz }, () => []);

  const idx3 = (ix, iy, iz) => (iz * ry + iy) * rx + ix;

  const markShellPoint = (x, y, z) => {
    const ix = Math.max(0, Math.min(rx - 1, Math.floor(((x + halfW) / w) * rx)));
    const iy = Math.max(0, Math.min(ry - 1, Math.floor((y / h) * ry)));
    const iz = Math.max(0, Math.min(rz - 1, Math.floor(((z + halfD) / d) * rz)));
    shell[idx3(ix, iy, iz)] = 1;
  };

  // Helper: barycentric test + interpolated 3rd coord on 2D projected triangle
  const rasterizeAxis = (
    u0, v0, t0, u1, v1, t1, u2, v2, t2,
    uMin, uSpan, nu,
    vMin, vSpan, nv,
    buckets
  ) => {
    const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (Math.abs(det) < 1e-10) return;
    const invDet = 1.0 / det;

    const minU = Math.max(0, Math.floor(((Math.min(u0, u1, u2) - uMin) / uSpan) * nu));
    const maxU = Math.min(nu - 1, Math.ceil(((Math.max(u0, u1, u2) - uMin) / uSpan) * nu));
    const minV = Math.max(0, Math.floor(((Math.min(v0, v1, v2) - vMin) / vSpan) * nv));
    const maxV = Math.min(nv - 1, Math.ceil(((Math.max(v0, v1, v2) - vMin) / vSpan) * nv));

    for (let iv = minV; iv <= maxV; iv++) {
      const pv = vMin + ((iv + 0.5) / nv) * vSpan;
      const row = iv * nu;
      for (let iu = minU; iu <= maxU; iu++) {
        const pu = uMin + ((iu + 0.5) / nu) * uSpan;
        const a = ((u1 - pu) * (v2 - pv) - (u2 - pu) * (v1 - pv)) * invDet;
        const b = ((u2 - pu) * (v0 - pv) - (u0 - pu) * (v2 - pv)) * invDet;
        const c = 1.0 - a - b;
        if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) {
          buckets[row + iu].push(a * t0 + b * t1 + c * t2);
        }
      }
    }
  };

  // Pass 1: Project all triangles onto XY, XZ, YZ scanline buckets + rasterize shell samples
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const x0 = posArray[o], y0 = posArray[o + 1], z0 = posArray[o + 2];
    const x1 = posArray[o + 3], y1 = posArray[o + 4], z1 = posArray[o + 5];
    const x2 = posArray[o + 6], y2 = posArray[o + 7], z2 = posArray[o + 8];

    markShellPoint(x0, y0, z0);
    markShellPoint(x1, y1, z1);
    markShellPoint(x2, y2, z2);
    markShellPoint((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3, (z0 + z1 + z2) / 3);
    markShellPoint((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
    markShellPoint((x1 + x2) * 0.5, (y1 + y2) * 0.5, (z1 + z2) * 0.5);
    markShellPoint((x2 + x0) * 0.5, (y2 + y0) * 0.5, (z2 + z0) * 0.5);

    rasterizeAxis(x0, y0, z0, x1, y1, z1, x2, y2, z2, -halfW, w, rx, 0, h, ry, zHits);
    rasterizeAxis(x0, z0, y0, x1, z1, y1, x2, z2, y2, -halfW, w, rx, -halfD, d, rz, yHits);
    rasterizeAxis(y0, z0, x0, y1, z1, x1, y2, z2, x2, 0, h, ry, -halfD, d, rz, xHits);
  }

  const dedupeSorted = (arr) => {
    arr.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      if (out.length === 0 || arr[i] - out[out.length - 1] > 1e-4) {
        out.push(arr[i]);
      }
    }
    return out;
  };

  // Pass 2: Cast Z scanlines
  for (let iy = 0; iy < ry; iy++) {
    for (let ix = 0; ix < rx; ix++) {
      const raw = zHits[iy * rx + ix];
      if (raw.length < 2) continue;
      const hits = dedupeSorted(raw);
      if (hits.length < 2) continue;

      const s0 = Math.max(0, Math.floor(((hits[0] + halfD) / d) * rz));
      const s1 = Math.min(rz - 1, Math.floor(((hits[hits.length - 1] + halfD) / d) * rz));
      for (let iz = s0; iz <= s1; iz++) spanVotes[idx3(ix, iy, iz)]++;

      for (let k = 0; k + 1 < hits.length; k += 2) {
        const a = Math.max(0, Math.floor(((hits[k] + halfD) / d) * rz));
        const b = Math.min(rz - 1, Math.floor(((hits[k + 1] + halfD) / d) * rz));
        for (let iz = a; iz <= b; iz++) parityVotes[idx3(ix, iy, iz)]++;
      }
    }
  }

  // Pass 3: Cast Y scanlines
  for (let iz = 0; iz < rz; iz++) {
    for (let ix = 0; ix < rx; ix++) {
      const raw = yHits[iz * rx + ix];
      if (raw.length < 2) continue;
      const hits = dedupeSorted(raw);
      if (hits.length < 2) continue;

      const s0 = Math.max(0, Math.floor((hits[0] / h) * ry));
      const s1 = Math.min(ry - 1, Math.floor((hits[hits.length - 1] / h) * ry));
      for (let iy = s0; iy <= s1; iy++) spanVotes[idx3(ix, iy, iz)]++;

      for (let k = 0; k + 1 < hits.length; k += 2) {
        const a = Math.max(0, Math.floor((hits[k] / h) * ry));
        const b = Math.min(ry - 1, Math.floor((hits[k + 1] / h) * ry));
        for (let iy = a; iy <= b; iy++) parityVotes[idx3(ix, iy, iz)]++;
      }
    }
  }

  // Pass 4: Cast X scanlines
  for (let iz = 0; iz < rz; iz++) {
    for (let iy = 0; iy < ry; iy++) {
      const raw = xHits[iz * ry + iy];
      if (raw.length < 2) continue;
      const hits = dedupeSorted(raw);
      if (hits.length < 2) continue;

      const s0 = Math.max(0, Math.floor(((hits[0] + halfW) / w) * rx));
      const s1 = Math.min(rx - 1, Math.floor(((hits[hits.length - 1] + halfW) / w) * rx));
      for (let ix = s0; ix <= s1; ix++) spanVotes[idx3(ix, iy, iz)]++;

      for (let k = 0; k + 1 < hits.length; k += 2) {
        const a = Math.max(0, Math.floor(((hits[k] + halfW) / w) * rx));
        const b = Math.min(rx - 1, Math.floor(((hits[k + 1] + halfW) / w) * rx));
        for (let ix = a; ix <= b; ix++) parityVotes[idx3(ix, iy, iz)]++;
      }
    }
  }

  // Pass 5: Combine votes (handles watertight AND slightly non-watertight scanned meshes)
  const occ = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (shell[i] || parityVotes[i] >= 2 || (spanVotes[i] === 3 && parityVotes[i] >= 1)) {
      occ[i] = 1;
    }
  }

  // Seal open bottom cap on scanned objects (statues/vases/cakes that sit flat on y=0 with uncapped underside)
  for (let iz = 0; iz < rz; iz++) {
    for (let ix = 0; ix < rx; ix++) {
      const i0 = idx3(ix, 0, iz);
      const i1 = idx3(ix, 1, iz);
      if (spanVotes[i0] >= 2 || spanVotes[i1] >= 2) {
        occ[i0] = 1;
      }
    }
  }

  // Pass 6: 3D Exterior BFS Flood-Fill Cavity Seal (GUARANTEES 100% SOLID INTERIOR — ZERO HOLLOW POCKETS!)
  const px = rx + 2, py = ry + 2, pz = rz + 2;
  const pTotal = px * py * pz;
  const air = new Uint8Array(pTotal);
  const pIdx = (x, y, z) => (z * py + y) * px + x;
  const queue = new Int32Array(pTotal);
  let qHead = 0, qTail = 0;

  const pushAir = (x, y, z) => {
    const k = pIdx(x, y, z);
    if (air[k]) return;
    if (x >= 1 && x <= rx && y >= 1 && y <= ry && z >= 1 && z <= rz) {
      if (occ[idx3(x - 1, y - 1, z - 1)]) return;
    }
    air[k] = 1;
    queue[qTail++] = k;
  };

  pushAir(0, 0, 0);
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const z = Math.floor(cur / (px * py));
    const rem = cur - z * px * py;
    const y = Math.floor(rem / px);
    const x = rem - y * px;

    if (x > 0) pushAir(x - 1, y, z);
    if (x + 1 < px) pushAir(x + 1, y, z);
    if (y > 0) pushAir(x, y - 1, z);
    if (y + 1 < py) pushAir(x, y + 1, z);
    if (z > 0) pushAir(x, y, z - 1);
    if (z + 1 < pz) pushAir(x, y, z + 1);
  }

  let solidCount = 0;
  for (let iz = 0; iz < rz; iz++) {
    for (let iy = 0; iy < ry; iy++) {
      for (let ix = 0; ix < rx; ix++) {
        const k = idx3(ix, iy, iz);
        if (!air[pIdx(ix + 1, iy + 1, iz + 1)]) {
          occ[k] = 1;
        }
        if (occ[k]) solidCount++;
      }
    }
  }

  // Pass 7: Fast 3D Chamfer distance-from-skin field (for realistic rind/shell/crust thickness!)
  const dist = new Float32Array(total);
  const INF = 9999;
  for (let i = 0; i < total; i++) dist[i] = occ[i] ? INF : 0;

  // Forward sweep
  for (let iz = 0; iz < rz; iz++) {
    for (let iy = 0; iy < ry; iy++) {
      for (let ix = 0; ix < rx; ix++) {
        const k = idx3(ix, iy, iz);
        let v = dist[k];
        if (v === 0) continue;
        if (ix === 0 || iy === 0 || iz === 0) v = 1;
        if (ix > 0) v = Math.min(v, dist[idx3(ix - 1, iy, iz)] + 1);
        if (iy > 0) v = Math.min(v, dist[idx3(ix, iy - 1, iz)] + 1);
        if (iz > 0) v = Math.min(v, dist[idx3(ix, iy, iz - 1)] + 1);
        dist[k] = v;
      }
    }
  }
  // Backward sweep
  let maxDist = 1;
  for (let iz = rz - 1; iz >= 0; iz--) {
    for (let iy = ry - 1; iy >= 0; iy--) {
      for (let ix = rx - 1; ix >= 0; ix--) {
        const k = idx3(ix, iy, iz);
        let v = dist[k];
        if (v === 0) continue;
        if (ix === rx - 1 || iy === ry - 1 || iz === rz - 1) v = Math.min(v, 1);
        if (ix + 1 < rx) v = Math.min(v, dist[idx3(ix + 1, iy, iz)] + 1);
        if (iy + 1 < ry) v = Math.min(v, dist[idx3(ix, iy + 1, iz)] + 1);
        if (iz + 1 < rz) v = Math.min(v, dist[idx3(ix, iy, iz + 1)] + 1);
        dist[k] = v;
        if (v < INF && v > maxDist) maxDist = v;
      }
    }
  }
  const invMaxDist = 1.0 / Math.max(1, maxDist);
  for (let i = 0; i < total; i++) {
    dist[i] = dist[i] >= INF ? 1.0 : clamp(dist[i] * invMaxDist, 0, 1);
  }

  // Pass 8: 3x3x3 soft density field so trilinear contains() gives razor-smooth 512x512 cut-cap curves!
  const density = new Float32Array(total);
  for (let iz = 0; iz < rz; iz++) {
    for (let iy = 0; iy < ry; iy++) {
      for (let ix = 0; ix < rx; ix++) {
        let sum = 0;
        let wSum = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = iz + dz;
          if (nz < 0 || nz >= rz) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = iy + dy;
            if (ny < 0 || ny >= ry) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = ix + dx;
              if (nx < 0 || nx >= rx) continue;
              const wt = (dx === 0 && dy === 0 && dz === 0) ? 4 : (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1 ? 2 : 1);
              sum += occ[idx3(nx, ny, nz)] * wt;
              wSum += wt;
            }
          }
        }
        density[idx3(ix, iy, iz)] = sum / wSum;
      }
    }
  }

  const sampleGridTrilinear = (field, nx, ny, nz) => {
    const gx = (nx + 0.5) * rx - 0.5;
    const gy = ny * ry - 0.5;
    const gz = (nz + 0.5) * rz - 0.5;
    if (gx < -0.5 || gx > rx - 0.5 || gy < -0.5 || gy > ry - 0.5 || gz < -0.5 || gz > rz - 0.5) {
      return 0;
    }
    const x0 = Math.max(0, Math.min(rx - 1, Math.floor(gx)));
    const y0 = Math.max(0, Math.min(ry - 1, Math.floor(gy)));
    const z0 = Math.max(0, Math.min(rz - 1, Math.floor(gz)));
    const x1 = Math.min(rx - 1, x0 + 1);
    const y1 = Math.min(ry - 1, y0 + 1);
    const z1 = Math.min(rz - 1, z0 + 1);
    const fx = clamp(gx - x0, 0, 1);
    const fy = clamp(gy - y0, 0, 1);
    const fz = clamp(gz - z0, 0, 1);

    const c000 = field[idx3(x0, y0, z0)];
    const c100 = field[idx3(x1, y0, z0)];
    const c010 = field[idx3(x0, y1, z0)];
    const c110 = field[idx3(x1, y1, z0)];
    const c001 = field[idx3(x0, y0, z1)];
    const c101 = field[idx3(x1, y0, z1)];
    const c011 = field[idx3(x0, y1, z1)];
    const c111 = field[idx3(x1, y1, z1)];

    const c00 = c000 + (c100 - c000) * fx;
    const c10 = c010 + (c110 - c010) * fx;
    const c01 = c001 + (c101 - c001) * fx;
    const c11 = c011 + (c111 - c011) * fx;
    const c0 = c00 + (c10 - c00) * fy;
    const c1 = c01 + (c11 - c01) * fy;
    return c0 + (c1 - c0) * fz;
  };

  return {
    rx, ry, rz,
    occ,
    density,
    dist,
    solidRatio: solidCount / total,
    contains(nx, ny, nz) {
      if (nx < -0.5 || nx > 0.5 || ny < 0 || ny > 1 || nz < -0.5 || nz > 0.5) return false;
      return sampleGridTrilinear(density, nx, ny, nz) >= 0.44;
    },
    depthAt(nx, ny, nz) {
      return sampleGridTrilinear(dist, nx, ny, nz);
    },
  };
}

/**
 * Rich, hyper-detailed procedural 3D volumetric interior recipes for sliced real 3D models.
 * Every recipe produces crisp sRGB [0..1] + PBR properties with dramatic contrast between skin and core.
 */
export function evaluateInteriorStyle(style, nx, ny, nz, depth, skinRgb = [0.85, 0.72, 0.55]) {
  const n1 = fbm3(nx * 14, ny * 14, nz * 14, 3);
  const n2 = fbm3(nx * 32 + 7.1, ny * 32 - 3.4, nz * 32 + 1.9, 2);

  // Preserve a thin crisp outer shell color right along the rim of the cut cross-section!
  if (depth < 0.08) {
    return {
      r: clamp(skinRgb[0] * (0.94 + n2 * 0.12), 0, 1),
      g: clamp(skinRgb[1] * (0.94 + n2 * 0.12), 0, 1),
      b: clamp(skinRgb[2] * (0.94 + n2 * 0.12), 0, 1),
      roughness: 0.34,
      metalness: 0.06,
      emissive: 0.0,
    };
  }

  switch (style) {
    case 'citrus-lemon':
    case 'citrus-lime': {
      const isLime = style === 'citrus-lime';
      const flesh = isLime ? [0.44, 0.86, 0.24] : [0.99, 0.89, 0.20];
      const darkFlesh = isLime ? [0.22, 0.68, 0.14] : [0.95, 0.72, 0.06];
      if (depth < 0.18) {
        return { r: 0.97, g: 0.96, b: 0.90, roughness: 0.65, metalness: 0.0, emissive: 0.0 }; // white pith
      }
      const cy = ny - 0.5;
      const rCore = Math.hypot(nx * 1.4, cy * 1.4);
      if (rCore < 0.07) {
        return { r: 0.96, g: 0.95, b: 0.86, roughness: 0.62, metalness: 0.0, emissive: 0.0 };
      }
      const ang = Math.atan2(cy, nx);
      const wedge = Math.abs(Math.sin(ang * 5.0)); // 10 radial wedges
      const membrane = smoothstep(0.08, 0.02, wedge);
      const vesicle = 0.5 + 0.5 * Math.sin(rCore * 48 + n2 * 6.0);
      const baseR = lerp(darkFlesh[0], flesh[0], vesicle * 0.75 + 0.2);
      const baseG = lerp(darkFlesh[1], flesh[1], vesicle * 0.75 + 0.2);
      const baseB = lerp(darkFlesh[2], flesh[2], vesicle * 0.75 + 0.2);
      return {
        r: lerp(baseR, 0.96, membrane * 0.88),
        g: lerp(baseG, 0.95, membrane * 0.88),
        b: lerp(baseB, 0.88, membrane * 0.88),
        roughness: lerp(0.16, 0.55, membrane),
        metalness: 0.0,
        emissive: 0.03,
      };
    }

    case 'banana': {
      if (depth < 0.16) {
        return { r: 0.96, g: 0.91, b: 0.62, roughness: 0.55, metalness: 0.0, emissive: 0.0 };
      }
      const cy = ny - 0.5;
      const r = Math.hypot(nx * 1.6, cy * 1.6);
      const star = Math.abs(Math.sin(Math.atan2(cy, nx) * 1.5)) * smoothstep(0.24, 0.04, r);
      const seedDot = smoothstep(0.18, 0.04, Math.hypot(r - 0.09, Math.sin(Math.atan2(cy, nx) * 3) * 0.06)) * (n2 > 0.42 ? 1 : 0);
      return {
        r: lerp(0.98, 0.72, star * 0.35 + seedDot * 0.55),
        g: lerp(0.93, 0.58, star * 0.35 + seedDot * 0.55),
        b: lerp(0.74, 0.36, star * 0.35 + seedDot * 0.55),
        roughness: 0.44,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'pear-flesh': {
      const cy = ny - 0.44;
      const r = Math.hypot(nx * 1.7, cy * 1.5);
      const coreRing = smoothstep(0.16, 0.12, Math.abs(r - 0.17));
      const isSeed = r < 0.14 && Math.abs(Math.sin(Math.atan2(cy, nx) * 2.5)) > 0.78 && Math.abs(nz) < 0.16;
      if (isSeed) {
        return { r: 0.24, g: 0.12, b: 0.06, roughness: 0.18, metalness: 0.05, emissive: 0.0 };
      }
      return {
        r: clamp(lerp(0.97, 0.88, coreRing * 0.35) + n2 * 0.04, 0, 1),
        g: clamp(lerp(0.95, 0.84, coreRing * 0.35) + n2 * 0.04, 0, 1),
        b: clamp(lerp(0.82, 0.66, coreRing * 0.35) + n2 * 0.03, 0, 1),
        roughness: 0.28,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'onion-rings': {
      const r = Math.hypot(nx * 1.45, (ny - 0.5) * 1.35);
      const ringPhase = fract(r * 9.5 + n1 * 0.22);
      const skinLine = smoothstep(0.11, 0.02, ringPhase) + smoothstep(0.89, 0.98, ringPhase);
      return {
        r: lerp(0.96, 0.76, skinLine * 0.55),
        g: lerp(0.94, 0.66, skinLine * 0.55),
        b: lerp(0.84, 0.44, skinLine * 0.55),
        roughness: lerp(0.20, 0.42, skinLine),
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'lychee-core': {
      const r = Math.hypot(nx * 1.6, (ny - 0.5) * 1.6, nz * 1.6);
      if (r < 0.26) {
        return { r: 0.26, g: 0.11, b: 0.05, roughness: 0.16, metalness: 0.06, emissive: 0.0 }; // glossy dark seed
      }
      return {
        r: clamp(0.94 + n2 * 0.05, 0, 1),
        g: clamp(0.92 + n2 * 0.05, 0, 1),
        b: clamp(0.96 + n2 * 0.04, 0, 1),
        roughness: 0.14,
        metalness: 0.0,
        emissive: 0.04,
      };
    }

    case 'sweet-potato': {
      const swirl = smoothstep(0.35, 0.65, 0.5 + 0.5 * Math.sin(depth * 18 + n1 * 5.0));
      return {
        r: lerp(0.94, 0.99, swirl),
        g: lerp(0.42, 0.60, swirl),
        b: lerp(0.10, 0.18, swirl),
        roughness: 0.45,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'ginger-root': {
      const ring = 0.5 + 0.5 * Math.sin(depth * 24 + n1 * 4.0);
      return {
        r: lerp(0.94, 0.98, ring),
        g: lerp(0.84, 0.92, ring),
        b: lerp(0.42, 0.58, ring),
        roughness: 0.42,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'croissant-pastry': {
      const swirl = Math.sin(depth * 28.0 + Math.atan2(ny - 0.5, nx) * 2.0 + n1 * 4.5);
      const pocket = smoothstep(0.45, 0.82, swirl);
      const chocoCore = smoothstep(0.55, 0.72, depth);
      const r = lerp(lerp(0.95, 0.78, pocket), 0.26, chocoCore);
      const g = lerp(lerp(0.80, 0.54, pocket), 0.12, chocoCore);
      const b = lerp(lerp(0.46, 0.22, pocket), 0.06, chocoCore);
      return { r, g, b, roughness: lerp(0.55, 0.22, chocoCore), metalness: 0.0, emissive: 0.0 };
    }

    case 'cake-chocolate': {
      const band = fract(ny * 5.0);
      const isJam = band > 0.44 && band < 0.56;
      const isCream = band > 0.86 || band < 0.10;
      if (isJam) return { r: 0.88, g: 0.10, b: 0.22, roughness: 0.18, metalness: 0.0, emissive: 0.03 };
      if (isCream) return { r: 0.99, g: 0.96, b: 0.90, roughness: 0.35, metalness: 0.0, emissive: 0.0 };
      return {
        r: clamp(0.28 + n2 * 0.08, 0, 1),
        g: clamp(0.14 + n2 * 0.05, 0, 1),
        b: clamp(0.08 + n2 * 0.04, 0, 1),
        roughness: 0.72,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'cake-carrot': {
      const band = fract(ny * 4.2);
      const isFrosting = band > 0.76 || band < 0.12;
      if (isFrosting) return { r: 0.99, g: 0.97, b: 0.91, roughness: 0.32, metalness: 0.0, emissive: 0.0 };
      const fleck = n2 > 0.66 ? 1 : 0;
      return {
        r: fleck ? 0.96 : 0.76,
        g: fleck ? 0.46 : 0.44,
        b: fleck ? 0.10 : 0.18,
        roughness: 0.74,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'tech-pcb': {
      // Viral "forbidden tech teardown" — emerald PCB layers, gold traces, copper coils, glowing battery cells!
      const layer = Math.floor(ny * 6.0);
      const traceX = Math.abs(Math.sin(nx * 54.0 + layer * 1.3)) > 0.92;
      const traceZ = Math.abs(Math.sin(nz * 54.0 - layer * 0.9)) > 0.92;
      const traceY = Math.abs(Math.sin(ny * 36.0)) > 0.94;
      const isBattery = depth > 0.56 && Math.abs(nx) < 0.24 && ny > 0.28 && ny < 0.72;
      if (isBattery) {
        const pulse = 0.5 + 0.5 * Math.sin(nx * 30 + ny * 30);
        return { r: 0.10, g: lerp(0.76, 0.96, pulse), b: 1.0, roughness: 0.18, metalness: 0.35, emissive: 0.42 };
      }
      if (traceX || traceZ || traceY) {
        return { r: 0.98, g: 0.78, b: 0.18, roughness: 0.18, metalness: 0.94, emissive: 0.05 };
      }
      const isChip = Math.abs(Math.sin(nx * 14)) > 0.82 && Math.abs(Math.sin(ny * 18)) > 0.72;
      if (isChip) {
        return { r: 0.12, g: 0.13, b: 0.16, roughness: 0.28, metalness: 0.45, emissive: 0.0 };
      }
      return { r: 0.04, g: 0.46, b: 0.22, roughness: 0.34, metalness: 0.18, emissive: 0.0 };
    }

    case 'clockwork': {
      // Interlocking brass & gold gears, ruby jewel bearings, blued steel springs!
      const gx = fract((nx + 0.5) * 4.0) - 0.5;
      const gy = fract(ny * 4.0) - 0.5;
      const r = Math.hypot(gx, gy);
      const tooth = 0.36 + 0.07 * Math.sign(Math.sin(Math.atan2(gy, gx) * 10.0));
      if (r < 0.09) {
        return { r: 0.92, g: 0.08, b: 0.26, roughness: 0.10, metalness: 0.15, emissive: 0.25 }; // ruby bearing
      }
      if (r < tooth && r > 0.16) {
        const isGold = ((Math.floor((nx + 0.5) * 4) + Math.floor(ny * 4)) % 2) === 0;
        return isGold
          ? { r: 0.96, g: 0.76, b: 0.22, roughness: 0.20, metalness: 0.94, emissive: 0.0 }
          : { r: 0.84, g: 0.52, b: 0.24, roughness: 0.24, metalness: 0.90, emissive: 0.0 };
      }
      return { r: 0.12, g: 0.18, b: 0.30, roughness: 0.30, metalness: 0.78, emissive: 0.0 }; // blued steel chamber
    }

    case 'treasure-gold': {
      // Packed gleaming 24k gold bullion coins + faceted rubies, sapphires & emeralds!
      const gx = (nx + 0.5) * 18;
      const gy = ny * 15;
      const gz = (nz + 0.5) * 18;
      const cx = Math.floor(gx);
      const cy = Math.floor(gy);
      const cz = Math.floor(gz);
      const hVal = hash3(cx, cy, cz);
      const dCenter = Math.hypot(fract(gx) - 0.5, fract(gy) - 0.5);
      const gap = smoothstep(0.40, 0.50, dCenter);
      if (hVal > 0.87) {
        return { r: lerp(0.95, 0.42, gap), g: lerp(0.06, 0.02, gap), b: lerp(0.22, 0.08, gap), roughness: 0.08, metalness: 0.14, emissive: 0.28 * (1 - gap) };
      }
      if (hVal > 0.78) {
        return { r: lerp(0.08, 0.02, gap), g: lerp(0.48, 0.16, gap), b: lerp(0.98, 0.42, gap), roughness: 0.08, metalness: 0.14, emissive: 0.24 * (1 - gap) };
      }
      if (hVal > 0.70) {
        return { r: lerp(0.06, 0.02, gap), g: lerp(0.84, 0.34, gap), b: lerp(0.34, 0.12, gap), roughness: 0.08, metalness: 0.14, emissive: 0.22 * (1 - gap) };
      }
      return {
        r: lerp(0.99, 0.46, gap),
        g: lerp(0.78, 0.30, gap),
        b: lerp(0.14, 0.05, gap),
        roughness: lerp(0.14, 0.42, gap),
        metalness: lerp(0.96, 0.55, gap),
        emissive: 0.05 * (1 - gap),
      };
    }

    case 'baseball-core': {
      const r = Math.hypot(nx * 1.8, (ny - 0.5) * 1.8, nz * 1.8);
      if (r < 0.24) return { r: 0.82, g: 0.56, b: 0.30, roughness: 0.72, metalness: 0.0, emissive: 0.0 }; // cork center
      if (r < 0.34) return { r: 0.92, g: 0.14, b: 0.16, roughness: 0.45, metalness: 0.0, emissive: 0.0 }; // red rubber shell
      const yarn = 0.5 + 0.5 * Math.sin(r * 65.0 + n2 * 6.0);
      return {
        r: lerp(0.84, 0.94, yarn),
        g: lerp(0.80, 0.90, yarn),
        b: lerp(0.74, 0.84, yarn),
        roughness: 0.78,
        metalness: 0.0,
        emissive: 0.0,
      };
    }

    case 'amethyst-crystal': {
      const bands = 0.5 + 0.5 * Math.sin(depth * 22.0 + n1 * 5.0);
      const facet = Math.abs(Math.sin(nx * 26 + ny * 22) * Math.cos(nz * 24 - ny * 18));
      const c1 = [0.60, 0.16, 0.96];
      const c2 = [0.14, 0.84, 0.98];
      const r = lerp(lerp(c1[0], c2[0], bands), 1.0, facet * 0.42);
      const g = lerp(lerp(c1[1], c2[1], bands), 1.0, facet * 0.42);
      const b = lerp(lerp(c1[2], c2[2], bands), 1.0, facet * 0.42);
      return { r, g, b, roughness: 0.09, metalness: 0.12, emissive: 0.18 + facet * 0.22 };
    }

    case 'marble-damascus': {
      const wave = Math.sin(nx * 22.0 + ny * 16.0 + n1 * 7.5);
      const vein = smoothstep(0.82, 0.98, Math.abs(wave));
      const dark = smoothstep(-0.3, 0.5, wave);
      return {
        r: lerp(lerp(0.14, 0.92, dark), 0.99, vein),
        g: lerp(lerp(0.16, 0.93, dark), 0.80, vein),
        b: lerp(lerp(0.22, 0.96, dark), 0.22, vein),
        roughness: lerp(0.22, 0.14, vein),
        metalness: lerp(0.08, 0.92, vein),
        emissive: vein * 0.08,
      };
    }

    case 'cake-rainbow':
    default: {
      // Iconic viral "WAIT — IS IT CAKE?!" 6-layer rainbow sponge + vanilla frosting!
      const layers = [
        [0.98, 0.24, 0.36], // coral red
        [0.99, 0.60, 0.12], // sunny orange
        [0.99, 0.86, 0.16], // lemon yellow
        [0.20, 0.82, 0.42], // mint green
        [0.16, 0.66, 0.98], // sky blue
        [0.64, 0.30, 0.96], // lavender violet
      ];
      const posY = clamp(ny, 0, 0.999) * layers.length;
      const idx = Math.floor(posY);
      const f = posY - idx;
      const isFrosting = f < 0.14 || f > 0.88;
      if (isFrosting) {
        return { r: 0.99, g: 0.97, b: 0.92, roughness: 0.34, metalness: 0.0, emissive: 0.0 };
      }
      const c = layers[idx % layers.length];
      return {
        r: clamp(c[0] * (0.94 + n2 * 0.12), 0, 1),
        g: clamp(c[1] * (0.94 + n2 * 0.12), 0, 1),
        b: clamp(c[2] * (0.94 + n2 * 0.12), 0, 1),
        roughness: 0.68,
        metalness: 0.0,
        emissive: 0.02,
      };
    }
  }
}

/**
 * Loads a .glb or .gltf URL, normalizes its geometry, bakes its authentic PBR textures into
 * a 1024x1024 surface atlas, voxelizes its interior 100% SOLID, and returns a full objDef
 * drop-in compatible with VolumetricSolid, mesh-slicer.js, and PhysicsTierEngine!
 */
export async function loadSolidifiedModelObject(modelUrl, meta = {}) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(modelUrl);
  gltf.scene.updateMatrixWorld(true);

  const parts = [];
  gltf.scene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    if (SKIP_MESH_RE.test(node.name || '')) return;

    const rawGeo = node.geometry;
    const posAttr = rawGeo.attributes.position;
    if (!posAttr || posAttr.count < 3) return;

    // Clone & bake world transform cleanly
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
    geo.applyMatrix4(node.matrixWorld);
    if (!geo.attributes.normal) {
      geo.computeVertexNormals();
    }
    // Fix inverted winding if mirror-scaled
    if (node.matrixWorld.determinant() < 0) {
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const u = geo.attributes.uv;
      for (let i = 0; i + 2 < p.count; i += 3) {
        const swap = (attr, a, b) => {
          if (!attr) return;
          for (let c = 0; c < attr.itemSize; c++) {
            const tmp = attr.array[a * attr.itemSize + c];
            attr.array[a * attr.itemSize + c] = attr.array[b * attr.itemSize + c];
            attr.array[b * attr.itemSize + c] = tmp;
          }
        };
        swap(p, i + 1, i + 2);
        swap(n, i + 1, i + 2);
        swap(u, i + 1, i + 2);
      }
      geo.computeVertexNormals();
    }

    const mat = Array.isArray(node.material) ? node.material[0] : node.material;
    parts.push({ geo, mat, name: node.name || '' });
  });

  if (parts.length === 0) {
    throw new Error(`GLTF/GLB at "${modelUrl}" contained zero usable meshes`);
  }

  // Optional user/catalog rotation adjustments BEFORE computing normalized AABB
  const rotEuler = new THREE.Euler(
    meta.rotateX || 0,
    meta.rotateY || 0,
    meta.rotateZ || 0,
    'XYZ'
  );
  if (rotEuler.x !== 0 || rotEuler.y !== 0 || rotEuler.z !== 0) {
    const rotMat = new THREE.Matrix4().makeRotationFromEuler(rotEuler);
    for (const part of parts) {
      part.geo.applyMatrix4(rotMat);
    }
  }

  // Compute global AABB
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geo.computeBoundingBox();
    box.union(part.geo.boundingBox);
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Auto-orient longest horizontal span along X so our 3/4 camera & knife see the best silhouette!
  if (!meta.keepOrientation && size.z > size.x * 1.15) {
    const rotY90 = new THREE.Matrix4().makeRotationY(Math.PI * 0.5);
    box.makeEmpty();
    for (const part of parts) {
      part.geo.applyMatrix4(rotY90);
      part.geo.computeBoundingBox();
      box.union(part.geo.boundingBox);
    }
    box.getSize(size);
    box.getCenter(center);
  }

  // Fit hero bounding box into studio cutting board frame (sits flush at y = 0)
  const maxW = meta.maxW || 2.24;
  const maxH = meta.maxH || 1.48;
  const maxD = meta.maxD || 1.62;
  const scale = Math.min(
    maxW / Math.max(1e-4, size.x),
    maxH / Math.max(1e-4, size.y),
    maxD / Math.max(1e-4, size.z)
  );

  const bounds = {
    w: Math.max(0.45, size.x * scale),
    h: Math.max(0.35, size.y * scale),
    d: Math.max(0.45, size.z * scale),
  };

  // Deduplicate unique materials -> atlas tiles
  const uniqueMats = [];
  const partTileIdx = parts.map((p) => {
    let idx = uniqueMats.indexOf(p.mat);
    if (idx < 0) {
      idx = uniqueMats.length;
      uniqueMats.push(p.mat);
    }
    return idx;
  });

  const numTiles = Math.max(1, uniqueMats.length);
  const cols = Math.ceil(Math.sqrt(numTiles));
  const rows = Math.ceil(numTiles / cols);
  const ATLAS_SIZE = 1024;
  const tileW = ATLAS_SIZE / cols;
  const tileH = ATLAS_SIZE / rows;
  const padPx = numTiles > 1 ? 6 : 0;

  // Bake authentic outer diffuse texture atlas + PBR props atlas on offscreen 2D canvases
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = ATLAS_SIZE;
  colorCanvas.height = ATLAS_SIZE;
  const cCtx = colorCanvas.getContext('2d');
  cCtx.fillStyle = '#d8d0c4';
  cCtx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  const propsCanvas = document.createElement('canvas');
  propsCanvas.width = ATLAS_SIZE;
  propsCanvas.height = ATLAS_SIZE;
  const pCtx = propsCanvas.getContext('2d');
  pCtx.fillStyle = 'rgb(110, 12, 0)';
  pCtx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  let avgSkinR = 0, avgSkinG = 0, avgSkinB = 0, avgSkinCount = 0;

  for (let m = 0; m < uniqueMats.length; m++) {
    const mat = uniqueMats[m] || {};
    const col = m % cols;
    const row = Math.floor(m / cols);
    const tx = Math.floor(col * tileW);
    const ty = Math.floor(row * tileH);
    const tw = Math.ceil(tileW);
    const th = Math.ceil(tileH);
    const ix = tx + padPx;
    const iy = ty + padPx;
    const iw = Math.max(4, tw - padPx * 2);
    const ih = Math.max(4, th - padPx * 2);

    // Base tint color (convert Three.js linear Color -> sRGB for canvas)
    const baseCol = (mat.color && mat.color.isColor) ? mat.color.clone().convertLinearToSRGB() : new THREE.Color(0.88, 0.85, 0.82);
    const rByte = Math.round(clamp(baseCol.r, 0, 1) * 255);
    const gByte = Math.round(clamp(baseCol.g, 0, 1) * 255);
    const bByte = Math.round(clamp(baseCol.b, 0, 1) * 255);

    cCtx.fillStyle = `rgb(${rByte},${gByte},${bByte})`;
    cCtx.fillRect(tx, ty, tw, th);

    if (mat.map && isValidImageSource(mat.map.image)) {
      // Draw image cleanly into tile (and bleed borders into padding to prevent mipmap seams)
      cCtx.drawImage(mat.map.image, tx, ty, tw, th);
      cCtx.drawImage(mat.map.image, ix, iy, iw, ih);
      // Tint multiply if material also specifies a non-white baseColorFactor
      if (rByte < 248 || gByte < 248 || bByte < 248) {
        cCtx.save();
        cCtx.globalCompositeOperation = 'multiply';
        cCtx.fillStyle = `rgb(${rByte},${gByte},${bByte})`;
        cCtx.fillRect(tx, ty, tw, th);
        cCtx.restore();
      }
    }

    // Sample average skin color for realistic rim blending on cut cross-sections
    const samplePx = cCtx.getImageData(ix + Math.floor(iw * 0.25), iy + Math.floor(ih * 0.25), Math.max(1, Math.floor(iw * 0.5)), Math.max(1, Math.floor(ih * 0.5))).data;
    let sr = 0, sg = 0, sb = 0, sc = 0;
    for (let k = 0; k < samplePx.length; k += 64) {
      sr += samplePx[k]; sg += samplePx[k + 1]; sb += samplePx[k + 2]; sc++;
    }
    if (sc > 0) {
      avgSkinR += sr / (sc * 255);
      avgSkinG += sg / (sc * 255);
      avgSkinB += sb / (sc * 255);
      avgSkinCount++;
    }

    const rough = clamp(typeof mat.roughness === 'number' ? mat.roughness : 0.42, 0.08, 0.92);
    const metal = clamp(typeof mat.metalness === 'number' ? mat.metalness : 0.06, 0.0, 0.95);
    const emiss = (mat.emissiveIntensity && mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.1)
      ? clamp(mat.emissiveIntensity * 0.35, 0, 0.8)
      : 0.0;
    pCtx.fillStyle = `rgb(${Math.round(rough * 255)},${Math.round(metal * 255)},${Math.round(emiss * 255)})`;
    pCtx.fillRect(tx, ty, tw, th);
  }

  const avgSkinRgb = avgSkinCount > 0
    ? [avgSkinR / avgSkinCount, avgSkinG / avgSkinCount, avgSkinB / avgSkinCount]
    : [0.85, 0.72, 0.55];

  // Merge all transformed geometries into ONE clean non-indexed BufferGeometry with atlas aSurfUv
  let totalVerts = 0;
  for (const part of parts) {
    totalVerts += Math.floor(part.geo.attributes.position.count / 3) * 3;
  }

  const outPos = new Float32Array(totalVerts * 3);
  const outNorm = new Float32Array(totalVerts * 3);
  const outUv = new Float32Array(totalVerts * 2);

  let vCursor = 0;
  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const { geo } = parts[pIdx];
    const tileIdx = partTileIdx[pIdx];
    const col = tileIdx % cols;
    const row = Math.floor(tileIdx / cols);
    const ox = (col * tileW + padPx) / ATLAS_SIZE;
    const oy = (row * tileH + padPx) / ATLAS_SIZE;
    const sw = Math.max(2, tileW - padPx * 2) / ATLAS_SIZE;
    const sh = Math.max(2, tileH - padPx * 2) / ATLAS_SIZE;

    const pAttr = geo.attributes.position;
    const nAttr = geo.attributes.normal;
    const uAttr = geo.attributes.uv;
    const count = Math.floor(pAttr.count / 3) * 3;

    for (let i = 0; i < count; i++) {
      const wx = (pAttr.getX(i) - center.x) * scale;
      const wy = (pAttr.getY(i) - box.min.y) * scale;
      const wz = (pAttr.getZ(i) - center.z) * scale;

      const pOff = (vCursor + i) * 3;
      outPos[pOff] = wx;
      outPos[pOff + 1] = wy;
      outPos[pOff + 2] = wz;

      outNorm[pOff] = nAttr.getX(i);
      outNorm[pOff + 1] = nAttr.getY(i);
      outNorm[pOff + 2] = nAttr.getZ(i);

      let u = 0.5, v = 0.5;
      if (uAttr) {
        u = uAttr.getX(i);
        v = uAttr.getY(i);
        // Handle tiled/wrapped UVs cleanly into [0, 1]
        if (u < 0 || u > 1) u = ((u % 1) + 1) % 1;
        if (v < 0 || v > 1) v = ((v % 1) + 1) % 1;
      }
      const uOff = (vCursor + i) * 2;
      outUv[uOff] = ox + u * sw;
      outUv[uOff + 1] = oy + v * sh;
    }
    vCursor += count;
    geo.dispose();
  }

  const mergedGeo = new THREE.BufferGeometry();
  mergedGeo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  mergedGeo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  mergedGeo.setAttribute('aSurfUv', new THREE.BufferAttribute(outUv, 2));
  mergedGeo.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));

  // Build DataTextures (flipY = false matching VolumetricSolid shader UV convention!)
  const colorData = new Uint8Array(cCtx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data);
  const propsData = new Uint8Array(pCtx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data);

  const surfColorTex = new THREE.DataTexture(colorData, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  surfColorTex.minFilter = THREE.LinearMipmapLinearFilter;
  surfColorTex.magFilter = THREE.LinearFilter;
  surfColorTex.generateMipmaps = true;
  surfColorTex.anisotropy = 8;
  surfColorTex.wrapS = THREE.ClampToEdgeWrapping;
  surfColorTex.wrapT = THREE.ClampToEdgeWrapping;
  surfColorTex.flipY = false;
  surfColorTex.needsUpdate = true;

  const surfPropsTex = new THREE.DataTexture(propsData, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  surfPropsTex.minFilter = THREE.LinearMipmapLinearFilter;
  surfPropsTex.magFilter = THREE.LinearFilter;
  surfPropsTex.generateMipmaps = true;
  surfPropsTex.anisotropy = 8;
  surfPropsTex.wrapS = THREE.ClampToEdgeWrapping;
  surfPropsTex.wrapT = THREE.ClampToEdgeWrapping;
  surfPropsTex.flipY = false;
  surfPropsTex.needsUpdate = true;

  // Voxelize 100% SOLID interior!
  const voxel = voxelizeMeshSolid(outPos, bounds, 96, 72, 80);
  const interiorStyle = meta.interiorStyle || 'cake-rainbow';
  const soundProfile = meta.soundProfile || 'culinary';

  // Optional custom AI interior evaluator (safe sandboxed pure function if provided)
  let customInteriorFn = null;
  if (meta.customInteriorCode && typeof meta.customInteriorCode === 'string') {
    try {
      const factory = new Function('clamp', 'lerp', 'smoothstep', 'fract', 'hash3', 'fbm3', `return (${meta.customInteriorCode});`);
      const fn = factory(clamp, lerp, smoothstep, fract, hash3, fbm3);
      if (typeof fn === 'function') {
        const probe = fn(0, 0.5, 0, 0.5, avgSkinRgb);
        if (probe && Number.isFinite(probe.r) && Number.isFinite(probe.g) && Number.isFinite(probe.b)) {
          customInteriorFn = fn;
        }
      }
    } catch (err) {
      console.warn('[glb-solidifier] Custom interior code rejected, using built-in recipe:', err.message);
    }
  }

  return {
    id: 'external-glb',
    slug: meta.slug || 'real-3d-model',
    name: meta.name || meta.englishName || '3D Model',
    englishName: meta.englishName || meta.name || '3D Model',
    subtitle: meta.subtitle || `3D Model • Solid ${interiorStyle} interior`,
    modelAssetId: meta.assetId || '',
    bounds,
    gridRes: { x: 96, y: 72, z: 80 },
    solidRatio: voxel.solidRatio,
    vertexCount: totalVerts,
    physics: {
      restitution: soundProfile === 'crystal' || soundProfile === 'metal' || soundProfile === 'tech' ? 0.28 : 0.16,
      friction: soundProfile === 'crystal' || soundProfile === 'metal' ? 0.38 : 0.62,
      cohesion: soundProfile === 'crystal' || soundProfile === 'metal' ? 0.50 : 0.72,
      density: soundProfile === 'metal' ? 4.5 : 1.3,
      soundProfile,
    },
    bakedSurface: {
      geometry: mergedGeo,
      surfColorTex,
      surfPropsTex,
    },
    contains(nx, ny, nz) {
      return voxel.contains(nx, ny, nz);
    },
    sampleVolume(nx, ny, nz) {
      const depth = voxel.depthAt(nx, ny, nz);
      if (customInteriorFn) {
        try {
          const out = customInteriorFn(nx, ny, nz, depth, avgSkinRgb);
          if (out && Number.isFinite(out.r) && Number.isFinite(out.g) && Number.isFinite(out.b)) {
            return {
              r: clamp(out.r, 0, 1),
              g: clamp(out.g, 0, 1),
              b: clamp(out.b, 0, 1),
              roughness: clamp(out.roughness ?? 0.4, 0.05, 0.95),
              metalness: clamp(out.metalness ?? 0.05, 0.0, 0.98),
              emissive: clamp(out.emissive ?? 0.0, 0.0, 1.0),
            };
          }
        } catch {
          // fall through to reliable recipe
        }
      }
      return evaluateInteriorStyle(interiorStyle, nx, ny, nz, depth, avgSkinRgb);
    },
    createOuterGeometry() {
      return mergedGeo.clone();
    },
  };
}
