import * as THREE from 'three';
import data from '../data/dalgu_buildings.json';

/** OSM 건물 윤곽을 높이만큼 세운 실제 배치 도시 + iM뱅크 본점 랜드마크 */
interface CityData { b: { p: number[]; h: number; k: number }[]; bank: { pts: number[][]; levels: number } | null }
const C = data as unknown as CityData;

/** iM뱅크 본점 실제 위치 (OSM 윤곽 중심, 로컬 m) */
export const BANK_POS = C.bank ? {
  x: C.bank.pts.reduce((s, p) => s + p[0], 0) / C.bank.pts.length,
  z: C.bank.pts.reduce((s, p) => s + p[1], 0) / C.bank.pts.length,
} : null;

// 종류별 벽 색 (0 기타 · 1 아파트 · 2 상가 · 3 사무실 · 4 학교)
const PAL: number[][] = [
  [0xe2d5c2, 0xd6c3a8, 0xcfc8bd, 0xbfb3a3, 0xe8e0d2],
  [0xf1ece2, 0xe9e2d6, 0xf4efe6, 0xdcd6cc, 0xe6ddcf],
  [0xd9cbb8, 0xc9c2b8, 0xb9a891, 0xd1b897, 0xa9a39c, 0xc4b5a5],
  [0x9fb0b8, 0xaab6bb, 0x8fa1aa, 0xb8c0c2],
  [0xc0785a, 0xb8735a, 0xcc8a6a],
];

/** 벽(창문 UV, 바깥 법선) + 지붕(삼각분할)을 한 덩어리 지오메트리로 */
function buildChunk(items: CityData['b']) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), roofC = new THREE.Color();
  items.forEach((b, bi) => {
    let pts: THREE.Vector2[] = [];
    for (let i = 0; i < b.p.length; i += 2) pts.push(new THREE.Vector2(b.p[i], b.p[i + 1]));
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], d = pts[(i + 1) % pts.length]; area += a.x * d.y - d.x * a.y; }
    if (area < 0) pts = pts.reverse();
    const pal = PAL[b.k] ?? PAL[0], seed = Math.abs(Math.round(b.p[0] * 7 + b.p[1] * 13 + bi));
    c.setHex(pal[seed % pal.length]); roofC.copy(c).multiplyScalar(0.72);
    const h = b.h;
    let run = 0;
    for (let i = 0; i < pts.length; i++) {                                     // 벽: 바깥을 보게 감음
      const a = pts[i], d = pts[(i + 1) % pts.length], len = a.distanceTo(d);
      if (len < 0.05) continue;
      const nx = (d.y - a.y) / len, nz = -(d.x - a.x) / len, base = pos.length / 3;
      pos.push(a.x, 0, a.y, a.x, h, a.y, d.x, 0, d.y, d.x, h, d.y);
      for (let k = 0; k < 4; k++) { nor.push(nx, 0, nz); col.push(c.r, c.g, c.b); }
      uv.push(run / 4, 0, run / 4, h / 3.5, (run + len) / 4, 0, (run + len) / 4, h / 3.5);
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      run += len;
    }
    const tris = THREE.ShapeUtils.triangulateShape(pts, []), base = pos.length / 3;   // 지붕
    pts.forEach(p => { pos.push(p.x, h, p.y); nor.push(0, 1, 0); uv.push(0.02, 0.02); col.push(roofC.r, roofC.g, roofC.b); });
    tris.forEach(([i0, i1, i2]) => {
      const a = pts[i0], b2 = pts[i1], d = pts[i2];
      const up = (b2.y - a.y) * (d.x - a.x) - (b2.x - a.x) * (d.y - a.y) > 0;  // 위를 보게
      if (up) idx.push(base + i0, base + i1, base + i2); else idx.push(base + i0, base + i2, base + i1);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildCity(scene: THREE.Scene, winTex: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ map: winTex, vertexColors: true, roughness: 0.8, metalness: 0.05 });
  // 600 m 칸으로 나눠 화면 밖 덩어리는 그리지 않고, 해 가림 검사도 가볍게
  const chunks = new Map<number, CityData['b']>();
  C.b.forEach(b => { const k = Math.floor(b.p[0] / 600) * 1000 + Math.floor(b.p[1] / 600); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push(b); });
  const meshes: THREE.Mesh[] = [];
  chunks.forEach(items => { const m = new THREE.Mesh(buildChunk(items), mat); m.castShadow = m.receiveShadow = true; scene.add(m); meshes.push(m); });

  const bank = C.bank ? buildBank(scene) : null;
  return { meshes, bank };
}

