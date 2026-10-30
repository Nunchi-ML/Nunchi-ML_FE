import raw from '../data/dalgu.json';

export interface Station { name: string; km: number }
interface DirVal { b: number; h: number; base: number; pred: number }
export interface Segment { km0: number; km1: number; lat: number; lon: number; name: string; E: DirVal; W: DirVal }
interface RoadData { total_km: number; poly: [number, number][]; stations: Station[]; segments: Segment[] }

export const D = raw as unknown as RoadData;

const LAT0 = 35.866, LON0 = 128.59;
const KLAT = 110940, KLON = 111320 * Math.cos(LAT0 * Math.PI / 180);

/* ---------- 도로 선 (m 단위, x = 동쪽, z = 남쪽) ---------- */
type Pt = { x: number; z: number };
const RAW: Pt[] = D.poly.map(([lon, lat]) => ({ x: (lon - LON0) * KLON, z: -(lat - LAT0) * KLAT }));

/** 꺾인 선을 5 m 간격으로 다시 찍고 이동 평균으로 다듬어, 모퉁이에서 시점이 확 꺾이지 않게 함 */
function smoothPath(src: Pt[], step = 5, half = 8, passes = 3): Pt[] {
  const out: Pt[] = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = step - carry; d <= len; d += step) out.push({ x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len });
    carry = (carry + len) % step;
  }
  out.push(src[src.length - 1]);
  let cur = out;
  for (let p = 0; p < passes; p++) {
    cur = cur.map((_, i) => {
      if (i === 0 || i === cur.length - 1) return cur[i];
      const k = Math.min(half, i, cur.length - 1 - i);                    // 양 끝은 창을 좁혀 길이를 지킴
      let x = 0, z = 0; for (let j = i - k; j <= i + k; j++) { x += cur[j].x; z += cur[j].z; }
      return { x: x / (2 * k + 1), z: z / (2 * k + 1) };
    });
  }
  return cur;
}
export const P = smoothPath(RAW);
const CUM = [0];
for (let i = 1; i < P.length; i++) CUM.push(CUM[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
export const TOTAL = CUM[CUM.length - 1];
/** 점마다 접선 (앞뒤 점 기준) — 점 사이에서 보간해 방향이 매끄럽게 바뀜 */
const TAN = P.map((_, i) => {
  const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
});

export const kmToS = (km: number) => km / D.total_km * TOTAL;   // 역 km → 도로 길이(m)
export const sToKm = (s: number) => s / TOTAL * D.total_km;

export interface RoadPoint { x: number; z: number; dx: number; dz: number }
/** 도로 위 s(m) 지점의 위치와 진행 방향(이정 증가 쪽) */
export function at(s: number): RoadPoint {
  s = Math.max(0, Math.min(TOTAL - 0.01, s));
  let lo = 0, hi = CUM.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CUM[m] <= s) lo = m; else hi = m; }
  const t = (s - CUM[lo]) / (CUM[hi] - CUM[lo]);
  const x = P[lo].x + (P[hi].x - P[lo].x) * t, z = P[lo].z + (P[hi].z - P[lo].z) * t;
  const dx = TAN[lo].x + (TAN[hi].x - TAN[lo].x) * t, dz = TAN[lo].z + (TAN[hi].z - TAN[lo].z) * t, len = Math.hypot(dx, dz) || 1;
  return { x, z, dx: dx / len, dz: dz / len };
}

export const ROAD_W = 30;
/** 진행 방향 오른쪽 차로 중심 (중앙선 기준, m) */
export const laneOffset = (lane: number) => 1.75 + lane * 3.3;

export const nearestStation = (km: number) =>
  D.stations.reduce((a, b) => Math.abs(b.km - km) < Math.abs(a.km - km) ? b : a);
export const BANK_KM = (D.stations.find(s => s.name === '대구은행') ?? { km: 22.45 }).km;
export const stationLabel = (name: string) => name === '대구은행' ? '대구은행역' : name;

/* ---------- 구간 위험 (체험용 예시값 · 모델 ① 결과 아님) ---------- */
const meanPred = { E: 0, W: 0 };
D.segments.forEach(g => { meanPred.E += g.E.pred; meanPred.W += g.W.pred; });
meanPred.E /= D.segments.length; meanPred.W /= D.segments.length;

export type Dir = 'E' | 'W';
export function riskAt(km: number, dir: Dir) {
  const g = D.segments[Math.max(0, Math.min(D.segments.length - 1, Math.floor(km / 0.2)))];
  return { ratio: g[dir].pred / meanPred[dir], name: g.name };
}
export const riskColor = (r: number) => r < 0.85 ? '#3BA55C' : r < 1.2 ? '#FF8A1F' : '#F2522E';
export const riskLv = (r: number) => r < 0.85 ? 0 : r < 1.2 ? 1 : 2;
