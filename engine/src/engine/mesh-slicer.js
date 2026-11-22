import * as THREE from 'three';

/**
 * Exact 3D Mesh-to-Cell Silhouette Slicer (Sutherland-Hodgman 6-plane clipper + occupancy-culled cut caps).
 * Keeps curved / organic / multi-part silhouettes (Burgers, Avocados, Billiard Balls, Watches, Geodes, etc.)
 * 100% faithful to the true 3D object shape during low cut counts (Tier 1A: 3–25 CUTS) instead of blocky cubes!
 */

export function prepareSlicerSource(objDef, bakedOuterGeo = null) {
  const ownsGeo = !bakedOuterGeo;
  const raw = bakedOuterGeo || objDef.createOuterGeometry();
  const geo = ownsGeo ? (raw.index ? raw.toNonIndexed() : raw.clone()) : raw;
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }

  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const surfUv = geo.attributes.aSurfUv || geo.attributes.uv || null;
  const triCount = Math.floor(pos.count / 3);
  const triangles = new Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    const x0 = pos.getX(i0), y0 = pos.getY(i0), z0 = pos.getZ(i0);
    const x1 = pos.getX(i1), y1 = pos.getY(i1), z1 = pos.getZ(i1);
    const x2 = pos.getX(i2), y2 = pos.getY(i2), z2 = pos.getZ(i2);

    triangles[t] = {
      v0: {
        x: x0, y: y0, z: z0,
        nx: norm.getX(i0), ny: norm.getY(i0), nz: norm.getZ(i0),
        u: surfUv ? surfUv.getX(i0) : 0, v: surfUv ? surfUv.getY(i0) : 0,
      },
      v1: {
        x: x1, y: y1, z: z1,
        nx: norm.getX(i1), ny: norm.getY(i1), nz: norm.getZ(i1),
        u: surfUv ? surfUv.getX(i1) : 0, v: surfUv ? surfUv.getY(i1) : 0,
      },
      v2: {
        x: x2, y: y2, z: z2,
        nx: norm.getX(i2), ny: norm.getY(i2), nz: norm.getZ(i2),
        u: surfUv ? surfUv.getX(i2) : 0, v: surfUv ? surfUv.getY(i2) : 0,
      },
      minX: Math.min(x0, x1, x2),
      maxX: Math.max(x0, x1, x2),
      minY: Math.min(y0, y1, y2),
      maxY: Math.max(y0, y1, y2),
      minZ: Math.min(z0, z1, z2),
      maxZ: Math.max(z0, z1, z2),
    };
  }

  if (ownsGeo) {
    raw.dispose();
    geo.dispose();
  }
  return { triangles };
}

function clipPolygonAxis(poly, axis, bound, keepGreater) {
  const n = poly.length;
  if (n < 3) return [];
  const out = [];

  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = keepGreater ? a[axis] - bound : bound - a[axis];
    const db = keepGreater ? b[axis] - bound : bound - b[axis];
    const aIn = da >= -1e-6;
    const bIn = db >= -1e-6;

    if (aIn) out.push(a);

    if (aIn !== bIn) {
      const denom = da - db;
      const t = Math.abs(denom) > 1e-8 ? Math.max(0, Math.min(1, da / denom)) : 0.5;
      let nx = a.nx + (b.nx - a.nx) * t;
      let ny = a.ny + (b.ny - a.ny) * t;
      let nz = a.nz + (b.nz - a.nz) * t;
      const nl = Math.hypot(nx, ny, nz) || 1;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        nx: nx / nl,
        ny: ny / nl,
        nz: nz / nl,
        u: a.u + (b.u - a.u) * t,
        v: a.v + (b.v - a.v) * t,
      });
    }
  }
  return out;
}

/**
 * Clips the true 3D outer mesh to box [x0,x1] x [y0,y1] x [z0,z1] and synthesizes
 * occupancy-trimmed flat cross-section caps strictly on active interior knife cut planes.
 * Returns { geometry, center: {x,y,z}, halfExtents: {x,y,z} } or null if cell is empty.
 */
