import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EnvironmentManager } from './environments.js';
import { VolumetricSolid } from './volumetric-solid.js';
import { KnifeController } from './knife-controller.js';
import { PhysicsTierEngine } from './physics-tiers.js';
import { AsmrAudioEngine } from './audio-asmr.js';
import { OBJECT_MAP, computeAxisCuts } from '../objects/registry.js';
import { generateObjectFromPrompt } from '../objects/prompt-object-generator.js';

export const DEFAULT_ROUNDS = [
  { cuts: 10,   tier: 1, label: '10 CUTS',    duration: 8.4, settleWait: 1.35 },
  { cuts: 50,   tier: 1, label: '50 CUTS',    duration: 9.0, settleWait: 1.45 },
  { cuts: 100,  tier: 2, label: '100 CUTS',   duration: 9.0, settleWait: 1.45 },
  { cuts: 250,  tier: 2, label: '250 CUTS',   duration: 9.4, settleWait: 1.50 },
  { cuts: 500,  tier: 3, label: '500 CUTS',   duration: 9.6, settleWait: 1.55 },
  { cuts: 1000, tier: 3, label: '1,000 CUTS', duration: 10.4, settleWait: 1.95 },
];

export const ROUNDS = DEFAULT_ROUNDS;

function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

function buildRoundEntry(cuts, durationScale = 1.0) {
  const preset = DEFAULT_ROUNDS.find((r) => r.cuts === cuts);
  if (preset) {
    return {
      ...preset,
      duration: preset.duration * durationScale,
      settleWait: preset.settleWait * durationScale,
    };
  }
  const tier = cuts <= 65 ? 1 : cuts <= 300 ? 2 : 3;
  return {
    cuts,
    tier,
    label: `${formatNumber(cuts)} CUTS`,
    duration: 9.2 * durationScale,
    settleWait: 1.45 * durationScale,
  };
}

/**
 * Core 9:16 Infinite Slice 3D Engine (Interactive Studio + Deterministic Headless Render Mode):
 * - Locked 3/4 isometric camera & 3-point studio lighting
 * - Logs exact millisecond ASMR audio event timeline for offline lossless WAV muxing
 */
export class InfiniteSliceEngine {
  constructor(outputCanvas, { headless = false } = {}) {
    this.outputCanvas = outputCanvas;
    this.headless = headless;
    this.ctx = outputCanvas.getContext('2d');

    this.width = 540;
    this.height = 960;
    this.outputCanvas.width = this.width;
    this.outputCanvas.height = this.height;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: headless,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.localClippingEnabled = true;

    this.scene = new THREE.Scene();

    // Studio softbox IBL (PMREM RoomEnvironment) so metallic blades, marble, glass, and glossy interiors gleam crisply
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.56;
    pmrem.dispose();

    // Locked 3/4 isometric perspective camera tuned specifically for 9:16 vertical composition
    this.camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.1, 60);
    this.camera.position.set(5.85, 7.55, 8.10);
    this.camera.lookAt(0.0, 0.34, 0.14);

    // 3-Point + Overhead Softbox Studio Lighting Rig
    const hemi = new THREE.HemisphereLight(0xf2f7f5, 0x483f36, 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff6e8, 3.25);
    key.position.set(5.2, 10.6, 5.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 2.0;
    key.shadow.camera.far = 26.0;
    key.shadow.camera.left = -4.2;
    key.shadow.camera.right = 4.2;
    key.shadow.camera.top = 4.2;
    key.shadow.camera.bottom = -4.2;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.018;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xd4ecff, 1.25);
    fill.position.set(-5.6, 6.8, 5.4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe1b8, 1.35);
    rim.position.set(-2.5, 6.4, -6.2);
    this.scene.add(rim);

    this.lights = { hemi, key, fill, rim };

    // Subsystems
    this.env = new EnvironmentManager(this.scene, this.lights);
    this.solid = new VolumetricSolid(this.scene);
    this.knife = new KnifeController(this.scene);
    this.physics = new PhysicsTierEngine(this.scene);
    this.audio = new AsmrAudioEngine({ headless });

