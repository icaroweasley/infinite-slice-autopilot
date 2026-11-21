import * as THREE from 'three';

/**
 * Turquoise Epoxy Resin River & Dark Walnut Slab with Gold Leaf Flakes
 * Bespoke AI cutting surface for brief-1795242608896
 */
export const customSurface = {
  id: 'ai-custom',
  name: 'Nogueira & Rio de Resina Turquesa',
  subtitle: 'Madeira nobre escura com rio translúcido turquesa e folha de ouro',
  surfaceAudio: 'wood',

  apply({ boardMat, rimMat, leafMesh }) {
    leafMesh.visible = false;

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');

    // 1. Rich dark American walnut background
    ctx.fillStyle = '#3b2416';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y++) {
      const wave = Math.sin(y * 0.055) * 14;
      ctx.fillStyle = y % 3 === 0 ? 'rgba(20,10,4,0.28)' : 'rgba(130,82,46,0.12)';
      ctx.fillRect(0, y + (wave * 0.05), 512, 1.5);
    }

    // 2. Winding luminous turquoise-sapphire epoxy river meandering across center
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 175);
    for (let x = 0; x <= 512; x += 16) {
      const yTop = 175 + Math.sin(x * 0.016) * 32 + Math.cos(x * 0.038) * 12;
      ctx.lineTo(x, yTop);
    }
    for (let x = 512; x >= 0; x -= 16) {
      const yBot = 335 + Math.sin(x * 0.016 + 0.6) * 30 + Math.cos(x * 0.032) * 14;
      ctx.lineTo(x, yBot);
    }
    ctx.closePath();

    const riverGrad = ctx.createLinearGradient(0, 150, 0, 360);
    riverGrad.addColorStop(0, '#0c4a6e');
    riverGrad.addColorStop(0.3, '#0284c7');
    riverGrad.addColorStop(0.55, '#22d3ee');
    riverGrad.addColorStop(0.8, '#0369a1');
    riverGrad.addColorStop(1, '#082f49');
    ctx.fillStyle = riverGrad;
    ctx.fill();

    // Live-edge golden bark transition outline
    ctx.strokeStyle = 'rgba(217, 163, 74, 0.72)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Pearlescent cyan swirl ribbons & gold leaf flecks inside resin river
    ctx.clip();
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      let y = 170 + (i * 11) % 165;
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 24) {
        ctx.lineTo(x, y + Math.sin(x * 0.022 + i * 0.9) * 18);
      }
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(186,245,255,0.34)' : 'rgba(14,165,233,0.28)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    for (let g = 0; g < 55; g++) {
      const gx = (g * 97 + 23) % 512;
      const gy = 185 + ((g * 61) % 140);
      ctx.fillStyle = 'rgba(250, 204, 65, 0.85)';
      ctx.fillRect(gx, gy, 3 + (g % 4), 2 + (g % 3));
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    boardMat.color.set('#ffffff');
    boardMat.map = tex;
    boardMat.roughness = 0.22;
    boardMat.metalness = 0.14;
    boardMat.transparent = false;
    boardMat.opacity = 1.0;
    boardMat.emissive.set('#05202e');
    boardMat.emissiveIntensity = 0.16;
    boardMat.needsUpdate = true;

    rimMat.color.set('#c99438');
    rimMat.emissive.set('#000000');
    rimMat.emissiveIntensity = 0;
  },
};
