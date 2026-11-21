import * as THREE from 'three';

/**
 * Ultra-HD Procedural Surface & Cut-Cap Baker (1024x1024 outer atlas + 512x512 dynamic cut caps).
 * Replaces blurry 96px 3D voxel skin lookups with razor-sharp 1024px mipmapped anisotropic textures
 * automatically for ANY volumetric object (built-in presets, prompt objects, and AI-generated meshes!).
 */

function computeBBox(posAttr) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    minX, minY, minZ,
    maxX, maxY, maxZ,
    spanX: Math.max(1e-5, maxX - minX),
    spanY: Math.max(1e-5, maxY - minY),
    spanZ: Math.max(1e-5, maxZ - minZ),
  };
}

/**
 * Converts any indexed or non-indexed BufferGeometry into a clean non-indexed geometry
 * with guaranteed non-overlapping [0..1]x[0..1] atlas UVs (`aSurfUv`) across all faces/parts.
 */
function buildNonOverlappingAtlasGeometry(rawGeo) {
  if (!rawGeo.attributes.normal) {
    rawGeo.computeVertexNormals();
  }

  const posAttr = rawGeo.attributes.position;
  const normAttr = rawGeo.attributes.normal;
  const uvAttr = rawGeo.attributes.uv || null;
  const indexAttr = rawGeo.index || null;
  const totalIndices = indexAttr ? indexAttr.count : posAttr.count;
  const triCount = Math.floor(totalIndices / 3);

  // Determine per-triangle group index BEFORE expanding so BoxGeometry (6 faces),
  // CylinderGeometry (3 parts), and multi-part merged meshes never overlap in UV space!
  const rawGroups = rawGeo.groups && rawGeo.groups.length > 1 ? rawGeo.groups : null;
  const triGroup = new Uint16Array(triCount);
  let numGroups = 1;
  if (rawGroups && uvAttr) {
    numGroups = rawGroups.length;
    for (let g = 0; g < rawGroups.length; g++) {
      const startTri = Math.floor(rawGroups[g].start / 3);
      const countTri = Math.floor(rawGroups[g].count / 3);
      const endTri = Math.min(triCount, startTri + countTri);
      for (let t = startTri; t < endTri; t++) {
        triGroup[t] = g;
      }
    }
  }

  const useBoxProjection = !uvAttr;
  if (useBoxProjection) {
    numGroups = 6; // +X, -X, +Y, -Y, +Z, -Z
  }

  const cols = numGroups <= 1 ? 1 : (numGroups <= 2 ? 2 : (numGroups <= 4 ? 2 : 3));
  const rows = Math.ceil(numGroups / cols);
  const padU = numGroups <= 1 ? 0.004 : 0.012;
  const padV = numGroups <= 1 ? 0.004 : 0.012;
  const tileW = 1.0 / cols;
  const tileH = 1.0 / rows;

  const bbox = useBoxProjection ? computeBBox(posAttr) : null;

  const outPos = new Float32Array(triCount * 9);
  const outNorm = new Float32Array(triCount * 9);
  const outUv = new Float32Array(triCount * 6);

  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

    const p0x = posAttr.getX(i0), p0y = posAttr.getY(i0), p0z = posAttr.getZ(i0);
    const p1x = posAttr.getX(i1), p1y = posAttr.getY(i1), p1z = posAttr.getZ(i1);
    const p2x = posAttr.getX(i2), p2y = posAttr.getY(i2), p2z = posAttr.getZ(i2);

    const n0x = normAttr.getX(i0), n0y = normAttr.getY(i0), n0z = normAttr.getZ(i0);
    const n1x = normAttr.getX(i1), n1y = normAttr.getY(i1), n1z = normAttr.getZ(i1);
    const n2x = normAttr.getX(i2), n2y = normAttr.getY(i2), n2z = normAttr.getZ(i2);

    const pOff = t * 9;
    outPos[pOff] = p0x; outPos[pOff + 1] = p0y; outPos[pOff + 2] = p0z;
    outPos[pOff + 3] = p1x; outPos[pOff + 4] = p1y; outPos[pOff + 5] = p1z;
    outPos[pOff + 6] = p2x; outPos[pOff + 7] = p2y; outPos[pOff + 8] = p2z;

    outNorm[pOff] = n0x; outNorm[pOff + 1] = n0y; outNorm[pOff + 2] = n0z;
    outNorm[pOff + 3] = n1x; outNorm[pOff + 4] = n1y; outNorm[pOff + 5] = n1z;
    outNorm[pOff + 6] = n2x; outNorm[pOff + 7] = n2y; outNorm[pOff + 8] = n2z;

    let g = triGroup[t];
    let u0, v0, u1, v1, u2, v2;

    if (useBoxProjection) {
      const fnx = n0x + n1x + n2x;
      const fny = n0y + n1y + n2y;
      const fnz = n0z + n1z + n2z;
      const ax = Math.abs(fnx), ay = Math.abs(fny), az = Math.abs(fnz);
      if (ax >= ay && ax >= az) {
        g = fnx >= 0 ? 0 : 1;
        u0 = (p0z - bbox.minZ) / bbox.spanZ; v0 = (p0y - bbox.minY) / bbox.spanY;
        u1 = (p1z - bbox.minZ) / bbox.spanZ; v1 = (p1y - bbox.minY) / bbox.spanY;
        u2 = (p2z - bbox.minZ) / bbox.spanZ; v2 = (p2y - bbox.minY) / bbox.spanY;
      } else if (ay >= ax && ay >= az) {
        g = fny >= 0 ? 2 : 3;
        u0 = (p0x - bbox.minX) / bbox.spanX; v0 = (p0z - bbox.minZ) / bbox.spanZ;
        u1 = (p1x - bbox.minX) / bbox.spanX; v1 = (p1z - bbox.minZ) / bbox.spanZ;
        u2 = (p2x - bbox.minX) / bbox.spanX; v2 = (p2z - bbox.minZ) / bbox.spanZ;
      } else {
        g = fnz >= 0 ? 4 : 5;
        u0 = (p0x - bbox.minX) / bbox.spanX; v0 = (p0y - bbox.minY) / bbox.spanY;
        u1 = (p1x - bbox.minX) / bbox.spanX; v1 = (p1y - bbox.minY) / bbox.spanY;
        u2 = (p2x - bbox.minX) / bbox.spanX; v2 = (p2y - bbox.minY) / bbox.spanY;
      }
    } else {
      u0 = Math.max(0, Math.min(1, uvAttr.getX(i0)));
      v0 = Math.max(0, Math.min(1, uvAttr.getY(i0)));
      u1 = Math.max(0, Math.min(1, uvAttr.getX(i1)));
      v1 = Math.max(0, Math.min(1, uvAttr.getY(i1)));
      u2 = Math.max(0, Math.min(1, uvAttr.getX(i2)));
      v2 = Math.max(0, Math.min(1, uvAttr.getY(i2)));
    }

    const col = g % cols;
    const row = Math.floor(g / cols);
    const ox = col * tileW + padU * tileW;
    const oy = row * tileH + padV * tileH;
    const sw = tileW * (1.0 - 2.0 * padU);
    const sh = tileH * (1.0 - 2.0 * padV);

    const uOff = t * 6;
    outUv[uOff] = ox + u0 * sw; outUv[uOff + 1] = oy + v0 * sh;
    outUv[uOff + 2] = ox + u1 * sw; outUv[uOff + 3] = oy + v1 * sh;
    outUv[uOff + 4] = ox + u2 * sw; outUv[uOff + 5] = oy + v2 * sh;
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  outGeo.setAttribute('normal', new THREE.BufferAttribute(outNorm, 3));
  outGeo.setAttribute('aSurfUv', new THREE.BufferAttribute(outUv, 2));
  outGeo.setAttribute('uv', new THREE.BufferAttribute(outUv, 2));
  return outGeo;
}

