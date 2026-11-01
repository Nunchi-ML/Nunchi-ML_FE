import * as THREE from 'three';
import { ROAD_W, at, rawToS } from './road';
import { OSM, type OsmJunction } from './osm';

/**
 * 달구벌대로 거리 시설물 — OpenStreetMap 실제 자리 기준:
 * 옆길(실제 모양) · 사거리 바닥 · 횡단보도 · 정지선 · 신호등 · 버스정류장 쉘터 · 도시철도 2호선 출입구.
 * 같은 종류는 묶어서 한 번에 그림 (인스턴싱) — 수백 개여도 가볍게.
 */
const HALF = ROAD_W / 2;
const UP = new THREE.Vector3(0, 1, 0);
const RANK: Record<string, number> = { trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1 };
const ARM_W: Record<string, number> = { trunk: 28, primary: 24, secondary: 20, tertiary: 14, residential: 8, unclassified: 8 };

/* ---------- 실제 자리 정리 (게임 도로 거리 s 기준) ---------- */
interface Junc { s: number; w: number; rank: number; src: OsmJunction }
const JUNCS: Junc[] = OSM.junction.map(j => ({ s: rawToS(j.s), w: ARM_W[j.hw] ?? 10, rank: RANK[j.hw] ?? 1, src: j }));
const BIG = JUNCS.filter(j => j.rank >= 2);                                     // 신호등 · 횡단보도가 있는 사거리
const dedupe = <T extends { s: number }>(list: T[], gap: number, key: (t: T) => number = () => 0) => {
  const out: T[] = [];
  [...list].sort((a, b) => a.s - b.s).forEach(t => { if (!out.some(o => key(o) === key(t) && Math.abs(o.s - t.s) < gap)) out.push(t); });
  return out;
};
const inJunction = (s: number, pad: number) => JUNCS.some(j => Math.abs(j.s - s) < j.w / 2 + pad);
/** 길 한가운데를 건너는 횡단보도 (사거리 밖) */
const MIDBLOCK = dedupe(OSM.crossing.filter(c => Math.abs(c.off) < HALF - 1).map(c => ({ s: rawToS(c.s) })), 40)
  .filter(c => !BIG.some(j => Math.abs(j.s - c.s) < j.w / 2 + 25));
const side = (off: number) => off >= 0 ? 1 : -1;
const STOPS = dedupe(OSM.bus_stop.filter(b => Math.abs(b.off) < 28).map(b => ({ s: rawToS(b.s), sd: side(b.off) })), 30, b => b.sd)
  .filter(b => !inJunction(b.s, 6));
const EXITS = dedupe(OSM.subway.map(e => ({ s: rawToS(e.s), sd: side(e.off) })), 9, e => e.sd)
  .filter(e => !inJunction(e.s, 4) && !STOPS.some(b => b.sd === e.sd && Math.abs(b.s - e.s) < 7));

/** s(m) 지점에 사거리 · 횡단보도 · 정류장 · 출입구가 있는지 (가로수 · 가로등을 비울 때 씀) */
export const nearCrossing = (s: number, pad = 14) =>
  inJunction(s, pad) || MIDBLOCK.some(c => Math.abs(c.s - s) < 3 + pad) || STOPS.some(b => Math.abs(b.s - s) < 4 + pad * 0.3) || EXITS.some(e => Math.abs(e.s - s) < 5);

/* ---------- 도우미 ---------- */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** 도로 위 s 지점 · 중심선에서 lat(m) 떨어진 곳 · 진행 방향 */
const frame = (s: number, lat = 0) => { const p = at(s), rx = -p.dz, rz = p.dx; return { x: p.x + rx * lat, z: p.z + rz * lat, dx: p.dx, dz: p.dz, rx, rz }; };
/** 자리 행렬: 로컬 x → X, z → Z 방향 (y는 위) */
const place = (x: number, z: number, X: THREE.Vector3, Z: THREE.Vector3, y = 0) => new THREE.Matrix4().makeBasis(X, UP, Z).setPosition(x, y, z);

