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

/** Entry-only candidates cannot be presented as validated exit predictions. */
export function validatedTransitionResult(value: AnalysisCase['adaptation']) {
  return value?.method === 'ml-luminance' && typeof value.modelVersion === 'string' && value.modelVersion.trim() && Array.isArray(value.validatedZones) && value.validatedZones.includes('entry') && value.validatedZones.includes('exit')
    && Number.isFinite(value.outsideLuminance) && value.outsideLuminance > 0
    && [value.entry, value.exit].every(n => Number.isFinite(n) && n >= 0 && n <= 1) ? value : undefined;
}

export function lookupRouteAnalysis(road: RoadId, settings: { date: string; minutes: number; weather: string; startKm: number; endKm: number }, km: number, data = DATA) {
  if (!Number.isFinite(km) || !Number.isFinite(settings.minutes)) return null;
  const direction = Math.sign(settings.endKm - settings.startKm);
  const entry = data.cases.find(c => c.status === 'final' && c.road === road && c.date === settings.date && c.weather === settings.weather &&
    Math.abs(c.minutes - settings.minutes) < .01 && c.direction === direction &&
    c.samples.some(s => km >= s.km0 && km <= s.km1));
  if (!entry) return null;
  const sample = entry.samples.find(s => km >= s.km0 && km <= s.km1)!;
  const ahead = entry.samples.filter(s => (s.km - km) * direction > 0 && (s.km - km) * direction <= .2 && s.level >= 1)
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))[0];
  return { sample, ahead, adaptation: validatedTransitionResult(entry.adaptation), modelVersion: entry.modelVersion, caseId: entry.id };
}
