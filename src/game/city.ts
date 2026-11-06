import * as THREE from 'three';
import cityDataUrl from '../data/dalgu_buildings.json?url';
import sincheonCityUrl from '../data/sincheon_buildings.json?url';
import { IS_SINCHEON } from './roadSelection';
import { P as ROAD_PTS, ROAD_W } from './road';
import { OSM } from './osm';

/** 실제 건물 윤곽(브이월드 · OSM)을 높이만큼 세운 도시 + iM뱅크 본점 랜드마크
 *  p: 윤곽 [x, z, …] · h: 높이(m) · k: 용도 · f: 지상 층수 · d: 도로 중심선까지 거리(m) */
interface Bldg { p: number[]; h: number; k: number; f?: number; d?: number; n?: string }   // n: 실제 건물 이름 (브이월드)
interface CityData { b: Bldg[]; bank: { pts: number[][]; levels: number } | null }
let C: CityData;
const navigationGrid = new Map<string, Bldg[]>();
/** Reuse surveyed footprints for the dashboard map, indexed in 150 m cells. */
export function nearbyMapBuildings(x: number, z: number, radius = 500) {
  const out: Bldg[] = [];
  for (let gx = Math.floor((x - radius) / 150); gx <= Math.floor((x + radius) / 150); gx++)
    for (let gz = Math.floor((z - radius) / 150); gz <= Math.floor((z + radius) / 150); gz++) out.push(...(navigationGrid.get(`${gx},${gz}`) ?? []));
  return out;
}
export let BANK_POS: { x: number; z: number } | null = null;
let cityLoad: Promise<void> | null = null;
/** 건물 좌표는 JS 번들에 넣지 않고 별도 JSON으로 읽고 캐시한다. */
export function loadCityData(): Promise<void> {
  if (!cityLoad) cityLoad = fetch(IS_SINCHEON ? sincheonCityUrl : cityDataUrl).then(async response => {
    if (!response.ok) throw new Error('건물 데이터를 불러오지 못했어요.');
    const data = await response.json() as CityData;
    if (!Array.isArray(data.b)) throw new Error('건물 데이터 형식이 올바르지 않아요.');
    C = data;
    navigationGrid.clear();
    for (const b of C.b) {
      const n = b.p.length / 2; let x = 0, z = 0;
      for (let i = 0; i < b.p.length; i += 2) { x += b.p[i] / n; z += b.p[i + 1] / n; }
      const key = `${Math.floor(x / 150)},${Math.floor(z / 150)}`;
      if (!navigationGrid.has(key)) navigationGrid.set(key, []); navigationGrid.get(key)!.push(b);
    }
    BANK_POS = C.bank ? {
      x: C.bank.pts.reduce((sum, p) => sum + p[0], 0) / C.bank.pts.length,
      z: C.bank.pts.reduce((sum, p) => sum + p[1], 0) / C.bank.pts.length,
    } : null;
    BF = C.bank ? bankFrame() : null;
  });
  return cityLoad;
}

/** 본점 자리 · 방향 · 크기 (본점 그리기와 주변 건물 비우기에 같이 씀) */
function bankFrame() {
  const P = C.bank!.pts.map(([x, z]) => new THREE.Vector2(x, z));
  const cx = P.reduce((s, p) => s + p.x, 0) / P.length, cz = P.reduce((s, p) => s + p.y, 0) / P.length;
  const e0 = P[1].clone().sub(P[0]), e1 = P[2].clone().sub(P[1]);
  const long = e0.length() >= e1.length() ? e0 : e1, angle = Math.atan2(long.y, long.x);
  const W = Math.max(34, Math.max(e0.length(), e1.length()) * 0.9), Dp = Math.max(24, Math.min(e0.length(), e1.length()) * 0.9);
  return { cx, cz, angle, W, Dp, H: Math.max(76, C.bank!.levels * 4.2) };
}
let BF: ReturnType<typeof bankFrame> | null = null;
/** 본점 광장(기단 · 깃대 포함) 안이면 true — 다른 건물과 겹치지 않게 비움 */
const inBankPlaza = (x: number, z: number) => {
  if (!BF) return false;
  const X = x - BF.cx, Z = z - BF.cz, c = Math.cos(BF.angle), s = Math.sin(BF.angle);
  return Math.abs(X * c + Z * s) < (BF.W + 40) / 2 + 3 && Math.abs(-X * s + Z * c) < (BF.Dp + 40) / 2 + 3;
};

// 종류별 벽 색 (0 기타 · 1 아파트 · 2 상가 · 3 사무실 · 4 학교)
const PAL: number[][] = [
  [0xe7e4df, 0xd8d5ce, 0xc9cdd0, 0xbfc3c2, 0xf1eee7, 0xc7b7a8],
  [0xf1f0eb, 0xe7e8e6, 0xe4e7e9, 0xd4d5d3, 0xe6e2d9],
  [0xd9cbb8, 0xc9c2b8, 0xb9a891, 0xd1b897, 0xa9a39c, 0xc4b5a5, 0xb3a08c],
  [0x9fb0b8, 0xaab6bb, 0x8fa1aa, 0xb8c0c2, 0xc9cfd2],
  [0xc0785a, 0xb8735a, 0xcc8a6a],
];

