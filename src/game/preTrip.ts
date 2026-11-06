/** Planning contract: roadside photos + capture-time G, never a G-only fallback.
 * Authored workflow examples are accepted only in explicit example mode.
 */
export type ObservationMode = 'connected' | 'example';
export type GlareLevel = 0 | 1 | 2;
export type UnknownReason = 'no-camera' | 'outside-view' | 'direction' | 'stale' | 'arrival-expiry' | 'capture-context' | 'missing-photo' | 'model-pending' | 'example-only';
export interface RoadsideObservation {
  id: string; road: string; km0: number; km1: number;
  camera: { id: string; latitude: number; longitude: number; headingDeg: number; horizontalFovDeg: number; directionValidated: boolean };
  photo: { url: string; sha256: string; capturedAt: string; validUntil: string; source: 'roadside' | 'simulator-example' };
  context: { at: string; sunAltitude: number; sunAzimuth: number; weather: string };
  prediction: { method: 'photo+G' | 'G-only' | 'photo-only'; status: 'validated' | 'pending' | 'pilot' | 'authored-example'; level?: GlareLevel; modelVersion: string };
}
export interface PlannedSegment {
  id: string; km0: number; km1: number; distanceM: number; headingDeg: number; eta: string;
}
export interface RouteCandidate {
  assumedKmh?: number;
  id: string; name: string; road: string; distanceM: number; durationSec: number;
  traffic: 'smooth' | 'slow' | 'congested' | 'unknown'; timeSource: 'traffic-cache' | 'simulation';
  closure: 'open' | 'closed' | 'unknown'; segments: PlannedSegment[];
}
export interface SegmentAssessment {
  segment: PlannedSegment; state: 'normal' | 'caution' | 'unknown'; level: GlareLevel | null;
  reason?: UnknownReason; observation?: RoadsideObservation; example: boolean;
}
export interface AssessedRoute {
  route: RouteCandidate; segments: SegmentAssessment[]; observedM: number; unknownM: number; cautionM: number; severeM: number;
}
export const UNKNOWN_LABELS: Record<UnknownReason, string> = {
  'no-camera': '도로변 사진 없음', 'outside-view': '촬영 범위 밖', direction: '진행방향 불일치', stale: '사진 유효기간 지남',
  'arrival-expiry': '예상 도착 전 유효기간 종료', 'capture-context': '사진 시점의 태양·날씨 정보 미확인',
  'missing-photo': '사진·위치 정보 미확인', 'model-pending': '사진+태양·날씨 결합 판정 대기', 'example-only': '실제 관측 미연결',
};
const epoch = (s: string) => Date.parse(s);
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
export function assessSegment(road: string, segment: PlannedSegment, observations: RoadsideObservation[], now: string, mode: ObservationMode): SegmentAssessment {
  const unknown = (reason: UnknownReason, observation?: RoadsideObservation): SegmentAssessment => ({ segment, state: 'unknown', level: null, reason, observation, example: mode === 'example' });
  const sameRoad = observations.filter(o => o && o.camera && o.photo && o.context && o.prediction && o.road === road);
  if (!sameRoad.length) return unknown('no-camera');
  const lo = Math.min(segment.km0, segment.km1), hi = Math.max(segment.km0, segment.km1);
  const covering = sameRoad.filter(o => Number.isFinite(o.km0) && Number.isFinite(o.km1) && Math.min(o.km0, o.km1) <= lo + 1e-6 && Math.max(o.km0, o.km1) >= hi - 1e-6);
  if (!covering.length) return unknown('outside-view');
  const directed = covering.filter(o => Number.isFinite(o.camera.headingDeg) && o.camera.headingDeg >= 0 && o.camera.headingDeg < 360 && Number.isFinite(o.camera.horizontalFovDeg) && o.camera.horizontalFovDeg > 0 && o.camera.horizontalFovDeg <= 180 && angle(o.camera.headingDeg, segment.headingDeg) <= Math.min(30, o.camera.horizontalFovDeg / 2));
  if (!directed.length) return unknown('direction', covering[0]);
  const o = [...directed].sort((a, b) => (epoch(b.photo.capturedAt) || 0) - (epoch(a.photo.capturedAt) || 0))[0];
  if (o.photo.source === 'simulator-example' && mode !== 'example') return unknown('example-only', o);
  if (!o.photo.url || !/^[a-f0-9]{64}$/i.test(o.photo.sha256) || !Number.isFinite(o.camera.latitude) || Math.abs(o.camera.latitude) > 90 || !Number.isFinite(o.camera.longitude) || Math.abs(o.camera.longitude) > 180) return unknown('missing-photo', o);
  const capture = epoch(o.photo.capturedAt), expires = epoch(o.photo.validUntil), clock = epoch(now), arrival = epoch(segment.eta);
  if (![capture, expires, clock, arrival].every(Number.isFinite) || capture > clock || expires <= capture || clock > expires) return unknown('stale', o);
  if (arrival > expires) return unknown('arrival-expiry', o);
  if (!Number.isFinite(epoch(o.context.at)) || Math.abs(epoch(o.context.at) - capture) > 30000 || !Number.isFinite(o.context.sunAltitude) || Math.abs(o.context.sunAltitude) > 90 || !Number.isFinite(o.context.sunAzimuth) || o.context.sunAzimuth < 0 || o.context.sunAzimuth >= 360 || !['clear', 'cloud', 'over'].includes(o.context.weather)) return unknown('capture-context', o);
  const example = mode === 'example' && o.photo.source === 'simulator-example' && o.prediction.status === 'authored-example';
  if (o.prediction.method !== 'photo+G' || (!example && (o.prediction.status !== 'validated' || !o.camera.directionValidated || o.photo.source !== 'roadside')) || ![0, 1, 2].includes(o.prediction.level as number) || !o.prediction.modelVersion) return unknown('model-pending', o);
  const level = o.prediction.level!;
  return { segment, state: level > 0 ? 'caution' : 'normal', level, observation: o, example };
}
export function assessRoute(route: RouteCandidate, observations: RoadsideObservation[], now: string, mode: ObservationMode): AssessedRoute {
  const segments = route.segments.map(s => assessSegment(route.road, s, observations, now, mode));
  const meters = (test: (s: SegmentAssessment) => boolean) => segments.filter(test).reduce((n, s) => n + s.segment.distanceM, 0);
  return { route, segments, observedM: meters(s => s.state !== 'unknown'), unknownM: meters(s => s.state === 'unknown'), cautionM: meters(s => s.state === 'caution'), severeM: meters(s => s.level === 2) };
}
export interface RoutePreference { preference: 'arrival' | 'exposure'; extraMinutes: number; extraKm: number }
export function selectRoute(routes: AssessedRoute[], baselineId: string, preference: RoutePreference) {
  const baseline = routes.find(r => r.route.id === baselineId);
  if (!baseline) return { selected: null, reason: 'no-route' as const };
  const available = routes.filter(r => r.route.closure !== 'closed' && r.route.durationSec <= baseline.route.durationSec + Math.max(0, preference.extraMinutes) * 60 && r.route.distanceM <= baseline.route.distanceM + Math.max(0, preference.extraKm) * 1000);
  if (!available.length) return { selected: null, reason: 'closed' as const };
  if (preference.preference === 'arrival') return { selected: [...available].sort((a, b) => a.route.durationSec - b.route.durationSec)[0], reason: 'arrival' as const };
  // Unknown is not zero exposure. Compare only complete, traffic-backed candidates.
  const comparable = available.filter(r => r.unknownM < 1 && r.route.timeSource === 'traffic-cache' && r.route.closure === 'open');
  const best = baseline.unknownM < 1 && baseline.route.timeSource === 'traffic-cache' && baseline.route.closure === 'open'
    ? [...comparable].sort((a, b) => a.cautionM - b.cautionM || a.severeM - b.severeM || a.route.durationSec - b.route.durationSec)[0] : undefined;
  if (best && best.cautionM < baseline.cautionM) return { selected: best, reason: 'exposure' as const };
  return { selected: available.find(r => r.route.id === baselineId) ?? available[0], reason: 'basic-warning' as const };
}
/** User-reported sensitivity affects warning lead time, never image class labels. */
export function warningLeadMeters(speedKmh: number, sensitivity: 'standard' | 'sensitive') {
  const speed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
  return Math.max(180, Math.min(600, Math.round(speed / 3.6 * (sensitivity === 'sensitive' ? 14 : 10))));
}