    // Sequence & Playback State
    this.rounds = [...DEFAULT_ROUNDS];
    this.currentObjectId = 'salmon';
    this.currentObjectPrompt = '';
    this.currentCutterId = 'chef-knife';
    this.currentCutterPrompt = '';
    this.currentSurfaceId = 'honey-wood';
    this.currentSurfacePrompt = '';
    this.currentEnvId = 'classic-viral';
    this.currentEnvPrompt = '';
    this.handleText = '@atomslice3d';
    this.showHud = true;
    this.ctaOutro = null;
    this.ctaActive = false;
    this.ctaTimer = 0;
    this.ctaChimeFired = false;
    this.speedMultiplier = 1.0;
    this.paused = false;
    this.autoSequence = false;
    this.roundIndex = 0;

    // Deterministic Timeline & Offline Audio Event Log
    this.simTime = 0;
    this.sequenceCompleted = false;
    this.audioLog = [];
    this.maxLogicalCubesSeen = 0;

    // HUD Counters
    this.displayCuts = 0;
    this.targetCuts = 10;
    this.displayCubes = 0;
    this.targetCubes = 0;
    this.cutPulse = 0;
    this.cubePulse = 0;
    this.roundFlash = 0;
    this.settleTimer = 0;
    this.waitingForNextRound = false;

    this.fps = 60;
    this._fpsFrames = 0;
    this._fpsAccum = 0;
    this.lastKnifeState = { phaseLabel: 'IDLE', activeAxis: 0, doneX: 0, doneY: 0, doneZ: 0 };

    this.onStateUpdate = null;
    this.onSequenceComplete = null;

