import sincheon from '../data/sincheon.json';
import type { RoadId } from './roadSelection';

export interface Mission {
  id: string; t: string; s: string; a: number; b: number; m: number; date: string;
  purpose: 'visibility' | 'adaptation'; badge?: string;
}
export const ROAD_MISSIONS: Record<RoadId, Mission[]> = {
  dalgu: [
    { id: 'im-bank-sunset', purpose: 'visibility', t: '🏦 iM뱅크 본점 앞 · 퇴근길 햇빛',
      s: '본점 500 m 앞에서 출발 · 본점 앞 통과 · 1.2 km', a: 22.95, b: 21.8, m: 1070, date: '-09-20', badge: '대표 체험' },
    { id: 'winter-morning', purpose: 'visibility', t: '겨울 아침 · 정면으로 들어오는 해',
      s: '강창교 부근 → 강창역 부근 · 동쪽 · 1.5 km', a: 8.3, b: 9.8, m: 478, date: '-12-20' },
    { id: 'winter-evening', purpose: 'visibility', t: '겨울 퇴근길 · 낮은 햇빛',
      s: '청라언덕 부근 → 반고개 부근 · 서쪽 · 1.5 km', a: 20, b: 18.5, m: 1000, date: '-12-20' },
  ],
  sincheon: [
    { id: 'jungdong-exit', purpose: 'adaptation', t: '지하차도 출구 · 밝아지는 시야',
      s: '중동교 지하차도 남행 · 밝은 출구와 회복 구간 · 0.5 km', a: (sincheon.underpasses[0].s1 + 160) / 1000,
      b: (sincheon.underpasses[0].s0 - 240) / 1000, m: 750, date: '-10-30', badge: '첫 체험 추천' },
    { id: 'successive-underpasses', purpose: 'adaptation', t: '연속 지하차도 · 밝아졌다 어두워졌다',
      s: '상동교 → 대봉교 하부 통과 · 북쪽 · 2.6 km', a: .1, b: 2.65, m: 780, date: '-10-30' },
    { id: 'west-exit-sunset', purpose: 'adaptation', t: '서쪽 출구 · 겨울 노을',
      s: '팔달교 하부 → 매천교 하부 · 낮은 햇빛 · 2.0 km', a: 12.1, b: sincheon.total_km - .15, m: 990, date: '-12-20' },
  ],
};
export const missionDate = (m: Mission, year = new Date().getFullYear()) => `${year}${m.date}`;
