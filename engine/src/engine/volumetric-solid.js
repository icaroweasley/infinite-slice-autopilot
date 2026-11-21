import * as THREE from 'three';

/**
 * Volumetric 3D solid renderer:
 * - Bakes objDef.contains + objDef.sampleVolume into two WebGL2 Data3DTextures
 * - Renders smooth outer geometry with hardware clipping plane (also clips cast shadows!)
 * - Renders pixel-accurate solid cross-section cap at z = clipZ (supports hollow interiors like Geode!)
 * - Draws exact phase-locked progressive X, Y, Z knife slits strictly behind the moving blade edge
 */
export class VolumetricSolid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.objDef = null;
    this.colorTex = null;
    this.propsTex = null;
    this.solidMesh = null;
    this.capMesh = null;
    this.zClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10.0);

    // Shared uniform block updated every frame by knife & round controller
    this.uniforms = {
      uColorVolume: { value: null },
      uPropsVolume: { value: null },
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
   * Bakes the procedural 3D volumetric field into Data3DTextures (~10-20ms).
   */
  loadObject(objDef) {
    this.disposeCurrent();
    this.objDef = objDef;

    const { x: rx, y: ry, z: rz } = objDef.gridRes;
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
          // Always sample RGB even near outside boundary so linear filtering never bleeds black edges!
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

    const { w, h, d } = objDef.bounds;
    this.uniforms.uColorVolume.value = this.colorTex;
    this.uniforms.uPropsVolume.value = this.propsTex;
    this.uniforms.uBounds.value.set(w, h, d);

    // 1. Solid outer mesh (clipped cleanly in world space + shadows via zClipPlane)
    const outerGeo = objDef.createOuterGeometry();
    const solidMat = this._createVolumetricMaterial(false);
    solidMat.clippingPlanes = [this.zClipPlane];
    solidMat.clipShadows = true;
    this.solidMesh = new THREE.Mesh(outerGeo, solidMat);
    this.solidMesh.castShadow = true;
    this.solidMesh.receiveShadow = true;
    this.group.add(this.solidMesh);

    // 2. Dynamic solid cross-section cap facing +Z (towards camera)
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
      roughness: 0.36,
      metalness: 0.04,
      side: isCap ? THREE.FrontSide : THREE.DoubleSide,
    });

    const sharedUniforms = this.uniforms;
    mat.customProgramCacheKey = () => (isCap ? 'volumetric-cap-photoreal-v3' : 'volumetric-solid-photoreal-v3');

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, sharedUniforms);
      shader.uniforms.uIsCap = { value: isCap ? 1.0 : 0.0 };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vObjPos;
varying mat3 vObjToView;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vObjPos = position;
vObjToView = mat3(modelViewMatrix);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
precision highp sampler3D;
uniform highp sampler3D uColorVolume;
uniform highp sampler3D uPropsVolume;
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
varying mat3 vObjToView;

float vHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Quintic C2 smooth 3D value noise (silky organic pebbles, zero blocky artifacts)
float vNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(vHash3(i + vec3(0.0, 0.0, 0.0)), vHash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(vHash3(i + vec3(0.0, 1.0, 0.0)), vHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(vHash3(i + vec3(0.0, 0.0, 1.0)), vHash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(vHash3(i + vec3(0.0, 1.0, 1.0)), vHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float surfaceMicroBump(vec3 p, float isCapFlag) {
  if (isCapFlag > 0.5) {
    return vNoise3(p * 30.0) * 0.65 + vNoise3(p * 60.0) * 0.35;
  }
  return vNoise3(p * 22.0) * 0.64 + vNoise3(p * 44.0) * 0.36;
}

// Analytical 3D finite-difference surface gradient (zero screen-space dFdx sparkle!)
vec3 surfaceBumpGrad(vec3 p, float isCapFlag) {
  float e = isCapFlag > 0.5 ? 0.004 : 0.0055;
  float dx = surfaceMicroBump(p + vec3(e, 0.0, 0.0), isCapFlag) - surfaceMicroBump(p - vec3(e, 0.0, 0.0), isCapFlag);
  float dy = surfaceMicroBump(p + vec3(0.0, e, 0.0), isCapFlag) - surfaceMicroBump(p - vec3(0.0, e, 0.0), isCapFlag);
  float dz = surfaceMicroBump(p + vec3(0.0, 0.0, e), isCapFlag) - surfaceMicroBump(p - vec3(0.0, 0.0, e), isCapFlag);
  return vec3(dx, dy, dz) / (2.0 * e);
}

// Returns vec2(grooveDarkness, signedBevelSlope) for crisp 3D V-groove cut slits
vec2 evalCutLine(float coord01, float numCuts, float doneCuts, float isActive, float progressMask) {
  if (numCuts < 0.5) return vec2(0.0);
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
  if (visible <= 0.001) return vec2(0.0);

  float signedDist = idxFromHigh - nearest;
  float distCell = abs(signedDist);
  // Anti-aliased crisp groove that scales naturally from chunky 10-cut slits to silky 1,000-cut grain
  float fw = fwidth(idxFromHigh);
  float halfW = max(0.032, min(0.22, fw * 0.68));
  float line = 1.0 - smoothstep(halfW * 0.28, halfW, distCell);
  // Subtle V-groove shoulder lip just outside the hairline cut to catch crisp studio rim specular
  float bevelBand = smoothstep(halfW * 0.2, halfW * 1.05, distCell) * (1.0 - smoothstep(halfW * 1.05, halfW * 2.4, distCell));
  // Gently soften contrast when grid cells become sub-pixel to eliminate moire
  float aaFade = 1.0 - smoothstep(0.65, 1.85, fw);
  float strength = visible * mix(0.28, 1.0, aaFade);
  return vec2(line * strength, sign(signedDist) * bevelBand * visible * aaFade);
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
vec4 volCol = texture(uColorVolume, uvwClamped);
vec4 volProps = texture(uPropsVolume, uvwClamped);

if (uIsCap > 0.5) {
  if (uvw.x < 0.0 || uvw.x > 1.0 || uvw.y < 0.0 || uvw.y > 1.0 || volCol.a < 0.46) {
    discard;
  }
}

// Convert sRGB volume sample to linear space identically to THREE.Color sRGB->Linear
vec3 volLinear = pow(max(volCol.rgb, vec3(0.0001)), vec3(2.2));

// Exact phase-locked progressive X, Y, Z knife grooves + analytical V-groove bevel slopes
float maskX = step(uActiveDepth, uvwClamped.y);
float maskY = step(uActiveDepth, uvwClamped.x);
float maskZ = step(uActiveDepth, uvwClamped.y);

vec2 cutX = evalCutLine(uvwClamped.x, uNumX, uDoneX, (uActiveAxis > 0.5 && uActiveAxis < 1.5) ? 1.0 : 0.0, maskX);
vec2 cutY = evalCutLine(uvwClamped.y, uNumY, uDoneY, (uActiveAxis > 1.5 && uActiveAxis < 2.5) ? 1.0 : 0.0, maskY);
vec2 cutZ = uIsCap > 0.5 ? vec2(0.0) : evalCutLine(uvwClamped.z, uNumZ, uDoneZ, (uActiveAxis > 2.5) ? 1.0 : 0.0, maskZ);

float cutIntensity = clamp(max(max(cutX.x, cutY.x), cutZ.x), 0.0, 1.0);
vec3 cutBevelObj = vec3(cutX.y, cutY.y, cutZ.y);

// Multi-scale organic micro-bump height (drives subtle cavity AO & smooth 3D analytical normal map)
float surfBump = surfaceMicroBump(volPos, uIsCap);
float microAO = uIsCap > 0.5 ? mix(0.97, 1.02, surfBump) : mix(0.93, 1.04, surfBump);
// Grounded contact ambient occlusion right where the object rests on the wooden board
float boardAO = mix(0.72, 1.0, smoothstep(0.0, 0.14, uvwClamped.y));
float capRimAO = uIsCap > 0.5 ? mix(0.86, 1.0, smoothstep(0.46, 0.64, volCol.a)) : 1.0;

// Subtle fine granular kinetic-sand sparkle on exposed/scored faces at 500 & 1,000 cuts
float grainSpark = 0.0;
if (uSandGrain > 0.01) {
  float gHash = fract(sin(dot(floor(volPos * 165.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float scoredRegion = max(step(1.0 - (uDoneX / max(1.0, uNumX + 1.0)), uvwClamped.x), uIsCap);
  grainSpark = (gHash - 0.5) * 0.16 * uSandGrain * scoredRegion;
}

// Fresh internal cross-section looks crisp and velvety; cut slits cast tight dark shadow
vec3 shadedCol = volLinear * microAO * boardAO * capRimAO * (1.0 - cutIntensity * 0.78) + vec3(grainSpark * 0.35);
diffuseColor.rgb *= max(shadedCol, vec3(0.004));`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
float sNonMetal = 1.0 - smoothstep(0.45, 0.85, volProps.g);
float sBaseR = uIsCap > 0.5
  ? clamp(volProps.r + 0.08, 0.28, 0.64)
  : mix(volProps.r, min(volProps.r, 0.28), sNonMetal * smoothstep(0.28, 0.60, volProps.r));
float microRoughVar = (surfBump - 0.5) * (uIsCap > 0.5 ? 0.05 : 0.10);
roughnessFactor = clamp(sBaseR + microRoughVar + cutIntensity * 0.38, 0.06, 0.96);`
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
metalnessFactor = clamp(volProps.g * (1.0 - cutIntensity * 0.7), 0.0, 0.96);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
{
  // Analytical 3D organic bump + crisp V-groove cut bevel (waxy Hass pebbles on rough fruit, silky gloss on smooth berries!)
  float nonMetal = 1.0 - smoothstep(0.45, 0.85, metalnessFactor);
  float organicAmt = smoothstep(0.24, 0.50, volProps.r);
  float bumpStr = uIsCap > 0.5 ? 0.006 : mix(0.005, 0.032, organicAmt * nonMetal);
  vec3 objGrad = surfaceBumpGrad(volPos, uIsCap) * bumpStr;
  vec3 viewPerturb = vObjToView * (objGrad - cutBevelObj * 0.38);
  vec3 tangPerturb = viewPerturb - normal * dot(viewPerturb, normal);
  normal = normalize(normal - tangPerturb);
}`
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
   * exposing the solid pixel-accurate internal cross-section cap facing +Z.
   */
  setClipZ(clipZ, showCap = true) {
    if (!this.objDef) return;
    const { d } = this.objDef.bounds;
    this.zClipPlane.constant = clipZ;
    this.uniforms.uCapZ.value = clipZ - 0.0015;

    if (this.capMesh) {
      const withinBody = clipZ < d * 0.5 - 0.003 && clipZ > -d * 0.5 + 0.003;
      this.capMesh.position.z = clipZ - 0.001;
      this.capMesh.visible = showCap && withinBody;
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
  }
}