/**
 * Dilates filled atlas pixels outward by N pixels so bilinear filtering and mipmaps
 * never pull black/empty texels across UV seams or tile gutters.
 */
function dilateAtlas(colorData, propsData, filled, W, H, passes = 4) {
  const nextFilled = new Uint8Array(filled);
  for (let p = 0; p < passes; p++) {
    let changed = false;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const idx = row + x;
        if (filled[idx]) continue;

        let cr = 0, cg = 0, cb = 0, pr = 0, pg = 0, pb = 0, cnt = 0;
        if (x > 0 && filled[idx - 1]) {
          const o = (idx - 1) * 4;
          cr += colorData[o]; cg += colorData[o + 1]; cb += colorData[o + 2];
          pr += propsData[o]; pg += propsData[o + 1]; pb += propsData[o + 2];
          cnt++;
        }
        if (x < W - 1 && filled[idx + 1]) {
          const o = (idx + 1) * 4;
          cr += colorData[o]; cg += colorData[o + 1]; cb += colorData[o + 2];
          pr += propsData[o]; pg += propsData[o + 1]; pb += propsData[o + 2];
          cnt++;
        }
        if (y > 0 && filled[idx - W]) {
          const o = (idx - W) * 4;
          cr += colorData[o]; cg += colorData[o + 1]; cb += colorData[o + 2];
          pr += propsData[o]; pg += propsData[o + 1]; pb += propsData[o + 2];
          cnt++;
        }
        if (y < H - 1 && filled[idx + W]) {
          const o = (idx + W) * 4;
          cr += colorData[o]; cg += colorData[o + 1]; cb += colorData[o + 2];
          pr += propsData[o]; pg += propsData[o + 1]; pb += propsData[o + 2];
          cnt++;
        }
        if (cnt > 0) {
          const o = idx * 4;
          colorData[o] = (cr / cnt) | 0;
          colorData[o + 1] = (cg / cnt) | 0;
          colorData[o + 2] = (cb / cnt) | 0;
          colorData[o + 3] = 255;
          propsData[o] = (pr / cnt) | 0;
          propsData[o + 1] = (pg / cnt) | 0;
          propsData[o + 2] = (pb / cnt) | 0;
          propsData[o + 3] = 255;
          nextFilled[idx] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
    filled.set(nextFilled);
  }
}

/**
 * Bakes an ultra-crisp 1024x1024 outer-surface color + PBR properties atlas directly from
 * `objDef.createOuterGeometry()` and `objDef.sampleVolume()`.
 */
export function bakeUltraHDSurface(objDef, texSize = 1024) {
  const rawGeo = objDef.createOuterGeometry();
  const geometry = buildNonOverlappingAtlasGeometry(rawGeo);
  rawGeo.dispose();

  const W = texSize;
  const H = texSize;
  const colorData = new Uint8Array(W * H * 4);
  const propsData = new Uint8Array(W * H * 4);
  const filled = new Uint8Array(W * H);

  const pos = geometry.attributes.position.array;
  const norm = geometry.attributes.normal.array;
  const uv = geometry.attributes.aSurfUv.array;
  const triCount = Math.floor(pos.length / 9);
  const { w, h, d } = objDef.bounds;
  const invW = 1.0 / w;
  const invH = 1.0 / h;
  const invD = 1.0 / d;
  // Tiny inward nudge along outward normal so surface sampling lands cleanly inside the skin layer
  const nudge = Math.min(w, h, d) * 0.0022;

  for (let t = 0; t < triCount; t++) {
    const pOff = t * 9;
    const uOff = t * 6;

    const x0 = uv[uOff] * W, y0 = uv[uOff + 1] * H;
    const x1 = uv[uOff + 2] * W, y1 = uv[uOff + 3] * H;
    const x2 = uv[uOff + 4] * W, y2 = uv[uOff + 5] * H;

    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-4) continue;
    const invArea = 1.0 / area;

    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxPx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxPy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));

    const p0x = pos[pOff], p0y = pos[pOff + 1], p0z = pos[pOff + 2];
    const p1x = pos[pOff + 3], p1y = pos[pOff + 4], p1z = pos[pOff + 5];
    const p2x = pos[pOff + 6], p2y = pos[pOff + 7], p2z = pos[pOff + 8];

    const n0x = norm[pOff], n0y = norm[pOff + 1], n0z = norm[pOff + 2];
    const n1x = norm[pOff + 3], n1y = norm[pOff + 4], n1z = norm[pOff + 5];
    const n2x = norm[pOff + 6], n2y = norm[pOff + 7], n2z = norm[pOff + 8];

    for (let py = minPy; py <= maxPy; py++) {
      const cy = py + 0.5;
      const row = py * W;
      for (let px = minPx; px <= maxPx; px++) {
        const cx = px + 0.5;
        let w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * invArea;
        let w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * invArea;
        let w2 = 1.0 - w0 - w1;

        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;

        // Clamp tiny sub-pixel boundary overhang strictly inside the triangle
        if (w0 < 0) w0 = 0;
        if (w1 < 0) w1 = 0;
        if (w2 < 0) w2 = 0;
        const wSum = w0 + w1 + w2 || 1.0;
        w0 /= wSum; w1 /= wSum; w2 /= wSum;

        let snx = w0 * n0x + w1 * n1x + w2 * n2x;
        let sny = w0 * n0y + w1 * n1y + w2 * n2y;
        let snz = w0 * n0z + w1 * n1z + w2 * n2z;
        const sl = Math.hypot(snx, sny, snz) || 1.0;
        snx /= sl; sny /= sl; snz /= sl;

        const wx = w0 * p0x + w1 * p1x + w2 * p2x - snx * nudge;
        const wy = w0 * p0y + w1 * p1y + w2 * p2y - sny * nudge;
        const wz = w0 * p0z + w1 * p1z + w2 * p2z - snz * nudge;

        const s = objDef.sampleVolume(wx * invW, wy * invH, wz * invD);
        const idx = row + px;
        const o = idx * 4;
        colorData[o] = Math.max(0, Math.min(255, Math.round(s.r * 255)));
        colorData[o + 1] = Math.max(0, Math.min(255, Math.round(s.g * 255)));
        colorData[o + 2] = Math.max(0, Math.min(255, Math.round(s.b * 255)));
        colorData[o + 3] = 255;

        propsData[o] = Math.max(0, Math.min(255, Math.round(s.roughness * 255)));
        propsData[o + 1] = Math.max(0, Math.min(255, Math.round(s.metalness * 255)));
        propsData[o + 2] = Math.max(0, Math.min(255, Math.round((s.emissive || 0) * 255)));
        propsData[o + 3] = 255;

        filled[idx] = 1;
      }
    }
  }

  dilateAtlas(colorData, propsData, filled, W, H, 5);

  const surfColorTex = new THREE.DataTexture(colorData, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  surfColorTex.minFilter = THREE.LinearMipmapLinearFilter;
  surfColorTex.magFilter = THREE.LinearFilter;
  surfColorTex.generateMipmaps = true;
  surfColorTex.anisotropy = 8;
  surfColorTex.wrapS = THREE.ClampToEdgeWrapping;
  surfColorTex.wrapT = THREE.ClampToEdgeWrapping;
  surfColorTex.flipY = false;
  surfColorTex.needsUpdate = true;

  const surfPropsTex = new THREE.DataTexture(propsData, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  surfPropsTex.minFilter = THREE.LinearMipmapLinearFilter;
  surfPropsTex.magFilter = THREE.LinearFilter;
  surfPropsTex.generateMipmaps = true;
  surfPropsTex.anisotropy = 8;
  surfPropsTex.wrapS = THREE.ClampToEdgeWrapping;
  surfPropsTex.wrapT = THREE.ClampToEdgeWrapping;
  surfPropsTex.flipY = false;
  surfPropsTex.needsUpdate = true;

  return { geometry, surfColorTex, surfPropsTex };
}

/**
 * Bakes an ultra-crisp 512x512 2D cross-section texture at exact cut plane z = zWorld
 * with 2x2 boundary supersampling & 2px RGB edge dilation (zero jagged edges, 40x sharper than 96px 3D volume!).
 */
export function bakeCutCapSlice(objDef, zWorld, colorBuf, propsBuf, size = 512) {
  const { d } = objDef.bounds;
  const nz = zWorld / d;
  const invS = 1.0 / size;
  const halfStep = 0.25 * invS;
  const insideGrid = new Uint8Array(size * size);

  // Pass 1: fast occupancy + interior color evaluation
  for (let py = 0; py < size; py++) {
    const ny = (py + 0.5) * invS;
    const row = py * size;
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5) * invS - 0.5;
      const idx = row + px;
      const o = idx * 4;
      const inside = objDef.contains(nx, ny, nz);
      insideGrid[idx] = inside ? 1 : 0;
      if (inside) {
        const s = objDef.sampleVolume(nx, ny, nz);
        colorBuf[o] = Math.max(0, Math.min(255, Math.round(s.r * 255)));
        colorBuf[o + 1] = Math.max(0, Math.min(255, Math.round(s.g * 255)));
        colorBuf[o + 2] = Math.max(0, Math.min(255, Math.round(s.b * 255)));
        colorBuf[o + 3] = 255;

        propsBuf[o] = Math.max(0, Math.min(255, Math.round(s.roughness * 255)));
        propsBuf[o + 1] = Math.max(0, Math.min(255, Math.round(s.metalness * 255)));
        propsBuf[o + 2] = Math.max(0, Math.min(255, Math.round((s.emissive || 0) * 255)));
        propsBuf[o + 3] = 255;
      } else {
        colorBuf[o + 3] = 0;
      }
    }
  }

  // Pass 2: crisp 2x2 anti-aliased boundary alpha + clean RGB edge dilation so bilinear filter never pulls black fringes
  for (let py = 1; py < size - 1; py++) {
    const ny = (py + 0.5) * invS;
    const row = py * size;
    for (let px = 1; px < size - 1; px++) {
      const idx = row + px;
      const c = insideGrid[idx];
      if (
        c === insideGrid[idx - 1] &&
        c === insideGrid[idx + 1] &&
        c === insideGrid[idx - size] &&
        c === insideGrid[idx + size]
      ) {
        continue;
      }

      const nx = (px + 0.5) * invS - 0.5;
      let cov = 0;
      if (objDef.contains(nx - halfStep, ny - halfStep, nz)) cov++;
      if (objDef.contains(nx + halfStep, ny - halfStep, nz)) cov++;
      if (objDef.contains(nx - halfStep, ny + halfStep, nz)) cov++;
      if (objDef.contains(nx + halfStep, ny + halfStep, nz)) cov++;

      const o = idx * 4;
      colorBuf[o + 3] = Math.round((cov / 4) * 255);

      if (!c) {
        // Fill boundary-outside pixel RGB from its inside neighbor so LinearFilter stays pure-hued!
        const s = objDef.sampleVolume(nx, ny, nz);
        colorBuf[o] = Math.max(0, Math.min(255, Math.round(s.r * 255)));
        colorBuf[o + 1] = Math.max(0, Math.min(255, Math.round(s.g * 255)));
        colorBuf[o + 2] = Math.max(0, Math.min(255, Math.round(s.b * 255)));
        propsBuf[o] = Math.max(0, Math.min(255, Math.round(s.roughness * 255)));
        propsBuf[o + 1] = Math.max(0, Math.min(255, Math.round(s.metalness * 255)));
        propsBuf[o + 2] = Math.max(0, Math.min(255, Math.round((s.emissive || 0) * 255)));
        propsBuf[o + 3] = 255;
      }
    }
  }
}