/* ---------- 도로를 침범하는 건물 빼기 ----------
 * 게임 도로는 실제 중심선을 다듬은 것이라 몇 m 어긋남 → 길가 건물 일부가 차도 · 옆길 위에 놓임.
 * 도로 · 옆길 선을 촘촘히 찍어 칸(20 m)에 넣고, 건물 꼭짓점 · 변 가운데가 그 반폭 안에 들면 뺌. */
const CELL = 20, roadHash = new Map<number, [number, number, number][]>();
const hkey = (x: number, z: number) => Math.floor(x / CELL) * 100000 + Math.floor(z / CELL);
const putLine = (pts: { x: number; z: number }[], r: number) => {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n, key = hkey(x, z);
      if (!roadHash.has(key)) roadHash.set(key, []); roadHash.get(key)!.push([x, z, r]);
    }
  }
};
putLine(ROAD_PTS, ROAD_W / 2 + 2.5);                                             // 차도 + 보도 일부
const ARM_HALF: Record<string, number> = { trunk: 15, primary: 13, secondary: 11, tertiary: 8, residential: 5, unclassified: 5 };
OSM.junction.forEach(j => j.arms.forEach(a => putLine(a.map(([x, z]) => ({ x, z })), (ARM_HALF[j.hw] ?? 6) + 1)));
/** 가장 가까운 도로 · 옆길 가장자리까지 거리 (60 m 넘으면 99) */
const roadGap = (x: number, z: number) => {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); let best = 99;
  for (let i = cx - 3; i <= cx + 3; i++) for (let j = cz - 3; j <= cz + 3; j++)
    for (const [px, pz, r] of roadHash.get(i * 100000 + j) ?? []) best = Math.min(best, Math.hypot(px - x, pz - z) - r);
  return best;
};
const onRoad = (x: number, z: number) => {                                      // 이웃 칸만 보는 빠른 판정 (건물 1만여 동 × 꼭짓점)
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++)
    for (const [px, pz, r] of roadHash.get(i * 100000 + j) ?? []) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return true;
  return false;
};
const keep = (b: Bldg) => {
  const p = b.p, n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const x = p[2 * i], z = p[2 * i + 1], x2 = p[(2 * i + 2) % p.length], z2 = p[(2 * i + 3) % p.length];
    if (onRoad(x, z) || onRoad((x + x2) / 2, (z + z2) / 2) || inBankPlaza(x, z)) return false;
  }
  return true;
};

/** 지오메트리 하나를 모으는 그릇 */
class Geo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  get n() { return this.pos.length / 3; }
  /** 네 꼭짓점 사각형 (a 아래왼 · b 위왼 · c 아래오 · d 위오) + 아틀라스 칸 UV [u0, v0, u1, v1] */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, [u0, v0, u1, v1]: number[]) {
    const base = this.n;
    for (const p of [a, b, c, d]) { this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.col.push(1, 1, 1); }
    this.uv.push(u0, v0, u0, v1, u1, v0, u1, v1);
    this.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeBoundingSphere(); return g;
  }
}
const SHOP_H = 4.2;                                                          // 1층 상가 높이
const UP_H = 3.4;                                                            // 2층 (창문 글씨 상가) 높이
const FLOOR_H = [3.4, 3.0, 3.4, 3.6, 3.6];                                   // 용도별 층고 (창문 한 줄)
const BAY_W = [4, 3.2, 3.6, 3, 4];                                           // 용도별 창 한 칸 폭
const VARIANTS = 2;                                                          // 용도마다 외벽 무늬 2가지
/** 결정적 난수: 같은 건물은 늘 같은 모습 */
const hash = (n: number) => { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
/** 길가 1층에 가게가 들어서는 건물: 아파트 · 학교 · 먼 건물 제외, 그중에서도 7할만 (나머지는 그냥 벽 · 현관) */
const hasShops = (b: Bldg, r: number) => b.k !== 1 && b.k !== 4 && (b.d ?? 999) < 160 && b.h > SHOP_H + 1 && r < 0.7;

/** 벽 띠 하나 (y0 ~ y1): 윤곽을 따라 돌며 u는 실제 m 기준. 아틀라스면 칸 하나(u 폭 du · v 범위)를 반복 */
function wallBand(G: Geo, pts: THREE.Vector2[], y0: number, y1: number, uW: number, vH: number, c: THREE.Color, u0 = 0, cellV?: [number, number]) {
  let run = u0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], d = pts[(i + 1) % pts.length], len = a.distanceTo(d);
    if (len < 0.05) continue;
    const nx = (d.y - a.y) / len, nz = -(d.x - a.x) / len, base = G.n;
    G.pos.push(a.x, y0, a.y, a.x, y1, a.y, d.x, y0, d.y, d.x, y1, d.y);
    for (let k = 0; k < 4; k++) { G.nor.push(nx, 0, nz); G.col.push(c.r, c.g, c.b); }
    // 바깥에서 보면 윤곽이 오른→왼으로 돌아서 u를 뒤집음 (간판 글자가 거울상이 되지 않게)
    const ua = -run / uW, ub = -(run + len) / uW;
    const [va, vb] = cellV ?? [0, (y1 - y0) / vH];
    G.uv.push(ua, va, ua, vb, ub, va, ub, vb);
    G.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    run += len;
  }
}

