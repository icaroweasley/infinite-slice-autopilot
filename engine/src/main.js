import { InfiniteSliceEngine, ROUNDS } from './engine/scene-core.js';
import { OBJECT_LIST } from './objects/registry.js';
import { CUTTER_LIST } from './engine/cutter-builder.js';
import { SURFACE_LIST, ENVIRONMENT_LIST } from './engine/environments.js';
import {
  AI_OBJECT_SUGGESTIONS,
  AI_CUTTER_SUGGESTIONS,
  AI_SURFACE_SUGGESTIONS,
  AI_ENV_SUGGESTIONS,
} from './data/ai-suggestions.js';

const params = new URLSearchParams(window.location.search);
const isHeadless = params.get('headless') === '1';

const canvas = document.getElementById('studioCanvas');
const loadingOverlay = document.getElementById('loadingOverlay');

const engine = new InfiniteSliceEngine(canvas, { headless: isHeadless });

if (isHeadless) {
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.overflow = 'hidden';
  document.querySelector('.control-pane')?.remove();
  document.querySelector('.stage-controls')?.remove();
  const stagePane = document.querySelector('.stage-pane');
  if (stagePane) {
    stagePane.style.position = 'fixed';
    stagePane.style.inset = '0';
    stagePane.style.height = '100vh';
    stagePane.style.padding = '0';
  }
  const frame = document.querySelector('.stage-frame');
  if (frame) {
    frame.style.borderRadius = '0';
    frame.style.border = 'none';
    frame.style.maxHeight = 'none';
    frame.style.boxShadow = 'none';
  }

  window.__HEADLESS_READY__ = false;
  window.__HEADLESS_API__ = {
    configure(opts) {
      return engine.configureHeadless(opts);
    },
    stepAndCapture(dt, quality = 0.94) {
      engine.step(dt);
      engine.renderFrame();
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return {
        base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
        done: engine.sequenceCompleted,
        simTime: engine.simTime,
        roundIndex: engine.roundIndex,
        cutsDone: engine.displayCuts,
        cutsTarget: engine.targetCuts,
        cubes: Math.round(engine.targetCubes),
      };
    },
    getSummary() {
      return {
        durationSec: Number(engine.simTime.toFixed(3)),
        maxCubes: engine.maxLogicalCubesSeen,
        audioEvents: engine.audioLog,
        object: {
          id: engine.objDef.id,
          slug: engine.objDef.slug || engine.objDef.id,
          name: engine.objDef.name,
          englishName: engine.objDef.englishName || engine.objDef.name,
          subtitle: engine.objDef.subtitle,
        },
        envId: engine.currentEnvId,
      };
    },
  };

  engine.init().then(() => {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    window.__HEADLESS_READY__ = true;
  }).catch((err) => {
    window.__HEADLESS_ERROR__ = err.message || String(err);
    console.error('Headless init error:', err);
  });
} else {
  // === AI-FIRST CREATOR STUDIO UI ===
  const fpsVal = document.getElementById('fpsVal');
  const diagPhase = document.getElementById('diagPhase');
  const diagTier = document.getElementById('diagTier');
  const diagStats = document.getElementById('diagStats');

  const btnSuggestAll = document.getElementById('btnSuggestAll');
  const btnRandomAll = document.getElementById('btnRandomAll');
  const btnPreviewSeq = document.getElementById('btnPreviewSeq');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnRestart = document.getElementById('btnRestart');
  const speedGroup = document.getElementById('speedGroup');
  const chkAudio = document.getElementById('chkAudio');

  // 4 Creative AI Cards
  const cardObject = document.getElementById('cardObject');
  const inpObjectPrompt = document.getElementById('inpObjectPrompt');
  const btnApplyObject = document.getElementById('btnApplyObject');
  const btnSuggestObj = document.getElementById('btnSuggestObj');
  const btnRandomObj = document.getElementById('btnRandomObj');
  const objModeBadge = document.getElementById('objModeBadge');
  const selObject = document.getElementById('selObject');

  const cardCutter = document.getElementById('cardCutter');
  const inpCutterPrompt = document.getElementById('inpCutterPrompt');
  const btnApplyCutter = document.getElementById('btnApplyCutter');
  const btnSuggestCutter = document.getElementById('btnSuggestCutter');
  const btnRandomCutter = document.getElementById('btnRandomCutter');
  const cutterModeBadge = document.getElementById('cutterModeBadge');
  const selCutter = document.getElementById('selCutter');

  const cardSurface = document.getElementById('cardSurface');
  const inpSurfacePrompt = document.getElementById('inpSurfacePrompt');
  const btnApplySurface = document.getElementById('btnApplySurface');
  const btnSuggestSurface = document.getElementById('btnSuggestSurface');
  const btnRandomSurface = document.getElementById('btnRandomSurface');
  const surfaceModeBadge = document.getElementById('surfaceModeBadge');
  const selSurface = document.getElementById('selSurface');

  const cardEnv = document.getElementById('cardEnv');
  const inpEnvPrompt = document.getElementById('inpEnvPrompt');
  const btnApplyEnv = document.getElementById('btnApplyEnv');
  const btnSuggestEnv = document.getElementById('btnSuggestEnv');
  const btnRandomEnv = document.getElementById('btnRandomEnv');
  const envModeBadge = document.getElementById('envModeBadge');
  const selEnv = document.getElementById('selEnv');

  // 5. Cut rounds
  const cutsChipGrid = document.getElementById('cutsChipGrid');
  const inpCustomCut = document.getElementById('inpCustomCut');
  const btnAddCut = document.getElementById('btnAddCut');
  const btnRandomRounds = document.getElementById('btnRandomRounds');
  const roundsSummary = document.getElementById('roundsSummary');

  // 6. AI Brief + 1-Click MP4 Render & Vault
  const btnLoadAiSlots = document.getElementById('btnLoadAiSlots');
  const handleInput = document.getElementById('handleInput');
  const selQuality = document.getElementById('selQuality');
  const chkHud = document.getElementById('chkHud');
  const chkFastPacing = document.getElementById('chkFastPacing');
  const btnSendBrief = document.getElementById('btnSendBrief');
  const btnRenderMp4 = document.getElementById('btnRenderMp4');
  const briefStatusBox = document.getElementById('briefStatusBox');
  const briefTitle = document.getElementById('briefTitle');
  const briefDesc = document.getElementById('briefDesc');
  const briefCmd = document.getElementById('briefCmd');
  const btnCopyTrigger = document.getElementById('btnCopyTrigger');

  const renderProgressBox = document.getElementById('renderProgressBox');
  const progressMsg = document.getElementById('progressMsg');
  const progressPct = document.getElementById('progressPct');
  const progressFill = document.getElementById('progressFill');
  const playerBox = document.getElementById('playerBox');
  const playerTitle = document.getElementById('playerTitle');
  const mp4Player = document.getElementById('mp4Player');
  const playerDownload = document.getElementById('playerDownload');
  const btnCopyCaption = document.getElementById('btnCopyCaption');
  const btnClosePlayer = document.getElementById('btnClosePlayer');
  const vaultList = document.getElementById('vaultList');
  const btnRefreshVault = document.getElementById('btnRefreshVault');

  // Track anti-repetition history from data/history.json so AI suggestions never repeat!
  let usedHistoryStrings = [];
  const lastPickedSuggestion = { object: '', cutter: '', surface: '', environment: '' };

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const d = await res.json();
        usedHistoryStrings = [...(d.usedSlugs || []), ...(d.usedNames || [])];
      }
    } catch {}
  }

  function pickFreshSuggestion(list, key) {
    const fresh = list.filter((idea) => {
      if (idea === lastPickedSuggestion[key]) return false;
      const low = idea.toLowerCase();
      return !usedHistoryStrings.some((u) => u && u.length > 3 && low.includes(u));
    });
    const pool = fresh.length > 0 ? fresh : list.filter((i) => i !== lastPickedSuggestion[key]);
    const picked = pool[Math.floor(Math.random() * pool.length)] || list[0];
    lastPickedSuggestion[key] = picked;
    return picked;
  }

  // Unified State for all 4 slots: mode is 'ai-prompt' | 'ai-random' | 'preset'
  const state = {
    object: { mode: 'preset', presetId: 'salmon', prompt: '' },
    cutter: { mode: 'preset', presetId: 'chef-knife', prompt: '' },
    surface: { mode: 'preset', presetId: 'honey-wood', prompt: '' },
    environment: { mode: 'preset', presetId: 'classic-viral', prompt: '' },
    availableCuts: [10, 50, 100, 250, 500, 1000],
    selectedCuts: new Set([10, 50, 100, 250, 500, 1000]),
    activeCaption: '',
    watchedBriefId: null,
  };

  // Populate optional secondary preset drawers (+ the dedicated AI Custom Slot entry at top!)
  function populateSelect(el, items, aiSlotLabel) {
    const aiOpt = document.createElement('option');
    aiOpt.value = aiSlotLabel.id;
    aiOpt.textContent = aiSlotLabel.text;
    el.appendChild(aiOpt);
    items.forEach((item) => {
      if (item.id === 'custom') return;
      const opt = document.createElement('option');
      opt.value = item.id;
      const label = item.englishName || item.name;
      opt.textContent = item.subtitle && !item.englishName ? `${label} — ${item.subtitle}` : label;
      el.appendChild(opt);
    });
  }

  populateSelect(selObject, OBJECT_LIST, { id: 'custom', text: '✨ AI Slot (engine/src/objects/object-builder.js)' });
  selObject.value = 'salmon';
  populateSelect(selCutter, CUTTER_LIST, { id: 'ai-custom', text: '✨ AI Slot (engine/src/engine/custom-cutter.js)' });
  selCutter.value = 'chef-knife';
  populateSelect(selSurface, SURFACE_LIST, { id: 'ai-custom', text: '✨ AI Slot (engine/src/engine/custom-surface.js)' });
  selSurface.value = 'honey-wood';
  populateSelect(selEnv, ENVIRONMENT_LIST, { id: 'ai-custom', text: '✨ AI Slot (engine/src/engine/custom-environment.js)' });
  selEnv.value = 'classic-viral';

  function syncCardVisual(slotName, cardEl, badgeEl, randomBtn, inputEl) {
    const isRand = state[slotName].mode === 'ai-random';
    cardEl.classList.toggle('is-ai-random', isRand);
    badgeEl.classList.toggle('hidden', !isRand);
    randomBtn.classList.toggle('active', isRand);
    inputEl.disabled = isRand;
    if (isRand) {
      inputEl.placeholder = '🎲 AI Random enabled — your AI will invent an original creation!';
    }
  }

  // --- Slot 1: Object ---
  function setObjectPromptMode(txt) {
    state.object = { mode: 'ai-prompt', presetId: '', prompt: txt };
    inpObjectPrompt.value = txt;
    syncCardVisual('object', cardObject, objModeBadge, btnRandomObj, inpObjectPrompt);
    if (txt.trim()) engine.setObjectFromPrompt(txt, true);
  }
  function toggleObjectRandom(forceOn = null) {
    const next = forceOn !== null ? forceOn : state.object.mode !== 'ai-random';
    if (next) {
      state.object = { mode: 'ai-random', presetId: '', prompt: '' };
      inpObjectPrompt.value = '';
    } else {
      state.object = { mode: 'ai-prompt', presetId: '', prompt: inpObjectPrompt.value.trim() };
    }
    syncCardVisual('object', cardObject, objModeBadge, btnRandomObj, inpObjectPrompt);
  }
  btnApplyObject.addEventListener('click', () => {
    const txt = inpObjectPrompt.value.trim();
    if (!txt) return;
    engine.audio.ensureContext();
    setObjectPromptMode(txt);
  });
  inpObjectPrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnApplyObject.click(); });
  btnSuggestObj.addEventListener('click', () => {
    engine.audio.ensureContext();
    setObjectPromptMode(pickFreshSuggestion(AI_OBJECT_SUGGESTIONS, 'object'));
  });
  btnRandomObj.addEventListener('click', () => toggleObjectRandom());
  selObject.addEventListener('change', () => {
    engine.audio.ensureContext();
    state.object = { mode: selObject.value === 'custom' ? 'ai-prompt' : 'preset', presetId: selObject.value, prompt: '' };
    inpObjectPrompt.value = '';
    syncCardVisual('object', cardObject, objModeBadge, btnRandomObj, inpObjectPrompt);
    engine.setObject(selObject.value, true);
  });

  // --- Slot 2: Cutter ---
  function setCutterPromptMode(txt) {
    state.cutter = { mode: 'ai-prompt', presetId: '', prompt: txt };
    inpCutterPrompt.value = txt;
    syncCardVisual('cutter', cardCutter, cutterModeBadge, btnRandomCutter, inpCutterPrompt);
    if (txt.trim()) engine.setCutter('custom', txt);
  }
  function toggleCutterRandom(forceOn = null) {
    const next = forceOn !== null ? forceOn : state.cutter.mode !== 'ai-random';
    if (next) {
      state.cutter = { mode: 'ai-random', presetId: '', prompt: '' };
      inpCutterPrompt.value = '';
    } else {
      state.cutter = { mode: 'ai-prompt', presetId: '', prompt: inpCutterPrompt.value.trim() };
    }
    syncCardVisual('cutter', cardCutter, cutterModeBadge, btnRandomCutter, inpCutterPrompt);
  }
  btnApplyCutter.addEventListener('click', () => {
    const txt = inpCutterPrompt.value.trim();
    if (!txt) return;
    engine.audio.ensureContext();
    setCutterPromptMode(txt);
  });
  inpCutterPrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnApplyCutter.click(); });
  btnSuggestCutter.addEventListener('click', () => {
    engine.audio.ensureContext();
    setCutterPromptMode(pickFreshSuggestion(AI_CUTTER_SUGGESTIONS, 'cutter'));
  });
  btnRandomCutter.addEventListener('click', () => toggleCutterRandom());
  selCutter.addEventListener('change', () => {
    engine.audio.ensureContext();
    state.cutter = { mode: selCutter.value === 'ai-custom' ? 'ai-prompt' : 'preset', presetId: selCutter.value, prompt: '' };
    inpCutterPrompt.value = '';
    syncCardVisual('cutter', cardCutter, cutterModeBadge, btnRandomCutter, inpCutterPrompt);
    engine.setCutter(selCutter.value, '');
  });

  // --- Slot 3: Surface ---
  function setSurfacePromptMode(txt) {
    state.surface = { mode: 'ai-prompt', presetId: '', prompt: txt };
    inpSurfacePrompt.value = txt;
    syncCardVisual('surface', cardSurface, surfaceModeBadge, btnRandomSurface, inpSurfacePrompt);
    if (txt.trim()) engine.setSurface('custom', txt);
  }
  function toggleSurfaceRandom(forceOn = null) {
    const next = forceOn !== null ? forceOn : state.surface.mode !== 'ai-random';
    if (next) {
      state.surface = { mode: 'ai-random', presetId: '', prompt: '' };
      inpSurfacePrompt.value = '';
    } else {
      state.surface = { mode: 'ai-prompt', presetId: '', prompt: inpSurfacePrompt.value.trim() };
    }
    syncCardVisual('surface', cardSurface, surfaceModeBadge, btnRandomSurface, inpSurfacePrompt);
  }
  btnApplySurface.addEventListener('click', () => {
    const txt = inpSurfacePrompt.value.trim();
    if (!txt) return;
    engine.audio.ensureContext();
    setSurfacePromptMode(txt);
  });
  inpSurfacePrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnApplySurface.click(); });
  btnSuggestSurface.addEventListener('click', () => {
    engine.audio.ensureContext();
    setSurfacePromptMode(pickFreshSuggestion(AI_SURFACE_SUGGESTIONS, 'surface'));
  });
  btnRandomSurface.addEventListener('click', () => toggleSurfaceRandom());
  selSurface.addEventListener('change', () => {
    engine.audio.ensureContext();
    state.surface = { mode: selSurface.value === 'ai-custom' ? 'ai-prompt' : 'preset', presetId: selSurface.value, prompt: '' };
    inpSurfacePrompt.value = '';
    syncCardVisual('surface', cardSurface, surfaceModeBadge, btnRandomSurface, inpSurfacePrompt);
    engine.setSurface(selSurface.value, '');
  });

  // --- Slot 4: Environment ---
  function setEnvPromptMode(txt) {
    state.environment = { mode: 'ai-prompt', presetId: '', prompt: txt };
    inpEnvPrompt.value = txt;
    syncCardVisual('environment', cardEnv, envModeBadge, btnRandomEnv, inpEnvPrompt);
    if (txt.trim()) engine.setEnvironment('custom', txt, false);
  }
  function toggleEnvRandom(forceOn = null) {
    const next = forceOn !== null ? forceOn : state.environment.mode !== 'ai-random';
    if (next) {
      state.environment = { mode: 'ai-random', presetId: '', prompt: '' };
      inpEnvPrompt.value = '';
    } else {
      state.environment = { mode: 'ai-prompt', presetId: '', prompt: inpEnvPrompt.value.trim() };
    }
    syncCardVisual('environment', cardEnv, envModeBadge, btnRandomEnv, inpEnvPrompt);
  }
  btnApplyEnv.addEventListener('click', () => {
    const txt = inpEnvPrompt.value.trim();
    if (!txt) return;
    engine.audio.ensureContext();
    setEnvPromptMode(txt);
  });
  inpEnvPrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnApplyEnv.click(); });
  btnSuggestEnv.addEventListener('click', () => {
    engine.audio.ensureContext();
    setEnvPromptMode(pickFreshSuggestion(AI_ENV_SUGGESTIONS, 'environment'));
  });
  btnRandomEnv.addEventListener('click', () => toggleEnvRandom());
  selEnv.addEventListener('change', () => {
    engine.audio.ensureContext();
    state.environment = { mode: selEnv.value === 'ai-custom' ? 'ai-prompt' : 'preset', presetId: selEnv.value, prompt: '' };
    inpEnvPrompt.value = '';
    syncCardVisual('environment', cardEnv, envModeBadge, btnRandomEnv, inpEnvPrompt);
    engine.setEnvironment(selEnv.value, '', false);
  });

  // --- Global Top Buttons (AI Suggestions vs AI Pure Random!) ---
  btnSuggestAll.addEventListener('click', () => {
    engine.audio.ensureContext();
    setCutterPromptMode(pickFreshSuggestion(AI_CUTTER_SUGGESTIONS, 'cutter'));
    setSurfacePromptMode(pickFreshSuggestion(AI_SURFACE_SUGGESTIONS, 'surface'));
    setEnvPromptMode(pickFreshSuggestion(AI_ENV_SUGGESTIONS, 'environment'));
    setObjectPromptMode(pickFreshSuggestion(AI_OBJECT_SUGGESTIONS, 'object'));
  });

  btnRandomAll.addEventListener('click', () => {
    toggleObjectRandom(true);
    toggleCutterRandom(true);
    toggleSurfaceRandom(true);
    toggleEnvRandom(true);
    randomizeRounds();
  });

  // Load the 4 dedicated AI-authored custom slot files straight into the live 3D preview!
  btnLoadAiSlots.addEventListener('click', () => {
    engine.audio.ensureContext();
    selObject.value = 'custom';
    selCutter.value = 'ai-custom';
    selSurface.value = 'ai-custom';
    selEnv.value = 'ai-custom';
    state.object = { mode: 'preset', presetId: 'custom', prompt: '' };
    state.cutter = { mode: 'preset', presetId: 'ai-custom', prompt: '' };
    state.surface = { mode: 'preset', presetId: 'ai-custom', prompt: '' };
    state.environment = { mode: 'preset', presetId: 'ai-custom', prompt: '' };
    syncCardVisual('object', cardObject, objModeBadge, btnRandomObj, inpObjectPrompt);
    syncCardVisual('cutter', cardCutter, cutterModeBadge, btnRandomCutter, inpCutterPrompt);
    syncCardVisual('surface', cardSurface, surfaceModeBadge, btnRandomSurface, inpSurfacePrompt);
    syncCardVisual('environment', cardEnv, envModeBadge, btnRandomEnv, inpEnvPrompt);
    engine.setEnvironment('ai-custom', '', false);
    engine.setSurface('ai-custom', '');
    engine.setCutter('ai-custom', '');
    engine.setObject('custom', true);
  });

  // --- Section 5: Custom Cut Rounds ---
  function getSortedSelectedRounds() {
    const arr = [...state.selectedCuts].sort((a, b) => a - b);
    return arr.length > 0 ? arr : [10];
  }
  function tierTagForCuts(c) {
    if (c <= 25) return 'Curved 3D';
    if (c <= 65) return 'Rapier';
    if (c <= 300) return 'Micro';
    return 'Sand';
  }
  function syncRoundsToEngine(restart = false) {
    engine.setRounds(getSortedSelectedRounds(), chkFastPacing.checked ? 0.65 : 1.0, restart);
  }
  function renderCutChips() {
    cutsChipGrid.innerHTML = '';
    state.availableCuts = [...new Set(state.availableCuts)].sort((a, b) => a - b);
    const defaultSet = new Set([10, 50, 100, 250, 500, 1000]);

    for (const c of state.availableCuts) {
      const chip = document.createElement('button');
      const isSelected = state.selectedCuts.has(c);
      chip.className = 'cut-chip' + (isSelected ? ' selected' : '');
      chip.innerHTML = `<span>${c.toLocaleString('en-US')}</span><span class="chip-tier">${tierTagForCuts(c)}</span>${!defaultSet.has(c) ? '<span class="chip-del">×</span>' : ''}`;

      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip-del')) {
          state.availableCuts = state.availableCuts.filter((x) => x !== c);
          state.selectedCuts.delete(c);
          if (state.selectedCuts.size === 0) state.selectedCuts.add(10);
          syncRoundsToEngine(false);
          renderCutChips();
          return;
        }
        if (isSelected) {
          if (state.selectedCuts.size > 1) state.selectedCuts.delete(c);
        } else {
          state.selectedCuts.add(c);
        }
        syncRoundsToEngine(false);
        renderCutChips();
      });

      chip.addEventListener('dblclick', () => {
        engine.audio.ensureContext();
        state.selectedCuts.add(c);
        syncRoundsToEngine(false);
        renderCutChips();
        engine.startRound(Math.max(0, getSortedSelectedRounds().indexOf(c)), false);
        btnPlayPause.textContent = '⏸ Pause';
      });

      cutsChipGrid.appendChild(chip);
    }

    const rounds = getSortedSelectedRounds();
    roundsSummary.textContent = `Video sequence (${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}): ${rounds.map((r) => r.toLocaleString('en-US')).join(' → ')} CUTS`;
  }

  function addCustomCut() {
    const val = Math.round(Number(inpCustomCut.value));
    if (!val || val < 3 || val > 2000) return;
    state.availableCuts.push(val);
    state.selectedCuts.add(val);
    inpCustomCut.value = '';
    syncRoundsToEngine(false);
    renderCutChips();
  }
  btnAddCut.addEventListener('click', addCustomCut);
  inpCustomCut.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustomCut(); });

  function randomizeRounds() {
    const presets = [
      [10, 100, 1000],
      [10, 50, 250, 1000],
      [10, 50, 100, 500, 1000],
      [10, 50, 100, 250, 500, 1000],
      [10, 250, 1000],
      [25, 100, 500, 1000],
    ];
    const picked = presets[Math.floor(Math.random() * presets.length)];
    for (const c of picked) if (!state.availableCuts.includes(c)) state.availableCuts.push(c);
    state.selectedCuts = new Set(picked);
    syncRoundsToEngine(false);
    renderCutChips();
  }
  btnRandomRounds.addEventListener('click', randomizeRounds);

  // --- Preview Controls ---
  btnPreviewSeq.addEventListener('click', () => {
    engine.audio.ensureContext();
    syncRoundsToEngine(false);
    engine.startRound(0, true);
    btnPlayPause.textContent = '⏸ Pause';
  });
  btnPlayPause.addEventListener('click', () => {
    engine.audio.ensureContext();
    btnPlayPause.textContent = engine.togglePause() ? '▶ Resume' : '⏸ Pause';
  });
  btnRestart.addEventListener('click', () => {
    engine.audio.ensureContext();
    syncRoundsToEngine(false);
    engine.startRound(engine.roundIndex, engine.autoSequence);
    btnPlayPause.textContent = '⏸ Pause';
  });
  speedGroup.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      speedGroup.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      engine.setSpeed(parseFloat(btn.dataset.speed));
    });
  });
  handleInput.addEventListener('input', () => engine.setHandle(handleInput.value));
  chkHud.addEventListener('change', () => { engine.showHud = chkHud.checked; });
  chkAudio.addEventListener('change', () => {
    engine.audio.ensureContext();
    engine.audio.setMuted(!chkAudio.checked);
  });

  // Telemetry
  let lastUiUpdate = 0;
  engine.onStateUpdate = (s) => {
    const now = performance.now();
    if (now - lastUiUpdate < 70) return;
    lastUiUpdate = now;
    fpsVal.textContent = s.fps;
    diagPhase.textContent = s.knifePhase;
    diagPhase.className = `phase-pill phase-${s.knifePhase}`;
    diagTier.textContent = `${s.roundLabel} • ${s.physics.tierName}`;
    diagStats.textContent = `${s.physics.logicalCubes.toLocaleString('en-US')} cubes`;
  };

  // --- Section 6A: Send Structured AI Brief to Claude / Antigravity ---
  let briefPollTimer = null;

  function captureTypedInputs() {
    if (state.object.mode !== 'ai-random' && inpObjectPrompt.value.trim()) {
      state.object = { mode: 'ai-prompt', presetId: '', prompt: inpObjectPrompt.value.trim() };
    }
    if (state.cutter.mode !== 'ai-random' && inpCutterPrompt.value.trim()) {
      state.cutter = { mode: 'ai-prompt', presetId: '', prompt: inpCutterPrompt.value.trim() };
    }
    if (state.surface.mode !== 'ai-random' && inpSurfacePrompt.value.trim()) {
      state.surface = { mode: 'ai-prompt', presetId: '', prompt: inpSurfacePrompt.value.trim() };
    }
    if (state.environment.mode !== 'ai-random' && inpEnvPrompt.value.trim()) {
      state.environment = { mode: 'ai-prompt', presetId: '', prompt: inpEnvPrompt.value.trim() };
    }
  }

  function getRenderConfig() {
    const [resStr, fpsStr, baseScaleStr] = selQuality.value.split('|');
    const [width, height] = resStr.split('x').map(Number);
    return {
      handle: handleInput.value.trim(),
      width,
      height,
      fps: Number(fpsStr),
      durationScale: Number(baseScaleStr) * (chkFastPacing.checked ? 0.68 : 1.0),
      showHud: chkHud.checked,
    };
  }

  btnSendBrief.addEventListener('click', async () => {
    captureTypedInputs();
    const payload = {
      object: state.object,
      cutter: state.cutter,
      surface: state.surface,
      environment: state.environment,
      rounds: getSortedSelectedRounds(),
      render: getRenderConfig(),
    };

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save creative brief');

      state.watchedBriefId = data.brief.id;
      briefStatusBox.classList.remove('hidden');
      const randCount = ['object', 'cutter', 'surface', 'environment'].filter((k) => payload[k].mode === 'ai-random').length;
      briefTitle.textContent = `✅ Brief saved (${randCount > 0 ? randCount + ' AI random slots' : 'custom'})`;
      briefDesc.textContent = 'Send the command below to Claude Code or Antigravity — your AI will code bespoke 3D modules and automatically render your MP4:';
      briefCmd.textContent = 'Run the infinite-slice-skill brief';

      try {
        await navigator.clipboard.writeText('Run the infinite-slice-skill brief');
        btnCopyTrigger.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyTrigger.textContent = '📋 Copy Command'; }, 2000);
      } catch {}

      // Watch for AI completion automatically
      clearInterval(briefPollTimer);
      briefPollTimer = setInterval(async () => {
        try {
          const bRes = await fetch('/api/brief');
          const bData = await bRes.json();
          const b = bData.brief;
          if (!b || b.id !== state.watchedBriefId) return;
          if (b.status === 'rendering') {
            briefTitle.textContent = '🎬 AI built your 3D models! Rendering MP4…';
          } else if (b.status === 'completed' && b.result) {
            clearInterval(briefPollTimer);
            briefTitle.textContent = `🎉 AI-authored MP4 ready (${b.result.fileSizeMb} MB)!`;
            await fetchHistory();
            await refreshVault();
            openVideoPlayer({
              filename: b.result.filename,
              sizeMb: b.result.fileSizeMb,
              url: `/api/video/${encodeURIComponent(b.result.filename)}`,
              downloadUrl: `/api/video/${encodeURIComponent(b.result.filename)}?download=1`,
              manifest: { name: b.result.filename },
              caption: b.result.caption || '',
            });
          }
        } catch {}
      }, 2000);
    } catch (err) {
      alert('Failed to save AI brief: ' + err.message);
    }
  });

  btnCopyTrigger.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(briefCmd.textContent);
      btnCopyTrigger.textContent = '✅ Copied!';
      setTimeout(() => { btnCopyTrigger.textContent = '📋 Copy Command'; }, 1800);
    } catch {}
  });

  // --- Section 6B: Direct 1-Click MP4 Render of Current Live Preview ---
  let pollTimer = null;

  function openVideoPlayer(item) {
    playerBox.classList.remove('hidden');
    const title = item.manifest?.englishName || item.manifest?.name || item.filename;
    playerTitle.textContent = `🎬 ${title} (${item.sizeMb} MB)`;
    mp4Player.src = item.url;
    mp4Player.load();
    playerDownload.href = item.downloadUrl;
    playerDownload.download = item.filename;
    state.activeCaption = item.caption || '';
  }

  btnClosePlayer.addEventListener('click', () => {
    mp4Player.pause();
    playerBox.classList.add('hidden');
  });

  btnCopyCaption.addEventListener('click', async () => {
    if (!state.activeCaption) return;
    try {
      await navigator.clipboard.writeText(state.activeCaption);
      btnCopyCaption.textContent = '✅ Caption Copied!';
      setTimeout(() => { btnCopyCaption.textContent = '📋 Copy Viral Caption'; }, 1800);
    } catch {
      alert(state.activeCaption);
    }
  });

  async function refreshVault() {
    try {
      const res = await fetch('/api/videos');
      if (!res.ok) throw new Error('API unavailable');
      const data = await res.json();
      vaultList.innerHTML = '';
      if (!data.videos || data.videos.length === 0) {
        vaultList.innerHTML = '<span class="empty-note">No MP4 videos rendered yet.</span>';
        return;
      }
      for (const v of data.videos.slice(0, 12)) {
        const row = document.createElement('div');
        row.className = 'vault-item';
        const title = v.manifest?.englishName || v.manifest?.name || v.filename;
        const roundsStr = v.manifest?.rounds ? v.manifest.rounds.join('→') : '';
        const resStr = v.manifest ? `${v.manifest.width}×${v.manifest.height} • ${v.manifest.fps}fps` : '';
        row.innerHTML = `
          <div class="vault-meta">
            <strong>${title}</strong>
            <span>${v.sizeMb} MB ${resStr ? '• ' + resStr : ''} ${roundsStr ? '• ' + roundsStr : ''}</span>
          </div>
          <div class="vault-btns">
            <button class="btn-secondary btn-sm btn-watch">▶ Watch</button>
            <a class="btn-primary btn-sm" href="${v.downloadUrl}" download="${v.filename}">⬇ MP4</a>
          </div>
        `;
        row.querySelector('.btn-watch').addEventListener('click', () => openVideoPlayer(v));
        vaultList.appendChild(row);
      }
    } catch {
      vaultList.innerHTML = '<span class="empty-note">Run via "npm run studio" to enable local MP4 rendering & video vault.</span>';
    }
  }
  btnRefreshVault.addEventListener('click', refreshVault);

  btnRenderMp4.addEventListener('click', async () => {
    // If any slot is on "ai-random", automatically materialize a fresh non-preset AI suggestion for instant render!
    if (state.object.mode === 'ai-random') setObjectPromptMode(pickFreshSuggestion(AI_OBJECT_SUGGESTIONS, 'object'));
    if (state.cutter.mode === 'ai-random') setCutterPromptMode(pickFreshSuggestion(AI_CUTTER_SUGGESTIONS, 'cutter'));
    if (state.surface.mode === 'ai-random') setSurfacePromptMode(pickFreshSuggestion(AI_SURFACE_SUGGESTIONS, 'surface'));
    if (state.environment.mode === 'ai-random') setEnvPromptMode(pickFreshSuggestion(AI_ENV_SUGGESTIONS, 'environment'));

    captureTypedInputs();
    const rc = getRenderConfig();
    const rounds = getSortedSelectedRounds();

    btnRenderMp4.disabled = true;
    btnRenderMp4.textContent = '⏳ Rendering MP4 (Playwright + FFmpeg)…';
    renderProgressBox.classList.remove('hidden');
    progressMsg.textContent = 'Sending job to offline renderer…';
    progressPct.textContent = '2%';
    progressFill.style.width = '2%';

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectId: state.object.mode === 'preset' ? state.object.presetId : 'prompt-custom',
          objectPrompt: state.object.mode === 'ai-prompt' ? state.object.prompt : '',
          cutterId: state.cutter.mode === 'preset' ? state.cutter.presetId : 'custom',
          cutterPrompt: state.cutter.mode === 'ai-prompt' ? state.cutter.prompt : '',
          surfaceId: state.surface.mode === 'preset' ? state.surface.presetId : 'custom',
          surfacePrompt: state.surface.mode === 'ai-prompt' ? state.surface.prompt : '',
          envId: state.environment.mode === 'preset' ? state.environment.presetId : 'custom',
          envPrompt: state.environment.mode === 'ai-prompt' ? state.environment.prompt : '',
          rounds,
          ...rc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start render');

      const jobId = data.jobId;
      clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const stRes = await fetch(`/api/render/${encodeURIComponent(jobId)}`);
          const job = await stRes.json();
          progressMsg.textContent = job.message || 'Rendering…';
          progressPct.textContent = `${job.percent || 0}%`;
          progressFill.style.width = `${job.percent || 0}%`;

          if (job.status === 'done') {
            clearInterval(pollTimer);
            btnRenderMp4.disabled = false;
            btnRenderMp4.textContent = '🎬 Render MP4 Video Now (Current Preview)';
            await fetchHistory();
            await refreshVault();
            if (job.manifest) {
              openVideoPlayer({
                filename: job.manifest.filename,
                sizeMb: job.manifest.fileSizeMb,
                url: `/api/video/${encodeURIComponent(job.manifest.filename)}`,
                downloadUrl: `/api/video/${encodeURIComponent(job.manifest.filename)}?download=1`,
                manifest: job.manifest,
                caption: job.caption || '',
              });
            }
          } else if (job.status === 'error') {
            clearInterval(pollTimer);
            btnRenderMp4.disabled = false;
            btnRenderMp4.textContent = '🎬 Render MP4 Video Now (Current Preview)';
            progressMsg.textContent = `Error: ${job.error}`;
          }
        } catch (err) {
          clearInterval(pollTimer);
          btnRenderMp4.disabled = false;
          btnRenderMp4.textContent = '🎬 Render MP4 Video Now (Current Preview)';
          progressMsg.textContent = `Error: ${err.message}`;
        }
      }, 450);
    } catch (err) {
      btnRenderMp4.disabled = false;
      btnRenderMp4.textContent = '🎬 Render MP4 Video Now (Current Preview)';
      progressMsg.textContent = `Error: ${err.message}`;
    }
  });

  window.__INFINITE_SLICE__ = { engine, ROUNDS, OBJECT_LIST, CUTTER_LIST, SURFACE_LIST, ENVIRONMENT_LIST };

  engine.init().then(async () => {
    loadingOverlay.classList.add('hidden');
    renderCutChips();
    await fetchHistory();
    await refreshVault();
  }).catch((err) => {
    console.error('Boot error:', err);
    loadingOverlay.innerHTML = `<span style="color:#fca5a5">Boot error: ${err.message}</span>`;
  });
}
