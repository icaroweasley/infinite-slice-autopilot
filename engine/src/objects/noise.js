// Deterministic 3D value noise helpers shared by volumetric object definitions

export function fract(x) {
  return x - Math.floor(x);
}

export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

export function valueNoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = lerp(n000, n100, ux);
  const nx10 = lerp(n010, n110, ux);
  const nx01 = lerp(n001, n101, ux);
  const nx11 = lerp(n011, n111, ux);

  const nxy0 = lerp(nx00, nx10, uy);
  const nxy1 = lerp(nx01, nx11, uy);

  return lerp(nxy0, nxy1, uz);
}

export function fbm3(x, y, z, octaves = 3) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise3(x * freq, y * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}
