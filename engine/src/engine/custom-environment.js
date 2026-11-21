import * as THREE from 'three';

/**
 * Swiss Horology Atelier at Midnight
 * Bespoke AI studio environment for brief-1795242608896
 *
 * Fluted midnight-slate architectural walls, espresso workbench,
 * warm museum gold key spotlight, sapphire cool fill, and rich amber rim light.
 */
export const customEnvironment = {
  id: 'ai-custom',
  name: 'Ateliê de Relojoaria Suíça (Meia-Noite)',
  subtitle: 'Paredes caneladas azul-ardósia + bancada espresso + luz de joalheria',

  apply({ scene, wallMat, counterMat, lights }) {
    // Procedural fluted luxury architectural slate wall texture
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    const flutes = 24;
    const fw = 512 / flutes;
    for (let i = 0; i < flutes; i++) {
      const x = i * fw;
      const g = ctx.createLinearGradient(x, 0, x + fw, 0);
      g.addColorStop(0, '#0a0f1c');
      g.addColorStop(0.35, '#17223a');
      g.addColorStop(0.65, '#1e2c4a');
      g.addColorStop(1, '#090e1a');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, fw, 512);
    }
    // Thin brushed brass horizontal inlay rail
    ctx.fillStyle = 'rgba(218, 174, 72, 0.35)';
    ctx.fillRect(0, 390, 512, 4);

    const wallTex = new THREE.CanvasTexture(c);
    wallTex.colorSpace = THREE.SRGBColorSpace;
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(3.2, 1.5);
    wallTex.anisotropy = 8;

    scene.background = new THREE.Color('#090d18');

    counterMat.map = null;
    counterMat.color.set('#141114');
    counterMat.roughness = 0.42;
    counterMat.metalness = 0.22;

    wallMat.map = wallTex;
    wallMat.color.set('#ffffff');
    wallMat.roughness = 0.46;
    wallMat.metalness = 0.18;

    const { hemi, key, fill, rim } = lights;
    hemi.color.set('#cfe4ff');
    hemi.groundColor.set('#211710');
    hemi.intensity = 0.80;

    key.color.set('#fff0d4');
    key.intensity = 2.95;

    fill.color.set('#5ec4f8');
    fill.intensity = 1.05;

    rim.color.set('#ffb94a');
    rim.intensity = 1.55;

    wallMat.needsUpdate = true;
    counterMat.needsUpdate = true;
  },
};
