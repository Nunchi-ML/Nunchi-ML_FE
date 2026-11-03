import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 앞뒤 오버행·어깨선·보닛을 따로 잡은 차체. 모든 차량이 차종별 지오메트리를 공유한다. */
export function sculptedBody(length: number, width: number, base: number, shoulder: number) {
  const sections = [
    [-.5, .79, -.16], [-.47, .93, -.04], [-.34, 1, .01], [-.13, 1, .015],
    [.17, 1, 0], [.34, .98, -.015], [.45, .93, -.07], [.49, .84, -.16], [.5, .74, -.21],
  ];
  const positions: number[] = [], indices: number[] = [];
  for (const [z, taper, rise] of sections) {
    const w = width * .5 * taper, top = shoulder + rise;
    const ring = [[-.76 * w, base], [-w, base + .12], [-w, top - .1], [-.91 * w, top], [-.65 * w, top + .035],
      [.65 * w, top + .035], [.91 * w, top], [w, top - .1], [w, base + .12], [.76 * w, base]];
    for (const [x, y] of ring) positions.push(x, y, z * length);
  }
  const ringSize = 10;
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < ringSize; j++) {
    const a = i * ringSize + j, b = a + ringSize, c = i * ringSize + (j + 1) % ringSize, d = c + ringSize;
    indices.push(a, b, c, c, b, d);
  }
  // 끝면은 별도 정점으로 분리해 범퍼와 측면의 법선이 섞이지 않게 한다.
  for (const end of [0, sections.length - 1]) {
    const first = positions.length / 3;
    for (let j = 0; j < ringSize; j++) positions.push(...positions.slice((end * ringSize + j) * 3, (end * ringSize + j + 1) * 3));
    const center = positions.length / 3;
    positions.push(0, (base + shoulder + sections[end][2]) / 2, sections[end][0] * length);
    for (let j = 0; j < ringSize; j++) {
      const a = first + j, b = first + (j + 1) % ringSize;
      indices.push(center, ...(end === 0 ? [a, b] : [b, a]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** 림·허브·스포크를 한 메시로: 기존의 바퀴당 스포크 메시 5개를 없앤다. */
export function alloyWheel(radius: number) {
  const parts: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(radius * .65, radius * .055, 6, 24).rotateY(Math.PI / 2),
    new THREE.CylinderGeometry(radius * .18, radius * .18, .035, 12).rotateZ(Math.PI / 2),
  ];
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    parts.push(new THREE.BoxGeometry(.025, radius * .5, radius * .085)
      .translate(0, radius * .4, 0).rotateX(angle));
  }
  const merged = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  if (!merged) throw new Error('차량 휠 지오메트리를 만들 수 없습니다.');
  merged.computeBoundingBox(); return merged;
}
