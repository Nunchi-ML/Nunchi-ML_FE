import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Shared branched trunk and layered crown; two instanced draws for the avenue. */
export function createTreeAssets() {
  const branches: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number) => {
    const delta = b.clone().sub(a), g = new THREE.CylinderGeometry(top, bottom, delta.length(), 7, 1);
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()), new THREE.Vector3(1, 1, 1)));
    branches.push(g);
  };
  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.1, 3.8, .03), .3, .14);
  for (let i = 0; i < 4; i++) {
    const angle = i * 2.4;
    branch(new THREE.Vector3(.05, 2.6 + i * .13, 0), new THREE.Vector3(Math.cos(angle) * 1.25, 4.3 + i * .14, Math.sin(angle) * 1.25), .13, .045);
  }
  const trunkGeo = mergeGeometries(branches)!; branches.forEach(g => g.dispose());
  const bark = new Uint8Array(64 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const groove = Math.sin(x * .8 + Math.sin(y * .05) * .9) + Math.sin(x * 1.9 + y * .015);
    const value = 90 + groove * 16; bark.set([value, value * .86, value * .68, 255], (y * 64 + x) * 4);
  }
  const barkTex = new THREE.DataTexture(bark, 64, 128); barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping; barkTex.magFilter = THREE.LinearFilter; barkTex.needsUpdate = true;
  const trunkMat = new THREE.MeshLambertMaterial({ map: barkTex });
  const lobes: THREE.BufferGeometry[] = [];
  const clusters = [[0, 5.1, 0, 1.85, 1.9, 1.65], [-1.15, 4.6, .25, 1.45, 1.55, 1.3], [1.15, 4.55, -.2, 1.5, 1.5, 1.3], [.25, 4.5, 1.15, 1.55, 1.45, 1.35], [-.25, 4.8, -1.1, 1.55, 1.6, 1.35], [.45, 6, .1, 1.25, 1.4, 1.2]];
  clusters.forEach(([x, y, z, sx, sy, sz], cluster) => {
    const shape = new THREE.IcosahedronGeometry(1, cluster < 3 ? 1 : 0);
    shape.deleteAttribute('normal'); shape.deleteAttribute('uv');
    const g = mergeVertices(shape), pos = g.getAttribute('position'); shape.dispose();
    for (let i = 0; i < pos.count; i++) {
      const n = Math.sin(pos.getX(i) * 12 + pos.getY(i) * 21 + pos.getZ(i) * 17 + cluster * 8);
      pos.setXYZ(i, x + pos.getX(i) * sx * (1 + n * .12), y + pos.getY(i) * sy * (1 + n * .08), z + pos.getZ(i) * sz * (1 + n * .12));
    }
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const light = .72 + (pos.getY(i) - 3) / 4.5 * .25 + Math.sin(i * 17 + cluster * 9) * .045;
      colors.set([light * .93, light, light * .84], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); lobes.push(g);
  });
  const crownGeo = mergeGeometries(lobes)!; lobes.forEach(g => g.dispose());
  const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, dithering: true });
  return { trunkGeo, crownGeo, trunkMat, crownMat };
}
