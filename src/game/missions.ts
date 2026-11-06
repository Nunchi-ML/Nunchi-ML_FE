import sincheon from '../data/sincheon.json';
import type { RoadId } from './roadSelection';

export interface Mission {
  id: string; t: string; s: string; a: number; b: number; m: number; date: string;
  purpose: 'visibility' | 'adaptation'; badge?: string;
  observeKmh?: 40; photoExample?: boolean;
}
const longest = sincheon.underpasses.reduce((a, b) => b.s1 - b.s0 > a.s1 - a.s0 ? b : a);
export const ROAD_MISSIONS: Record<RoadId, Mission[]> = {
  dalgu: [
    { id: 'im-bank-sunset', purpose: 'visibility', t: '🏦 iM뱅크 본점 앞 · 봄 퇴근길 햇빛',
      s: '본점 350 m 앞에서 출발 · 본점 앞 통과 · 1.0 km', a: 22.8, b: 21.8, m: 1080, date: '-04-05', badge: '대표 체험', photoExample: true },
    { id: 'winter-morning', purpose: 'visibility', t: '겨울 아침 · 정면으로 들어오는 해',
      s: '강창교 부근 → 강창역 부근 · 동쪽 · 1.5 km', a: 8.3, b: 9.8, m: 505, date: '-12-20' },
    { id: 'winter-evening', purpose: 'visibility', t: '늦겨울 퇴근길 · 낮은 햇빛',
      s: '청라언덕 부근 → 반고개 부근 · 서쪽 · 1.5 km', a: 20, b: 18.5, m: 1030, date: '-02-20' },
  ],
  sincheon: [
    { id: 'chimsan-observation', purpose: 'adaptation', t: '침산교 · 내부를 더 오래 관찰',
      s: '실제 지붕 구간 약 190 m · 40 km/h에서 약 17초 · 북행', a: (longest.s0 - 220) / 1000,
      b: (longest.s1 + 260) / 1000, m: 750, date: '-10-30', badge: '밝기 전환 추천', observeKmh: 40 },
    { id: 'jungdong-exit', purpose: 'adaptation', t: '지하차도 출구 · 밝아지는 시야',
      s: '중동교 남행 · 지붕 약 93 m · 40 km/h에서 약 8초', a: (sincheon.underpasses[0].s1 + 160) / 1000,
      b: (sincheon.underpasses[0].s0 - 240) / 1000, m: 750, date: '-10-30', badge: '짧은 구간 비교', observeKmh: 40, photoExample: true },
    { id: 'successive-underpasses', purpose: 'adaptation', t: '연속 지하차도 · 밝아졌다 어두워졌다',
      s: '상동교 → 대봉교 하부 통과 · 북쪽 · 2.6 km', a: .1, b: 2.65, m: 780, date: '-10-30' },
    { id: 'west-exit-sunset', purpose: 'adaptation', t: '서쪽 출구 · 겨울 노을',
      s: '팔달교 하부 → 매천교 하부 · 낮은 햇빛 · 2.0 km', a: 12.1, b: sincheon.total_km - .15, m: 990, date: '-12-20' },
  ],
};
export const missionDate = (m: Mission, year = new Date().getFullYear()) => `${year}${m.date}`;
