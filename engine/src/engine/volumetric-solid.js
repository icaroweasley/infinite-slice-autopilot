import * as THREE from 'three';
import { bakeUltraHDSurface, bakeCutCapSlice } from './hd-surface-baker.js';

const CAP_RES = 512;

/**
 * Ultra-HD Volumetric 3D Solid Renderer:
 * - Bakes a 1024x1024 anisotropic mipmapped outer-surface atlas (`surfColorTex` + `surfPropsTex`)
 *   so every stripe, seed, logo, and surface detail is razor-sharp with ZERO voxel pixelation!
 * - Bakes a 512x512 anti-aliased 2D cross-section cut cap on every Tier 1A Z-slice (~40x sharper than 96px 3D!)
 * - Bakes an upgraded high-resolution 3D volume (`~160x120x128`) for fast high-cut slices & falling chunk interiors
 * - Draws exact phase-locked progressive X, Y, Z knife grooves strictly behind the moving blade edge
 */
export class VolumetricSolid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.objDef = null;
    this.colorTex = null;
    this.propsTex = null;
    this.surfColorTex = null;
    this.surfPropsTex = null;
    this.bakedOuterGeo = null;
    this.solidMesh = null;
    this.capMesh = null;
    this.zClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10.0);

    // Reusable 512x512 Ultra-HD dynamic cut-plane cross-section textures
    this.capColorBuf = new Uint8Array(CAP_RES * CAP_RES * 4);
    this.capPropsBuf = new Uint8Array(CAP_RES * CAP_RES * 4);
    this.capColorTex = new THREE.DataTexture(this.capColorBuf, CAP_RES, CAP_RES, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.capColorTex.minFilter = THREE.LinearFilter;
    this.capColorTex.magFilter = THREE.LinearFilter;
    this.capColorTex.anisotropy = 8;
    this.capColorTex.wrapS = THREE.ClampToEdgeWrapping;
    this.capColorTex.wrapT = THREE.ClampToEdgeWrapping;
    this.capColorTex.flipY = false;

    this.capPropsTex = new THREE.DataTexture(this.capPropsBuf, CAP_RES, CAP_RES, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.capPropsTex.minFilter = THREE.LinearFilter;
    this.capPropsTex.magFilter = THREE.LinearFilter;
    this.capPropsTex.anisotropy = 8;
    this.capPropsTex.wrapS = THREE.ClampToEdgeWrapping;
    this.capPropsTex.wrapT = THREE.ClampToEdgeWrapping;
    this.capPropsTex.flipY = false;
    this._lastCapBakedZ = 1e9;

    // Shared uniform block updated every frame by knife & round controller
    this.uniforms = {
      uColorVolume: { value: null },
      uPropsVolume: { value: null },
      uSurfColorMap: { value: null },
      uSurfPropsMap: { value: null },
      uCapColorMap: { value: this.capColorTex },
      uCapPropsMap: { value: this.capPropsTex },
      uUseCap2D: { value: 0.0 },
      uBounds: { value: new THREE.Vector3(2, 1, 1.5) },
      uCapZ: { value: 0.0 },
      uNumX: { value: 5.0 },
      uNumY: { value: 2.0 },
      uNumZ: { value: 3.0 },
      uDoneX: { value: 0.0 },
      uDoneY: { value: 0.0 },
      uDoneZ: { value: 0.0 },
      uActiveAxis: { value: 0.0 },  // 0=none, 1=X, 2=Y, 3=Z
      uActiveDepth: { value: 1.0 }, // 1.0=clear, drops to 0.0 as blade passes through
      uSandGrain: { value: 0.0 },   // 0..1 micro-voxel visual texture intensity at 500/1000 cuts
    };
  }

  /**
   * Bakes the Ultra-HD 1024x1024 outer surface atlas + upgraded high-res 3D volumetric field.
   */
  loadObject(objDef) {
    this.disposeCurrent();
    this.objDef = objDef;
    this._lastCapBakedZ = 1e9;

    // 1. Upgraded 3D volume (~1.55x resolution per axis = ~3.7x more voxels for crisp falling-piece cut faces!)
    const baseRes = objDef.gridRes || { x: 96, y: 64, z: 76 };
    const rx = Math.min(168, Math.max(96, Math.round(baseRes.x * 1.55)));
    const ry = Math.min(128, Math.max(64, Math.round(baseRes.y * 1.55)));
    const rz = Math.min(136, Math.max(76, Math.round(baseRes.z * 1.55)));
    const total = rx * ry * rz;
    const colorData = new Uint8Array(total * 4);
    const propsData = new Uint8Array(total * 4);

    let ptr = 0;
    for (let iz = 0; iz < rz; iz++) {
      const nz = (iz + 0.5) / rz - 0.5;
      for (let iy = 0; iy < ry; iy++) {
        const ny = (iy + 0.5) / ry;
        for (let ix = 0; ix < rx; ix++) {
          const nx = (ix + 0.5) / rx - 0.5;
          const inside = objDef.contains(nx, ny, nz);
          const sample = objDef.sampleVolume(nx, ny, nz);

          colorData[ptr] = Math.round(Math.max(0, Math.min(1, sample.r)) * 255);
          colorData[ptr + 1] = Math.round(Math.max(0, Math.min(1, sample.g)) * 255);
          colorData[ptr + 2] = Math.round(Math.max(0, Math.min(1, sample.b)) * 255);
          colorData[ptr + 3] = inside ? 255 : 0;

          propsData[ptr] = Math.round(Math.max(0, Math.min(1, sample.roughness)) * 255);
          propsData[ptr + 1] = Math.round(Math.max(0, Math.min(1, sample.metalness)) * 255);
          propsData[ptr + 2] = Math.round(Math.max(0, Math.min(1, sample.emissive || 0)) * 255);
          propsData[ptr + 3] = 255;

          ptr += 4;
        }
      }
    }

    this.colorTex = new THREE.Data3DTexture(colorData, rx, ry, rz);
    this.colorTex.format = THREE.RGBAFormat;
    this.colorTex.type = THREE.UnsignedByteType;
    this.colorTex.minFilter = THREE.LinearFilter;
    this.colorTex.magFilter = THREE.LinearFilter;
    this.colorTex.wrapS = THREE.ClampToEdgeWrapping;
    this.colorTex.wrapT = THREE.ClampToEdgeWrapping;
    this.colorTex.wrapR = THREE.ClampToEdgeWrapping;
    this.colorTex.needsUpdate = true;

    this.propsTex = new THREE.Data3DTexture(propsData, rx, ry, rz);
    this.propsTex.format = THREE.RGBAFormat;
    this.propsTex.type = THREE.UnsignedByteType;
    this.propsTex.minFilter = THREE.LinearFilter;
    this.propsTex.magFilter = THREE.LinearFilter;
    this.propsTex.wrapS = THREE.ClampToEdgeWrapping;
    this.propsTex.wrapT = THREE.ClampToEdgeWrapping;
    this.propsTex.wrapR = THREE.ClampToEdgeWrapping;
    this.propsTex.needsUpdate = true;

    // 2. Ultra-HD 1024x1024 Outer Surface Atlas (use pre-baked authentic GLB/GLTF textures when provided!)
    const baked = objDef.bakedSurface || bakeUltraHDSurface(objDef, 1024);
    this.bakedOuterGeo = baked.geometry;
    this.surfColorTex = baked.surfColorTex;
    this.surfPropsTex = baked.surfPropsTex;

    const { w, h, d } = objDef.bounds;
    this.uniforms.uColorVolume.value = this.colorTex;
    this.uniforms.uPropsVolume.value = this.propsTex;
    this.uniforms.uSurfColorMap.value = this.surfColorTex;
    this.uniforms.uSurfPropsMap.value = this.surfPropsTex;
    this.uniforms.uUseCap2D.value = 0.0;
    this.uniforms.uBounds.value.set(w, h, d);

    // 3. Solid outer mesh (uses razor-sharp 1024x1024 surface atlas + hardware clip plane!)
    const solidMat = this._createVolumetricMaterial(false);
    solidMat.clippingPlanes = [this.zClipPlane];
    solidMat.clipShadows = true;
    this.solidMesh = new THREE.Mesh(this.bakedOuterGeo, solidMat);
    this.solidMesh.castShadow = true;
    this.solidMesh.receiveShadow = true;
    this.group.add(this.solidMesh);

    // 4. Dynamic solid cross-section cap facing +Z (uses 512x512 HD cut texture in Tier 1A!)
    const capGeo = new THREE.PlaneGeometry(w * 1.02, h * 1.02, 1, 1);
    capGeo.translate(0, h * 0.5, 0);
    const capMat = this._createVolumetricMaterial(true);
    this.capMesh = new THREE.Mesh(capGeo, capMat);
    this.capMesh.receiveShadow = true;
    this.capMesh.castShadow = false;
    this.capMesh.visible = false;
    this.group.add(this.capMesh);

    this.resetCuts(5, 2, 3);
  }

  _createVolumetricMaterial(isCap) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.05,
      side: isCap ? THREE.FrontSide : THREE.DoubleSide,
    });

    const sharedUniforms = this.uniforms;
    mat.customProgramCacheKey = () => (isCap ? 'volumetric-cap-hd-v2' : 'volumetric-solid-hd-v2');

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, sharedUniforms);
      shader.uniforms.uIsCap = { value: isCap ? 1.0 : 0.0 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
${isCap ? '' : 'attribute vec2 aSurfUv;'}
varying vec3 vObjPos;
varying vec2 vSurfUv;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vObjPos = position;
vSurfUv = ${isCap ? 'vec2(0.0)' : 'aSurfUv'};`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
precision highp sampler3D;
uniform highp sampler3D uColorVolume;
uniform highp sampler3D uPropsVolume;
uniform sampler2D uSurfColorMap;
uniform sampler2D uSurfPropsMap;
uniform sampler2D uCapColorMap;
uniform sampler2D uCapPropsMap;
uniform float uUseCap2D;
uniform vec3 uBounds;
uniform float uIsCap;
uniform float uCapZ;
uniform float uNumX;
uniform float uNumY;
uniform float uNumZ;
uniform float uDoneX;
uniform float uDoneY;
uniform float uDoneZ;
uniform float uActiveAxis;
uniform float uActiveDepth;
uniform float uSandGrain;
varying vec3 vObjPos;
varying vec2 vSurfUv;

float evalCutLine(float coord01, float numCuts, float doneCuts, float isActive, float progressMask) {
  if (numCuts < 0.5) return 0.0;
  float stepLen = 1.0 / (numCuts + 1.0);
  // Cuts march from coord = 1.0 down toward 0.0
  float idxFromHigh = (1.0 - coord01) / stepLen;
  float nearest = clamp(floor(idxFromHigh + 0.5), 1.0, numCuts);

  float visible = 0.0;
  if (nearest <= doneCuts + 0.001) {
    visible = 1.0;
  } else if (isActive > 0.5 && abs(nearest - (doneCuts + 1.0)) < 0.49) {
    visible = progressMask;
  }
  if (visible <= 0.001) return 0.0;

  float distCell = abs(idxFromHigh - nearest);
  // Anti-aliased crisp groove that scales naturally from chunky 10-cut slits to silky 1,000-cut grain
  float fw = fwidth(idxFromHigh);
  float halfW = max(0.028, min(0.24, fw * 0.65));
  float line = 1.0 - smoothstep(halfW * 0.35, halfW, distCell);
  // Gently soften contrast when grid cells become sub-pixel to eliminate moire
  float aaFade = 1.0 - smoothstep(0.65, 1.85, fw);
  return line * visible * mix(0.28, 1.0, aaFade);
}`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
vec3 volPos = uIsCap > 0.5 ? vec3(vObjPos.x, vObjPos.y, uCapZ) : vObjPos;
vec3 uvw = vec3(
  volPos.x / uBounds.x + 0.5,
  volPos.y / uBounds.y,
  volPos.z / uBounds.z + 0.5
);
vec3 uvwClamped = clamp(uvw, vec3(0.002), vec3(0.998));

vec4 volCol;
vec4 volProps;
if (uIsCap > 0.5) {
  if (uvw.x < 0.0 || uvw.x > 1.0 || uvw.y < 0.0 || uvw.y > 1.0) {
    discard;
  }
  if (uUseCap2D > 0.5) {
    volCol = texture2D(uCapColorMap, clamp(uvw.xy, vec2(0.001), vec2(0.999)));
    volProps = texture2D(uCapPropsMap, clamp(uvw.xy, vec2(0.001), vec2(0.999)));
    if (volCol.a < 0.48) discard;
  } else {
    volCol = texture(uColorVolume, uvwClamped);
    volProps = texture(uPropsVolume, uvwClamped);
    if (volCol.a < 0.46) discard;
  }
} else {
  // Razor-sharp 1024x1024 anisotropic mipmapped outer surface texture!
  volCol = texture2D(uSurfColorMap, vSurfUv);
  volProps = texture2D(uSurfPropsMap, vSurfUv);
}

// Convert sRGB sample to linear space identically to THREE.Color sRGB->Linear
vec3 volLinear = pow(max(volCol.rgb, vec3(0.0001)), vec3(2.2));

// Exact phase-locked progressive X, Y, Z knife grooves
float maskX = step(uActiveDepth, uvwClamped.y);
float maskY = step(uActiveDepth, uvwClamped.x);
float maskZ = step(uActiveDepth, uvwClamped.y);

float cutX = evalCutLine(uvwClamped.x, uNumX, uDoneX, (uActiveAxis > 0.5 && uActiveAxis < 1.5) ? 1.0 : 0.0, maskX);
float cutY = evalCutLine(uvwClamped.y, uNumY, uDoneY, (uActiveAxis > 1.5 && uActiveAxis < 2.5) ? 1.0 : 0.0, maskY);
float cutZ = uIsCap > 0.5 ? 0.0 : evalCutLine(uvwClamped.z, uNumZ, uDoneZ, (uActiveAxis > 2.5) ? 1.0 : 0.0, maskZ);

float cutIntensity = clamp(max(max(cutX, cutY), cutZ), 0.0, 1.0);

// Subtle fine granular kinetic-sand sparkle on exposed/scored faces at 500 & 1,000 cuts
float grainSpark = 0.0;
if (uSandGrain > 0.01) {
  float gHash = fract(sin(dot(floor(volPos * 165.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float scoredRegion = max(step(1.0 - (uDoneX / max(1.0, uNumX + 1.0)), uvwClamped.x), uIsCap);
  grainSpark = (gHash - 0.5) * 0.16 * uSandGrain * scoredRegion;
}

// Crisp shaded surface + tight dark knife slits
vec3 shadedCol = volLinear * (1.0 - cutIntensity * 0.66) + vec3(grainSpark * 0.35);
diffuseColor.rgb *= max(shadedCol, vec3(0.004));`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = clamp(volProps.r + cutIntensity * 0.35, 0.06, 0.96);`
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
metalnessFactor = clamp(volProps.g * (1.0 - cutIntensity * 0.7), 0.0, 0.96);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += volLinear * volProps.b * 1.55 * (1.0 - cutIntensity * 0.8);`
        );
    };

    return mat;
  }

  resetCuts(nx, ny, nz, sandGrain = 0.0) {
    if (!this.objDef) return;
    const { d } = this.objDef.bounds;
    this.uniforms.uNumX.value = nx;
    this.uniforms.uNumY.value = ny;
    this.uniforms.uNumZ.value = nz;
    this.uniforms.uDoneX.value = 0;
    this.uniforms.uDoneY.value = 0;
    this.uniforms.uDoneZ.value = 0;
    this.uniforms.uActiveAxis.value = 0;
    this.uniforms.uActiveDepth.value = 1.0;
    this.uniforms.uSandGrain.value = sandGrain;
    this._lastCapBakedZ = 1e9;

    this.setClipZ(d * 0.5 + 0.05, false);
    if (this.solidMesh) this.solidMesh.visible = true;
  }

  setCutState({ doneX, doneY, doneZ, activeAxis, activeDepth }) {
    this.uniforms.uDoneX.value = doneX;
    this.uniforms.uDoneY.value = doneY;
    this.uniforms.uDoneZ.value = doneZ;
    this.uniforms.uActiveAxis.value = activeAxis;
    this.uniforms.uActiveDepth.value = activeDepth;
  }

  /**
   * Advances the Z-clipping plane backward (from +d/2 toward -d/2),
   * baking a razor-sharp 512x512 HD cut cross-section on Tier 1A slices!
   */
  setClipZ(clipZ, showCap = true) {
    if (!this.objDef) return;
    const { d } = this.objDef.bounds;
    this.zClipPlane.constant = clipZ;
    const capZ = clipZ - 0.0015;
    this.uniforms.uCapZ.value = capZ;

    if (this.capMesh) {
      const withinBody = clipZ < d * 0.5 - 0.003 && clipZ > -d * 0.5 + 0.003;
      this.capMesh.position.z = clipZ - 0.001;
      this.capMesh.visible = showCap && withinBody;

      if (showCap && withinBody && this.uniforms.uNumZ.value < 8) {
        if (Math.abs(capZ - this._lastCapBakedZ) > 0.002) {
          bakeCutCapSlice(this.objDef, capZ, this.capColorBuf, this.capPropsBuf, CAP_RES);
          this.capColorTex.needsUpdate = true;
          this.capPropsTex.needsUpdate = true;
          this._lastCapBakedZ = capZ;
        }
        this.uniforms.uUseCap2D.value = 1.0;
      } else {
        this.uniforms.uUseCap2D.value = 0.0;
      }
    }
    if (this.solidMesh) {
      this.solidMesh.visible = clipZ > -d * 0.5 + 0.003;
    }
  }

  getVolumeData() {
    if (!this.objDef || !this.colorTex || !this.propsTex) return null;
    return {
      colorTex: this.colorTex,
      propsTex: this.propsTex,
      surfColorTex: this.surfColorTex,
      surfPropsTex: this.surfPropsTex,
      bakedOuterGeo: this.bakedOuterGeo,
      bounds: this.objDef.bounds,
    };
  }

  hideCompletely() {
    if (this.solidMesh) this.solidMesh.visible = false;
    if (this.capMesh) this.capMesh.visible = false;
  }

  disposeCurrent() {
    if (this.solidMesh) {
      this.group.remove(this.solidMesh);
      this.solidMesh.geometry.dispose();
      this.solidMesh.material.dispose();
      this.solidMesh = null;
      this.bakedOuterGeo = null;
    }
    if (this.capMesh) {
      this.group.remove(this.capMesh);
      this.capMesh.geometry.dispose();
      this.capMesh.material.dispose();
      this.capMesh = null;
    }
    if (this.colorTex) {
      this.colorTex.dispose();
      this.colorTex = null;
    }
    if (this.propsTex) {
      this.propsTex.dispose();
      this.propsTex = null;
    }
    if (this.surfColorTex) {
      this.surfColorTex.dispose();
      this.surfColorTex = null;
    }
    if (this.surfPropsTex) {
      this.surfPropsTex.dispose();
      this.surfPropsTex = null;
    }
  }
}
