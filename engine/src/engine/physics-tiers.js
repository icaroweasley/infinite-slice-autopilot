import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BOARD_W, BOARD_D, BOARD_H } from './environments.js';
import { estimateFillRatio } from '../objects/registry.js';
import { prepareSlicerSource, buildClippedPieceGeometry } from './mesh-slicer.js';

const HF_NX = 128;
const HF_NZ = 96;
const HF_W = BOARD_W * 0.98;
const HF_D = BOARD_D * 0.98;
const HF_CELL_X = HF_W / (HF_NX - 1);
const HF_CELL_Z = HF_D / (HF_NZ - 1);

const TIER1B_MAX_INSTANCES = 6000;
const TIER1B_MAX_ACTIVE_RAPIER = 820;
const TIER2_MAX_INSTANCES = 52000;
const TIER3_MAX_PARTICLES = 130000;

const _dummy = new THREE.Object3D();
const _tmpColor = new THREE.Color();

/**
 * 3-Tier True-Scale Photorealistic Physics & Granular Avalanche Engine:
 * - Tier 1A (10 cuts): Rapier3D rigid bodies + Per-Pixel GPU Data3DTexture Volumetric PBR Shader (ZERO vertex-color blur!)
 * - Tier 1B (50 cuts): Rapier3D rigid bodies (with smart auto-freeze) + exact-scale InstancedMesh
 * - Tier 2  (100-250 cuts): Exact-scale InstancedMesh (up to 52,000 cubes) + discrete micro-cube heightfield pile
 * - Tier 3  (500-1,000 cuts): 130,000-grain lit Points cloud + NearestFilter dual-pigment micro-normal kinetic sand heap
 */
export class PhysicsTierEngine {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.rapierReady = false;
    this.world = null;

    this.activeTier = 1;
    this.subMode = '1A';
    this.objDef = null;
    this.nx = 5;
    this.ny = 2;
    this.nz = 3;
    this.dx = 0.4;
    this.dy = 0.3;
    this.dz = 0.4;
    this.totalLogicalCubes = 0;
    this.totalVisualPieces = 0;

    // Tier 1A: individual Rapier3D true-silhouette clipped chunks rendered with per-pixel 3D volumetric GPU shader!
    this.tier1AChunks = [];
    this.tier1ASource = null;
    this.tier1AUniforms = {
      uChunkColorVol: { value: null },
      uChunkPropsVol: { value: null },
      uChunkSurfColorMap: { value: null },
      uChunkSurfPropsMap: { value: null },
      uChunkBounds: { value: new THREE.Vector3(2, 1, 1.5) },
    };
    this.tier1AMaterial = this._createTier1AVolumetricMaterial();