type Part = [THREE.BufferGeometry, THREE.Material, THREE.Matrix4?, boolean?];   // 모양 · 재질 · 로컬 자리 · 그림자
const at3 = (x: number, y: number, z: number, rx = 0, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));
/** 부품 목록(키트)을 자리마다 찍음: 부품 하나당 InstancedMesh 하나 */
function stamp(scene: THREE.Scene, parts: Part[], spots: THREE.Matrix4[]) {
  if (!spots.length) return;
  for (const [geo, mat, local, shadow] of parts) {
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((m, i) => inst.setMatrixAt(i, local ? m.clone().multiply(local) : m));
    inst.castShadow = !!shadow; inst.receiveShadow = true; scene.add(inst);
  }
}
/** 꺾인 선을 폭 w의 띠로 (여러 줄을 한 모양으로 합침) */
function strips(lines: THREE.Vector2[][], w: number, y: number) {
  const pos: number[] = [], idx: number[] = [];
  for (const L of lines) {
    const base = pos.length / 3;
    L.forEach((p, i) => {
      const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], d = b.clone().sub(a).normalize();
      pos.push(p.x - d.y * w / 2, y, p.y + d.x * w / 2, p.x + d.y * w / 2, y, p.y - d.x * w / 2);
      if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildIntersections(scene: THREE.Scene) {
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x55504b, side: THREE.DoubleSide });
  const walk = new THREE.MeshLambertMaterial({ color: 0xb8a990, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 6 });
  const paint = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 0.55, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.7 });
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5 });
  const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const green = glow(0x30e07a), red = glow(0xff3b2f);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xb9d3da, roughness: 0.08, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const wall = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 });
  const LINE2 = '#00a650';

  /* ---------- 옆길: 실제 모양대로 (보도 → 차도 순으로 깔기) ---------- */
  const armsByW = new Map<number, THREE.Vector2[][]>();
  for (const j of JUNCS) {
    const c = frame(j.s);
    for (const arm of j.src.arms) {
      // 게임 도로는 실제 선을 다듬은 것이라 몇 m 어긋남 → 시작점을 게임 도로 가장자리에 맞추고 멀어질수록 원래 자리로
      const [sx, sz] = arm[0], sd = Math.sign((sx - c.x) * c.rx + (sz - c.z) * c.rz) || 1, edge = frame(j.s, sd * (HALF - 0.5));
      const ox = edge.x - sx, oz = edge.z - sz; let cum = 0;
      const pts = arm.map(([x, z], i) => {
        if (i) cum += Math.hypot(x - arm[i - 1][0], z - arm[i - 1][1]);
        const k = Math.max(0, 1 - cum / 60); return new THREE.Vector2(x + ox * k, z + oz * k);
      });
      if (!armsByW.has(j.w)) armsByW.set(j.w, []);
      armsByW.get(j.w)!.push(pts);
    }
  }
  for (const [w, lines] of armsByW) {
    const sw = new THREE.Mesh(strips(lines, w + 7, 0.03), walk); sw.receiveShadow = true; scene.add(sw);
    const rd = new THREE.Mesh(strips(lines, w, 0.07), asphalt); rd.receiveShadow = true; scene.add(rd);
  }

  /* ---------- 노면 표시: 사거리 바닥(차선 없음) · 횡단보도 · 정지선 ---------- */
  const stripes: THREE.Matrix4[] = [];
  const stripe = (s: number, lat: number, w: number, l: number, cross = false) => {
    const f = frame(s, lat), d = new THREE.Vector3(f.dx, 0, f.dz), r = new THREE.Vector3(f.rx, 0, f.rz);
    // 오른손 좌표가 되게 (거울상이면 면이 뒤집혀 안 보임): (r, 위, −d) · (d, 위, r)
    stripes.push(new THREE.Matrix4().makeBasis(cross ? d : r, UP, cross ? r : d.negate()).scale(new THREE.Vector3(w, 1, l)).setPosition(f.x, 0.095, f.z));
  };
  const zebra = (s: number) => { for (let lat = -HALF + 1; lat <= HALF - 1; lat += 1.1) stripe(s, lat, 0.55, 4); };
  const stopLine = (s: number, sd: number) => stripe(s, sd * HALF / 2, 0.45, HALF - 1, true);
  const boxes: THREE.Matrix4[] = [];
  for (const j of BIG) {
    const f = frame(j.s);
    boxes.push(new THREE.Matrix4().makeBasis(new THREE.Vector3(f.rx, 0, f.rz), UP, new THREE.Vector3(-f.dx, 0, -f.dz)).scale(new THREE.Vector3(ROAD_W - 1, 1, j.w + 2)).setPosition(f.x, 0.088, f.z));
    for (const e of [-1, 1]) { zebra(j.s + e * (j.w / 2 + 3)); stopLine(j.s + e * (j.w / 2 + 6.5), -e); }
  }
  for (const c of MIDBLOCK) { zebra(c.s); for (const e of [-1, 1]) stopLine(c.s + e * 5, -e); }
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const boxInst = new THREE.InstancedMesh(flat, asphalt, boxes.length); boxes.forEach((m, i) => boxInst.setMatrixAt(i, m)); boxInst.receiveShadow = true; boxInst.renderOrder = 1; scene.add(boxInst);
  const strInst = new THREE.InstancedMesh(flat, paint, stripes.length); stripes.forEach((m, i) => strInst.setMatrixAt(i, m)); strInst.receiveShadow = true; strInst.renderOrder = 2; scene.add(strInst);

  /* ---------- 신호등: 사거리 · 횡단보도 건너편 모서리 (팔이 차도 위로, 신호는 다가오는 차를 마주봄) ---------- */
  // 로컬: 기둥이 원점, 팔은 +x (차도 쪽), 신호 불빛은 −z 쪽 면
  const signalKit: Part[] = [
    [new THREE.CylinderGeometry(0.14, 0.18, 7, 10), metal, at3(0, 3.5, 0), true],
    [new THREE.BoxGeometry(9, 0.18, 0.18), metal, at3(4.5, 6.8, 0)],
    [new THREE.BoxGeometry(0.35, 0.6, 0.25), dark, at3(0, 2.8, -0.2)],                  // 보행 신호
    [new THREE.CircleGeometry(0.1, 10), red, at3(0, 2.85, -0.33, 0, Math.PI)],
  ];
  for (const x of [4.5, 8.2]) {
    signalKit.push([new THREE.BoxGeometry(1.25, 0.42, 0.32), dark, at3(x, 6.3, 0), true]);
    signalKit.push([new THREE.CircleGeometry(0.14, 14), red, at3(x - 0.4, 6.3, -0.165, 0, Math.PI)]);
    signalKit.push([new THREE.CircleGeometry(0.14, 14), lampOff, at3(x, 6.3, -0.165, 0, Math.PI)]);
    signalKit.push([new THREE.CircleGeometry(0.14, 14), green, at3(x + 0.4, 6.3, -0.165, 0, Math.PI)]);
  }
  const signals: THREE.Matrix4[] = [];
  const signalPair = (s: number, reach: number) => {
    for (const sd of [-1, 1]) {                                                 // sd 쪽 차로는 sd·d 방향으로 달림 → 건너편(앞쪽 sd) 모서리에 세움
      const f = frame(s + sd * reach, sd * (HALF + 1.2));
      signals.push(place(f.x, f.z, new THREE.Vector3(-sd * f.rx, 0, -sd * f.rz), new THREE.Vector3(sd * f.dx, 0, sd * f.dz)));
    }
  };
  for (const j of BIG) signalPair(j.s, j.w / 2 + 1.5);
  for (const c of MIDBLOCK) signalPair(c.s, 3.5);
  stamp(scene, signalKit, signals);

  /* ---------- 버스정류장 쉘터 (로컬: x = 도로 방향, +z = 차도 쪽) ---------- */
  const busSign = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(256, 320, g => {
    g.fillStyle = '#1f6fc5'; g.beginPath(); g.roundRect(0, 0, 256, 320, 28); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(48, 40, 160, 120, 18); g.fill();
    g.fillStyle = '#1f6fc5'; g.fillRect(70, 62, 116, 52); g.fillStyle = '#fff'; g.fillRect(78, 70, 46, 30); g.fillRect(132, 70, 46, 30);
    g.fillStyle = '#1f6fc5'; g.beginPath(); g.arc(88, 132, 11, 0, 7); g.arc(168, 132, 11, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = '900 52px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.fillText('버스', 128, 232); g.font = '600 30px "Noto Sans KR", sans-serif'; g.fillText('정류장', 128, 282);
  }) });
  const adBox = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(128, 256, g => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#f4efe6'); gr.addColorStop(1, '#e9a35a');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256); g.fillStyle = '#2b1a12'; g.font = '900 30px "Noto Sans KR", sans-serif'; g.textAlign = 'center';
    g.fillText('iM', 64, 90); g.font = '700 18px "Noto Sans KR", sans-serif'; g.fillText('뱅크', 64, 118); g.fillText('눈부심 주의', 64, 210);
  }) });
  const bis = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(256, 64, g => {
    g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ffb02e'; g.font = '700 22px monospace'; g.fillText('410  곧 도착', 10, 26); g.fillStyle = '#7fe08a'; g.fillText('급행1  3분', 10, 54);
  }) });
  const shelterKit: Part[] = [
    [new THREE.BoxGeometry(6.4, 0.14, 2.3), metal, at3(0, 2.62, 0.1), true],                        // 지붕
    [new THREE.BoxGeometry(6.2, 0.05, 2.1), glass, at3(0, 2.52, 0.1)],                               // 지붕 아래 유리
    [new THREE.BoxGeometry(6, 2.2, 0.04), glass, at3(0, 1.3, -0.95)],                                // 뒤 유리벽
    [new THREE.BoxGeometry(0.04, 2.2, 1.3), glass, at3(-3.05, 1.3, -0.3)],                           // 옆 유리
    [new THREE.BoxGeometry(3.2, 0.07, 0.42), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 }), at3(-0.6, 0.48, -0.65)],   // 의자
    [new THREE.BoxGeometry(3.2, 0.42, 0.05), metal, at3(-0.6, 0.24, -0.8)],
    [new THREE.BoxGeometry(1.25, 2.1, 0.22), metal, at3(2.4, 1.15, -0.85), true],                    // 광고판 틀
    [new THREE.PlaneGeometry(1.05, 1.85), adBox, at3(2.4, 1.15, -0.735)],                            // 광고판 (차도 쪽)
    [new THREE.BoxGeometry(1.5, 0.42, 0.12), dark, at3(-0.4, 2.3, 0.85)],                           // 도착 안내 (BIS)
    [new THREE.PlaneGeometry(1.4, 0.34), bis, at3(-0.4, 2.3, 0.915)],
    [new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), metal, at3(-3.9, 1.7, 0.9), true],             // 정류장 표지 기둥
    [new THREE.PlaneGeometry(0.62, 0.78), busSign, at3(-3.9, 3.0, 0.97)],
    [new THREE.PlaneGeometry(0.62, 0.78), busSign, at3(-3.9, 3.0, 0.83, 0, Math.PI)],
  ];
  for (const x of [-3.05, 3.05]) for (const z of [-0.95, 1.1]) shelterKit.push([new THREE.BoxGeometry(0.1, 2.6, 0.1), metal, at3(x, 1.3, z), true]);
  stamp(scene, shelterKit, STOPS.map(b => {
    const f = frame(b.s, b.sd * (HALF + 2.6)), Z = new THREE.Vector3(-b.sd * f.rx, 0, -b.sd * f.rz);
    return place(f.x, f.z, new THREE.Vector3().crossVectors(UP, Z), Z);
  }));

  /* ---------- 도시철도 2호선 출입구 (로컬: z = 계단 내려가는 쪽, 지붕 유리 · 초록 간판) ---------- */
  const exitSign = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(512, 128, x => {
    x.fillStyle = LINE2; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 42, 0, 7); x.fill();
    x.fillStyle = LINE2; x.font = '900 56px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('2', 64, 68);
    x.fillStyle = '#fff'; x.font = '900 46px "Noto Sans KR", sans-serif'; x.textAlign = 'left'; x.fillText('도시철도', 124, 52);
    x.font = '500 24px "Noto Sans KR", sans-serif'; x.fillText('2호선 · Line 2', 126, 100);
  }) });
  const exitKit: Part[] = [
    [new THREE.BoxGeometry(0.25, 1.1, 7), wall, at3(-1.25, 0.55, 0), true], [new THREE.BoxGeometry(0.25, 1.1, 7), wall, at3(1.25, 0.55, 0), true],
    [new THREE.BoxGeometry(2.75, 2.6, 0.25), wall, at3(0, 1.3, -3.5), true],
    [new THREE.BoxGeometry(2.9, 0.08, 7.4), glass, at3(0, 2.55, 0, 0.06)],
    [new THREE.PlaneGeometry(2.3, 6.6).rotateX(-Math.PI / 2), dark, at3(0, 0.03, 0)],
    [new THREE.PlaneGeometry(2.6, 0.65), exitSign, at3(0, 2.95, 3.55)],
    [new THREE.BoxGeometry(0.08, 0.4, 0.08), metal, at3(0, 2.7, 3.55)],
  ];
  for (const x of [-1.35, 1.35]) for (const z of [-3.4, 3.4]) exitKit.push([new THREE.BoxGeometry(0.1, 2.5, 0.1), metal, at3(x, 1.3, z)]);
  stamp(scene, exitKit, EXITS.map((e, i) => {
    const f = frame(e.s, e.sd * (HALF + 4.4)), dir = i % 2 ? 1 : -1;               // 계단 방향은 번갈아
    const Z = new THREE.Vector3(dir * f.dx, 0, dir * f.dz);
    return place(f.x, f.z, new THREE.Vector3().crossVectors(UP, Z), Z);
  }));
}
