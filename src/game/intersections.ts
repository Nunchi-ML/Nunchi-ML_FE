import * as THREE from 'three';
import { D, ROAD_W, TOTAL, at, kmToS, rawToS, stationLabel } from './road';
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

  buildStreetFurniture(scene, metal);
}

/**
 * 거리 구조물: 큰 사거리 앞 도로 안내 표지(파란 방향판) · 횡단보도 옆 보행자 울타리 · 볼라드 ·
 * 보도의 휴지통 · 분전함 · 소화전. 같은 종류는 묶어서 한 번에 그림.
 */
function buildStreetFurniture(scene: THREE.Scene, metal: THREE.Material) {
  /* ---------- 도로 안내 표지: 큰 사거리(2차로급 이상) 45 m 앞, 다가오는 차를 마주봄 ---------- */
  const SIGNS = JUNCS.filter(j => j.rank >= 3);
  const stS = D.stations.map(st => ({ s: kmToS(st.km), name: stationLabel(st.name) }));
  const nextStation = (s: number, dir: number) => {                              // dir 방향으로 이 사거리를 지나 처음 나오는 역
    const ahead = stS.filter(t => (t.s - s) * dir > 60).sort((a, b) => (a.s - b.s) * dir);
    return ahead[0]?.name ?? '시내';
  };
  const CW = 512, CH = 160, COLS = 4, cells: { s: number; sd: number; i: number }[] = [];
  SIGNS.forEach(j => [-1, 1].forEach(sd => cells.push({ s: j.s, sd, i: cells.length })));
  const rows = Math.max(1, Math.ceil(cells.length / COLS));
  /** 다가오는 차에서 봐서 왼쪽 · 오른쪽 옆길: 큰 글씨 = 그쪽 동네, 작은 글씨 = 길 이름 (양쪽 동네가 같으면 길 이름을 크게) */
  const sides = (j: Junc, s: number, sd: number) => {
    const f = frame(s), rx = sd * f.rx, rz = sd * f.rz;                           // 진행 방향의 오른쪽
    const pick = (want: number) => {
      const i = j.src.arms.findIndex(a => Math.sign((a[a.length - 1][0] - a[0][0]) * rx + (a[a.length - 1][1] - a[0][1]) * rz) === want);
      return i < 0 ? null : { to: j.src.to?.[i] || '', road: (j.src.an?.[i] || j.src.name || '').replace(/^.*[ ·]/, '') };
    };
    const L = pick(-1), R = pick(1), same = !!(L && R && L.to && L.to === R.to);
    const label = (a: { to: string; road: string } | null) => a && { big: (same ? a.road : a.to) || a.road || a.to, small: same ? a.to : a.road };
    return { L: label(L), R: label(R) };
  };
  const tex = canvasTex(CW * COLS, CH * rows, g => {
    cells.forEach(({ s, sd, i }) => {
      const j = SIGNS[Math.floor(i / 2)], x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
      g.fillStyle = '#1554a8'; g.fillRect(x, y, CW, CH);                          // 한국 일반도로 안내 표지: 파란 바탕 · 흰 글씨 · 흰 테두리
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(x + 6, y + 6, CW - 12, CH - 12);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fit = (t: string, cx: number, cy: number, w: number, px: number) => { g.font = `900 ${px}px "Noto Sans KR", sans-serif`; const m = g.measureText(t).width; if (m > w) g.font = `900 ${px * w / m}px "Noto Sans KR", sans-serif`; g.fillText(t, cx, cy); };
      fit(nextStation(s, sd), x + CW / 2, y + 50, 200, 40);                       // 직진: 다음 역
      g.beginPath(); g.moveTo(x + CW / 2, y + 140); g.lineTo(x + CW / 2, y + 86); g.lineWidth = 9; g.stroke();   // ↑ 화살표
      g.beginPath(); g.moveTo(x + CW / 2 - 16, y + 96); g.lineTo(x + CW / 2, y + 76); g.lineTo(x + CW / 2 + 16, y + 96); g.fill();
      const { L, R } = sides(j, s, sd);
      for (const [a, cx, arrow] of [[L, x + 92, '←'], [R, x + CW - 92, '→']] as const) {
        if (!a) continue;                                                         // 그쪽 옆길이 없으면 (T자) 비움
        fit(a.big, cx, y + 58, 150, 34);
        if (a.small && a.small !== a.big) { g.globalAlpha = 0.85; fit(a.small, cx, y + 92, 140, 20); g.globalAlpha = 1; }
        g.font = '900 40px sans-serif'; g.fillText(arrow, cx, y + 124);
      }
    });
  });
  const signMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
  const face: number[] = [], uvs: number[] = [], idx: number[] = [];
  const gantries: THREE.Matrix4[] = [];
  cells.forEach(({ s, sd, i }) => {
    const j = SIGNS[Math.floor(i / 2)], sAt = s - sd * (j.w / 2 + 45);           // 사거리 45 m 앞 (그쪽 차로가 다가오는 쪽)
    const post = frame(sAt, sd * (HALF + 1.6));
    gantries.push(place(post.x, post.z, new THREE.Vector3(-sd * post.rx, 0, -sd * post.rz), new THREE.Vector3(sd * post.dx, 0, sd * post.dz)));
    // 표지판 면: 차로 위 (중심선 쪽 2 m ~ 가장자리 13 m), 높이 5.6 ~ 8.4 m
    const a = frame(sAt, sd * 2.2), b = frame(sAt, sd * 12.2), y0 = 5.6, y1 = 8.4, base = face.length / 3;
    const [L, R] = [a, b];                                                        // 다가오는 차에서 봐서 왼쪽(중앙선 쪽) · 오른쪽(길가 쪽)
    face.push(L.x, y0, L.z, L.x, y1, L.z, R.x, y0, R.z, R.x, y1, R.z);
    const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(i / COLS) / rows, v0 = v1 - 1 / rows;
    uvs.push(u0, v0, u0, v1, u1, v0, u1, v1); idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  });
  if (cells.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(face, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
    scene.add(new THREE.Mesh(g, signMat));
  }
  const back = new THREE.MeshStandardMaterial({ color: 0x8d949a, metalness: 0.5, roughness: 0.5 });
  stamp(scene, [
    [new THREE.CylinderGeometry(0.22, 0.28, 9, 12), metal, at3(0, 4.5, 0), true],                  // 기둥
    [new THREE.BoxGeometry(14.2, 0.35, 0.35), metal, at3(7.1, 8.7, 0.1)],                          // 팔 (차로 위로)
    [new THREE.BoxGeometry(14.2, 0.25, 0.25), metal, at3(7.1, 6.0, 0.1)],
    [new THREE.BoxGeometry(10.2, 2.9, 0.12), back, at3(9.4, 7.0, 0.12)],                           // 표지판 뒷판 (면과 같은 자리, 차 쪽에서 봐서 뒤)
  ], gantries);

  /* ---------- 횡단보도 옆 보행자 울타리 · 볼라드 ---------- */
  const fences: THREE.Matrix4[] = [], bollards: THREE.Matrix4[] = [];
  const along = (s: number, lat: number) => { const f = frame(s, lat); return place(f.x, f.z, new THREE.Vector3(f.dx, 0, f.dz), new THREE.Vector3(f.rx, 0, f.rz)); };   // x = 도로 방향 (오른손 좌표)
  const zebraS: number[] = [];
  BIG.forEach(j => [-1, 1].forEach(e => zebraS.push(j.s + e * (j.w / 2 + 3))));
  MIDBLOCK.forEach(c => zebraS.push(c.s));
  zebraS.forEach(zs => {
    for (const sd of [-1, 1]) {
      for (const k of [-1, 0, 1]) bollards.push(along(zs + k * 1.6, sd * (HALF + 0.7)));          // 횡단보도 끝 볼라드 3개
      for (const dir of [-1, 1]) for (let n = 0; n < 6; n++) {                                     // 양옆으로 울타리 15 m
        const s = zs + dir * (4 + 1.25 + n * 2.5);
        if (STOPS.some(b => b.sd === sd && Math.abs(b.s - s) < 5) || BIG.some(j => Math.abs(j.s - s) < j.w / 2 + 1)) continue;
        fences.push(along(s, sd * (HALF + 0.55)));
      }
    }
  });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9ece8, roughness: 0.5, metalness: 0.3 });
  const fenceKit: Part[] = [
    [new THREE.BoxGeometry(2.5, 0.07, 0.07), white, at3(0, 1.0, 0)], [new THREE.BoxGeometry(2.5, 0.05, 0.05), white, at3(0, 0.18, 0)],
    [new THREE.BoxGeometry(0.08, 1.05, 0.08), white, at3(-1.25, 0.52, 0)],
    [new THREE.BoxGeometry(2.3, 0.62, 0.02), new THREE.MeshStandardMaterial({ color: 0x9fbf3a, roughness: 0.6, transparent: true, opacity: 0.85 }), at3(0, 0.58, 0)],   // 연두 판
  ];
  stamp(scene, fenceKit, fences);
  stamp(scene, [
    [new THREE.CylinderGeometry(0.11, 0.13, 0.85, 10), new THREE.MeshStandardMaterial({ color: 0x4a4f54, roughness: 0.5 }), at3(0, 0.42, 0), true],
    [new THREE.CylinderGeometry(0.115, 0.115, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x332600 }), at3(0, 0.72, 0)],   // 반사띠
  ], bollards);

  /* ---------- 보도 소품: 휴지통 · 분전함 · 소화전 (사거리 · 정류장 자리는 비움) ---------- */
  const bins: THREE.Matrix4[] = [], boxes: THREE.Matrix4[] = [], hydrants: THREE.Matrix4[] = [];
  let n = 0;
  for (let s = 40; s < TOTAL; s += 37) {
    if (nearCrossing(s, 6)) continue;
    const sd = n % 2 ? 1 : -1, kind = n % 5; n++;
    if (kind === 0 || kind === 3) bins.push(along(s, sd * (HALF + 1.4)));
    else if (kind === 1) boxes.push(along(s, sd * (HALF + 6.2)));
    else if (kind === 2) hydrants.push(along(s, sd * (HALF + 0.9)));
  }
  stamp(scene, [
    [new THREE.CylinderGeometry(0.28, 0.24, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.6 }), at3(0, 0.45, 0), true],
    [new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12), metal, at3(0, 0.93, 0)],
  ], bins);
  stamp(scene, [
    [new THREE.BoxGeometry(0.9, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: 0xa9adaa, roughness: 0.7, metalness: 0.2 }), at3(0, 0.7, 0), true],
    [new THREE.BoxGeometry(0.96, 0.06, 0.56), metal, at3(0, 1.42, 0)],
  ], boxes);
  const red = new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.45 });
  stamp(scene, [
    [new THREE.CylinderGeometry(0.13, 0.16, 0.75, 10), red, at3(0, 0.37, 0), true],
    [new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, at3(0, 0.75, 0)],
    [new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), red, at3(0, 0.5, 0, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))],
  ], hydrants);
}
