import raw from '../data/route_analysis.json';
import type { RoadId } from './roadSelection';

export interface AnalysisSample {
  km0: number; km1: number; km: number; level: 0 | 1 | 2;
  scores: { normal: number; glare: number; severe: number };
  imageSha256: string; geometricGlare: number;
}
export interface AnalysisCase {
  id: string; road: RoadId; date: string; minutes: number; weather: string; direction: number;
  status: 'final';
  modelVersion: string; samples: AnalysisSample[];
  adaptation?: { method: 'ml-luminance'; modelVersion: string; outsideLuminance: number; entry: number; exit: number; validatedZones?: ('entry' | 'exit')[] };
}
interface AnalysisData { format: string; cases: AnalysisCase[] }
const DATA = raw as unknown as AnalysisData;

type AnalysisSettings = { date: string; minutes: number; weather: string; startKm: number; endKm: number };
const matches = (c: AnalysisCase, road: RoadId, settings: AnalysisSettings) => c.status === 'final' && c.road === road && c.date === settings.date && c.weather === settings.weather &&
  Math.abs(c.minutes - settings.minutes) < .01 && c.direction === Math.sign(settings.endKm - settings.startKm);

/** Only matching cached predictions become warnings; missing photos stay unknown. */
export function routeAnalysisWarnings(road: RoadId, settings: AnalysisSettings, data = DATA) {
  const lo = Math.min(settings.startKm, settings.endKm), hi = Math.max(settings.startKm, settings.endKm);
  if (![lo, hi, settings.minutes].every(Number.isFinite) || lo === hi) return [];
  return data.cases.filter(c => matches(c, road, settings)).flatMap(c => c.samples
    .filter(s => s.level >= 1 && s.km1 > lo && s.km0 < hi)
    .map(s => ({ id: `${c.id}-${s.km0}`, km0: Math.max(lo, s.km0), km1: Math.min(hi, s.km1), level: s.level as 1 | 2 })));
}

/** Entry-only candidates cannot be presented as validated exit predictions. */
export function validatedTransitionResult(value: AnalysisCase['adaptation']) {
  return value?.method === 'ml-luminance' && typeof value.modelVersion === 'string' && value.modelVersion.trim() && Array.isArray(value.validatedZones) && value.validatedZones.includes('entry') && value.validatedZones.includes('exit')
    && Number.isFinite(value.outsideLuminance) && value.outsideLuminance > 0
    && [value.entry, value.exit].every(n => Number.isFinite(n) && n >= 0 && n <= 1) ? value : undefined;
}

export function lookupRouteAnalysis(road: RoadId, settings: { date: string; minutes: number; weather: string; startKm: number; endKm: number }, km: number, data = DATA) {
  if (!Number.isFinite(km) || !Number.isFinite(settings.minutes)) return null;
  const direction = Math.sign(settings.endKm - settings.startKm);
  const entry = data.cases.find(c => matches(c, road, settings) &&
    c.samples.some(s => km >= s.km0 && km <= s.km1));
  if (!entry) return null;
  const sample = entry.samples.find(s => km >= s.km0 && km <= s.km1)!;
  const ahead = entry.samples.filter(s => (s.km - km) * direction > 0 && (s.km - km) * direction <= .2 && s.level >= 1)
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))[0];
  return { sample, ahead, adaptation: validatedTransitionResult(entry.adaptation), modelVersion: entry.modelVersion, caseId: entry.id };
}

/** 출발 전 안내용: 지금 설정(도로·날짜·시각·날씨·방향)에 맞는 미리 판정 결과를 등급별 거리로 요약한다. 없으면 null. */
export function routeAnalysisSummary(road: RoadId, settings: { date: string; minutes: number; weather: string; startKm: number; endKm: number }, data = DATA) {
  if (!Number.isFinite(settings.minutes)) return null;
  const direction = Math.sign(settings.endKm - settings.startKm);
  const entry = data.cases.find(c => c.status === 'final' && c.road === road && c.date === settings.date && c.weather === settings.weather &&
    Math.abs(c.minutes - settings.minutes) < .01 && c.direction === direction);
  if (!entry || !entry.samples.length) return null;
  const meters = [0, 0, 0];
  for (const s of entry.samples) meters[s.level] += Math.round(Math.abs(s.km1 - s.km0) * 1000);
  const ordered = [...entry.samples].sort((a, b) => (a.km - b.km) * direction);
  return { modelVersion: entry.modelVersion, points: entry.samples.length, normalM: meters[0], glareM: meters[1], severeM: meters[2], levels: ordered.map(s => s.level) };
}