    this._rafId = null;
    this._lastTime = 0;
    this._running = false;
  }

  async init() {
    await this.physics.init();
    this.setObject(this.currentObjectId, false);
    this.setEnvironment(this.currentEnvId, '', true);

    if (!this.headless) {
      this.startRound(0, false);
      this.startLoop();
    }
  }

  /**
   * Configures a deterministic headless render job (called by scripts/render-headless.mjs).
   */
  configureHeadless({
    objectId = 'salmon',
    objectPrompt = '',
    cutterId = 'chef-knife',
    cutterPrompt = '',
    surfaceId = '',
    surfacePrompt = '',
    envId = 'classic-viral',
    envPrompt = '',
    handle = '@cubiccutlab',
    width = 1080,
    height = 1920,
    rounds = [10, 50, 100, 250, 500, 1000],
    durationScale = 1.0,
    showHud = true,
    ctaOutro = null,
  } = {}) {
    this.setResolution(width, height);
    this.setHandle(handle);
    this.showHud = showHud;
    this.ctaOutro = (ctaOutro && ctaOutro.enabled) ? ctaOutro : null;
    this.ctaActive = false;
    this.ctaTimer = 0;
    this.ctaChimeFired = false;
    this.setRounds(rounds, durationScale, false);

    // Environment first, then decoupled Cutting Surface (if explicitly chosen or prompted!)
    const hasExplicitSurface = Boolean((surfaceId && surfaceId !== 'default') || (surfacePrompt && surfacePrompt.trim()));
    if (envPrompt && envPrompt.trim()) {
      this.setEnvironment('custom', envPrompt, !hasExplicitSurface);
    } else {
      this.setEnvironment(envId, '', !hasExplicitSurface);
    }

    if (surfacePrompt && surfacePrompt.trim()) {
      this.setSurface('custom', surfacePrompt);
    } else if (surfaceId && surfaceId !== 'default') {
      this.setSurface(surfaceId, '');
    }

    // Cutting tool (Knife / Katana / 1000°C / Lightsaber / Black Card / Custom)
    if (cutterPrompt && cutterPrompt.trim()) {
      this.setCutter('custom', cutterPrompt);
    } else {
      this.setCutter(cutterId || 'chef-knife', '');
    }

    // Volumetric Object (preset OR free-text prompt)
    if (objectPrompt && objectPrompt.trim()) {
      this.setObjectFromPrompt(objectPrompt, false);
    } else {
      this.setObject(objectId, false);
    }

    this.simTime = 0;
    this.sequenceCompleted = false;
    this.audioLog = [];
    this.maxLogicalCubesSeen = 0;

    this.startRound(0, true);
    return {
      objectId: this.objDef.id,
      slug: this.objDef.slug || this.objDef.id,
      name: this.objDef.name,
      englishName: this.objDef.englishName || this.objDef.name,
      cutterId: this.currentCutterId,
      surfaceId: this.currentSurfaceId,
      envId: this.currentEnvId,
      rounds: this.rounds.map((r) => r.cuts),
    };
  }

  setResolution(width, height) {
    this.width = width;
    this.height = height;
    this.outputCanvas.width = width;
    this.outputCanvas.height = height;
    this.renderer.setSize(width, height, false);
  }

  setHandle(text) {
    const clean = (text || '').trim();
    this.handleText = clean.startsWith('@') || clean === '' ? clean : '@' + clean;
  }

  setCutter(cutterId, customPrompt = '') {
    this.currentCutterId = cutterId;
    this.currentCutterPrompt = customPrompt || '';
    this.knife.setCutter(cutterId, customPrompt);
  }

  setSurface(surfaceId, customPrompt = '') {
    this.currentSurfaceId = surfaceId;
    this.currentSurfacePrompt = customPrompt || '';
    this.env.applySurface(surfaceId, customPrompt);
  }

  setEnvironment(envId, customPrompt = '', syncDefaultSurface = false) {
    this.currentEnvId = envId;
    this.currentEnvPrompt = customPrompt || '';
    this.env.applyPreset(envId, syncDefaultSurface, customPrompt);
    if (syncDefaultSurface) {
      this.currentSurfaceId = this.env.currentSurfaceId;
    }
  }

  setRounds(cutNumbers, durationScale = 1.0, restart = true) {
    const clean = [...new Set(cutNumbers.map((n) => Math.max(3, Math.min(2000, Math.round(Number(n) || 10)))))]
      .sort((a, b) => a - b);
    if (clean.length === 0) clean.push(10);
    this.rounds = clean.map((c) => buildRoundEntry(c, durationScale));
    if (this.roundIndex >= this.rounds.length) this.roundIndex = 0;
    if (restart && this.objDef) {
      this.startRound(0, this.autoSequence);
    }
  }

  setObject(objId, restartCurrentRound = true) {
    const objDef = OBJECT_MAP[objId];
    if (!objDef) throw new Error(`Unknown object id: "${objId}"`);
    this.currentObjectId = objId;
    this.currentObjectPrompt = '';
    this.objDef = objDef;
    this.solid.loadObject(objDef);
    if (restartCurrentRound) {
      this.startRound(this.roundIndex, this.autoSequence);
    }
  }

  setObjectFromPrompt(promptText, restartCurrentRound = true) {
    const objDef = generateObjectFromPrompt(promptText);
    this.currentObjectId = 'prompt-custom';
    this.currentObjectPrompt = promptText;
    this.objDef = objDef;
    this.solid.loadObject(objDef);
    if (restartCurrentRound) {
      this.startRound(this.roundIndex, this.autoSequence);
    }
    return objDef;
  }

  startRound(roundIdx, autoSeq = false) {
    this.roundIndex = Math.max(0, Math.min(this.rounds.length - 1, roundIdx));
    this.autoSequence = autoSeq;
    const round = this.rounds[this.roundIndex];
    const { nx, ny, nz } = computeAxisCuts(round.cuts, this.objDef.bounds);

    this.waitingForNextRound = false;
    this.settleTimer = 0;
    this.ctaActive = false;
    this.ctaTimer = 0;
    this.ctaChimeFired = false;
    this.displayCuts = 0;
    this.targetCuts = round.cuts;
    this.displayCubes = 0;
    this.targetCubes = 0;
    this.roundFlash = 1.0;

    const sandGrain = round.cuts >= 500 ? (round.cuts >= 1000 ? 1.0 : 0.72) : 0.0;
    this.solid.resetCuts(nx, ny, nz, sandGrain);
    this.physics.prepareRound({
      objDef: this.objDef,
      totalCuts: round.cuts,
      nx,
      ny,
      nz,
      volumeData: this.solid.getVolumeData(),
    });
    this.knife.resetIdle(this.objDef.bounds);
    this.knife.startRound({
      bounds: this.objDef.bounds,
      nx,
      ny,
      nz,
      totalCuts: round.cuts,
      targetDuration: round.duration,
    });
    this.paused = false;
  }

  startFullSequence() {
    this.sequenceCompleted = false;
    this.startRound(0, true);
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  setSpeed(mult) {
    this.speedMultiplier = mult;
  }

  startLoop() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    const tick = (now) => {
      if (!this._running) return;
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
      this._lastTime = now;

      this._fpsFrames++;
      this._fpsAccum += rawDt;
      if (this._fpsAccum >= 0.45) {
        this.fps = Math.round(this._fpsFrames / this._fpsAccum);
        this._fpsFrames = 0;
        this._fpsAccum = 0;
      }

      if (!this.paused) {
        this.step(rawDt * this.speedMultiplier);
      }
      this.renderFrame();

      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  step(dt) {
    this.simTime += dt;
    const round = this.rounds[this.roundIndex];
    const soundProfile = this.objDef.physics.soundProfile;
    const surfaceAudio = this.env.getSurfaceAudio();

    const knifeState = this.knife.update(dt, {
      onImpact: (ev) => {
        this.displayCuts = this.knife.totalCutsDone;
        this.cutPulse = 1.0;

        if (ev.axis !== 'y') {
          this.env.triggerImpactRecoil(round.cuts <= 50 ? 0.013 : 0.005);
        }

        const impactAudio = {
          timeSec: Number(this.simTime.toFixed(4)),
          kind: 'cut',
          axis: ev.axis,
          soundProfile,
          surfaceAudio,
          speedFactor: Number((ev.speedFactor || 1).toFixed(2)),
        };
        if (this.headless) {
          this.audioLog.push(impactAudio);
        } else {
          this.audio.playCutImpact(impactAudio);
        }

        if (ev.axis === 'z') {
          let released = 0;
          if (ev.isLastZ) {
            this.solid.hideCompletely();
            released += this.physics.releaseZSlice(ev.zFront, ev.zBack, false);
            released += this.physics.releaseZSlice(ev.zBack, ev.finalSlabBack, true);
          } else {
            this.solid.setClipZ(ev.zBack, true);
            released += this.physics.releaseZSlice(ev.zFront, ev.zBack, false);
          }

          if (released > 0) {
            this.targetCubes += released;
            if (this.targetCubes > this.maxLogicalCubesSeen) {
              this.maxLogicalCubesSeen = Math.round(this.targetCubes);
            }
            this.cubePulse = 1.0;

            const cascadeAudio = {
              timeSec: Number(this.simTime.toFixed(4)),
              kind: 'cascade',
              tier: this.physics.activeTier,
              soundProfile,
              intensity: Number(Math.min(1.2, released / (round.cuts <= 10 ? 12 : 120)).toFixed(3)),
            };
            if (this.headless) {
              this.audioLog.push(cascadeAudio);
            } else {
              this.audio.playCascade(cascadeAudio);
            }
          }
        }
      },
      onRoundComplete: () => {
        this.waitingForNextRound = true;
        this.settleTimer = 0;
      },
    });

    this.lastKnifeState = knifeState;

    this.solid.setCutState({
      doneX: knifeState.doneX,
      doneY: knifeState.doneY,
      doneZ: knifeState.doneZ,
      activeAxis: knifeState.activeAxis,
      activeDepth: knifeState.activeDepth,
    });

    this.physics.update(dt);
    this.env.update(dt);

    this.cutPulse = Math.max(0, this.cutPulse - dt * 5.2);
    this.cubePulse = Math.max(0, this.cubePulse - dt * 4.5);
    this.roundFlash = Math.max(0, this.roundFlash - dt * 1.9);

    const diffCubes = this.targetCubes - this.displayCubes;
    if (this.targetCuts <= 50 || Math.abs(diffCubes) < 0.6) {
      this.displayCubes = this.targetCubes;
    } else {
      this.displayCubes += diffCubes * Math.min(1, dt * 16.0);
    }

    if (this.waitingForNextRound) {
      this.settleTimer += dt;
      const isFinalRound = this.autoSequence && this.roundIndex >= this.rounds.length - 1;
      const hasCta = Boolean(isFinalRound && this.ctaOutro && this.ctaOutro.enabled);
      const ctaDelay = 0.48;
      const ctaDur = hasCta ? Math.max(1.6, Number(this.ctaOutro.durationSec) || 2.4) : 0;

      if (hasCta && this.settleTimer >= ctaDelay) {
        if (!this.ctaActive) {
          this.ctaActive = true;
          this.ctaTimer = 0;
        } else {
          this.ctaTimer += dt;
        }
        if (!this.ctaChimeFired) {
          this.ctaChimeFired = true;
          const chimeEv = {
            timeSec: Number(this.simTime.toFixed(4)),
            kind: 'ctaChime',
          };
          if (this.headless) {
            this.audioLog.push(chimeEv);
          } else {
            this.audio.playCtaChime?.();
          }
        }
      }

      const effectiveWait = hasCta ? Math.max(round.settleWait, ctaDelay + ctaDur) : round.settleWait;
      if (this.settleTimer >= effectiveWait) {
        if (this.autoSequence) {
          if (this.roundIndex < this.rounds.length - 1) {
            this.startRound(this.roundIndex + 1, true);
          } else {
            this.waitingForNextRound = false;
            this.sequenceCompleted = true;
            this.onSequenceComplete?.();
          }
        } else {
          this.waitingForNextRound = false;
        }
      }
    }

    if (this.onStateUpdate) {
      this.onStateUpdate({
        fps: this.fps,
        roundIndex: this.roundIndex,
        roundLabel: round.label,
        cutsDone: this.displayCuts,
        cutsTarget: this.targetCuts,
        cubes: Math.round(this.targetCubes),
        knifePhase: knifeState.phaseLabel,
        knifeAxis: knifeState.activeAxis === 1 ? 'Eixo X (Vertical)' : knifeState.activeAxis === 2 ? 'Eixo Y (Horizontal)' : knifeState.activeAxis === 3 ? 'Eixo Z (Fatiamento)' : 'Transição',
        physics: this.physics.getDiagnostics(),
      });
    }
  }

  renderFrame() {
    this.renderer.render(this.scene, this.camera);
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
    if (this.showHud) {
      this._drawHud(ctx, W, H);
    }
  }

  _drawHud(ctx, W, H) {
    const s = W / 540;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const topGrad = ctx.createLinearGradient(0, 0, 0, 195 * s);
    topGrad.addColorStop(0, 'rgba(0,0,0,0.40)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 195 * s);

    // Subtle bottom vignette that frames the Reels/TikTok/Shorts safe-zone counter without darkening the board
    const botGrad = ctx.createLinearGradient(0, H - 280 * s, 0, H);
    botGrad.addColorStop(0, 'rgba(0,0,0,0)');
    botGrad.addColorStop(0.55, 'rgba(0,0,0,0.16)');
    botGrad.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, H - 280 * s, W, 280 * s);

    const dotY = 48 * s;
    const dotGap = 16 * s;
    const startX = W * 0.5 - ((this.rounds.length - 1) * dotGap) * 0.5;
    for (let i = 0; i < this.rounds.length; i++) {
      ctx.beginPath();
      const active = i === this.roundIndex;
      const passed = i < this.roundIndex;
      ctx.arc(startX + i * dotGap, dotY, (active ? 4.5 : 3.0) * s, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#ffffff' : passed ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.24)';
      ctx.fill();
    }

    const cutScale = 1.0 + this.cutPulse * 0.045 + this.roundFlash * 0.10;
    ctx.save();
    ctx.translate(W * 0.5, 102 * s);
    ctx.scale(cutScale, cutScale);
    const headline = this.displayCuts === 0 ? `${formatNumber(this.targetCuts)} CUTS` : `${formatNumber(this.displayCuts)} CUTS`;
    ctx.font = `900 ${Math.round(52 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7 * s;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.strokeText(headline, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(headline, 0, 0);
    ctx.restore();

    if (this.displayCuts > 0 && this.displayCuts < this.targetCuts) {
      ctx.font = `700 ${Math.round(13 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(`GOAL: ${formatNumber(this.targetCuts)} CUTS`, W * 0.5, 140 * s);
    }

    if (this.handleText) {
      ctx.font = `700 ${Math.round(17 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      const handleY = this.displayCuts > 0 && this.displayCuts < this.targetCuts ? 166 * s : 150 * s;
      ctx.strokeText(this.handleText, W * 0.5, handleY);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      ctx.fillText(this.handleText, W * 0.5, handleY);
    }

    // Reels / TikTok / YouTube Shorts Safe Zone:
    // Bottom ~20-23% of 9:16 is covered by captions, username & audio bar.
    // Placing the CUBES counter at H - 250*s (~74.0% down, ~22.6% = 434px@1080p clear below label)
    // keeps it 100% visible above all platform overlays (even 2-line captions) and cleanly below the object.
    const cubesVal = Math.round(this.displayCubes);
    if (cubesVal > 0) {
      const cubeScale = 1.0 + this.cubePulse * 0.06;
      ctx.save();
      ctx.translate(W * 0.5, H - 250 * s);
      ctx.scale(cubeScale, cubeScale);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 14 * s;
      ctx.shadowOffsetY = 3 * s;

      const numStr = formatNumber(cubesVal);
      ctx.font = `900 ${Math.round(44 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7.5 * s;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.strokeText(numStr, 0, -10 * s);
      ctx.fillStyle = '#ffe169';
      ctx.fillText(numStr, 0, -10 * s);

      ctx.font = `800 ${Math.round(16 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4.5 * s;
      ctx.strokeText('CUBES', 0, 23 * s);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText('CUBES', 0, 23 * s);
      ctx.restore();
    }

    if (this.ctaActive && this.ctaOutro?.enabled) {
      this._drawCtaOutro(ctx, W, H, s);
    }

    ctx.restore();
  }

  _drawRoundedRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  _drawStarSparkle(ctx, x, y, r, color, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.34;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawCtaOutro(ctx, W, H, s) {
    const t = Math.max(0, this.ctaTimer);
    // Joyful bouncy elastic pop-in (0.58 -> 1.07 -> 0.98 -> 1.00)
    const alpha = Math.min(1, t / 0.12);
    const spring = t < 0.65
      ? 1.0 - Math.exp(-9.2 * t) * Math.cos(15.5 * t) * 0.42
      : 1.0;
    const floatY = Math.exp(-9.5 * t) * 34 * s + Math.sin(t * 3.8) * 3.2 * s;

    ctx.save();
    // NO dark gloomy scrim — keep the bright, happy 3D studio shining cleanly!
    const cx = W * 0.5;
    const cy = H * 0.465 + floatY;
    const cardW = 434 * s;
    const cardH = 248 * s;
    const x0 = -cardW * 0.5;
    const y0 = -cardH * 0.5;

    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    // 1. Happy burst of colorful confetti & twinkling 4-point stars popping outward on "PLIM!"
    const burst = 1.0 - Math.exp(-6.5 * t);
    const confFade = t > 1.8 ? Math.max(0, 1.0 - (t - 1.8) / 0.7) : 1.0;
    const confetti = [
      { ang: -2.65, dist: 252, col: '#ff3b6b', kind: 'star', sz: 14 },
      { ang: -2.18, dist: 222, col: '#ffe047', kind: 'dot',  sz: 8 },
      { ang: -0.95, dist: 228, col: '#22d3ee', kind: 'pill', sz: 13 },
      { ang: -0.45, dist: 256, col: '#4ade80', kind: 'star', sz: 15 },
      { ang:  0.42, dist: 252, col: '#ffe047', kind: 'star', sz: 14 },
      { ang:  0.96, dist: 224, col: '#a855f7', kind: 'dot',  sz: 8 },
      { ang:  2.20, dist: 226, col: '#ff7a18', kind: 'pill', sz: 13 },
      { ang:  2.70, dist: 255, col: '#38bdf8', kind: 'star', sz: 14 },
      { ang: -1.56, dist: 162, col: '#ff3b6b', kind: 'dot',  sz: 7 },
      { ang:  1.56, dist: 164, col: '#4ade80', kind: 'dot',  sz: 7 },
    ];
    ctx.save();
    ctx.globalAlpha = alpha * confFade;
    for (let i = 0; i < confetti.length; i++) {
      const c = confetti[i];
      const px = Math.cos(c.ang) * c.dist * s * (0.45 + 0.55 * burst);
      const py = Math.sin(c.ang) * (c.dist * 0.72) * s * (0.45 + 0.55 * burst) + t * 14 * s;
      const rot = t * (i % 2 === 0 ? 2.4 : -2.1) + i;
      if (c.kind === 'star') {
        const tw = 0.82 + 0.24 * Math.sin(t * 9.0 + i * 1.7);
        this._drawStarSparkle(ctx, px, py, c.sz * s * tw, c.col, rot);
      } else if (c.kind === 'pill') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        this._drawRoundedRect(ctx, -c.sz * 0.65 * s, -4.5 * s, c.sz * 1.3 * s, 9 * s, 4.5 * s);
        ctx.fillStyle = c.col;
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, c.sz * s, 0, Math.PI * 2);
        ctx.fillStyle = c.col;
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.scale(spring, spring);

    // 2. Joyful 3D candy bottom lip (sunny golden-amber base matching our @atomslice3d brand yellow!)
    ctx.save();
    ctx.shadowColor = 'rgba(20, 16, 40, 0.28)';
    ctx.shadowBlur = 32 * s;
    ctx.shadowOffsetY = 16 * s;
    this._drawRoundedRect(ctx, x0, y0 + 8 * s, cardW, cardH, 32 * s);
    ctx.fillStyle = '#f5b800';
    ctx.fill();
    ctx.restore();

    // 3. Bright creamy-white cheerful main card body
    this._drawRoundedRect(ctx, x0, y0, cardW, cardH, 32 * s);
    const cardGrad = ctx.createLinearGradient(0, y0, 0, y0 + cardH);
    cardGrad.addColorStop(0, '#ffffff');
    cardGrad.addColorStop(1, '#fff8e6');
    ctx.fillStyle = cardGrad;
    ctx.fill();

    // Thick sunny yellow sticker border
    this._drawRoundedRect(ctx, x0, y0, cardW, cardH, 32 * s);
    ctx.lineWidth = 4.5 * s;
    ctx.strokeStyle = '#ffd836';
    ctx.stroke();

    // 4. Playful slightly tilted sunny-yellow sticker pill overlapping top edge ("TRY IT YOURSELF!")
    const eyebrow = (this.ctaOutro.eyebrow || 'TRY IT YOURSELF!').toUpperCase();
    ctx.save();
    ctx.translate(0, y0 - 2 * s);
    ctx.rotate(-0.032);
    const badgeW = 224 * s;
    const badgeH = 38 * s;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetY = 4 * s;
    this._drawRoundedRect(ctx, -badgeW * 0.5, -badgeH * 0.5, badgeW, badgeH, 19 * s);
    const tagGrad = ctx.createLinearGradient(-badgeW * 0.5, 0, badgeW * 0.5, 0);
    tagGrad.addColorStop(0, '#ffe84d');
    tagGrad.addColorStop(1, '#ffc824');
    ctx.fillStyle = tagGrad;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = `900 ${Math.round(15 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#18181b';
    ctx.fillText(eyebrow, 0, 1 * s);
    ctx.restore();

    // 5. Big, engaging, joyful 2-line headline with vibrant watermelon-coral highlight!
    const line1 = this.ctaOutro.headlineTop || 'Make YOUR OWN';
    const accent = this.ctaOutro.headlineAccent || 'viral 3D';
    const suffix = this.ctaOutro.headlineSuffix || 'videos!';
    ctx.font = `900 ${Math.round(34 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#141824';
    ctx.fillText(line1, 0, y0 + 68 * s);

    // Measure & center "[viral 3D] [videos!]" cleanly in dual color
    const fullLine2 = `${accent} ${suffix}`;
    const wFull = ctx.measureText(fullLine2).width;
    const wAcc = ctx.measureText(`${accent} `).width;
    const startX2 = -wFull * 0.5;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff2e63';
    ctx.fillText(accent, startX2, y0 + 108 * s);
    ctx.fillStyle = '#141824';
    ctx.fillText(suffix, startX2 + wAcc, y0 + 108 * s);
    ctx.restore();

    // 6. Super juicy 3D glossy candy CTA button ("LINK IN BIO ↗") with animated pulse & shine!
    const pillW = 292 * s;
    const pillH = 58 * s;
    const pillX = -pillW * 0.5;
    const pillY = y0 + 136 * s;
    const pulse = 1.0 + Math.sin(t * 7.8) * 0.032;

    ctx.save();
    ctx.translate(0, pillY + pillH * 0.5);
    ctx.scale(pulse, pulse);

    // Candy 3D button bottom lip
    this._drawRoundedRect(ctx, pillX, -pillH * 0.5 + 5 * s, pillW, pillH, 29 * s);
    ctx.fillStyle = '#c8194b';
    ctx.fill();

    // Main vibrant watermelon-coral -> sunny orange gradient button
    ctx.shadowColor = 'rgba(255, 46, 99, 0.36)';
    ctx.shadowBlur = 18 * s;
    ctx.shadowOffsetY = 6 * s;
    this._drawRoundedRect(ctx, pillX, -pillH * 0.5, pillW, pillH, 29 * s);
    const btnGrad = ctx.createLinearGradient(pillX, -pillH * 0.5, pillX + pillW, pillH * 0.5);
    btnGrad.addColorStop(0, '#ff2e63');
    btnGrad.addColorStop(0.55, '#ff5940');
    btnGrad.addColorStop(1, '#ff881a');
    ctx.fillStyle = btnGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Glossy top candy highlight strip inside button
    this._drawRoundedRect(ctx, pillX + 16 * s, -pillH * 0.5 + 5 * s, pillW - 32 * s, 12 * s, 6 * s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.26)';
    ctx.fill();

    // Animated glossy diagonal light sweep across button
    const sweepU = (t - 0.32) / 0.62;
    if (sweepU > 0 && sweepU < 1.25) {
      ctx.save();
      this._drawRoundedRect(ctx, pillX, -pillH * 0.5, pillW, pillH, 29 * s);
      ctx.clip();
      const sx = pillX - 50 * s + sweepU * (pillW + 100 * s);
      const shine = ctx.createLinearGradient(sx - 28 * s, -pillH * 0.5, sx + 28 * s, pillH * 0.5);
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,0.65)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(sx - 45 * s, -pillH * 0.6, 90 * s, pillH * 1.2);
      ctx.restore();
    }

    // Crisp white CTA label + bouncing vector arrow
    const pillLabel = (this.ctaOutro.pill || 'LINK IN BIO').toUpperCase();
    ctx.font = `900 ${Math.round(23 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(130, 10, 35, 0.38)';
    ctx.shadowBlur = 4 * s;
    ctx.fillText(pillLabel, -14 * s, 1 * s);
    ctx.shadowBlur = 0;

    const ax = 82 * s + Math.sin(t * 9.5) * 4.0 * s;
    const ay = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.6 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - 7 * s, ay + 6 * s);
    ctx.lineTo(ax + 6 * s, ay - 6 * s);
    ctx.moveTo(ax - 2 * s, ay - 6 * s);
    ctx.lineTo(ax + 6 * s, ay - 6 * s);
    ctx.lineTo(ax + 6 * s, ay + 2 * s);
    ctx.stroke();
    ctx.restore();

    // 7. Playful clean sub-line ("Slice ANYTHING in 1 click • @atomslice3d")
    const subline = this.ctaOutro.subline || 'Slice ANYTHING in 1 click';
    const footer = this.handleText ? `${subline}  •  ${this.handleText}` : subline;
    ctx.font = `800 ${Math.round(14.5 * s)}px "Inter", "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = '#475569';
    ctx.fillText(footer, 0, y0 + 221 * s);

    ctx.restore();
  }
}
