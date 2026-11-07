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
  voice: boolean; guidance: boolean; carSound: boolean;
  preference: 'arrival' | 'exposure'; extraMinutes: number; extraKm: number; sensitivity: 'standard' | 'sensitive';
  observationMode: 'connected' | 'example'; exampleCondition: 'attention' | 'stale' | 'direction' | 'missing';
  date: string; minutes: number; weather: Weather; flow: number; glass: boolean; gfx: Gfx; mode: DriveMode;
  startKm: number; endKm: number; mission: number | null;
  observationSpeed: 0 | 40 | 60 | 80;
}

/** HUD에 보여줄 값 (엔진이 초당 10번 넣어 줌) */
export interface Hud {
  riskRatio: number; glareLv: 0 | 1 | 2; glassText: string; score: number; kmh: number;
  prog: number; remainKm: number; from: string; to: string; ticks: number[]; station: string; warn: boolean; fps: number;
  navigation?: { text: string; meters: number; source: string; voiceAvailable: boolean; inCab: boolean };
  analysis?: { level: 0 | 1 | 2; modelVersion: string; aheadMeters: number | null; aheadLevel?: 0 | 1 | 2 | null };
  /** 모델 ③ 지하차도 입구 순응 위험: 155m 전 알림 문구 · 입구 통과 뒤 카운트다운 */
  model3?: { grade: '하' | '중' | '상'; text: string; color: string; source: 'photo' | 'sun' | 'preset'; countdown: number | null };
  adaptation?: { name: string; phase: string; burden: number; score: number; entryScore: number; exitScore: number; pupil: number; distance: number; coveredSeconds: number };
}

export interface Banner { k: string; v: string; s: string; id: number }
export interface PassageRecord { name: string; roofM: number; seconds: number; completed: boolean }
export interface RunResult { title: string; score: number; sec: number; glareSec: number; glareMax: number; passages: PassageRecord[] }

interface State {
  currentFrame: { state: 'unavailable' | 'analyzing' | 'ready'; level?: 0 | 1 | 2; at?: string; source?: 'camera' | 'game' };
  screen: Screen; phoneOpen: boolean; app: AppId;
  /** 실제로 그리는 해상도 배율·경계 다듬기 방식 (설정 화면 표시용) */
  render: { pixelRatio: number; deviceRatio: number; smoothing: string };
  /** 메인 화면 '눈부심 카메라'로 연 경우: 카메라 앱만 쓰고 다른 앱·홈으로는 못 간다. 휴대폰을 닫으면 풀린다. */
  camOnly: boolean;
  settings: Settings; hud: Hud; banner: Banner | null; result: RunResult | null;
  set: (p: Partial<Settings>) => void;
  openApp: (a: AppId) => void;
}



export const useGame = create<State>(set => ({
  currentFrame: { state: 'unavailable' },
  screen: 'menu', phoneOpen: false, app: 'home', camOnly: false, render: { pixelRatio: 1, deviceRatio: 1, smoothing: '' },
  settings: {
    preference: 'arrival', extraMinutes: 5, extraKm: 2, sensitivity: 'standard', observationMode: 'connected', exampleCondition: 'attention',
    voice: true, guidance: true, carSound: true, date: missionDate(INITIAL), minutes: INITIAL.m, weather: 'clear', flow: 0, glass: false, gfx: isTouch ? 'low' : 'high',
    startKm: INITIAL.a, endKm: INITIAL.b,
    mission: 0, mode: 'normal', observationSpeed: 0,
  },
  hud: { riskRatio: 1, glareLv: 0, glassText: '대기', score: 100, kmh: 0, prog: 0, remainKm: 0, from: '-', to: '-', ticks: [], station: '-', warn: false, fps: 0 },
  banner: null, result: null,
  set: p => set(s => ({ settings: { ...s.settings, ...p } })),
  openApp: a => set({ app: a }),
}));
