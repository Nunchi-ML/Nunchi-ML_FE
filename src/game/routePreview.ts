import raw from '../data/roadside_feed.json';
import examples from '../data/roadside_examples.json';
import { at, kmToS } from './road';
import { ROAD_ID } from './roadSelection';
import { simDate } from './sun';
import { assessRoute, selectRoute, type RouteCandidate, type RoadsideObservation } from './preTrip';
import type { Settings } from '../store';

export function nativeCandidate(settings: Pick<Settings, 'startKm' | 'endKm' | 'date' | 'minutes'> & { observationSpeed?: number }): RouteCandidate {
  const start = kmToS(settings.startKm), end = kmToS(settings.endKm), dir = Math.sign(end - start) || 1;
  const distanceM = Math.abs(settings.endKm - settings.startKm) * 1000, clock = simDate(settings.date, settings.minutes).getTime();
  const assumedKmh = settings.observationSpeed || 50;
  const segments: RouteCandidate['segments'] = [];
  for (let traveled = 0; traveled < Math.abs(end - start) - .01; traveled += 50) {
    const next = Math.min(traveled + 50, Math.abs(end - start)), middle = at(start + dir * (traveled + next) / 2);
    const km0 = settings.startKm + (settings.endKm - settings.startKm) * traveled / Math.abs(end - start);
    const km1 = settings.startKm + (settings.endKm - settings.startKm) * next / Math.abs(end - start);
    segments.push({ id: `segment-${Math.round((km0 + km1) * 500)}`, km0, km1,
      distanceM: Math.abs(km1 - km0) * 1000, headingDeg: (Math.atan2(middle.dx * dir, -middle.dz * dir) * 180 / Math.PI + 360) % 360,
      eta: new Date(clock + traveled / (assumedKmh / 3.6) * 1000).toISOString() });
  }
  return { id: 'native-road', name: '기본 코스', road: ROAD_ID, distanceM, durationSec: distanceM / (assumedKmh / 3.6), assumedKmh, timeSource: 'simulation', traffic: 'unknown', closure: 'unknown', segments };
}
export function getRoutePreview(settings: Settings) {
  const route = nativeCandidate(settings), now = simDate(settings.date, settings.minutes).toISOString();
  const mode = settings.observationMode;
  let observations = (mode === 'example' ? examples.observations : raw.observations) as unknown as RoadsideObservation[];
  if (mode === 'example') {
    if (settings.exampleCondition === 'missing') observations = [];
    else observations = observations.map(o => ({ ...o,
      camera: { ...o.camera, headingDeg: settings.exampleCondition === 'direction' ? (o.camera.headingDeg + 180) % 360 : o.camera.headingDeg },
      photo: { ...o.photo, validUntil: settings.exampleCondition === 'stale' ? new Date(Date.parse(o.photo.capturedAt) + 1000).toISOString() : o.photo.validUntil },
    }));
  }
  // Routes from an integration must match the entire departure context; never invent alternatives.
  const cached = (raw.routes as unknown as (RouteCandidate & { date: string; minutes: number; startKm: number; endKm: number; weather: string; validUntil: string })[])
    .filter(r => r && r.road === ROAD_ID && r.date === settings.date && Math.abs(r.minutes - settings.minutes) < .01 && r.weather === settings.weather && r.startKm === settings.startKm && r.endKm === settings.endKm && Date.parse(r.validUntil) >= Date.parse(now) && Array.isArray(r.segments) && r.segments.length && Number.isFinite(r.durationSec) && r.durationSec > 0 && Number.isFinite(r.distanceM) && r.distanceM > 0 && r.timeSource === 'traffic-cache' && ['open','closed','unknown'].includes(r.closure) && ['smooth','slow','congested','unknown'].includes(r.traffic) && r.segments.every(s => s && Number.isFinite(s.km0) && Number.isFinite(s.km1) && Number.isFinite(s.distanceM) && s.distanceM > 0 && Number.isFinite(s.headingDeg) && Number.isFinite(Date.parse(s.eta))));
  const candidates = [route, ...cached].map(r => assessRoute(r, observations, now, mode));
  return { now, mode, observations, candidates, primary: candidates[0], selection: selectRoute(candidates, route.id, settings) };
}
export function metersLabel(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`; }
