import * as THREE from 'three';

/**
 * Obsidian Magma Wakizashi Blade
 * Bespoke AI 3D cutter for brief-1795242608896
 *
 * Volcanic obsidian-black faceted blade with a blazing molten-gold plasma cutting edge,
 * brushed gold collar (habaki), and faceted carbon-and-gold hilt.
 */
export const customCutter = {
  id: 'ai-custom',
  name: 'Wakizashi Obsidiana & Ouro Incandescente',
  subtitle: 'Lâmina vulcânica negra com fio de plasma dourado',
  blurHex: 0xffb326,

  build() {
    const toolGroup = new THREE.Group();

    // Sleek angular Japanese Wakizashi tanto-point blade profile (edge strictly at y = 0)
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-1.54, 0.0);
    bladeShape.lineTo(1.12, 0.0);
    bladeShape.lineTo(1.62, 0.24); // sharp geometric kissaki tanto tip
    bladeShape.lineTo(1.16, 0.35);
    bladeShape.lineTo(-1.54, 0.40);
    bladeShape.closePath();

    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.024,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    bladeGeo.translate(0, 0, -0.012);
    bladeGeo.rotateY(-Math.PI * 0.5);

    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x12141c,
      metalness: 0.48,
      roughness: 0.14,
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, obsidianMat);
    bladeMesh.castShadow = true;
    bladeMesh.receiveShadow = true;
    toolGroup.add(bladeMesh);

    // Blazing molten-gold plasma razor edge along y = 0.015
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xffe484,
      emissive: 0xff9d0a,
      emissiveIntensity: 2.1,
      roughness: 0.10,
      metalness: 0.30,
    });
    const edgeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.036, 2.74), edgeMat);
    edgeStrip.position.set(0, 0.018, -0.18);
    toolGroup.add(edgeStrip);

    // Engraved 24k gold Habaki collar & diamond Tsuba guard
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf5c445,
      metalness: 0.96,
      roughness: 0.18,
    });
    const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.42, 0.24), goldMat);
    habaki.position.set(0, 0.21, -1.56);
    habaki.castShadow = true;
    toolGroup.add(habaki);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.52, 0.06), goldMat);
    guard.position.set(0, 0.21, -1.70);
    guard.castShadow = true;
    toolGroup.add(guard);

    // Faceted dark carbon-and-gold hilt extending cleanly to -Z
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.11, 1.32, 6),
      new THREE.MeshStandardMaterial({ color: 0x161822, roughness: 0.46, metalness: 0.22 })
    );
    hilt.rotation.x = Math.PI * 0.5;
    hilt.position.set(0, 0.21, -2.38);
    hilt.castShadow = true;
    toolGroup.add(hilt);

    for (const rz of [-1.92, -2.28, -2.64, -2.98]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.045, 6), goldMat);
      band.rotation.x = Math.PI * 0.5;
      band.position.set(0, 0.21, rz);
      toolGroup.add(band);
    }

    return {
      toolGroup,
      bladeGeo,
      bladeMatsToFade: [obsidianMat, edgeMat],
      blurHex: this.blurHex,
    };
  },
};