export function buildClippedPieceGeometry(source, objDef, box, cutFlags) {
  const { x0, x1, y0, y1, z0, z1 } = box;
  const { w, h, d } = objDef.bounds;

  const positions = [];
  const normals = [];
  const origPositions = [];
  const surfUvs = [];
  const isCapList = [];

  const pushTri = (a, b, c, isCap) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    normals.push(a.nx, a.ny, a.nz, b.nx, b.ny, b.nz, c.nx, c.ny, c.nz);
    origPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    surfUvs.push(a.u || 0, a.v || 0, b.u || 0, b.v || 0, c.u || 0, c.v || 0);
    isCapList.push(isCap, isCap, isCap);
  };

  // 1. Exact curved outer shell clipped cleanly to the 6 cell planes.
  // CRITICAL: On outer object boundaries (where cutFlags.* is false), expand bounds outward by +0.08
  // so Float32Array precision (+2e-8 on flat BoxGeometry tops like Chocolate Bar / Cash / Cheese)
  // NEVER deletes the object's own outer skin or leaves sliced chunks hollow!
  const bx0 = cutFlags.negX ? x0 : x0 - 0.08;
  const bx1 = cutFlags.posX ? x1 : x1 + 0.08;
  const by0 = cutFlags.negY ? y0 : y0 - 0.08;
  const by1 = cutFlags.posY ? y1 : y1 + 0.08;
  const bz0 = cutFlags.negZ ? z0 : z0 - 0.08;
  const bz1 = cutFlags.posZ ? z1 : z1 + 0.08;
  const AABB_EPS = 0.002;

  const tris = source.triangles;
  for (let i = 0; i < tris.length; i++) {
    const tr = tris[i];
    if (
      tr.maxX < bx0 - AABB_EPS || tr.minX > bx1 + AABB_EPS ||
      tr.maxY < by0 - AABB_EPS || tr.minY > by1 + AABB_EPS ||
      tr.maxZ < bz0 - AABB_EPS || tr.minZ > bz1 + AABB_EPS
    ) {
      continue;
    }

    let poly = [tr.v0, tr.v1, tr.v2];
    poly = clipPolygonAxis(poly, 'x', bx0, true);
    if (poly.length < 3) continue;
    poly = clipPolygonAxis(poly, 'x', bx1, false);
    if (poly.length < 3) continue;
    poly = clipPolygonAxis(poly, 'y', by0, true);
    if (poly.length < 3) continue;
    poly = clipPolygonAxis(poly, 'y', by1, false);
    if (poly.length < 3) continue;
    poly = clipPolygonAxis(poly, 'z', bz0, true);
    if (poly.length < 3) continue;
    poly = clipPolygonAxis(poly, 'z', bz1, false);
    if (poly.length < 3) continue;

    for (let k = 1; k < poly.length - 1; k++) {
      pushTri(poly[0], poly[k], poly[k + 1], 0.0);
    }
  }

  // 2. Occupancy-culled flat cross-section caps ONLY along real interior knife cut planes
  // Fragment shader performs pixel-accurate Data3DTexture alpha discard (volCol.a < 0.44),
  // while CPU 6x6 sub-quad culling keeps cast shadows & physics bounds tightly hugging curved silhouettes!
  const SUB = 6;
  const epsX = Math.min(0.014, (x1 - x0) * 0.08);
  const epsY = Math.min(0.014, (y1 - y0) * 0.08);
  const epsZ = Math.min(0.014, (z1 - z0) * 0.08);

  const cellContainsAny = (pts) => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const nx = p[0] / w;
      const ny = p[1] / h;
      const nz = p[2] / d;
      if (objDef.contains(nx, ny, nz)) return true;
    }
    return false;
  };

  const addCapPlane = (u0, u1, v0, v1, makePt, normal) => {
    const du = (u1 - u0) / SUB;
    const dv = (v1 - v0) / SUB;
    for (let iu = 0; iu < SUB; iu++) {
      const ua = u0 + iu * du;
      const ub = ua + du;
      const um = (ua + ub) * 0.5;
      for (let iv = 0; iv < SUB; iv++) {
        const va = v0 + iv * dv;
        const vb = va + dv;
        const vm = (va + vb) * 0.5;

        const p00 = makePt(ua, va);
        const p10 = makePt(ub, va);
        const p11 = makePt(ub, vb);
        const p01 = makePt(ua, vb);
        const pm = makePt(um, vm);

        if (!cellContainsAny([pm, p00, p10, p11, p01])) continue;

        const v00 = { x: p00[0], y: p00[1], z: p00[2], nx: normal[0], ny: normal[1], nz: normal[2] };
        const v10 = { x: p10[0], y: p10[1], z: p10[2], nx: normal[0], ny: normal[1], nz: normal[2] };
        const v11 = { x: p11[0], y: p11[1], z: p11[2], nx: normal[0], ny: normal[1], nz: normal[2] };
        const v01 = { x: p01[0], y: p01[1], z: p01[2], nx: normal[0], ny: normal[1], nz: normal[2] };
        pushTri(v00, v10, v11, 1.0);
        pushTri(v00, v11, v01, 1.0);
      }
    }
  };

  // +Z cut cap (facing camera)
  if (cutFlags.posZ) {
    addCapPlane(x0, x1, y0, y1, (u, v) => [u, v, z1 - epsZ * 0.15], [0, 0, 1]);
  }
  // -Z cut cap (facing back) — reversed winding so normal points -Z
  if (cutFlags.negZ) {
    addCapPlane(x0, x1, y0, y1, (u, v) => [u, y0 + y1 - v, z0 + epsZ * 0.15], [0, 0, -1]);
  }
  // +X cut cap (facing right)
  if (cutFlags.posX) {
    addCapPlane(z1, z0, y0, y1, (u, v) => [x1 - epsX * 0.15, v, u], [1, 0, 0]);
  }
  // -X cut cap (facing left)
  if (cutFlags.negX) {
    addCapPlane(z0, z1, y0, y1, (u, v) => [x0 + epsX * 0.15, v, u], [-1, 0, 0]);
  }
  // +Y cut cap (facing up)
  if (cutFlags.posY) {
    addCapPlane(x0, x1, z1, z0, (u, v) => [u, y1 - epsY * 0.15, v], [0, 1, 0]);
  }
  // -Y cut cap (facing down)
  if (cutFlags.negY) {
    addCapPlane(x0, x1, z0, z1, (u, v) => [u, y0 + epsY * 0.15, v], [0, -1, 0]);
  }

  if (positions.length < 9) return null;

  // Compute tight actual piece bounding box so Rapier3D physics & resting height match the curved silhouette
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const px = positions[i];
    const py = positions[i + 1];
    const pz = positions[i + 2];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
    if (pz < minZ) minZ = pz;
    if (pz > maxZ) maxZ = pz;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  if (spanX * spanY * spanZ < 0.00045 || Math.max(spanX, spanY, spanZ) < 0.045) return null;
  const halfX = Math.max(0.018, spanX * 0.5);
  const halfY = Math.max(0.018, spanY * 0.5);
  const halfZ = Math.max(0.018, spanZ * 0.5);

  // Recenter local mesh vertices around piece centroid while preserving exact uncut aOrigPos & aSurfUv
  const posArr = new Float32Array(positions.length);
  const origArr = new Float32Array(origPositions.length);
  const normArr = new Float32Array(normals);
  const surfUvArr = new Float32Array(surfUvs);
  const capArr = new Float32Array(isCapList);

  // Micro shrink (~1.2%) around centroid gives clean visible hair-thin slice separation without boxy gaps
  const shrink = 0.985;
  for (let i = 0; i < positions.length; i += 3) {
    posArr[i] = (positions[i] - cx) * shrink;
    posArr[i + 1] = (positions[i + 1] - cy) * shrink;
    posArr[i + 2] = (positions[i + 2] - cz) * shrink;

    origArr[i] = origPositions[i];
    origArr[i + 1] = Math.max(0.002, origPositions[i + 1]);
    origArr[i + 2] = origPositions[i + 2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  geometry.setAttribute('aOrigPos', new THREE.BufferAttribute(origArr, 3));
  geometry.setAttribute('aSurfUv', new THREE.BufferAttribute(surfUvArr, 2));
  geometry.setAttribute('aIsCap', new THREE.BufferAttribute(capArr, 1));
  geometry.computeBoundingSphere();

  return {
    geometry,
    center: { x: cx, y: cy, z: cz },
    halfExtents: { x: halfX * shrink, y: halfY * shrink, z: halfZ * shrink },
  };
}