/* ---------- 간판 · 외벽 그림 ---------- */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glassGrad = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top: string, bot: string) => {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, top); gr.addColorStop(.43, top); gr.addColorStop(.48, bot); gr.addColorStop(1, bot);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const reflection = g.createLinearGradient(x, y, x + w, y + h);
  reflection.addColorStop(0, 'rgba(255,255,255,.2)'); reflection.addColorStop(.42, 'rgba(225,240,255,.04)');
  reflection.addColorStop(.45, 'rgba(255,255,255,.16)'); reflection.addColorStop(.62, 'rgba(255,255,255,0)');
  g.fillStyle = reflection; g.fillRect(x, y, w, h); g.restore();
  g.strokeStyle = 'rgba(12,24,32,.4)'; g.lineWidth = 1.5; g.strokeRect(x + .75, y + .75, w - 1.5, h - 1.5);
  g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y + h - 1, w, 1);
};
const font = (g: CanvasRenderingContext2D, px: number, w = 900) => { g.font = `${w} ${px}px "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; };
/** 글자 폭이 칸을 넘으면 줄여서 맞춤 */
const fitText = (g: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number, px: number, w = 900) => {
  font(g, px, w); const m = g.measureText(s).width; if (m > maxW) font(g, px * maxW / m, w); g.fillText(s, x, y);
};

/** 외벽 무늬: 용도 5 × 2가지 (한 장 = 창 한 칸 × 한 층, 흰 부분이 벽색으로 물듦) */
function facadeTextures() {
  const tex = (draw: (g: CanvasRenderingContext2D) => void) => {
    const t = canvasTex(256, 256, g => {
      g.scale(2, 2); draw(g);
      // 약한 표면 결. 같은 입력에서 항상 같은 외벽을 만든다.
      for (let i = 0; i < 850; i++) {
        g.fillStyle = i % 2 ? 'rgba(0,0,0,.025)' : 'rgba(255,255,255,.035)';
        g.fillRect(hash(i * 7) * 128, hash(i * 13) * 128, .6, .6);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  };
  const white = (g: CanvasRenderingContext2D) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); };
  return [
    tex(g => { white(g); g.fillStyle = '#d9d4cc'; g.fillRect(14, 22, 100, 70); glassGrad(g, 20, 28, 88, 58, '#8e9aa2', '#4f5b63'); g.fillStyle = '#d9d4cc'; g.fillRect(62, 28, 4, 58); g.fillStyle = '#c9c3b9'; g.fillRect(0, 118, 128, 10); }),
    tex(g => {                                                                // 0-2 작은 창 둘 · 창턱 · 방범창
      white(g); for (const x of [12, 70]) { g.fillStyle = '#cfc9bf'; g.fillRect(x - 3, 30, 52, 52); glassGrad(g, x, 33, 46, 44, '#909ca4', '#56626a');
        g.strokeStyle = 'rgba(60,60,60,.55)'; g.lineWidth = 1.5; for (let i = x + 6; i < x + 46; i += 7) { g.beginPath(); g.moveTo(i, 33); g.lineTo(i, 77); g.stroke(); }
        g.fillStyle = '#bdb6aa'; g.fillRect(x - 5, 80, 56, 5); }
      g.fillStyle = '#d2cbc0'; g.fillRect(0, 120, 128, 8);
    }),
    tex(g => {                                                                // 1-1 아파트: 넓은 거실 창 + 발코니 난간
      white(g); glassGrad(g, 6, 14, 116, 78, '#9fb0b9', '#56646d');
      g.fillStyle = '#e8e4dc'; for (const x of [6, 44, 84]) g.fillRect(x, 14, 3, 78);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(6, 70, 116, 3); g.fillRect(6, 88, 116, 4);
      g.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 10; x < 122; x += 7) g.fillRect(x, 72, 1.5, 16);
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 96, 128, 32);
    }),
    tex(g => {                                                                // 1-2 아파트: 확장형 통유리 · 실외기 칸
      white(g); glassGrad(g, 4, 12, 92, 84, '#a9bcc6', '#5a6a74'); g.fillStyle = '#eef0f0'; for (const x of [4, 34, 64, 94]) g.fillRect(x, 12, 2, 84);
      g.fillStyle = '#d8d6d0'; g.fillRect(100, 40, 24, 56); g.strokeStyle = 'rgba(80,80,80,.5)'; for (let y = 44; y < 96; y += 5) { g.beginPath(); g.moveTo(100, y); g.lineTo(124, y); g.stroke(); }
      g.fillStyle = '#e6e2da'; g.fillRect(0, 100, 128, 28);
    }),
    tex(g => { white(g); glassGrad(g, 0, 30, 128, 54, '#7d8f99', '#3f4b53'); g.fillStyle = '#e0dbd2'; g.fillRect(0, 30, 128, 3); g.fillRect(0, 81, 128, 3); g.fillRect(126, 30, 2, 54); }),
    tex(g => {                                                                // 2-2 타일 외벽 · 네모 창
      white(g); g.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
      g.fillStyle = '#3f3a36'; g.fillRect(22, 26, 84, 62); glassGrad(g, 25, 29, 78, 56, '#8597a1', '#4a5760'); g.fillStyle = '#3f3a36'; g.fillRect(63, 29, 3, 56);
    }),
    tex(g => { glassGrad(g, 0, 0, 128, 128, '#c8d6dd', '#6f8592'); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(70, 0); g.lineTo(0, 90); g.fill(); g.fillStyle = '#e4e8ea'; g.fillRect(0, 0, 4, 128); g.fillRect(0, 108, 128, 20); }),
    tex(g => {                                                                // 3-2 짙은 유리 · 가로 스팬드럴 띠
      glassGrad(g, 0, 0, 128, 92, '#5e6f7a', '#2e3a42'); g.fillStyle = '#b9c0c4'; g.fillRect(0, 92, 128, 36); g.fillStyle = '#9aa3a8'; g.fillRect(0, 92, 128, 4);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, 128, 30); g.fillStyle = '#7f898e'; g.fillRect(62, 0, 3, 92);
    }),
    tex(g => {                                                                // 4-1 학교: 벽돌 · 흰 창틀
      white(g); g.strokeStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < 128; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
      g.fillStyle = '#f4f2ee'; g.fillRect(16, 24, 96, 66); glassGrad(g, 21, 29, 86, 56, '#93a3ac', '#5a6870'); g.fillStyle = '#f4f2ee'; g.fillRect(62, 29, 4, 56); g.fillRect(21, 54, 86, 3);
    }),
    tex(g => {                                                                // 4-2 학교: 긴 복도 창
      white(g); g.fillStyle = '#f2efe9'; g.fillRect(0, 28, 128, 60); glassGrad(g, 4, 32, 120, 52, '#97a8b0', '#5d6c74'); g.fillStyle = '#f2efe9'; for (const x of [34, 64, 94]) g.fillRect(x, 32, 3, 52);
    }),
  ];
}

/** 창문을 벽보다 안쪽으로 보이게 하는 공유 높이 맵. 건물별 메시를 늘리지 않는다. */
function facadeBump(texture: THREE.Texture) {
  const source = texture.image as HTMLCanvasElement;
  const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
  const g = c.getContext('2d')!, original = source.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  const out = g.createImageData(c.width, c.height);
  for (let i = 0; i < original.data.length; i += 4) {
    const r = original.data[i], green = original.data[i + 1], b = original.data[i + 2];
    const glazing = b > r * 1.02 && green > r * .98 && r < 220;
    const height = glazing ? 65 : 165;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = height; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const result = new THREE.CanvasTexture(c); result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.colorSpace = THREE.NoColorSpace; result.anisotropy = 4;
  return result;
}

/** 1층 가게 64칸 (16 × 4줄, 한 칸 = 폭 6 m): 간판 · 차양 · LED 글자 · 빈 가게(임대) 섞음 */
const SHOP_COLS = 16, SHOP_ROWS = 4;
function shopAtlas() {
  // 가게 사이사이에 가게 아닌 칸(로비 · 그냥 벽 · 주차장 입구)을 섞어 간판이 줄줄이 도배되지 않게
  const names = ['편의점', '로비', '약국', '치킨', '벽', '헤어', '분식', '주차', '베이커리', '휴대폰', '벽', '꽃집', '세탁', '로비', '반찬', '문구',
    '김밥', '벽', '피자', '떡볶이', '로비', '마트', '철물', '벽', '옷가게', '신발', '주차', '한의원', '치과', '벽', '이비인후과', 'iM뱅크',
    '로비', 'PC방', '횟집', '벽', '갈비', '냉면', '주차', '돈까스', '초밥', '벽', '버블티', '로비', '수선', '열쇠', '벽', '인테리어',
    '공인중개사', '로비', '여행사', '벽', '요가', '태권도', '주차', '임대', '카페', '벽', '스터디카페', '로비', '커피', '벽', '닭갈비', '우동'];
  const bgs = ['#1f8f4e', '#4a2f22', '#e04a3a', '#f2b232', '#1d4f8f', '#e8e2da', '#ff7a2e', '#2b2b2b', '#f7e6c8', '#e3262e', '#3b2a1e', '#f6dbe5', '#5bb7d6', '#7a1f1f', '#2f6fb8', '#ffffff', '#111111', '#6b4fa0'];
  const W = 128, H = 128;
  const t = canvasTex(W * SHOP_COLS, H * SHOP_ROWS, g => {
    names.forEach((name, i) => {
      const x = (i % SHOP_COLS) * W, y = Math.floor(i / SHOP_COLS) * H, r = hash(i * 31 + 7);
      const bg = name === 'iM뱅크' ? '#00a07a' : bgs[i % bgs.length], light = ['#e8e2da', '#ffffff', '#f7e6c8', '#f6dbe5'].includes(bg);
      const fg = light ? ['#c0397a', '#1f6fc5', '#8a4a20', '#3d7a3d'][i % 4] : (r < 0.3 ? '#ffe28a' : '#ffffff');
      g.fillStyle = ['#d8d3cb', '#cfc8bd', '#bdb5aa', '#e2ddd5'][i % 4]; g.fillRect(x, y, W, H);          // 기둥 · 벽
      const vacant = name === '임대';
      if (name === '벽') {                                                                                // 가게 없는 벽: 석재 판 · 줄눈
        g.fillStyle = ['#c9c2b6', '#b8b0a3', '#d3cdc3'][i % 3]; g.fillRect(x, y, W, H);
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x, y + 30 * k + 8); g.lineTo(x + W, y + 30 * k + 8); g.stroke(); }
        g.fillStyle = '#8a857e'; g.fillRect(x, y + 122, W, 6); return;
      }
      if (name === '로비') {                                                                              // 건물 현관: 유리문 · 캐노피 · 번지 표시
        g.fillStyle = '#cfc9bf'; g.fillRect(x, y, W, H); g.fillStyle = '#5c5751'; g.fillRect(x + 14, y + 26, W - 28, 8);
        glassGrad(g, x + 24, y + 36, W - 48, 86, '#b9c9cf', '#55636a'); g.fillStyle = '#7d7871'; g.fillRect(x + W / 2 - 1, y + 36, 3, 86);
        g.fillStyle = '#2f2b28'; fitText(g, String(10 + (i * 37) % 90), x + W / 2, y + 16, 40, 14, 700); return;
      }
      if (name === '주차') {                                                                              // 주차장 입구: 어두운 입구 · 노란 높이 제한 띠
        g.fillStyle = '#bdb6aa'; g.fillRect(x, y, W, H); g.fillStyle = '#1d1c1b'; g.fillRect(x + 10, y + 36, W - 20, 92);
        for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#222' : '#f2c230'; g.fillRect(x + 10 + k * (W - 20) / 6, y + 28, (W - 20) / 6, 8); }
        g.fillStyle = '#fff'; fitText(g, 'P 주차장', x + W / 2, y + 14, W - 20, 14); return;
      }
      if (vacant) {
        glassGrad(g, x + 6, y + 30, W - 12, 92, '#6f7c83', '#30383d');
        g.fillStyle = '#fff'; g.fillRect(x + 34, y + 54, 60, 34); g.fillStyle = '#d0302a'; fitText(g, '임대', x + 64, y + 66, 54, 22); g.fillStyle = '#333'; fitText(g, '문의 010-', x + 64, y + 82, 54, 10, 500);
        g.fillStyle = '#9a948c'; g.fillRect(x + 4, y + 8, W - 8, 18);                                    // 간판 뗀 자국
      } else {
        const style = r < 0.25 ? 'led' : r < 0.5 ? 'awning' : 'band';
        if (style === 'led') { g.fillStyle = '#1b1b1d'; g.fillRect(x + 2, y + 4, W - 4, 32); g.shadowColor = fg; g.shadowBlur = 8; g.fillStyle = fg; fitText(g, name, x + W / 2, y + 21, W - 20, 24); g.shadowBlur = 0; }
        else { g.fillStyle = bg; g.fillRect(x + 4, y + 6, W - 8, 30); g.fillStyle = fg; fitText(g, name, x + W / 2, y + 22, W - 18, 23); }
        glassGrad(g, x + 6, y + 42, W - 12, 80, '#a6b8c0', '#3c4a52');                                 // 진열창
        g.fillStyle = `rgba(255,240,210,${0.25 + r * 0.25})`; g.fillRect(x + 10, y + 58, W - 20, 44);
        for (let k = 0; k < 4; k++) { g.fillStyle = `hsl(${(i * 47 + k * 70) % 360},45%,${50 + k * 6}%)`; g.fillRect(x + 14 + k * 18, y + 92, 12, 14 + (k % 2) * 6); }  // 진열 물건
        g.fillStyle = '#5a5550'; g.fillRect(x + 6, y + 42, W - 12, 3); g.fillRect(x + W / 2 - 1, y + 42, 3, 80);
        g.fillStyle = '#3a3633'; g.fillRect(x + (r < 0.6 ? W - 40 : 14), y + 62, 26, 60);                  // 문
        if (style === 'awning') {                                                                          // 줄무늬 차양
          for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f4f1ea' : bg; g.beginPath(); g.moveTo(x + 6 + k * 14.5, y + 40); g.lineTo(x + 20.5 + k * 14.5, y + 40); g.lineTo(x + 18 + k * 14.5, y + 56); g.lineTo(x + 4 + k * 14.5, y + 56); g.fill(); }
        }
      }
      g.fillStyle = '#8a857e'; g.fillRect(x, y + 122, W, 6);
    });
  });
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** 2층 창문 글씨 (학원 · 병원 · 노래방 …) 16칸 × 2줄 — 유리창에 큰 글자 시트 */
const UP_COLS = 16, UP_ROWS = 2;
function upperAtlas() {
  const names = ['수학학원', '영어학원', '연세치과', '피부과', '내과', '한의원', '노래연습장', 'PC방', '당구장', '필라테스', '헬스클럽', '미술학원', '태권도', '정형외과', '안과', '스터디카페',
    '논술', '코인노래방', '탁구장', '골프연습장', '안경원', '세무회계', '법무사', '공인중개사', '보습학원', '피아노', '요가', '키즈카페', '호프', '스크린골프', '산부인과', '동물병원'];
  const cols = ['#ffdf3e', '#ffffff', '#ff6b4a', '#7fd4ff', '#ffffff', '#ffe08a', '#ff8ad8', '#8affc1'];
  const W = 128, H = 128;
  const t = canvasTex(W * UP_COLS, H * UP_ROWS, g => {
    names.forEach((name, i) => {
      const x = (i % UP_COLS) * W, y = Math.floor(i / UP_COLS) * H;
      g.fillStyle = '#fff'; g.fillRect(x, y, W, H);
      glassGrad(g, x + 4, y + 16, W - 8, 92, '#2c3a44', '#1b242b');                 // 짙은 창
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 4, y + 16, W - 8, 20);
      g.fillStyle = cols[i % cols.length]; fitText(g, name, x + W / 2, y + 60, W - 18, name.length > 4 ? 22 : 30);
      g.fillStyle = '#e8e4dc'; g.fillRect(x + W / 2 - 1, y + 16, 2, 92); g.fillRect(x, y + 112, W, 16);
    });
  });
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** 세로 간판 8종 (64 × 256) — 업종 이름이라 어느 동네에나 있는 것 */
const VERT = ['병원', '치과', '학원', '노래방', 'PC방', '한의원', '모텔', '호프'];
function signAtlas() {
  return canvasTex(512, 256, g => {
    VERT.forEach((name, i) => {
      const x = i * 64, bg = ['#c62828', '#1565c0', '#2e7d32', '#6a1b9a', '#111', '#4e342e', '#ad1457', '#ef6c00'][i];
      g.fillStyle = '#e8e8e8'; g.fillRect(x, 0, 64, 256); g.fillStyle = bg; g.fillRect(x + 4, 4, 56, 248);
      g.fillStyle = '#fff'; [...name].forEach((ch, k, a) => { font(g, 38); g.fillText(ch, x + 32, 128 + (k - (a.length - 1) / 2) * 46); });
    });
  });
}
const vertCell = (i: number) => [i / 8, 0, (i + 1) / 8, 1];                          // [u0, v0(아래), u1, v1(위)]

/* ---------- 실제 건물 이름 간판 (브이월드 건물명) ----------
 * 아파트: 단지 이름을 길 쪽 벽 맨 위층에 (실제 아파트처럼 글자만) · 상가 · 사무실 · 학교 · 호텔: 옥상 간판.
 * 이름 있는 건물만, 길에서 가까운 것부터 최대 512개 → 한 장(2048 × 4096, 칸 256 × 64)에 그림 */
type NameSign = { kind: 'apt' | 'roof'; name: string };
const nameSignOf = (b: Bldg): NameSign | null => {
  if (!b.n) return null;
  const f = b.f ?? 1, d = b.d ?? 999;
  if (b.k === 1) return f >= 8 && d < 220 ? { kind: 'apt', name: b.n } : null;
  return f >= 4 && d < 160 ? { kind: 'roof', name: b.n } : null;
};
const NAME_COLS = 8, NAME_ROWS = 64;
function nameAtlas(signs: NameSign[]) {
  const keys = [...new Map(signs.map(s => [s.kind + s.name, s])).values()].slice(0, NAME_COLS * NAME_ROWS);
  const cell = new Map<string, number[]>();
  const tex = canvasTex(256 * NAME_COLS, 64 * NAME_ROWS, g => {
    keys.forEach((s, i) => {
      const x = (i % NAME_COLS) * 256, y = Math.floor(i / NAME_COLS) * 64, r = hash(i * 13 + s.name.length);
      if (s.kind === 'apt') {                                                    // 아파트: 바탕 없이 글자만 (벽에 칠한 단지명)
        g.fillStyle = ['#2b4a7a', '#1f5f4a', '#6b2b2b', '#3a3a3a', '#7a5a1f'][Math.floor(r * 5)]; fitText(g, s.name, x + 128, y + 34, 240, 44);
      } else {                                                                   // 옥상 간판: 색 판 + 흰 글씨 + 테두리
        g.fillStyle = ['#0d47a1', '#1b5e20', '#b71c1c', '#263238', '#4a148c'][Math.floor(r * 5)]; g.fillRect(x + 2, y + 2, 252, 60);
        g.fillStyle = '#fff'; fitText(g, s.name, x + 128, y + 33, 232, 38);
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, 246, 54);
      }
      const c = i % NAME_COLS, rr = Math.floor(i / NAME_COLS);
      cell.set(s.kind + s.name, [c / NAME_COLS, 1 - (rr + 1) / NAME_ROWS, (c + 1) / NAME_COLS, 1 - rr / NAME_ROWS]);
    });
  });
  tex.anisotropy = 8;
  return { tex, cell };
}

/* ---------- 600 m 칸 하나 만들기 ---------- */
function buildChunk(items: Bldg[], nameCell: Map<string, number[]>) {
  const walls = Array.from({ length: PAL.length * VARIANTS }, () => new Geo()), shops = new Geo(), uppers = new Geo(), roofs = new Geo(), signs = new Geo(), names = new Geo();
  const c = new THREE.Color(), roofC = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  const roofBoxes: THREE.Matrix4[] = [];
  items.forEach(b => {
    let pts: THREE.Vector2[] = [];
    for (let i = 0; i < b.p.length; i += 2) pts.push(new THREE.Vector2(b.p[i], b.p[i + 1]));
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], d = pts[(i + 1) % pts.length]; area += a.x * d.y - d.x * a.y; }
    if (area < 0) pts = pts.reverse();
    area = Math.abs(area) / 2;
    const seed = Math.round(b.p[0] * 7 + b.p[1] * 13), R = (k: number) => hash(seed * 97 + k);
    const k = PAL[b.k] ? b.k : 0, pal = PAL[k], fl = b.f ?? Math.max(1, Math.round(b.h / 3.3));
    c.setHex(pal[Math.floor(R(1) * pal.length)]); roofC.copy(c).multiplyScalar(0.62);
    const h = b.h, shop = hasShops(b, R(2)), upper = shop && fl >= 3 && R(3) < 0.3;
    let y0 = 0;
    if (shop) {                                                                  // 1층: 건물마다 다른 줄 · 다른 시작 칸
      const row = Math.floor(R(4) * SHOP_ROWS);
      wallBand(shops, pts, 0, SHOP_H, 6 * SHOP_COLS, SHOP_H, white, Math.floor(R(5) * SHOP_COLS) * 6, [1 - (row + 1) / SHOP_ROWS, 1 - row / SHOP_ROWS]);
      y0 = SHOP_H;
    }
    if (upper) {                                                                 // 2층: 창문 글씨 상가
      const row = Math.floor(R(6) * UP_ROWS);
      wallBand(uppers, pts, SHOP_H, SHOP_H + UP_H, 6 * UP_COLS, UP_H, white, Math.floor(R(7) * UP_COLS) * 6, [1 - (row + 1) / UP_ROWS, 1 - row / UP_ROWS]);
      y0 = SHOP_H + UP_H;
    }
    if (h > y0 + 0.5) wallBand(walls[k * VARIANTS + Math.floor(R(8) * VARIANTS)], pts, y0, h, BAY_W[k], FLOOR_H[k], c);
    // 옥상 난간 (지붕 가장자리를 살짝 올림)
    wallBand(roofs, pts, h, h + 0.9, 1, 1, roofC.clone().multiplyScalar(1.25));
    const tris = THREE.ShapeUtils.triangulateShape(pts, []), base = roofs.n;   // 지붕
    pts.forEach(p => { roofs.pos.push(p.x, h + 0.05, p.y); roofs.nor.push(0, 1, 0); roofs.uv.push(0, 0); roofs.col.push(roofC.r, roofC.g, roofC.b); });
    tris.forEach(([i0, i1, i2]) => {
      const a = pts[i0], b2 = pts[i1], d = pts[i2];
      const up = (b2.y - a.y) * (d.x - a.x) - (b2.x - a.x) * (d.y - a.y) > 0;  // 위를 보게
      if (up) roofs.idx.push(base + i0, base + i1, base + i2); else roofs.idx.push(base + i0, base + i2, base + i1);
    });
    // 옥상 설비 (실외기 · 물탱크 · 계단실): 넓은 건물에 1~3개, 윤곽 안쪽에만
    if (area > 150 && b.k !== 1) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      for (let j = 0; j < 1 + Math.floor(R(9) * 3); j++) {
        const ox = cx + (R(10 + j) - 0.5) * 7, oz = cz + (R(20 + j) - 0.5) * 7;
        if (!insidePoly(ox, oz, pts)) continue;
        const sx = 2 + R(30 + j) * 3, sy = 1.2 + R(40 + j) * 1.8, sz = 1.6 + R(50 + j) * 1.5;
        roofBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(ox, h + sy / 2, oz), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
      }
    }
    // 가까운 건물만 코너 프레임·수평 처마를 추가한다. 공유 배치에 합쳐 draw call은 늘리지 않는다.
    if ((b.d ?? 999) < 70 && h > 9 && area > 100 && R(61) < .55) {
      const center = pts.reduce((v, p) => v.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
      const cornice = pts.map(p => p.clone().addScaledVector(p.clone().sub(center).normalize(), .2));
      wallBand(roofs, cornice, h - .12, h + .14, 1, 1, c.clone().multiplyScalar(.87));
      if (shop) wallBand(roofs, cornice, SHOP_H - .14, SHOP_H + .1, 1, 1, c.clone().multiplyScalar(.8));
      if (k !== 1) pts.slice(0, 6).forEach(p => {
        const out = p.clone().addScaledVector(p.clone().sub(center).normalize(), .08);
        roofBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(out.x, h / 2, out.y), new THREE.Quaternion(), new THREE.Vector3(.26, h, .26)));
      });
    }
    // 길가 쪽 꼭짓점 · 변 찾기 (세로 간판 · 이름 간판 자리)
    const ns = nameSignOf(b), nc = ns && nameCell.get(ns.kind + ns.name);
    if (!nc && (!shop || (b.d ?? 999) > 110)) return;
    let vi = 0, vg = 1e9, ei = 0, eg = 1e9;
    pts.forEach((p, i) => {
      const gp = roadGap(p.x, p.y); if (gp < vg) { vg = gp; vi = i; }
      const q = pts[(i + 1) % pts.length], ge = roadGap((p.x + q.x) / 2, (p.y + q.y) / 2); if (ge < eg && p.distanceTo(q) > 6) { eg = ge; ei = i; }
    });
    if (ns && nc) {                                                              // 실제 이름: 아파트는 맨 위층 벽에 글자 · 그 밖은 옥상 간판
      const p = pts[ei], q = pts[(ei + 1) % pts.length], len = p.distanceTo(q), e = new THREE.Vector2(q.x - p.x, q.y - p.y).normalize(), o = new THREE.Vector2(e.y, -e.x);
      const mid = p.clone().lerp(q, 0.5), apt = ns.kind === 'apt';
      const w = Math.min(len * (apt ? 0.8 : 0.7), apt ? 3 * ns.name.length + 4 : 16), hh = w / 4;
      const P0 = mid.clone().addScaledVector(e, w / 2).addScaledVector(o, apt ? 0.08 : -0.8), P1 = mid.clone().addScaledVector(e, -w / 2).addScaledVector(o, apt ? 0.08 : -0.8);
      const yb = apt ? h - 1.2 - hh : h + 1.4;
      names.quad(new THREE.Vector3(P0.x, yb, P0.y), new THREE.Vector3(P0.x, yb + hh, P0.y), new THREE.Vector3(P1.x, yb, P1.y), new THREE.Vector3(P1.x, yb + hh, P1.y), new THREE.Vector3(o.x, 0, o.y), nc);
      if (!apt) for (const P of [P0, P1]) roofBoxes.push(new THREE.Matrix4().compose(new THREE.Vector3(P.x, h + 0.7, P.y), new THREE.Quaternion(), new THREE.Vector3(0.2, 1.4, 0.2)));   // 받침 기둥
    }
    if (!shop || (b.d ?? 999) > 110) return;
    if (fl >= 3 && fl <= 12 && R(11) < 0.3) {                                    // 세로 간판: 길 쪽 모서리에서 벽과 직각으로 튀어나옴
      const p = pts[vi], q = pts[(vi + 1) % pts.length], e = new THREE.Vector2(q.x - p.x, q.y - p.y).normalize(), o = new THREE.Vector2(e.y, -e.x);   // o: 바깥 법선
      const yA = y0 + 0.4, yB = Math.min(h - 0.6, yA + Math.min(9, (fl - 1) * 2.6)), at = p.clone().addScaledVector(e, 0.4);
      const n = new THREE.Vector3(e.x, 0, e.y), cell = vertCell(Math.floor(R(12) * VERT.length));
      const A = (s: number, y: number) => new THREE.Vector3(at.x + o.x * s, y, at.y + o.y * s);
      if (yB - yA > 2) {
        signs.quad(A(0.2, yA), A(0.2, yB), A(1.1, yA), A(1.1, yB), n.clone().negate(), cell);                  // 앞면
        signs.quad(A(1.1, yA), A(1.1, yB), A(0.2, yA), A(0.2, yB), n, cell);                                   // 뒷면
      }
    }
  });
  const g = (G: Geo) => G.idx.length ? G.build() : null;
  return { walls: walls.map(g), shops: g(shops), uppers: g(uppers), roofs: roofs.build(), signs: g(signs), names: g(names), roofBoxes };
}

function insidePoly(x: number, z: number, pts: THREE.Vector2[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

export function buildCity(scene: THREE.Scene) {
  // 용도별 외벽 재질 (사무실 유리는 반사 조금) · 1층 · 2층 상가와 간판 (저녁에 은은히 빛남) · 지붕
  const wallMats = facadeTextures().map((t, i) => {
    const k = Math.floor(i / VARIANTS);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: facadeBump(t), bumpScale: .075,
      vertexColors: true, roughness: k === 3 ? .26 : .82, metalness: k === 3 ? .42 : .035,
      envMapIntensity: k === 3 ? .7 : .25 });
  });
  const lit = (t: THREE.Texture, glow: number) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.6 });
  const shopMat = lit(shopAtlas(), 0.08), upperMat = lit(upperAtlas(), 0.1), signMat = lit(signAtlas(), 0.18);
  signMat.side = THREE.DoubleSide;
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xb9b6b0, roughness: 0.8 });
  // 600 m 칸으로 나눠 화면 밖 덩어리는 그리지 않고, 해 가림 검사도 가볍게
  const chunks = new Map<number, Bldg[]>(), kept = C.b.filter(keep);
  kept.forEach(b => { const k = Math.floor(b.p[0] / 600) * 1000 + Math.floor(b.p[1] / 600); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push(b); });
  // 실제 이름 간판: 길에서 가까운 건물부터
  const named = kept.filter(b => nameSignOf(b)).sort((a, b) => (a.d ?? 999) - (b.d ?? 999)).map(b => nameSignOf(b)!);
  const NA = nameAtlas(named);
  const nameMat = new THREE.MeshStandardMaterial({ map: NA.tex, emissiveMap: NA.tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.6, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, occl = true) => {
    if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = occl; m.receiveShadow = true; scene.add(m); if (occl) meshes.push(m);
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  chunks.forEach(items => {
    const ch = buildChunk(items, NA.cell);
    ch.walls.forEach((g, i) => add(g, wallMats[i])); add(ch.shops, shopMat); add(ch.uppers, upperMat); add(ch.roofs, roofMat); add(ch.signs, signMat, false); add(ch.names, nameMat, false);
    if (ch.roofBoxes.length) {
      const inst = new THREE.InstancedMesh(boxGeo, boxMat, ch.roofBoxes.length);
      ch.roofBoxes.forEach((m, i) => inst.setMatrixAt(i, m)); inst.castShadow = true; scene.add(inst);
    }
  });

  const bank = C.bank ? buildBank(scene) : null;
  return { meshes, bank };
}

/** iM뱅크 본점: 실제 위치 · 18층 윤곽을 바탕으로 유리 커튼월 · 세로 핀 · 빛나는 왕관 · 간판 */
function buildBank(scene: THREE.Scene) {
  const { cx, cz, angle, W, Dp, H } = BF!;

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