    // Tier 1B: InstancedMesh + Rapier rigid bodies (with auto-freeze ring)
    this.tier1BGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tier1BMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.40,
      metalness: 0.10,
    });
    this.tier1BMesh = new THREE.InstancedMesh(this.tier1BGeo, this.tier1BMat, TIER1B_MAX_INSTANCES);
    this.tier1BMesh.castShadow = true;
    this.tier1BMesh.receiveShadow = true;
    this.tier1BMesh.count = 0;
    this.tier1BMesh.visible = false;
    this.tier1BMesh.frustumCulled = false;
    this.group.add(this.tier1BMesh);
    this.tier1BBodies = [];
    this.tier1BCount = 0;

    // Tier 2: Exact-scale InstancedMesh + flat Float32Array solver
    this.tier2Geo = new THREE.BoxGeometry(1, 1, 1);
    this.tier2Mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.46,
      metalness: 0.08,
    });
    this.tier2Mesh = new THREE.InstancedMesh(this.tier2Geo, this.tier2Mat, TIER2_MAX_INSTANCES);
    this.tier2Mesh.castShadow = true;
    this.tier2Mesh.receiveShadow = true;
    this.tier2Mesh.count = 0;
    this.tier2Mesh.visible = false;
    this.tier2Mesh.frustumCulled = false;
    this.group.add(this.tier2Mesh);

    this.t2State = new Uint8Array(TIER2_MAX_INSTANCES);
    this.t2X = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2Y = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2Z = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2VX = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2VY = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2VZ = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2RX = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2RY = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2RZ = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2AVX = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2AVY = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2AVZ = new Float32Array(TIER2_MAX_INSTANCES);
    this.t2CR = new Uint8Array(TIER2_MAX_INSTANCES);
    this.t2CG = new Uint8Array(TIER2_MAX_INSTANCES);
    this.t2CB = new Uint8Array(TIER2_MAX_INSTANCES);
    this.t2Cursor = 0;
    this.t2Allocated = 0;
    this.t2ActiveList = [];

    // Shared Heightfield + Dual-Pigment NearestFilter True-Granular Sand Mound
    this.hfSize = HF_NX * HF_NZ;
    this.hfH = new Float32Array(this.hfSize);
    this.hfRelief = new Float32Array(this.hfSize);
    for (let i = 0; i < this.hfSize; i++) {
      // Deterministic tiny organic dune lumpiness so pile silhouettes never look like smooth geometric tents
      const gx = i % HF_NX;
      const gz = (i - gx) / HF_NX;
      const n1 = Math.sin(gx * 0.43 + gz * 0.31) * Math.cos(gx * 0.27 - gz * 0.51);
      const n2 = Math.sin(gx * 1.17 - gz * 0.89);
      this.hfRelief[i] = (n1 * 0.65 + n2 * 0.35) * 0.016;
    }

    // Two un-blended sRGB byte DataTextures (NearestFilter) so pigments NEVER smear into muddy grey/pink!
    this.hfBytesA = new Uint8Array(this.hfSize * 4);
    this.hfBytesB = new Uint8Array(this.hfSize * 4);
    this.hfTexA = new THREE.DataTexture(this.hfBytesA, HF_NX, HF_NZ, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.hfTexA.minFilter = THREE.NearestFilter;
    this.hfTexA.magFilter = THREE.NearestFilter;
    this.hfTexA.wrapS = THREE.ClampToEdgeWrapping;
    this.hfTexA.wrapT = THREE.ClampToEdgeWrapping;
    this.hfTexA.flipY = false;

    this.hfTexB = new THREE.DataTexture(this.hfBytesB, HF_NX, HF_NZ, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.hfTexB.minFilter = THREE.NearestFilter;
    this.hfTexB.magFilter = THREE.NearestFilter;
    this.hfTexB.wrapS = THREE.ClampToEdgeWrapping;
    this.hfTexB.wrapT = THREE.ClampToEdgeWrapping;
    this.hfTexB.flipY = false;

    this.hfDirty = false;
    this.moundVisible = false;
    this._moundFrameCounter = 0;
    this._depositToggle = 0;
    this._initMoundMesh();

    // Tier 3: 130,000-Grain Lit Micro-Voxel Points Cloud
    this._initTier3Points();
  }

  _createTier1AVolumetricMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const shared = this.tier1AUniforms;
    mat.customProgramCacheKey = () => 'tier1a-true-silhouette-hd-v4';

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aOrigPos;
attribute vec2 aSurfUv;
attribute float aIsCap;
varying vec3 vOrigPos;
varying vec2 vSurfUv;
varying float vIsCap;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vOrigPos = aOrigPos;
vSurfUv = aSurfUv;
vIsCap = aIsCap;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
precision highp sampler3D;
uniform highp sampler3D uChunkColorVol;
uniform highp sampler3D uChunkPropsVol;
uniform sampler2D uChunkSurfColorMap;
uniform sampler2D uChunkSurfPropsMap;
uniform vec3 uChunkBounds;
varying vec3 vOrigPos;
varying vec2 vSurfUv;
varying float vIsCap;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
vec4 volCol;
vec4 volProps;
float cutEdgeShade = 1.0;
if (vIsCap > 0.5) {
  vec3 uvw = clamp(vec3(
    vOrigPos.x / uChunkBounds.x + 0.5,
    vOrigPos.y / uChunkBounds.y,
    vOrigPos.z / uChunkBounds.z + 0.5
  ), vec3(0.002), vec3(0.998));
  volCol = texture(uChunkColorVol, uvw);
  // Pixel-accurate silhouette trim on flat knife-cut cross-section caps (preserves round/organic & hollow shapes!)
  if (volCol.a < 0.44) discard;
  volProps = texture(uChunkPropsVol, uvw);
  cutEdgeShade = mix(0.86, 1.0, smoothstep(0.44, 0.62, volCol.a));
} else {
  // Razor-sharp 1024x1024 anisotropic mipmapped outer surface texture on curved falling pieces!
  volCol = texture2D(uChunkSurfColorMap, vSurfUv);
  volProps = texture2D(uChunkSurfPropsMap, vSurfUv);
}
vec3 volLinear = pow(max(volCol.rgb, vec3(0.0001)), vec3(2.2));
diffuseColor.rgb *= max(volLinear * cutEdgeShade, vec3(0.004));`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = clamp(volProps.r, 0.06, 0.96);`
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
metalnessFactor = clamp(volProps.g, 0.0, 0.96);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += volLinear * volProps.b * 1.55;`
        );
    };
    return mat;
  }

  async init() {
    if (this.rapierReady) return;
    await RAPIER.init();
    this.rapierReady = true;
    this._rebuildRapierWorld();
  }

  _rebuildRapierWorld() {
    if (!this.rapierReady) return;
    if (this.world) this.world.free();
    this.world = new RAPIER.World({ x: 0.0, y: -15.5, z: 0.0 });

    const boardBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(BOARD_W * 0.5, 0.25, BOARD_D * 0.5).setFriction(0.68).setRestitution(0.14),
      boardBody
    );

    const counterBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -BOARD_H - 0.25, 0)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(8.0, 0.25, 8.0).setFriction(0.75).setRestitution(0.1),
      counterBody
    );
  }

  _initMoundMesh() {
    const geo = new THREE.PlaneGeometry(HF_W, HF_D, HF_NX - 1, HF_NZ - 1);
    geo.rotateX(-Math.PI * 0.5);

    this.moundUniforms = {
      uGrainFreq: { value: 220.0 },
      uHfTexA: { value: this.hfTexA },
      uHfTexB: { value: this.hfTexB },
      uHfSize: { value: new THREE.Vector2(HF_W, HF_D) },
      uHfRes: { value: new THREE.Vector2(HF_NX, HF_NZ) },
    };

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.FrontSide,
    });
    mat.customProgramCacheKey = () => 'true-granular-sand-mound-v2';

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.moundUniforms);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMoundPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoundPos = position;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uGrainFreq;
uniform sampler2D uHfTexA;
uniform sampler2D uHfTexB;
uniform vec2 uHfSize;
uniform vec2 uHfRes;
varying vec3 vMoundPos;

float gHash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
// Discrete world-space 3D micro-grain voxel coordinates (zero smooth blur!)
vec3 gCell = floor(vMoundPos * uGrainFreq);
float h1 = gHash(gCell);
float h2 = gHash(gCell + vec3(19.1, 37.7, 11.3));
float h3 = gHash(gCell + vec3(47.3, 13.9, 61.7));

// Feathered stochastic granular perimeter so mound dissolves seamlessly into scattered loose grains!
// Strict y >= 0.0035 + <= check prevents stray black dots on an empty cutting board before pieces fall!
if (vMoundPos.y < 0.0035) discard;
float edgeDensity = smoothstep(0.0035, 0.028, vMoundPos.y);
if (edgeDensity <= h2) discard;

// Jittered NearestFilter lookup into un-blended pure pigment textures A & B:
// ZERO muddy color averaging and ZERO parallel grid stripes — authentic organic speckled micro-cube sand!
vec2 baseUv = vec2(vMoundPos.x / uHfSize.x + 0.5, vMoundPos.z / uHfSize.y + 0.5);
float h4 = gHash(gCell + vec3(91.7, 29.3, 53.1));
vec2 jitter = (vec2(h1, h4) - 0.5) * (2.8 / uHfRes);
vec2 uvSample = clamp(baseUv + jitter, vec2(0.004), vec2(0.996));

vec4 colA = texture2D(uHfTexA, uvSample);
vec4 colB = texture2D(uHfTexB, uvSample);
vec3 srgbGrain = (h2 > 0.50 && colB.a > 0.5) ? colB.rgb : colA.rgb;
vec3 linGrain = pow(max(srgbGrain, vec3(0.0001)), vec3(2.2));

// Individual micro-cube crevice shadows & discrete per-grain luminance variation
vec3 fCell = fract(vMoundPos * uGrainFreq);
vec3 edgeDist = min(fCell, 1.0 - fCell);
float crevice = smoothstep(0.0, 0.18, min(min(edgeDist.x, edgeDist.y), edgeDist.z));
float grainVar = mix(0.66, 1.24, h3);
float microGlint = smoothstep(0.982, 1.0, h1 * h2) * 0.28;

diffuseColor.rgb *= max(linGrain * grainVar * mix(0.72, 1.08, crevice) + vec3(microGlint), vec3(0.004));`
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
// Per-grain randomized micro-facet normal! Completely breaks up smooth plastic/rubber shading into gritty sand!
vec3 microN = normalize(vec3(h1 - 0.5, h2 - 0.5, h3 - 0.5));
normal = normalize(normal + microN * 0.62);`
        );
    };

    this.moundMesh = new THREE.Mesh(geo, mat);
    this.moundMesh.castShadow = false;
    this.moundMesh.receiveShadow = true;
    this.moundMesh.visible = false;
    this.moundMesh.frustumCulled = false;
    this.group.add(this.moundMesh);
  }

  _initTier3Points() {
    this.pPos = new Float32Array(TIER3_MAX_PARTICLES * 3);
    this.pCol = new Float32Array(TIER3_MAX_PARTICLES * 3);
    this.pVel = new Float32Array(TIER3_MAX_PARTICLES * 3);
    this.pState = new Uint8Array(TIER3_MAX_PARTICLES);
    this.pCursor = 0;
    this.pAllocated = 0;
    this.pActiveList = [];

    const geo = new THREE.BufferGeometry();
    this.pPosAttr = new THREE.BufferAttribute(this.pPos, 3);
    this.pPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.pColAttr = new THREE.BufferAttribute(this.pCol, 3);
    this.pColAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pPosAttr);
    geo.setAttribute('color', this.pColAttr);
    geo.setDrawRange(0, 0);

    this.pUniforms = {
      uPointScale: { value: 26.0 },
      uLightDir: { value: new THREE.Vector3(0.42, 0.80, 0.42).normalize() },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.pUniforms,
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        varying float vSpark;
        uniform float uPointScale;
        void main() {
          vColor = color;
          vSpark = fract(sin(dot(position.xyz * 73.1, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uPointScale / max(1.0, -mvPosition.z), 1.45, 4.4);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vSpark;
        uniform vec3 uLightDir;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          if (max(abs(p.x), abs(p.y)) > 0.94) discard;
          vec3 n = normalize(vec3(p.x * 0.55, -p.y * 0.55, 0.85));
          float diff = 0.52 + 0.56 * max(0.0, dot(n, uLightDir));
          float glint = smoothstep(0.90, 1.0, vSpark) * 0.16;
          vec3 col = vColor * diff + vec3(glint);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      depthWrite: true,
      depthTest: true,
    });

    this.tier3Points = new THREE.Points(geo, mat);
    this.tier3Points.visible = false;
    this.tier3Points.frustumCulled = false;
    this.group.add(this.tier3Points);
  }

  prepareRound({ objDef, totalCuts, nx, ny, nz, volumeData }) {
    this.clearAll();
    this.objDef = objDef;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.totalCuts = totalCuts;
    this.dx = objDef.bounds.w / (nx + 1);
    this.dy = objDef.bounds.h / (ny + 1);
    this.dz = objDef.bounds.d / (nz + 1);
    this.totalLogicalCubes = 0;
    this.totalVisualPieces = 0;

    if (volumeData) {
      this.tier1AUniforms.uChunkColorVol.value = volumeData.colorTex;
      this.tier1AUniforms.uChunkPropsVol.value = volumeData.propsTex;
      this.tier1AUniforms.uChunkSurfColorMap.value = volumeData.surfColorTex;
      this.tier1AUniforms.uChunkSurfPropsMap.value = volumeData.surfPropsTex;
      this.tier1AUniforms.uChunkBounds.value.set(volumeData.bounds.w, volumeData.bounds.h, volumeData.bounds.d);
    }

    const totalGridCells = (nx + 1) * (ny + 1) * (nz + 1);

    if (totalCuts <= 25 && totalGridCells <= 360) {
      this.activeTier = 1;
      this.subMode = '1A';
      this.tier1ASource = prepareSlicerSource(objDef, volumeData?.bakedOuterGeo || null);
    } else if (totalCuts <= 65 && totalGridCells <= TIER1B_MAX_INSTANCES) {
      this.activeTier = 1;
      this.subMode = '1B';
      this.tier1BMat.roughness = objDef.physics.soundProfile === 'tech' ? 0.28 : 0.42;
      this.tier1BMat.metalness = objDef.physics.soundProfile === 'tech' || objDef.physics.soundProfile === 'metal' ? 0.35 : 0.06;
      this.tier1BMesh.visible = true;
    } else if (totalCuts <= 300) {
      this.activeTier = 2;
      this.subMode = '2';
      this.tier2Mat.roughness = objDef.physics.soundProfile === 'tech' ? 0.30 : 0.46;
      this.tier2Mat.metalness = objDef.physics.soundProfile === 'tech' || objDef.physics.soundProfile === 'metal' ? 0.30 : 0.06;
      this.tier2Mesh.visible = true;
      // Keep mound hidden until the FIRST grain actually lands on the board (zero stray spots before cutting!)
      this.moundEnabled = totalCuts >= 200;
      this.moundVisible = false;
      this.moundMesh.visible = false;
      this.moundUniforms.uGrainFreq.value = Math.min(240, 1.0 / Math.max(0.005, this.dx));
    } else {
      this.activeTier = 3;
      this.subMode = '3';
      this.moundEnabled = true;
      this.moundVisible = false;
      this.moundMesh.visible = false;
      this.tier3Points.visible = true;
      this.pUniforms.uPointScale.value = totalCuts >= 900 ? 22.0 : 29.0;
      this.moundUniforms.uGrainFreq.value = totalCuts >= 900 ? 275.0 : 195.0;
    }
  }

  clearAll() {
    for (const item of this.tier1AChunks) {
      this.group.remove(item.mesh);
      item.mesh.geometry.dispose();
    }
    this.tier1AChunks.length = 0;

    this.tier1BBodies.length = 0;
    this.tier1BCount = 0;
    this.tier1BMesh.count = 0;
    this.tier1BMesh.visible = false;

    if (this.rapierReady) this._rebuildRapierWorld();

    this.t2State.fill(0);
    this.t2Cursor = 0;
    this.t2Allocated = 0;
    this.t2ActiveList.length = 0;
    this.tier2Mesh.count = 0;
    this.tier2Mesh.visible = false;

    this.hfH.fill(0);
    this.hfBytesA.fill(0);
    this.hfBytesB.fill(0);
    this.hfDirty = true;
    this._syncMoundGeometry();
    this.moundMesh.visible = false;
    this.moundVisible = false;
    this.moundEnabled = false;

    this.pState.fill(0);
    this.pCursor = 0;
    this.pAllocated = 0;
    this.pActiveList.length = 0;
    this.tier3Points.geometry.setDrawRange(0, 0);
    this.tier3Points.visible = false;

    this.totalLogicalCubes = 0;
    this.totalVisualPieces = 0;
  }

  releaseZSlice(zFront, zBack, isFinalBackSlab = false) {
    if (!this.objDef) return 0;
    if (this.subMode === '1A') return this._releaseTier1A(zFront, zBack, isFinalBackSlab);
    if (this.subMode === '1B') return this._releaseTier1B(zFront, zBack, isFinalBackSlab);
    if (this.subMode === '2') return this._releaseTier2(zFront, zBack, isFinalBackSlab);
    return this._releaseTier3(zFront, zBack, isFinalBackSlab);
  }

  _releaseTier1A(zFront, zBack, isFinalBackSlab) {
    const { w, h, d } = this.objDef.bounds;
    const { friction, restitution } = this.objDef.physics;
    const sliceD = Math.max(0.02, zFront - zBack);
    const z0 = Math.max(-d * 0.5, zBack);
    const z1 = Math.min(d * 0.5, zFront);
    const hasNegZCut = z0 > -d * 0.5 + 0.008;
    const hasPosZCut = z1 < d * 0.5 - 0.008;

    if (!this.tier1ASource) {
      this.tier1ASource = prepareSlicerSource(this.objDef);
    }

    let released = 0;
    for (let ix = 0; ix <= this.nx; ix++) {
      const x0 = -w * 0.5 + ix * this.dx;
      const x1 = x0 + this.dx;
      for (let iy = 0; iy <= this.ny; iy++) {
        const y0 = iy * this.dy;
        const y1 = y0 + this.dy;

        const piece = buildClippedPieceGeometry(
          this.tier1ASource,
          this.objDef,
          { x0, x1, y0, y1, z0, z1 },
          {
            negX: ix > 0,
            posX: ix < this.nx,
            negY: iy > 0,
            posY: iy < this.ny,
            negZ: hasNegZCut,
            posZ: hasPosZCut,
          }
        );
        if (!piece) continue;

        const { geometry, center, halfExtents } = piece;
        const mesh = new THREE.Mesh(geometry, this.tier1AMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(center.x, center.y, center.z);
        this.group.add(mesh);

        let body = null;
        if (this.world) {
          const desc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(center.x, Math.max(halfExtents.y + 0.006, center.y + 0.006), center.z)
            .setLinearDamping(0.22)
            .setAngularDamping(0.28);
          body = this.world.createRigidBody(desc);
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(
              Math.max(0.014, halfExtents.x * 0.94),
              Math.max(0.014, halfExtents.y * 0.94),
              Math.max(0.014, halfExtents.z * 0.94)
            )
              .setFriction(friction)
              .setRestitution(restitution),
            body
          );

          const heightRatio = Math.max(0, Math.min(1, center.y / h));
          const pushZ = isFinalBackSlab
            ? -(0.38 + heightRatio * 0.48 + Math.random() * 0.18)
            : 0.55 + heightRatio * 0.85 + Math.random() * 0.25;
          const pushX = (center.x / (w * 0.5)) * 0.48 + (Math.random() - 0.5) * 0.32;
          const pushY = 0.20 + heightRatio * 0.32 + Math.random() * 0.16;
          body.setLinvel({ x: pushX, y: pushY, z: pushZ }, true);
          body.setAngvel(
            {
              x: (isFinalBackSlab ? -1 : 1) * (1.2 + Math.random() * 2.2),
              y: (Math.random() - 0.5) * 2.4,
              z: (Math.random() - 0.5) * 2.2,
            },
            true
          );
        }

        this.tier1AChunks.push({ mesh, body });
        released++;
      }
    }

    this.totalLogicalCubes += released;
    this.totalVisualPieces = this.tier1AChunks.length;
    return released;
  }

  _releaseTier1B(zFront, zBack, isFinalBackSlab) {
    const { w, h, d } = this.objDef.bounds;
    const { friction, restitution } = this.objDef.physics;
    const cz = (zFront + zBack) * 0.5;
    const sliceD = Math.max(0.01, zFront - zBack);
    const nzC = cz / d;
    const sx = this.dx * 0.955;
    const sy = this.dy * 0.955;
    const sz = sliceD * 0.955;

    let released = 0;

    let activeCount = 0;
    for (let i = 0; i < this.tier1BBodies.length; i++) {
      if (!this.tier1BBodies[i].frozen) activeCount++;
    }
    if (activeCount > TIER1B_MAX_ACTIVE_RAPIER - 220 && this.world) {
      let toFreeze = activeCount - (TIER1B_MAX_ACTIVE_RAPIER - 280);
      for (let i = 0; i < this.tier1BBodies.length && toFreeze > 0; i++) {
        const entry = this.tier1BBodies[i];
        if (!entry.frozen && entry.body) {
          const v = entry.body.linvel();
          if (v.x * v.x + v.y * v.y + v.z * v.z < 0.28) {
            this.world.removeRigidBody(entry.body);
            entry.body = null;
            entry.frozen = true;
            toFreeze--;
          }
        }
      }
      for (let i = 0; i < this.tier1BBodies.length && toFreeze > 0; i++) {
        const entry = this.tier1BBodies[i];
        if (!entry.frozen && entry.body) {
          this.world.removeRigidBody(entry.body);
          entry.body = null;
          entry.frozen = true;
          toFreeze--;
        }
      }
    }

    for (let ix = 0; ix <= this.nx; ix++) {
      const cx = -w * 0.5 + (ix + 0.5) * this.dx;
      const nxC = cx / w;
      for (let iy = 0; iy <= this.ny; iy++) {
        const cy = (iy + 0.5) * this.dy;
        const nyC = cy / h;
        if (!this.objDef.contains(nxC, nyC, nzC)) continue;
        if (this.tier1BCount >= TIER1B_MAX_INSTANCES) break;

        const idx = this.tier1BCount++;
        const s = this.objDef.sampleVolume(nxC, nyC, nzC);
        _tmpColor.setRGB(s.r, s.g, s.b, THREE.SRGBColorSpace);
        this.tier1BMesh.setColorAt(idx, _tmpColor);

        _dummy.position.set(cx, cy, cz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(sx, sy, sz);
        _dummy.updateMatrix();
        this.tier1BMesh.setMatrixAt(idx, _dummy.matrix);

        let body = null;
        if (this.world) {
          const desc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(cx, cy + 0.004, cz)
            .setLinearDamping(0.32)
            .setAngularDamping(0.40)
            .setCanSleep(true);
          body = this.world.createRigidBody(desc);
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(sx * 0.48, sy * 0.48, sz * 0.48)
              .setFriction(friction)
              .setRestitution(restitution),
            body
          );

          const heightRatio = cy / h;
          const pushZ = isFinalBackSlab
            ? -(0.32 + heightRatio * 0.45 + Math.random() * 0.20)
            : 0.45 + heightRatio * 0.95 + Math.random() * 0.45;
          const pushX = (cx / (w * 0.5)) * 0.55 + (Math.random() - 0.5) * 0.45;
          const pushY = 0.15 + heightRatio * 0.40 + Math.random() * 0.25;
          body.setLinvel({ x: pushX, y: pushY, z: pushZ }, true);
          body.setAngvel(
            {
              x: (Math.random() - 0.2) * 5.2,
              y: (Math.random() - 0.5) * 4.5,
              z: (Math.random() - 0.5) * 4.5,
            },
            true
          );
        }

        this.tier1BBodies.push({ idx, body, frozen: false, sx, sy, sz });
        released++;
      }
    }

    this.tier1BMesh.count = this.tier1BCount;
    this.tier1BMesh.instanceMatrix.needsUpdate = true;
    if (this.tier1BMesh.instanceColor) this.tier1BMesh.instanceColor.needsUpdate = true;

    this.totalLogicalCubes += released;
    this.totalVisualPieces = this.tier1BCount;
    return released;
  }

  _releaseTier2(zFront, zBack, isFinalBackSlab) {
    const { w, h, d } = this.objDef.bounds;
    const cz = (zFront + zBack) * 0.5;
    const sliceD = Math.max(0.005, zFront - zBack);
    const nzC = cz / d;

    const totalCols = this.nx + 1;
    const totalRows = this.ny + 1;
    const sliceTotalCells = totalCols * totalRows;

    const maxVisualPerSlice =
      this.totalCuts <= 130 ? sliceTotalCells : Math.max(420, Math.floor(TIER2_MAX_INSTANCES / (this.nz + 1)));
    const step = sliceTotalCells > maxVisualPerSlice ? Math.ceil(Math.sqrt(sliceTotalCells / maxVisualPerSlice)) : 1;

    let sampledOccupied = 0;
    const sx = this.dx * 0.96;
    const sy = this.dy * 0.96;
    const sz = sliceD * 0.96;

    for (let ix = 0; ix < totalCols; ix += step) {
      const cx = -w * 0.5 + (ix + 0.5) * this.dx;
      const nxC = cx / w;
      let colCount = 0;
      let byteR = 200, byteG = 200, byteB = 200;

      for (let iy = 0; iy < totalRows; iy += step) {
        const cy = (iy + 0.5) * this.dy;
        const nyC = cy / h;
        if (!this.objDef.contains(nxC, nyC, nzC)) continue;

        sampledOccupied++;
        colCount++;
        const s = this.objDef.sampleVolume(nxC, nyC, nzC);
        byteR = Math.round(Math.max(0, Math.min(1, s.r)) * 255);
        byteG = Math.round(Math.max(0, Math.min(1, s.g)) * 255);
        byteB = Math.round(Math.max(0, Math.min(1, s.b)) * 255);
        _tmpColor.setRGB(s.r, s.g, s.b, THREE.SRGBColorSpace);

        const slot = this.t2Cursor;
        this.t2Cursor = (this.t2Cursor + 1) % TIER2_MAX_INSTANCES;
        if (this.t2Allocated < TIER2_MAX_INSTANCES) this.t2Allocated++;

        const jitter = step > 1 ? step * 0.35 : 0.08;
        const px = cx + (Math.random() - 0.5) * this.dx * jitter;
        const py = Math.max(sy * 0.5, cy + (Math.random() - 0.5) * this.dy * jitter);
        const pz = cz + (Math.random() - 0.5) * sliceD * 0.4;

        this.t2State[slot] = 1;
        this.t2X[slot] = px;
        this.t2Y[slot] = py;
        this.t2Z[slot] = pz;

        const heightRatio = cy / h;
        this.t2VX[slot] = (cx / (w * 0.5)) * 0.36 + (Math.random() - 0.5) * 0.42;
        this.t2VY[slot] = 0.04 + heightRatio * 0.24 + (Math.random() - 0.5) * 0.16;
        this.t2VZ[slot] = isFinalBackSlab
          ? -0.10 + (Math.random() - 0.5) * 0.38
          : 0.22 + heightRatio * 0.68 + Math.random() * 0.28;

        this.t2RX[slot] = Math.random() * 0.4;
        this.t2RY[slot] = Math.random() * 0.4;
        this.t2RZ[slot] = Math.random() * 0.4;
        this.t2AVX[slot] = (Math.random() - 0.5) * 9.0;
        this.t2AVY[slot] = (Math.random() - 0.5) * 9.0;
        this.t2AVZ[slot] = (Math.random() - 0.5) * 9.0;

        this.t2CR[slot] = byteR;
        this.t2CG[slot] = byteG;
        this.t2CB[slot] = byteB;

        this.tier2Mesh.setColorAt(slot, _tmpColor);
        _dummy.position.set(px, py, pz);
        _dummy.rotation.set(this.t2RX[slot], this.t2RY[slot], this.t2RZ[slot]);
        _dummy.scale.set(sx, sy, sz);
        _dummy.updateMatrix();
        this.tier2Mesh.setMatrixAt(slot, _dummy.matrix);

        this.t2ActiveList.push(slot);
      }

      if (this.moundVisible && colCount > 0) {
        const colHeight = colCount * step * this.dy;
        const massVol = colHeight * (this.dx * step) * sliceD * 0.62;
        this._depositToHeightfield(cx, cz + (isFinalBackSlab ? -0.02 : 0.14), massVol, byteR, byteG, byteB);
      }
    }

    this.tier2Mesh.count = this.t2Allocated;
    this.tier2Mesh.instanceMatrix.needsUpdate = true;
    if (this.tier2Mesh.instanceColor) this.tier2Mesh.instanceColor.needsUpdate = true;

    const logicalInSlice = step === 1 ? sampledOccupied : Math.round(sampledOccupied * step * step);
    this.totalLogicalCubes += logicalInSlice;
    this.totalVisualPieces = this.t2Allocated;
    return logicalInSlice;
  }

  _releaseTier3(zFront, zBack, isFinalBackSlab) {
    const { w, h, d } = this.objDef.bounds;
    const cz = (zFront + zBack) * 0.5;
    const sliceD = Math.max(0.002, zFront - zBack);
    const nzC = cz / d;

    const sampleCols = 56;
    const sampleRows = 20;
    const colW = w / sampleCols;
    const rowH = h / sampleRows;
    let sliceOccupiedFrac = 0;

    for (let cxIdx = 0; cxIdx < sampleCols; cxIdx++) {
      const baseCx = -w * 0.5 + (cxIdx + 0.5) * colW;

      for (let ryIdx = 0; ryIdx < sampleRows; ryIdx++) {
        // Randomize sub-cell sample coordinate inside each column so heightfield never gets periodic zebra columns!
        const cx = baseCx + (Math.random() - 0.5) * colW * 1.1;
        const cy = (ryIdx + Math.random()) * rowH;
        const nxC = Math.max(-0.499, Math.min(0.499, cx / w));
        const nyC = Math.max(0.001, Math.min(0.999, cy / h));
        if (!this.objDef.contains(nxC, nyC, nzC)) continue;

        sliceOccupiedFrac += 1 / (sampleCols * sampleRows);
        const s = this.objDef.sampleVolume(nxC, nyC, nzC);
        const byteR = Math.round(Math.max(0, Math.min(1, s.r)) * 255);
        const byteG = Math.round(Math.max(0, Math.min(1, s.g)) * 255);
        const byteB = Math.round(Math.max(0, Math.min(1, s.b)) * 255);

        // Spread each grain organically forward & laterally with non-periodic jitter
        const forwardShift = isFinalBackSlab
          ? -(0.04 + nyC * 0.16) + (Math.random() - 0.5) * 0.16
          : 0.04 + nyC * 0.42 + (Math.random() - 0.5) * 0.22;
        const sideSpread = (cx / (w * 0.5)) * nyC * 0.22 + (Math.random() - 0.5) * 0.18;
        const cellVol = rowH * colW * sliceD * 0.94;
        // Let top-most surface shell write slightly less frequently than rich interior layers so
        // white top stickers / chocolate shells don't drown out vibrant internal colors!
        const colorPriority = nyC > 0.92 ? 0.35 : 0.85;
        this._depositToHeightfield(cx + sideSpread, cz + forwardShift, cellVol, byteR, byteG, byteB, colorPriority);

        if (Math.random() < (this.totalCuts >= 900 ? 0.34 : 0.52)) {
          _tmpColor.setRGB(s.r, s.g, s.b, THREE.SRGBColorSpace);
          this._spawnTier3Grain(cx, cy, cz, _tmpColor.r, _tmpColor.g, _tmpColor.b, h, w, isFinalBackSlab);
        }
      }
    }

    this.tier3Points.geometry.setDrawRange(0, this.pAllocated);
    this.pPosAttr.needsUpdate = true;
    this.pColAttr.needsUpdate = true;

    const fill = Math.max(sliceOccupiedFrac, estimateFillRatio(this.objDef) * 0.5);
    const logicalInSlice = Math.round((this.nx + 1) * (this.ny + 1) * fill);
    this.totalLogicalCubes += logicalInSlice;
    this.totalVisualPieces = this.pAllocated;
    return logicalInSlice;
  }

  _spawnTier3Grain(cx, cy, cz, r, g, b, h, w, isFinalBackSlab) {
    const slot = this.pCursor;
    this.pCursor = (this.pCursor + 1) % TIER3_MAX_PARTICLES;
    if (this.pAllocated < TIER3_MAX_PARTICLES) this.pAllocated++;

    const p3 = slot * 3;
    this.pPos[p3] = cx + (Math.random() - 0.5) * 0.05;
    this.pPos[p3 + 1] = Math.max(0.01, cy + (Math.random() - 0.5) * 0.03);
    this.pPos[p3 + 2] = cz + (Math.random() - 0.5) * 0.03;

    this.pCol[p3] = r;
    this.pCol[p3 + 1] = g;
    this.pCol[p3 + 2] = b;

    const hr = cy / h;
    this.pVel[p3] = (cx / (w * 0.5)) * 0.28 + (Math.random() - 0.5) * 0.36;
    this.pVel[p3 + 1] = -0.10 + hr * 0.18 + (Math.random() - 0.5) * 0.14;
    this.pVel[p3 + 2] = isFinalBackSlab
      ? -(0.12 + hr * 0.24) + (Math.random() - 0.5) * 0.24
      : 0.18 + hr * 0.62 + Math.random() * 0.26;

    if (this.pState[slot] !== 1) {
      this.pState[slot] = 1;
      this.pActiveList.push(slot);
    }
  }

  _worldToHF(x, z) {
    const gx = Math.round(((x + HF_W * 0.5) / HF_W) * (HF_NX - 1));
    const gz = Math.round(((z + HF_D * 0.5) / HF_D) * (HF_NZ - 1));
    if (gx < 1 || gx >= HF_NX - 1 || gz < 1 || gz >= HF_NZ - 1) return -1;
    return gz * HF_NX + gx;
  }

  _sampleHeightfield(x, z) {
    if (Math.abs(x) > BOARD_W * 0.5 || Math.abs(z) > BOARD_D * 0.5) {
      return -BOARD_H;
    }
    const idx = this._worldToHF(x, z);
    if (idx < 0) return 0.0;
    return this.hfH[idx];
  }

  /**
   * Deposits volume + PURE UN-BLENDED sRGB byte pigment into either slot A or slot B.
   * Never averages RGB channels together!
   */
  _depositToHeightfield(x, z, volume, byteR, byteG, byteB, colorChance = 1.0) {
    const idx = this._worldToHF(x, z);
    if (idx < 0) return;

    const cellArea = HF_CELL_X * HF_CELL_Z;
    const dh = volume / cellArea;
    const prevH = this.hfH[idx];
    this.hfH[idx] = prevH + dh;

    const p4 = idx * 4;
    if (prevH < 0.002) {
      this.hfBytesA[p4] = byteR;
      this.hfBytesA[p4 + 1] = byteG;
      this.hfBytesA[p4 + 2] = byteB;
      this.hfBytesA[p4 + 3] = 255;
      this.hfBytesB[p4] = byteR;
      this.hfBytesB[p4 + 1] = byteG;
      this.hfBytesB[p4 + 2] = byteB;
      this.hfBytesB[p4 + 3] = 255;
    } else if (Math.random() < colorChance) {
      // Stochastic non-periodic slot choice -> zero zebra striping!
      const target = Math.random() < 0.5 ? this.hfBytesA : this.hfBytesB;
      target[p4] = byteR;
      target[p4 + 1] = byteG;
      target[p4 + 2] = byteB;
      target[p4 + 3] = 255;
    }
    this.hfDirty = true;
    if (this.moundEnabled && !this.moundVisible) {
      this.moundVisible = true;
      this.moundMesh.visible = true;
    }
  }

  /**
   * Realistic broad Angle-of-Repose granular avalanche (~20-26 degrees, NEVER a steep cartoon cone!)
   * with discrete un-blended pigment transfer.
   */
  _relaxHeightfield(passes = 4) {
    const cohesion = this.objDef ? this.objDef.physics.cohesion : 0.60;
    // Lower realistic repose slope -> broad natural crumbled heap instead of tall smooth volcano peak!
    const slope = 0.28 + cohesion * 0.16;
    const maxDiffX = HF_CELL_X * slope;
    const maxDiffZ = HF_CELL_Z * slope;

    let moved = false;
    for (let p = 0; p < passes; p++) {
      const rev = (p & 1) === 1;
      for (let gz = rev ? HF_NZ - 2 : 1; rev ? gz >= 1 : gz < HF_NZ - 1; gz += rev ? -1 : 1) {
        const rowOff = gz * HF_NX;
        for (let gx = rev ? HF_NX - 2 : 1; rev ? gx >= 1 : gx < HF_NX - 1; gx += rev ? -1 : 1) {
          const i = rowOff + gx;
          const hi = this.hfH[i];
          if (hi < 0.006) continue;

          const neighbors = [
            [i + 1, maxDiffX],
            [i - 1, maxDiffX],
            [i + HF_NX, maxDiffZ],
            [i - HF_NX, maxDiffZ],
          ];
          for (let n = 0; n < 4; n++) {
            const ni = neighbors[n][0];
            const limit = neighbors[n][1];
            const diff = hi - this.hfH[ni];
            if (diff > limit) {
              const flow = (diff - limit) * 0.30;
              this.hfH[i] -= flow;
              const prevN = this.hfH[ni];
              this.hfH[ni] = prevN + flow;

              // Copy PURE un-blended pigment from source grain to destination slot (zero muddy mixing!)
              const sp = i * 4;
              const dp = ni * 4;
              if (prevN < 0.002) {
                this.hfBytesA[dp] = this.hfBytesA[sp];
                this.hfBytesA[dp + 1] = this.hfBytesA[sp + 1];
                this.hfBytesA[dp + 2] = this.hfBytesA[sp + 2];
                this.hfBytesA[dp + 3] = 255;
                this.hfBytesB[dp] = this.hfBytesB[sp];
                this.hfBytesB[dp + 1] = this.hfBytesB[sp + 1];
                this.hfBytesB[dp + 2] = this.hfBytesB[sp + 2];
                this.hfBytesB[dp + 3] = 255;
              } else if (flow > 0.0012 && Math.random() < 0.45) {
                const src = Math.random() < 0.5 ? this.hfBytesB : this.hfBytesA;
                const dst = Math.random() < 0.5 ? this.hfBytesA : this.hfBytesB;
                if (src[sp + 3] > 0) {
                  dst[dp] = src[sp];
                  dst[dp + 1] = src[sp + 1];
                  dst[dp + 2] = src[sp + 2];
                  dst[dp + 3] = 255;
                }
              }
              moved = true;
            }
          }
        }
      }
    }
    if (moved) this.hfDirty = true;
  }

  _syncMoundGeometry() {
    if (!this.hfDirty) return;
    this.hfDirty = false;
    const pos = this.moundMesh.geometry.attributes.position;

    for (let i = 0; i < this.hfSize; i++) {
      const h = this.hfH[i];
      // Add subtle organic granular lumpiness proportional to pile depth
      const organicY = h > 0.01 ? h + this.hfRelief[i] * Math.min(1.0, h * 3.5) : h;
      pos.setY(i, Math.max(0, organicY));
    }
    pos.needsUpdate = true;
    this.hfTexA.needsUpdate = true;
    this.hfTexB.needsUpdate = true;
    this.moundMesh.geometry.computeVertexNormals();
  }

  update(dt) {
    const stepDt = Math.min(dt, 1 / 30);

    if (this.activeTier === 1 && this.world) {
      this.world.timestep = stepDt;
      this.world.step();

      if (this.subMode === '1A') {
        for (let i = 0; i < this.tier1AChunks.length; i++) {
          const item = this.tier1AChunks[i];
          if (!item.body) continue;
          const t = item.body.translation();
          const r = item.body.rotation();
          item.mesh.position.set(t.x, t.y, t.z);
          item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        }
      } else if (this.subMode === '1B' && this.tier1BBodies.length > 0) {
        let dirty = false;
        for (let i = 0; i < this.tier1BBodies.length; i++) {
          const entry = this.tier1BBodies[i];
          if (entry.frozen || !entry.body || entry.body.isSleeping()) continue;
          const t = entry.body.translation();
          const r = entry.body.rotation();
          _dummy.position.set(t.x, t.y, t.z);
          _dummy.quaternion.set(r.x, r.y, r.z, r.w);
          _dummy.scale.set(entry.sx, entry.sy, entry.sz);
          _dummy.updateMatrix();
          this.tier1BMesh.setMatrixAt(entry.idx, _dummy.matrix);
          dirty = true;
        }
        if (dirty) this.tier1BMesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    if (this.activeTier === 2) {
      if (this.t2ActiveList.length > 0) {
        const rest = this.objDef ? this.objDef.physics.restitution : 0.18;
        const fric = this.objDef ? Math.max(0.25, 1.0 - this.objDef.physics.friction * 0.45) : 0.72;
        const sx = this.dx * 0.96;
        const sy = this.dy * 0.96;
        const sz = this.dz * 0.96;
        const halfH = sy * 0.5;
        const cubeVol = sx * sy * sz * (this.totalCuts >= 200 ? 0.50 : 1.04);

        let writeIdx = 0;
        for (let k = 0; k < this.t2ActiveList.length; k++) {
          const i = this.t2ActiveList[k];
          if (this.t2State[i] !== 1) continue;

          this.t2VY[i] -= 15.5 * stepDt;
          let x = this.t2X[i] + this.t2VX[i] * stepDt;
          let y = this.t2Y[i] + this.t2VY[i] * stepDt;
          let z = this.t2Z[i] + this.t2VZ[i] * stepDt;

          this.t2RX[i] += this.t2AVX[i] * stepDt;
          this.t2RY[i] += this.t2AVY[i] * stepDt;
          this.t2RZ[i] += this.t2AVZ[i] * stepDt;

          const edgeMarginX = BOARD_W * 0.455;
          const edgeMarginZ = BOARD_D * 0.455;
          if (Math.abs(x) > edgeMarginX) {
            x = Math.sign(x) * edgeMarginX;
            this.t2VX[i] *= -0.25;
          }
          if (Math.abs(z) > edgeMarginZ) {
            z = Math.sign(z) * edgeMarginZ;
            this.t2VZ[i] *= -0.25;
          }

          const floorY = this._sampleHeightfield(x, z) + halfH;
          if (y <= floorY) {
            y = floorY;
            const hL = this._sampleHeightfield(x - HF_CELL_X, z);
            const hR = this._sampleHeightfield(x + HF_CELL_X, z);
            const hB = this._sampleHeightfield(x, z - HF_CELL_Z);
            const hF = this._sampleHeightfield(x, z + HF_CELL_Z);
            const gradX = (hR - hL) / (2 * HF_CELL_X);
            const gradZ = (hF - hB) / (2 * HF_CELL_Z);

            this.t2VX[i] = this.t2VX[i] * fric - gradX * 1.45;
            this.t2VZ[i] = this.t2VZ[i] * fric - gradZ * 1.45;
            this.t2VY[i] = Math.abs(this.t2VY[i]) > 0.45 ? -this.t2VY[i] * rest : 0;

            this.t2AVX[i] *= 0.65;
            this.t2AVY[i] *= 0.65;
            this.t2AVZ[i] *= 0.65;

            const speedSq = this.t2VX[i] * this.t2VX[i] + this.t2VZ[i] * this.t2VZ[i];
            if (this.t2VY[i] === 0 && speedSq < 0.045) {
              this.t2State[i] = 2;
              this._depositToHeightfield(x, z, cubeVol, this.t2CR[i], this.t2CG[i], this.t2CB[i]);
            }
          }

          this.t2X[i] = x;
          this.t2Y[i] = y;
          this.t2Z[i] = z;

          _dummy.position.set(x, y, z);
          _dummy.rotation.set(this.t2RX[i], this.t2RY[i], this.t2RZ[i]);
          _dummy.scale.set(sx, sy, sz);
          _dummy.updateMatrix();
          this.tier2Mesh.setMatrixAt(i, _dummy.matrix);

          if (this.t2State[i] === 1 && y > -BOARD_H - 0.5) {
            this.t2ActiveList[writeIdx++] = i;
          }
        }
        this.t2ActiveList.length = writeIdx;
        this.tier2Mesh.instanceMatrix.needsUpdate = true;
      }

      this._relaxHeightfield(3);
      if (this.moundVisible) this._syncMoundGeometry();
      return;
    }

    if (this.activeTier === 3) {
      if (this.pActiveList.length > 0) {
        let writeIdx = 0;
        for (let k = 0; k < this.pActiveList.length; k++) {
          const i = this.pActiveList[k];
          const p3 = i * 3;
          this.pVel[p3 + 1] -= 15.0 * stepDt;

          let x = this.pPos[p3] + this.pVel[p3] * stepDt;
          let y = this.pPos[p3 + 1] + this.pVel[p3 + 1] * stepDt;
          let z = this.pPos[p3 + 2] + this.pVel[p3 + 2] * stepDt;

          const edgeX = BOARD_W * 0.455;
          const edgeZ = BOARD_D * 0.455;
          if (Math.abs(x) > edgeX) {
            x = Math.sign(x) * edgeX;
            this.pVel[p3] *= -0.15;
          }
          if (Math.abs(z) > edgeZ) {
            z = Math.sign(z) * edgeZ;
            this.pVel[p3 + 2] *= -0.15;
          }

          const floorY = this._sampleHeightfield(x, z) + 0.008;
          if (y <= floorY) {
            y = floorY;
            const hL = this._sampleHeightfield(x - HF_CELL_X, z);
            const hR = this._sampleHeightfield(x + HF_CELL_X, z);
            const hB = this._sampleHeightfield(x, z - HF_CELL_Z);
            const hF = this._sampleHeightfield(x, z + HF_CELL_Z);
            const gradX = (hR - hL) / (2 * HF_CELL_X);
            const gradZ = (hF - hB) / (2 * HF_CELL_Z);

            this.pVel[p3] = this.pVel[p3] * 0.62 - gradX * 1.15;
            this.pVel[p3 + 2] = this.pVel[p3 + 2] * 0.62 - gradZ * 1.15;
            this.pVel[p3 + 1] = 0;

            if (this.pVel[p3] * this.pVel[p3] + this.pVel[p3 + 2] * this.pVel[p3 + 2] < 0.03) {
              this.pState[i] = 2;
            }
          }

          this.pPos[p3] = x;
          this.pPos[p3 + 1] = y;
          this.pPos[p3 + 2] = z;

          if (this.pState[i] === 1 && y > -BOARD_H - 0.5) {
            this.pActiveList[writeIdx++] = i;
          }
        }
        this.pActiveList.length = writeIdx;
        this.pPosAttr.needsUpdate = true;
      }

      // 5 passes of broad natural granular slumping, syncing normals every 2nd frame for smooth 60 FPS!
      this._relaxHeightfield(5);
      this._moundFrameCounter++;
      if ((this._moundFrameCounter & 1) === 0) {
        this._syncMoundGeometry();
      }
    }
  }

  getDiagnostics() {
    const tierNames = {
      '1A': 'Tier 1 • Rapier3D Volumétrico Per-Pixel',
      '1B': 'Tier 1 • Rapier3D Cubos Instanciados',
      '2': 'Tier 2 • Micro-Cubos Escala Real + Monte',
      '3': 'Tier 3 • Areia Cinética Granular + Grains',
    };
    return {
      tierName: tierNames[this.subMode] || 'Tier 1',
      pieceSizeMm: (this.dx * 32).toFixed(2),
      logicalCubes: this.totalLogicalCubes,
      visualPieces: this.totalVisualPieces,
    };
  }
}
