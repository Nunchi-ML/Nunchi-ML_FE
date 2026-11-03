export interface GlareReading {
  model_version: string; status: 'pilot'; level: 0 | 1 | 2; label: string;
  scores: { normal: number; glare: number; severe: number };
  brightest: { x: number; y: number };
}
export const MAX_IMAGE_BYTES = 1024 * 1024;
const apiBase = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
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
