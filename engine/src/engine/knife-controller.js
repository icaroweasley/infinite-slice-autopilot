import * as THREE from 'three';
import { buildCutterTool } from './cutter-builder.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function easeInCubic(t) {
  const c = clamp(t, 0, 1);
  return c * c * c;
}

function easeOutQuad(t) {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) * (1 - c);
}

/**
 * 3D Chef's Knife with exact phase-locked cutting state machine + Anti-Aliased Supersonic Shutter Blur:
 *
 * Local origin (0, 0, 0) sits directly at the center of the razor edge.
 * - Low speeds (10-50 cuts): 100% strict phase-locked slow chops (REPOSITION -> CHOP -> IMPACT -> LIFT -> PARK),
 *   crystal-sharp solid steel blade, zero aliasing.
 * - High speeds (100-1,000 cuts): Tight rapid-fire stroke + frame-locked anti-aliased strobe motion +
 *   world-anchored metallic shutter-blur curtain & multi-blade afterimage fan so 1,000 cuts genuinely
 *   looks and feels supersonic at BOTH 30 FPS and 60 FPS!
 */
export class KnifeController {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);

    // Separate world-anchored shutter-blur curtain group so motion-blur spans the full chop envelope
    // cleanly from cutting board (y = 0) up to stroke peak while sweeping across the object!
    this.curtainRoot = new THREE.Group();
    this.scene.add(this.curtainRoot);

    this.toolContainer = new THREE.Group();
    this.root.add(this.toolContainer);
    this.ghostContainer = new THREE.Group();
    this.curtainRoot.add(this.ghostContainer);

    this.currentCutterId = 'chef-knife';
    this.currentCutterPrompt = '';
    this.bladeMatsToFade = [];
    this.ghostBlades = [];
    this.ghostMats = [];
    this.veilMesh = null;
    this.veilMat = null;
    this.flashMesh = null;
    this.flashMat = null;

    this._visualTick = 0;
    this._buildCurtainBase();
    this.setCutter('chef-knife', '');
    this.resetIdle();
  }

  _buildCurtainBase() {
    const veilGeo = new THREE.PlaneGeometry(2.95, 1.0);
    veilGeo.rotateY(Math.PI * 0.5);
    veilGeo.translate(0, 0.5, -0.02);
    this.veilMat = new THREE.MeshBasicMaterial({
      color: 0xe6f3ff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.veilMesh = new THREE.Mesh(veilGeo, this.veilMat);
    this.curtainRoot.add(this.veilMesh);

    const flashGeo = new THREE.PlaneGeometry(2.70, 0.14);
    flashGeo.rotateY(Math.PI * 0.5);
    flashGeo.translate(0, 0.07, -0.05);
    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flashMesh = new THREE.Mesh(flashGeo, this.flashMat);
    this.curtainRoot.add(this.flashMesh);
    this.curtainRoot.visible = false;
  }

  /**
   * Swaps the 3D cutting tool (Chef Knife, 1000°C Hot Knife, Katana, Cleaver, Lightsaber,
   * Gold Blade, Crystal Blade, Black Card, Steel Scraper, or any free-text custom cutter!)
   * and automatically syncs its 12 motion-blur ghost blades & blur color.
   */
  setCutter(cutterId = 'chef-knife', customPrompt = '') {
    this.currentCutterId = cutterId;
    this.currentCutterPrompt = customPrompt || '';

    // Dispose previous tool meshes cleanly
    while (this.toolContainer.children.length > 0) {
      const child = this.toolContainer.children[0];
      this.toolContainer.remove(child);
    }
    while (this.ghostContainer.children.length > 0) {
      const g = this.ghostContainer.children[0];
      this.ghostContainer.remove(g);
    }
    this.ghostBlades = [];
    this.ghostMats = [];

    const built = buildCutterTool(cutterId, customPrompt);
    this.toolContainer.add(built.toolGroup);
    this.bladeMatsToFade = built.bladeMatsToFade || [];

    // Tint motion-blur curtain & flash to match cutter (e.g. fiery orange for 1000°C, cyan for Lightsaber, gold for 24k!)
    this.veilMat.color.setHex(built.blurHex);
    this.flashMat.color.setHex(built.blurHex).lerp(new THREE.Color(0xffffff), 0.45);

    const ghostCount = 12;
    for (let i = 0; i < ghostCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xffffff : built.blurHex,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const ghost = new THREE.Mesh(built.bladeGeo, mat);
      this.ghostContainer.add(ghost);
      this.ghostBlades.push(ghost);
      this.ghostMats.push(mat);
    }

    this._hideShutterBlur();
  }

  resetIdle(bounds = { w: 2.3, h: 0.9, d: 1.5 }) {
    this.bounds = bounds;
    this.active = false;
    this.finished = false;
    this.stage = 'IDLE';
    this.phaseLabel = 'IDLE';
    this.currentAxis = 0;

    this.nx = 5;
    this.ny = 2;
    this.nz = 3;
    this.doneX = 0;
    this.doneY = 0;
    this.doneZ = 0;
    this.totalCutsDone = 0;

    this.cutIndex = 0;
    this.cutT = 0;
    this.impactFiredForCut = false;
    this.transT = 0;
    this._visualTick = 0;
    this.prevPos = new THREE.Vector3(bounds.w * 0.5 + 0.55, bounds.h + 0.85, 0);
    this.prevRot = new THREE.Euler(0, 0, 0);

    this.root.position.copy(this.prevPos);
    this.root.rotation.set(0, 0, 0);
    this._hideShutterBlur();
  }

  startRound({ bounds, nx, ny, nz, totalCuts, targetDuration = 9.5 }) {
    this.bounds = bounds;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.totalCuts = totalCuts;
    this.doneX = 0;
    this.doneY = 0;
    this.doneZ = 0;
    this.totalCutsDone = 0;
    this.finished = false;
    this.active = true;
    this._visualTick = 0;

    const transTime = totalCuts <= 10 ? 0.36 : totalCuts <= 50 ? 0.26 : 0.18;
    this.transDur = transTime;
    this.parkDur = totalCuts <= 50 ? 0.42 : 0.24;

    const cutBudget = Math.max(3.2, targetDuration - transTime * 3.0);
    const weightedTotal = nx * 0.92 + ny * 0.92 + nz * 1.18;
    const basePerCut = cutBudget / Math.max(1, weightedTotal);

    this.durX = clamp(basePerCut * 0.92, 0.0018, 0.62);
    this.durY = clamp(basePerCut * 0.92, 0.0018, 0.62);
    this.durZ = clamp(basePerCut * 1.18, 0.0028, 0.72);

    // Progressive stroke tightening:
    // 10 cuts = high deliberate chef lift (+0.62), 50 cuts = brisk (+0.36), 100-1,000 cuts = tight supersonic reciprocating chop (+0.18..+0.26)!
    const liftMargin =
      totalCuts <= 15 ? 0.62 :
      totalCuts <= 60 ? 0.36 :
      totalCuts <= 150 ? 0.26 :
      totalCuts <= 300 ? 0.22 : 0.18;
    const sideMargin =
      totalCuts <= 15 ? 0.68 :
      totalCuts <= 60 ? 0.42 : 0.26;

    this.yClear = bounds.h + liftMargin;
    this.xClear = bounds.w * 0.5 + sideMargin;

    this._beginTransition('TRANS_X', new THREE.Vector3(this._getXCutPos(1), this.yClear, 0), new THREE.Euler(0, 0, 0));
  }

  _getXCutPos(index1Based) {
    const u = 1.0 - index1Based / (this.nx + 1);
    return (u - 0.5) * this.bounds.w;
  }

  _getYCutPos(index1Based) {
    const v = 1.0 - index1Based / (this.ny + 1);
    return v * this.bounds.h;
  }

  _getZCutPos(index1Based) {
    const w = 1.0 - index1Based / (this.nz + 1);
    return (w - 0.5) * this.bounds.d;
  }

  _beginTransition(stageName, targetPos, targetRot) {
    this.stage = stageName;
    this.phaseLabel = stageName === 'PARK' ? 'LIFT' : 'ALIGN';
    this.transT = 0;
    this.transStartPos = this.root.position.clone();
    this.transStartRot = this.root.rotation.clone();
    this.transEndPos = targetPos.clone();
    this.transEndRot = targetRot.clone();
    this._hideShutterBlur();
  }

  _hideShutterBlur() {
    this.curtainRoot.visible = false;
    this.veilMat.opacity = 0;
    this.flashMat.opacity = 0;
    for (let i = 0; i < this.ghostMats.length; i++) {
      this.ghostMats[i].opacity = 0;
    }
    for (const m of this.bladeMatsToFade) {
      if (m && m.transparent) {
        m.transparent = false;
        m.opacity = 1.0;
        m.needsUpdate = true;
      }
    }
  }

  /**
   * Updates the anti-aliased supersonic shutter-blur curtain & afterimage fan for 50-1,000 cuts.
   */
  _updateShutterBlur({ axis, coord, blurIntensity, strokeSpan, sweepTrailDir }) {
    if (blurIntensity <= 0.02) {
      this._hideShutterBlur();
      return;
    }

    this.curtainRoot.visible = true;
    const tick = this._visualTick;
    // Slight realistic camera-shutter translucency on primary solid blade at supersonic speeds
    const mainOpacity = lerp(1.0, 0.58, smoothstep((blurIntensity - 0.35) / 0.65));
    const wantTransparent = mainOpacity < 0.99;
    for (const m of this.bladeMatsToFade) {
      if (!m) continue;
      if (m.transparent !== wantTransparent) {
        m.transparent = wantTransparent;
        m.needsUpdate = true;
      }
      m.opacity = mainOpacity;
    }

    // Position the curtain anchored cleanly on the active cutting plane (spanning board y=0 to strokeSpan!)
    if (axis === 'x') {
      this.curtainRoot.position.set(coord, 0.005, 0);
      this.curtainRoot.rotation.set(0, 0, 0);
    } else if (axis === 'y') {
      this.curtainRoot.position.set(-this.bounds.w * 0.5 - 0.10, coord, 0);
      this.curtainRoot.rotation.set(0, 0, -Math.PI * 0.5);
    } else {
      this.curtainRoot.position.set(0, 0.005, coord);
      this.curtainRoot.rotation.set(0, -Math.PI * 0.5, 0);
    }

    // Metallic vertical/horizontal shutter-smear veil covering full stroke envelope
    this.veilMesh.scale.set(1, strokeSpan, 1);
    const flicker = 0.84 + 0.16 * Math.sin(tick * 2.39996);
    this.veilMat.opacity = blurIntensity * 0.30 * flicker;

    // Bright specular razor-edge streak pulsing right inside the cut zone
    this.flashMesh.position.y = ((tick * 0.381966) % 1) * (strokeSpan * 0.72);
    this.flashMat.opacity = blurIntensity * 0.42 * (0.65 + 0.35 * ((tick & 1) ? 1 : 0.4));

    // 12 staggered ghost blades distributed across the full chop height AND trailing slightly behind sweep direction
    const n = this.ghostBlades.length;
    const wakeWidth = blurIntensity * (this.totalCuts >= 500 ? 0.14 : 0.07);
    for (let i = 0; i < n; i++) {
      // Golden-ratio quasi-random phase shift per frame so afterimages shimmer at full framerate with ZERO slow aliasing!
      const frac = ((i / n) + (tick * 0.6180339) % 1) % 1;
      const yPos = frac * Math.max(0.05, strokeSpan - 0.32);
      const wakeOffset = (i / n) * wakeWidth * sweepTrailDir;

      const ghost = this.ghostBlades[i];
      // On local knife coords: X is lateral (for X and Z cuts), Y is chop stroke axis!
      ghost.position.set(wakeOffset, yPos, 0);

      // Denser opacity near the razor impact bottom, softer near top recoil
      const heightFade = 1.0 - frac * 0.55;
      const wakeFade = 1.0 - (i / n) * 0.55;
      this.ghostMats[i].opacity = blurIntensity * 0.24 * heightFade * wakeFade;
    }
  }

  update(dt, callbacks = {}) {
    const events = [];
    if (!this.active || this.finished) {
      return {
        doneX: this.doneX,
        doneY: this.doneY,
        doneZ: this.doneZ,
        activeAxis: 0,
        activeDepth: 1.0,
        phaseLabel: this.phaseLabel,
        finished: this.finished,
        events,
      };
    }

    this._visualTick++;

    // 1. Axis Transitions & Smooth End-of-Round Park
    if (this.stage === 'TRANS_X' || this.stage === 'TRANS_Y' || this.stage === 'TRANS_Z' || this.stage === 'PARK') {
      const dur = this.stage === 'PARK' ? this.parkDur : this.transDur;
      this.transT += dt / dur;
      const s = smoothstep(this.transT);
      const liftArc = this.stage === 'PARK' ? 0.0 : Math.sin(clamp(this.transT, 0, 1) * Math.PI) * 0.35;
      this.root.position.set(
        lerp(this.transStartPos.x, this.transEndPos.x, s),
        lerp(this.transStartPos.y, this.transEndPos.y, s) + liftArc,
        lerp(this.transStartPos.z, this.transEndPos.z, s)
      );
      this.root.rotation.set(
        lerp(this.transStartRot.x, this.transEndRot.x, s),
        lerp(this.transStartRot.y, this.transEndRot.y, s),
        lerp(this.transStartRot.z, this.transEndRot.z, s)
      );

      if (this.transT >= 1.0) {
        this.root.position.copy(this.transEndPos);
        this.root.rotation.copy(this.transEndRot);

        if (this.stage === 'PARK') {
          this.stage = 'DONE';
          this.phaseLabel = 'DONE';
          this.finished = true;
          this.active = false;
          this._hideShutterBlur();
          callbacks.onRoundComplete?.();
          return {
            doneX: this.doneX,
            doneY: this.doneY,
            doneZ: this.doneZ,
            activeAxis: 0,
            activeDepth: 1.0,
            phaseLabel: 'DONE',
            finished: true,
            events,
          };
        }

        this.cutIndex = 1;
        this.cutT = 0;
        this.impactFiredForCut = false;
        this.prevCoord =
          this.stage === 'TRANS_X'
            ? this.root.position.x
            : this.stage === 'TRANS_Y'
            ? this.root.position.y
            : this.root.position.z;

        if (this.stage === 'TRANS_X') {
          this.stage = 'CUT_X';
          this.currentAxis = 1;
        } else if (this.stage === 'TRANS_Y') {
          this.stage = 'CUT_Y';
          this.currentAxis = 2;
        } else {
          this.stage = 'CUT_Z';
          this.currentAxis = 3;
        }
      }

      return {
        doneX: this.doneX,
        doneY: this.doneY,
        doneZ: this.doneZ,
        activeAxis: 0,
        activeDepth: 1.0,
        phaseLabel: this.stage === 'PARK' ? 'LIFT' : 'ALIGN',
        finished: false,
        events,
      };
    }

    // 2. Cutting Loops (exact logical progression for 10 -> 1,000 cuts)
    let activeDepth = 1.0;
    const isX = this.stage === 'CUT_X';
    const isY = this.stage === 'CUT_Y';
    const isZ = this.stage === 'CUT_Z';
    const maxCuts = isX ? this.nx : isY ? this.ny : this.nz;
    const cutDur = isX ? this.durX : isY ? this.durY : this.durZ;
    const cutsPerSec = 1.0 / cutDur;

    let remainingDt = dt;
    let safetyIters = 0;

    while (remainingDt > 1e-7 && safetyIters < 96) {
      safetyIters++;
      const dtCut = remainingDt / cutDur;
      const nextT = this.cutT + dtCut;

      if (!this.impactFiredForCut && nextT >= 0.50) {
        this.impactFiredForCut = true;
        this.totalCutsDone++;

        if (isX) {
          this.doneX = this.cutIndex;
          const ev = { axis: 'x', index: this.cutIndex, pos: this._getXCutPos(this.cutIndex), speedFactor: cutsPerSec / 4.0 };
          events.push(ev);
          callbacks.onImpact?.(ev);
        } else if (isY) {
          this.doneY = this.cutIndex;
          const ev = { axis: 'y', index: this.cutIndex, pos: this._getYCutPos(this.cutIndex), speedFactor: cutsPerSec / 4.0 };
          events.push(ev);
          callbacks.onImpact?.(ev);
        } else if (isZ) {
          this.doneZ = this.cutIndex;
          const zPrev = this.cutIndex === 1 ? this.bounds.d * 0.5 : this._getZCutPos(this.cutIndex - 1);
          const zCurr = this._getZCutPos(this.cutIndex);
          const isLastZ = this.cutIndex === this.nz;
          const ev = {
            axis: 'z',
            index: this.cutIndex,
            zFront: zPrev,
            zBack: zCurr,
            isLastZ,
            finalSlabBack: isLastZ ? -this.bounds.d * 0.5 : null,
            speedFactor: cutsPerSec / 4.0,
          };
          events.push(ev);
          callbacks.onImpact?.(ev);
        }
      }

      if (nextT >= 1.0) {
        const consumedDt = (1.0 - this.cutT) * cutDur;
        remainingDt -= consumedDt;

        this.prevCoord = isX
          ? this._getXCutPos(this.cutIndex)
          : isY
          ? this._getYCutPos(this.cutIndex)
          : this._getZCutPos(this.cutIndex);

        this.cutIndex++;
        this.cutT = 0;
        this.impactFiredForCut = false;

        if (this.cutIndex > maxCuts) {
          if (isX) {
            this._beginTransition(
              'TRANS_Y',
              new THREE.Vector3(this.xClear, this._getYCutPos(1), 0),
              new THREE.Euler(0, 0, -Math.PI * 0.5)
            );
          } else if (isY) {
            this._beginTransition(
              'TRANS_Z',
              new THREE.Vector3(0, this.yClear, this._getZCutPos(1)),
              new THREE.Euler(0, -Math.PI * 0.5, 0)
            );
          } else {
            this._beginTransition(
              'PARK',
              new THREE.Vector3(this.bounds.w * 0.65, this.bounds.h + 1.35, -this.bounds.d * 0.65),
              new THREE.Euler(0, -0.35, 0)
            );
          }
          break;
        }
      } else {
        this.cutT = nextT;
        remainingDt = 0;
      }
    }

    // 3. Visual Knife Positioning + Anti-Aliased Supersonic Strobe & Blur Curtain
    if (this.stage === 'CUT_X' || this.stage === 'CUT_Y' || this.stage === 'CUT_Z') {
      const t = this.cutT;
      // Nyquist-safe visual mode: when cutting faster than ~12 cuts/sec (100+ cuts),
      // switch from single-cut sampling (which aliases at 30/60fps!) to true high-speed reciprocating strobe + blur curtain!
      const isSupersonicVisual = this.totalCuts >= 90 || cutsPerSec >= 12.0;

      // Blur curtain intensity scales progressively across 50 -> 100 -> 250 -> 500 -> 1,000 cuts!
      const blurIntensity =
        this.totalCuts <= 15 ? 0.0 :
        this.totalCuts <= 60 ? (t >= 0.22 && t <= 0.56 ? 0.22 : 0.04) :
        this.totalCuts <= 130 ? 0.56 :
        this.totalCuts <= 300 ? 0.78 :
        this.totalCuts <= 600 ? 0.92 : 1.0;

      const tick = this._visualTick;
      // Alternating high-energy strike phase every frame so even 30fps video looks fiercely fast!
      const strobeDown = (tick & 1) === 0;
      const quasiRand = (tick * 0.6180339887) % 1;
      const microVib = isSupersonicVisual ? (quasiRand - 0.5) * 0.022 * blurIntensity : 0;

      if (this.stage === 'CUT_X') {
        const targetX = this._getXCutPos(this.cutIndex);
        this.root.rotation.set(microVib * 0.6, 0, microVib * 1.4);

        if (isSupersonicVisual) {
          this.phaseLabel = strobeDown ? 'IMPACT' : 'CHOP';
          const y = strobeDown
            ? 0.008 + quasiRand * (this.bounds.h * 0.28)
            : this.bounds.h * 0.58 + quasiRand * (this.yClear - this.bounds.h * 0.52);
          this.root.position.set(targetX + microVib, y, microVib);
          activeDepth = 0.0;
        } else {
          const holdEnd = 0.60;
          if (t < 0.22) {
            this.phaseLabel = 'REPOSITION';
            const p = smoothstep(t / 0.22);
            this.root.position.set(lerp(this.prevCoord, targetX, p), this.yClear, 0);
            activeDepth = 1.05;
          } else if (t < 0.50) {
            this.phaseLabel = 'CHOP';
            const p = easeInCubic((t - 0.22) / 0.28);
            const y = lerp(this.yClear, 0.005, p);
            this.root.position.set(targetX, y, 0);
            activeDepth = clamp(y / this.bounds.h, 0.0, 1.05);
          } else if (t < holdEnd) {
            this.phaseLabel = 'IMPACT';
            this.root.position.set(targetX, 0.005, 0);
            activeDepth = 0.0;
          } else {
            this.phaseLabel = 'LIFT';
            const p = easeOutQuad((t - holdEnd) / (1.0 - holdEnd));
            const y = lerp(0.005, this.yClear, p);
            this.root.position.set(targetX, y, 0);
            activeDepth = 1.05;
          }
        }

        this._updateShutterBlur({
          axis: 'x',
          coord: targetX,
          blurIntensity,
          strokeSpan: this.yClear + 0.30,
          sweepTrailDir: +1, // X cuts march from +X toward -X, so trail wakes toward +X!
        });
      } else if (this.stage === 'CUT_Y') {
        const targetY = this._getYCutPos(this.cutIndex);
        const xEnd = -this.bounds.w * 0.5 - 0.14;
        this.root.rotation.set(microVib * 0.8, 0, -Math.PI * 0.5 + microVib * 1.2);

        if (isSupersonicVisual) {
          this.phaseLabel = strobeDown ? 'IMPACT' : 'CHOP';
          const x = strobeDown
            ? xEnd + quasiRand * (this.bounds.w * 0.34)
            : this.bounds.w * 0.16 + quasiRand * (this.xClear - this.bounds.w * 0.12);
          this.root.position.set(x, targetY + microVib * 0.6, microVib);
          activeDepth = 0.0;
        } else {
          const holdEnd = 0.60;
          if (t < 0.22) {
            this.phaseLabel = 'REPOSITION';
            const p = smoothstep(t / 0.22);
            this.root.position.set(this.xClear, lerp(this.prevCoord, targetY, p), 0);
            activeDepth = 1.05;
          } else if (t < 0.50) {
            this.phaseLabel = 'CHOP';
            const p = easeInCubic((t - 0.22) / 0.28);
            const x = lerp(this.xClear, xEnd, p);
            this.root.position.set(x, targetY, 0);
            activeDepth = clamp(x / this.bounds.w + 0.5, 0.0, 1.05);
          } else if (t < holdEnd) {
            this.phaseLabel = 'IMPACT';
            this.root.position.set(xEnd, targetY, 0);
            activeDepth = 0.0;
          } else {
            this.phaseLabel = 'LIFT';
            const p = easeOutQuad((t - holdEnd) / (1.0 - holdEnd));
            const x = lerp(xEnd, this.xClear, p);
            this.root.position.set(x, targetY, 0);
            activeDepth = 1.05;
          }
        }

        this._updateShutterBlur({
          axis: 'y',
          coord: targetY,
          blurIntensity,
          strokeSpan: this.bounds.w + 0.45,
          sweepTrailDir: -1, // Y cuts march top->bottom; in rotZ=-PI/2 local -X points to +Y (wake!)
        });
      } else if (this.stage === 'CUT_Z') {
        const targetZ = this._getZCutPos(this.cutIndex);
        this.root.rotation.set(microVib * 1.2, -Math.PI * 0.5, microVib * 0.8);

        if (isSupersonicVisual) {
          this.phaseLabel = strobeDown ? 'IMPACT' : 'CHOP';
          const y = strobeDown
            ? 0.008 + quasiRand * (this.bounds.h * 0.28)
            : this.bounds.h * 0.58 + quasiRand * (this.yClear - this.bounds.h * 0.52);
          this.root.position.set(microVib, y, targetZ + microVib);
          activeDepth = 0.0;
        } else {
          const holdEnd = 0.60;
          if (t < 0.22) {
            this.phaseLabel = 'REPOSITION';
            const p = smoothstep(t / 0.22);
            this.root.position.set(0, this.yClear, lerp(this.prevCoord, targetZ, p));
            activeDepth = 1.05;
          } else if (t < 0.50) {
            this.phaseLabel = 'CHOP';
            const p = easeInCubic((t - 0.22) / 0.28);
            const y = lerp(this.yClear, 0.005, p);
            this.root.position.set(0, y, targetZ);
            activeDepth = clamp(y / this.bounds.h, 0.0, 1.05);
          } else if (t < holdEnd) {
            this.phaseLabel = 'IMPACT';
            this.root.position.set(0, 0.005, targetZ);
            activeDepth = 0.0;
          } else {
            this.phaseLabel = 'LIFT';
            const p = easeOutQuad((t - holdEnd) / (1.0 - holdEnd));
            const y = lerp(0.005, this.yClear, p);
            this.root.position.set(0, y, targetZ);
            activeDepth = 1.05;
          }
        }

        this._updateShutterBlur({
          axis: 'z',
          coord: targetZ,
          blurIntensity,
          strokeSpan: this.yClear + 0.30,
          sweepTrailDir: +1, // Z cuts march +Z->-Z; in rotY=-PI/2 local +X points to +Z (wake!)
        });
      }
    }

    return {
      doneX: this.doneX,
      doneY: this.doneY,
      doneZ: this.doneZ,
      activeAxis: this.currentAxis,
      activeDepth,
      phaseLabel: this.phaseLabel,
      finished: this.finished,
      events,
    };
  }
}
