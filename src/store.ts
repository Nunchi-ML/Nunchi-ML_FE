import { create } from 'zustand';
import { ROAD_ID } from './game/roadSelection';
import { ROAD_MISSIONS, missionDate } from './game/missions';
export { missionDate } from './game/missions';
export const MISSIONS = ROAD_MISSIONS[ROAD_ID];
const INITIAL = MISSIONS[0];

export type Weather = 'clear' | 'cloud' | 'over';
export type Gfx = 'high' | 'low';
export type DriveMode = 'normal' | 'sport';
export type Screen = 'menu' | 'driving' | 'result';
export type AppId = 'home' | 'cam' | 'map' | 'res' | 'set';

export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;

export interface Settings {
  voice: boolean; guidance: boolean;
  date: string; minutes: number; weather: Weather; flow: number; glass: boolean; gfx: Gfx; mode: DriveMode;
  startKm: number; endKm: number; mission: number | null;
}

/** HUD에 보여줄 값 (엔진이 초당 10번 넣어 줌) */
export interface Hud {
  riskRatio: number; glareLv: 0 | 1 | 2; glassText: string; score: number; kmh: number;
  prog: number; remainKm: number; from: string; to: string; ticks: number[]; station: string; warn: boolean; fps: number;
  navigation?: { text: string; meters: number; source: string; voiceAvailable: boolean; inCab: boolean };
  analysis?: { level: 0 | 1 | 2; modelVersion: string; aheadMeters: number | null };
  adaptation?: { name: string; phase: string; burden: number; score: number; entryScore: number; exitScore: number; pupil: number; distance: number };
}

export interface Banner { k: string; v: string; s: string; id: number }
export interface RunResult { title: string; score: number; sec: number; glareSec: number; glareMax: number }

interface State {
  screen: Screen; phoneOpen: boolean; app: AppId;
  settings: Settings; hud: Hud; banner: Banner | null; result: RunResult | null;
  set: (p: Partial<Settings>) => void;
  openApp: (a: AppId) => void;
}



export const useGame = create<State>(set => ({
  screen: 'menu', phoneOpen: false, app: 'home',
  settings: {
    voice: true, guidance: true, date: missionDate(INITIAL), minutes: INITIAL.m, weather: 'clear', flow: 0, glass: false, gfx: isTouch ? 'low' : 'high',
    startKm: INITIAL.a, endKm: INITIAL.b,
    mission: 0, mode: 'normal',
  },
  hud: { riskRatio: 1, glareLv: 0, glassText: '대기', score: 100, kmh: 0, prog: 0, remainKm: 0, from: '-', to: '-', ticks: [], station: '-', warn: false, fps: 0 },
  banner: null, result: null,
  set: p => set(s => ({ settings: { ...s.settings, ...p } })),
  openApp: a => set({ app: a }),
}));
