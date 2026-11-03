import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 앞뒤 오버행·어깨선·보닛을 따로 잡은 차체. 모든 차량이 차종별 지오메트리를 공유한다. */
export function sculptedBody(length: number, width: number, base: number, shoulder: number,
  wheelZ = [length * .3, -length * .3], wheelRadius = .33,
  cockpit?: { start: number; end: number; floor: number }) {
  const profile = [
    [-.5, .9, -.05], [-.47, .97, -.01], [-.34, 1, .01], [-.13, 1, .015],
    [.17, 1, 0], [.34, .98, -.015], [.45, .96, -.05], [.49, .94, -.08], [.5, .9, -.1],
  ];
  const samples = new Set(profile.map(s => s[0]));
  // 휠하우스 곡선을 충분히 샘플링해 타이어 위 차체를 실제로 비운다.
  for (const z of wheelZ) for (let i = -6; i <= 6; i++) samples.add((z + (wheelRadius + .09) * i / 6) / length);
  if (cockpit) for (const z of [cockpit.start, cockpit.start + .14, 0, cockpit.end - .14, cockpit.end]) samples.add(z / length);
  const sections = [...samples].filter(t => t >= -.5 && t <= .5).sort((a, b) => a - b).map(t => {
    const i = Math.max(0, Math.min(profile.length - 2, profile.findIndex((_, i) => i < profile.length - 1 && t <= profile[i + 1][0])));
    const a = profile[i], b = profile[i + 1], u = (t - a[0]) / (b[0] - a[0]);
    return [t, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  });
  const positions: number[] = [], indices: number[] = [];
  for (const [z, taper, rise] of sections) {
    const w = width * .5 * taper, top = shoulder + rise;
    let lower = base + .1;
    for (const center of wheelZ) {
      const dz = z * length - center, radius = wheelRadius + .09;
      if (Math.abs(dz) < radius) lower = Math.max(lower, wheelRadius + Math.sqrt(radius * radius - dz * dz));
    }
    lower = Math.min(top - .11, lower);
    const open = cockpit ? Math.max(0, Math.min(1, (z * length - cockpit.start) / .14, (cockpit.end - z * length) / .14)) : 0;
    const inner = (top + .034) * (1 - open) + (cockpit?.floor ?? top + .034) * open;
    const ring = [[-.62 * w, base], [-w, lower], [-w, top - .1], [-.91 * w, top], [-.77 * w, top + .035],
      [-.77 * w, inner], [.77 * w, inner], [.77 * w, top + .035], [.91 * w, top], [w, top - .1], [w, lower], [.62 * w, base]];
    for (const [x, y] of ring) positions.push(x, y, z * length);
  }
  const ringSize = 12;
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
