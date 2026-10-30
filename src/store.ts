import { create } from 'zustand';

export type Weather = 'clear' | 'cloud' | 'over';
export type Gfx = 'high' | 'low';
export type DriveMode = 'normal' | 'sport';
export type Screen = 'menu' | 'driving' | 'result';
export type AppId = 'home' | 'cam' | 'map' | 'res' | 'set';

export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;

export interface Settings {
  date: string; minutes: number; weather: Weather; flow: number; glass: boolean; gfx: Gfx; mode: DriveMode;
  startKm: number; endKm: number; mission: number | null;
}

/** HUD에 보여줄 값 (엔진이 초당 10번 넣어 줌) */
export interface Hud {
  riskRatio: number; glareLv: 0 | 1 | 2; glassText: string; score: number; kmh: number;
  prog: number; remainKm: number; from: string; to: string; ticks: number[]; station: string; warn: boolean; fps: number;
}

export interface Banner { k: string; v: string; s: string; id: number }
export interface RunResult { title: string; score: number; sec: number; glareSec: number; glareMax: number }

interface State {
  screen: Screen; phoneOpen: boolean; app: AppId;
  settings: Settings; hud: Hud; banner: Banner | null; result: RunResult | null;
  set: (p: Partial<Settings>) => void;
  openApp: (a: AppId) => void;
}

const year = new Date().getFullYear();

export const useGame = create<State>(set => ({
  screen: 'menu', phoneOpen: false, app: 'home',
  settings: {
    date: `${year}-10-30`, minutes: 1020, weather: 'clear', flow: 10, glass: false, gfx: isTouch ? 'low' : 'high',
    startKm: 22.95, endKm: 16.9, mission: 0, mode: 'normal',
  },
  hud: { riskRatio: 1, glareLv: 0, glassText: '대기', score: 100, kmh: 0, prog: 0, remainKm: 0, from: '-', to: '-', ticks: [], station: '-', warn: false, fps: 0 },
  banner: null, result: null,
  set: p => set(s => ({ settings: { ...s.settings, ...p } })),
  openApp: a => set({ app: a }),
}));

export interface Mission { t: string; s: string; a: number; b: number; m: number; date: string; badge?: string }
export const MISSIONS: Mission[] = [
  { t: '🏦 iM뱅크 본점 퇴근길', s: '본점 500 m 앞 → 두류 · 17:00 · 서쪽 노을을 정면으로', a: 22.95, b: 16.9, m: 1020, date: '-10-30', badge: '추천' },
  { t: '아침 출근길 동쪽', s: '다사 → 계명대 · 07:58 · 겨울 아침 해를 정면으로', a: 7.55, b: 10.95, m: 478, date: '-12-20' },
  { t: '겨울 노을 서쪽', s: '범어 → 두류 · 16:50 · 해가 가장 낮은 계절', a: 23.57, b: 16.9, m: 1010, date: '-12-20' },
];
export const missionDate = (m: Mission) => `${year}${m.date}`;