/** iM뱅크 본점: 실제 위치 · 18층 윤곽을 바탕으로 유리 커튼월 · 세로 핀 · 빛나는 왕관 · 간판 */
function buildBank(scene: THREE.Scene) {
  const P = C.bank!.pts.map(([x, z]) => new THREE.Vector2(x, z));
  const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cz = P.reduce((s, p) => s + p.y, 0) / P.length;
  const e0 = P[1].clone().sub(P[0]), e1 = P[2].clone().sub(P[1]);
  const long = e0.length() >= e1.length() ? e0 : e1, angle = Math.atan2(long.y, long.x);
  const W = Math.max(34, Math.max(e0.length(), e1.length()) * 0.9), Dp = Math.max(24, Math.min(e0.length(), e1.length()) * 0.9);
  const H = Math.max(76, C.bank!.levels * 4.2);

  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = -angle; scene.add(g);
  const green = 0x00a07a;
  const gridTex = canvasTex(64, 64, x => {                                     // 커튼월 줄눈
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#7d8c8a'; x.fillRect(0, 60, 64, 4); x.fillRect(30, 0, 3, 64);
  });
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(1 / 3, 1 / 4.2);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x6fa59a, map: gridTex, metalness: 0.55, roughness: 0.12, clearcoat: 0.6, envMapIntensity: 1.3 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xe9ecec, roughness: 0.35, metalness: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: green, emissive: green, emissiveIntensity: 0.6, roughness: 0.4 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.9 });

  // 둥근 모서리 탑 (세계 좌표 UV → 줄눈이 층 높이에 맞음)
  const r = 5, s = new THREE.Shape(), w2 = W / 2, d2 = Dp / 2;
  s.moveTo(-w2 + r, -d2); s.lineTo(w2 - r, -d2); s.quadraticCurveTo(w2, -d2, w2, -d2 + r); s.lineTo(w2, d2 - r); s.quadraticCurveTo(w2, d2, w2 - r, d2);
  s.lineTo(-w2 + r, d2); s.quadraticCurveTo(-w2, d2, -w2, d2 - r); s.lineTo(-w2, -d2 + r); s.quadraticCurveTo(-w2, -d2, -w2 + r, -d2);
  const tower = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: H, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), glass);
  tower.castShadow = tower.receiveShadow = true; g.add(tower);
  // 세로 알루미늄 핀 (긴 면 · 짧은 면)
  const fin = new THREE.BoxGeometry(0.5, H - 8, 1.2); fin.translate(0, (H - 8) / 2 + 8, 0);
  const finsN = Math.floor((W - 2 * r) / 3) * 2 + Math.floor((Dp - 2 * r) / 3) * 2;
  const fins = new THREE.InstancedMesh(fin, alu, finsN); let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (let x = -w2 + r; x <= w2 - r && n < finsN; x += 3) for (const sz of [-1, 1]) if (n < finsN) { q.identity(); fins.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, 0, sz * (d2 + 0.5)), q, one)); }
  for (let z = -d2 + r; z <= d2 - r && n < finsN; z += 3) for (const sx of [-1, 1]) if (n < finsN) { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); fins.setMatrixAt(n++, m4.compose(new THREE.Vector3(sx * (w2 + 0.5), 0, z), q, one)); }
  fins.count = n; fins.castShadow = true; g.add(fins);
  // 저층부 (넓은 기단 · 로비 캐노피)
  const pod = new THREE.Mesh(new THREE.BoxGeometry(W + 16, 9, Dp + 12), stone); pod.position.y = 4.5; pod.castShadow = pod.receiveShadow = true; g.add(pod);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.6, 6), alu); canopy.position.set(0, 7, Dp / 2 + 9); g.add(canopy);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, Dp + 40), stone); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; plaza.receiveShadow = true; g.add(plaza);
  // 왕관: 초록 띠 두 줄 + 네 면 간판 (해 질 녘 빛남)
  for (const [y, h] of [[H - 6, 1.6], [H + 0.2, 2.4]] as const) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, h, Dp + 1.6), glow); band.position.y = y; g.add(band);
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 9, Dp * 0.7), glass); crown.position.y = H + 5.5; g.add(crown);
  const signTex = canvasTex(1024, 256, x => {
    x.fillStyle = '#00a07a'; x.fillRect(0, 0, 1024, 256);
    x.fillStyle = '#ffffff'; x.font = '900 170px "Noto Sans KR", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('iM뱅크', 512, 140);
  });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
  const sw = Math.min(W * 0.85, 34), sh = sw / 4;
  for (const [x, z, ry, ww] of [[0, Dp * 0.35 + 0.1, 0, sw], [0, -Dp * 0.35 - 0.1, Math.PI, sw], [W * 0.35 + 0.1, 0, Math.PI / 2, Dp * 0.65], [-W * 0.35 - 0.1, 0, -Math.PI / 2, Dp * 0.65]] as const) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(ww, ww / 4), signMat); sg.position.set(x, H + 5.5, z); sg.rotation.y = ry; g.add(sg);
  }
  const pod2 = new THREE.Mesh(new THREE.PlaneGeometry(sw * 0.8, sh * 0.8), signMat); pod2.position.set(0, 7.4, Dp / 2 + 12.1); g.add(pod2);   // 입구 간판
  // 옥상 안테나 · 경고등
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 14, 8), alu); mast.position.y = H + 17; g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b2f, toneMapped: false })); beacon.position.y = H + 24.5; g.add(beacon);
  // 깃대
  for (const x of [-8, 0, 8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 14, 6), alu); p.position.set(x, 7, Dp / 2 + 18); g.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshStandardMaterial({ color: x === 0 ? green : 0xf4f4f2, side: THREE.DoubleSide })); f.position.set(x + 1.3, 12.6, Dp / 2 + 18); g.add(f); }

  return { group: g, glow, H };
}
