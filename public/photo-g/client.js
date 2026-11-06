export const MAX_IMAGE_BYTES = 1048576;
const VERSION = 'photo-g-candidate-v1';
const labels = ['정상', '눈부심', '심한 눈부심'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const score = value => finite(value) && value >= 0 && value <= 1;
const time = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function parseReading(value) {
  const invalid = () => { throw new Error('서버의 사진+G 결과 형식을 확인할 수 없습니다.'); };
  if (!value || value.model_version !== VERSION || value.status !== 'prototype' || value.variant !== 'B_geometry_aug'
      || !Number.isInteger(value.level) || ![0, 1, 2].includes(value.level) || value.label !== labels[value.level]
      || value.roadside_validated !== false || value.future_route_validated !== false || value.camera_pose_validated !== false
      || value.projection !== 'legacy_level_assumed' || !time(value.captured_at)
      || !/^[a-f0-9]{64}$/.test(value.image_sha256) || typeof value.weather_availability_verified !== 'boolean'
      || !finite(value.weather_age_seconds) || value.weather_age_seconds < 0 || value.weather_age_seconds > 3600
      || !finite(value.processing_ms) || value.processing_ms < 0) invalid();
  const a = value.alert_score, b = value.conditional_severe_score;
  const actual = ['normal', 'glare', 'severe'].map(key => value.scores?.[key]);
  if (![a, b, ...actual].every(score)) invalid();
  const expected = [1 - a, a * (1 - b), a * b];
  if (actual.some((x, i) => Math.abs(x - expected[i]) > 1e-9)
      || value.level !== (a < .5 ? 0 : b >= .5 ? 2 : 1)) invalid();
  return value;
}

export function parseContext(text) {
  if (new TextEncoder().encode(text).length > 8192) throw new Error('촬영 정보는 8KiB 이하의 JSON으로 입력해 주세요.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('촬영 정보 JSON을 확인해 주세요.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('촬영 정보가 필요합니다.');
  const ranges = { lat: [-90, 90], lon: [-180, 180], heading: [0, 360], focal: [1e-6, 100],
    cloud: [0, 10], sunshine: [0, 1], width: [1, 100000], height: [1, 100000] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!finite(value[key]) || value[key] < min || value[key] > max
        || (key === 'heading' && value[key] === 360)
        || (['width', 'height'].includes(key) && !Number.isInteger(value[key]))) {
      throw new Error(`촬영 정보의 ${key} 값을 확인해 주세요.`);
    }
  }
  for (const key of ['captured_at', 'weather_observed_at']) if (!time(value[key])) throw new Error(`${key}에 시간대를 포함해 주세요.`);
  if (value.weather_available_at != null && !time(value.weather_available_at)) throw new Error('weather_available_at에 시간대를 포함해 주세요.');
  for (const key of ['weather_source', 'geometry_source']) if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 512) throw new Error(`${key} 출처를 입력해 주세요.`);
  if (value.projection !== 'legacy_level_assumed') throw new Error('촬영 정보의 projection을 확인해 주세요.');
  const age = Date.parse(value.captured_at) - Date.parse(value.weather_observed_at);
  if (age < 0 || age > 3600000) throw new Error('사진 촬영 전 1시간 이내의 기상 관측이 필요합니다.');
  if (value.weather_available_at && Date.parse(value.weather_available_at) > Date.parse(value.captured_at)) throw new Error('촬영 이후에 공개된 기상 정보입니다.');
  const keys = [...Object.keys(ranges), 'captured_at', 'weather_observed_at', 'weather_available_at', 'weather_source', 'geometry_source', 'projection'];
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('알 수 없는 촬영 정보 항목이 있습니다.');
  return value;
}

export function apiEndpoint(base) {
  let url;
  try { url = new URL(base); } catch { throw new Error('로컬 시제품 서버 주소를 확인해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('서버의 http(s) 기본 주소만 입력해 주세요.');
  }
  return new URL('/predict/glare/prototype', url).href;
}

const errors = {
  INVALID_REQUEST: '사진과 촬영 정보 JSON을 확인해 주세요.', INVALID_CONTEXT: '사진 원본 크기·촬영시각·기상 관측시각이 맞지 않습니다.',
  MODEL_NOT_READY: '서버의 사진+G 모델이 준비되지 않았습니다.', IMAGE_TOO_LARGE: '1MiB·800만 픽셀 이하 사진이 필요합니다.',
  UNSUPPORTED_IMAGE_TYPE: 'JPEG 사진만 지원합니다.', INVALID_IMAGE: 'JPEG 사진을 읽을 수 없습니다.', INFERENCE_FAILED: '모델 분석에 실패했습니다.',
};

export async function predictPhotoG(image, contextText, base, { signal, fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  if (!image || image.type !== 'image/jpeg' || image.size < 1 || image.size > MAX_IMAGE_BYTES) throw new Error('1MiB 이하의 JPEG 원본을 선택해 주세요.');
  const metadata = parseContext(contextText), endpoint = apiEndpoint(base);
  if (!finite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 90000) throw new Error('요청 제한시간을 확인해 주세요.');
  const form = new FormData();
  form.append('image', image, 'photo.jpg');
  form.append('context', JSON.stringify(metadata));
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const started = performance.now();
  try {
    if (!globalThis.crypto?.subtle) throw new Error('사진 지문 확인을 위해 localhost 또는 HTTPS 화면을 사용해 주세요.');
    const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer());
    const imageHash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const response = await fetchImpl(endpoint, { method: 'POST', body: form, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    let body;
    try { body = await response.json(); } catch { throw new Error('서버의 JSON 응답을 받을 수 없습니다.'); }
    if (!response.ok) throw new Error(errors[body?.error] || `분석 요청에 실패했습니다 (${response.status}).`);
    const reading = parseReading(body);
    if (reading.image_sha256 !== imageHash) throw new Error('선택한 사진과 서버 결과의 지문이 다릅니다. 다시 분석해 주세요.');
    if (reading.captured_at && Date.parse(reading.captured_at) !== Date.parse(metadata.captured_at)) throw new Error('다른 촬영시각의 결과를 받았습니다.');
    return { reading, requestMs: performance.now() - started };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
