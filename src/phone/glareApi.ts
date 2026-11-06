export interface GlareReading {
  model_version: string; status: 'pilot'; level: 0 | 1 | 2; label: string;
  scores: { normal: number; glare: number; severe: number };
  brightest: { x: number; y: number };
}
export const MAX_IMAGE_BYTES = 1024 * 1024;
const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
/** 페이지 진입 시 무료 서버를 미리 깨운다. 실패해도 시뮬레이터 시작을 막지 않는다. */
export async function warmUpBackend(fetcher = fetch, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      // 캐시된 health 응답 대신 실제 서버까지 요청이 도달해야 한다.
      const response = await fetcher(`${apiBase}/health?_warmup=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (response.ok && (await response.json()).status === 'ok') return true;
    } catch {
      // 콜드 스타트 중 프록시 시간 초과/HTML 응답은 다음 요청에서 재확인한다.
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2) await wait(2_000);
  }
  return false;
}
export function frameSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function parseGlareReading(value: unknown): GlareReading {
  if (!value || typeof value !== 'object') throw new Error('분석 응답 형식이 올바르지 않아요.');
  const r = value as Partial<GlareReading>;
  const scores = r.scores && [r.scores.normal, r.scores.glare, r.scores.severe];
  if (r.status !== 'pilot' || ![0, 1, 2].includes(r.level as number) ||
      typeof r.model_version !== 'string' || !r.model_version || typeof r.label !== 'string' ||
      !scores || !scores.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) ||
      Math.abs(scores.reduce((a, b) => a + b, 0) - 1) > 0.02 ||
      !r.brightest || ![r.brightest.x, r.brightest.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) {
    throw new Error('분석 응답 형식이 올바르지 않아요.');
  }
  return r as GlareReading;
}
export async function predictGlare(image: Blob, source: 'camera' | 'game', signal: AbortSignal, fetcher = fetch) {
  if (image.type !== 'image/jpeg' || image.size === 0 || image.size > MAX_IMAGE_BYTES) throw new Error('사진은 1MiB 이하의 JPEG여야 해요.');
  const body = new FormData(); body.append('image', image, 'frame.jpg'); body.append('source', source);
  const response = await fetcher(`${apiBase}/predict/glare`, { method: 'POST', body, signal });
  if (!response.ok) {
    if (response.status === 503) throw new Error('모델이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
    if (response.status === 413) throw new Error('사진 용량이 너무 커요. 다음 화면으로 다시 시도해 주세요.');
    throw new Error(`분석 서버에 연결하지 못했어요 (${response.status}).`);
  }
  return parseGlareReading(await response.json());
}

/** 발표 선정 모델(사진 + 해 위치·날씨) 응답. 사진만 보는 시범 모델과 달리 밝은 곳 좌표는 없다. */
export interface PhotoGReading {
  model_version: string; status: 'prototype'; variant: string; level: 0 | 1 | 2; label: string;
  scores: { normal: number; glare: number; severe: number };
  alert_score: number; conditional_severe_score: number; image_sha256: string; captured_at: string;
}
export interface PhotoGContext {
  lat: number; lon: number; heading: number; focal: number; width: number; height: number;
  captured_at: string; cloud: number; sunshine: number; weather_observed_at: string;
  weather_source: string; geometry_source: string; projection: 'legacy_level_assumed';
}
/** 시뮬레이터 날씨 설정을 기상청 ASOS 단위(전운량 0~10, 일조 0~1)로 옮긴다. */
export const SIM_WEATHER: Record<string, { cloud: number; sunshine: number }> = {
  clear: { cloud: 0, sunshine: 1 }, cloud: { cloud: 5, sunshine: 0.5 }, over: { cloud: 9, sunshine: 0 },
};
const pad = (n: number) => String(n).padStart(2, '0');
/** 시뮬레이터 시각(분, 한국 시간)을 시간대가 붙은 ISO 문자열로. */
export function kstIso(date: string, minutes: number) {
  const total = Math.floor(minutes * 60), day = Math.floor(total / 86400), s = ((total % 86400) + 86400) % 86400;
  const base = new Date(`${date}T00:00:00Z`); base.setUTCDate(base.getUTCDate() + day);
  return `${base.toISOString().slice(0, 10)}T${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}+09:00`;
}
/** 시뮬레이터 카메라의 위치·방향·화각과 설정 시각·날씨로 선정 모델의 촬영 정보를 만든다. */
export function simulatorContext(meta: { latitude: number; longitude: number; headingDeg: number; horizontalFovDeg: number },
  size: { width: number; height: number }, date: string, minutes: number, weather: string): PhotoGContext {
  const w = SIM_WEATHER[weather] ?? SIM_WEATHER.clear;
  const focalPx = size.width / 2 / Math.tan(meta.horizontalFovDeg * Math.PI / 360);
  return {
    lat: meta.latitude, lon: meta.longitude, heading: ((meta.headingDeg % 360) + 360) % 360,
    focal: focalPx / Math.max(size.width, size.height), width: size.width, height: size.height,
    captured_at: kstIso(date, minutes), cloud: w.cloud, sunshine: w.sunshine,
    weather_observed_at: kstIso(date, minutes - 10),
    weather_source: 'simulator_weather_setting', geometry_source: 'simulator_camera_pose', projection: 'legacy_level_assumed',
  };
}
export function parsePhotoGReading(value: unknown): PhotoGReading {
  if (!value || typeof value !== 'object') throw new Error('분석 응답 형식이 올바르지 않아요.');
  const r = value as Partial<PhotoGReading>;
  const scores = r.scores && [r.scores.normal, r.scores.glare, r.scores.severe];
  if (r.status !== 'prototype' || ![0, 1, 2].includes(r.level as number) || typeof r.model_version !== 'string' || !r.model_version ||
      typeof r.label !== 'string' || !scores || !scores.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) ||
      Math.abs(scores.reduce((a, b) => a + b, 0) - 1) > 0.02 || typeof r.image_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.image_sha256)) {
    throw new Error('분석 응답 형식이 올바르지 않아요.');
  }
  return r as PhotoGReading;
}
export async function predictPhotoG(image: Blob, context: PhotoGContext, signal: AbortSignal, fetcher = fetch) {
  if (image.type !== 'image/jpeg' || image.size === 0 || image.size > MAX_IMAGE_BYTES) throw new Error('사진은 1MiB 이하의 JPEG여야 해요.');
  const body = new FormData(); body.append('image', image, 'frame.jpg'); body.append('context', JSON.stringify(context));
  const response = await fetcher(`${apiBase}/predict/glare/photo-g`, { method: 'POST', body, signal });
  if (!response.ok) {
    if (response.status === 503) throw new Error('선정 모델이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
    if (response.status === 413) throw new Error('사진 용량이 너무 커요. 다음 화면으로 다시 시도해 주세요.');
    if (response.status === 400 || response.status === 422) throw new Error('촬영 정보가 맞지 않아 판정하지 않았어요.');
    throw new Error(`분석 서버에 연결하지 못했어요 (${response.status}).`);
  }
  return parsePhotoGReading(await response.json());
}
