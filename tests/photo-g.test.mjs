import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { apiEndpoint, parseContext, parseReading, predictPhotoG, MAX_IMAGE_BYTES } from '../public/photo-g/client.js';

const metadata = { lat: 35.8, lon: 128.6, heading: 90, focal: .55, width: 32, height: 24,
  captured_at: '2026-11-06T08:30:00+09:00', cloud: 0, sunshine: .5,
  weather_observed_at: '2026-11-06T08:00:00+09:00', weather_source: 'test observation',
  geometry_source: 'test geometry', projection: 'legacy_level_assumed' };
const reading = { model_version: 'photo-g-candidate-v1', status: 'prototype', variant: 'B_geometry_aug',
  level: 2, label: '심한 눈부심', scores: { normal: .4, glare: .24, severe: .36 },
  alert_score: .6, conditional_severe_score: .6, captured_at: metadata.captured_at, image_sha256: createHash('sha256').update('jpeg').digest('hex'),
  weather_age_seconds: 1800, weather_availability_verified: false, projection: 'legacy_level_assumed',
  camera_pose_validated: false, roadside_validated: false, future_route_validated: false, processing_ms: 1 };
const image = new Blob(['jpeg'], { type: 'image/jpeg' });

test('두 단계 판정: joint 최대값이 정상이어도 실제 조건부 등급 유지', () => {
  assert.equal(parseReading(reading).level, 2);
  for (const value of [null, {}, { ...reading, level: 0 }, { ...reading, status: 'pilot' },
    { ...reading, roadside_validated: true }, { ...reading, camera_pose_validated: true },
    { ...reading, future_route_validated: true }, { ...reading, scores: { normal: NaN, glare: .24, severe: .36 } },
    { ...reading, alert_score: Infinity }, { ...reading, scores: { normal: .5, glare: .2, severe: .3 } },
    { ...reading, captured_at: '2026-11-06T08:30:00' }, { ...reading, image_sha256: '' },
    { ...reading, weather_age_seconds: 3601 }]) assert.throws(() => parseReading(value));
});

test('누락·추측·오래된/미래 기상 정보는 전송 전에 차단', () => {
  assert.deepEqual(parseContext(JSON.stringify(metadata)), metadata);
  for (const value of [{}, [], { ...metadata, heading: '90' }, { ...metadata, lat: true },
    { ...metadata, width: 32.5 }, { ...metadata, cloud: null }, { ...metadata, heading: 360 },
    { ...metadata, captured_at: '2026-11-06T08:30:00' }, { ...metadata, weather_source: ' ' },
    { ...metadata, weather_observed_at: '2026-11-06T09:00:00+09:00' },
    { ...metadata, weather_observed_at: '2026-11-06T07:00:00+09:00' },
    { ...metadata, weather_available_at: '2026-11-06T09:00:00+09:00' },
    { ...metadata, extra: true }]) assert.throws(() => parseContext(JSON.stringify(value)));
  assert.throws(() => parseContext('x'.repeat(8193)));
});

test('기본 서버 주소만 허용, 계정/쿼리/임의 경로는 차단', () => {
  assert.equal(apiEndpoint('http://127.0.0.1:8766'), 'http://127.0.0.1:8766/predict/glare/prototype');
  for (const url of ['file:///tmp/test', 'https://user:pass@example.com', 'https://example.com/path',
    'https://example.com?token=x', 'https://example.com#x', 'not-a-url']) assert.throws(() => apiEndpoint(url));
});

test('원본 JPEG·실제 메타데이터만 multipart로 전송', async () => {
  const result = await predictPhotoG(image, JSON.stringify(metadata), 'http://127.0.0.1:8766', {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:8766/predict/glare/prototype');
      assert.equal(init.method, 'POST'); assert.equal(init.credentials, 'omit');
      assert.equal(init.body.get('image').size, image.size);
      assert.deepEqual(JSON.parse(init.body.get('context')), metadata);
      assert.equal(init.body.get('source'), null);
      return new Response(JSON.stringify(reading));
    },
  });
  assert.equal(result.reading.level, 2); assert.ok(result.requestMs >= 0);
});

test('빈 사진·PNG·용량 초과·누락 정보는 네트워크 요청 없음', async () => {
  let calls = 0;
  const options = { fetchImpl: async () => { calls++; } };
  for (const file of [null, new Blob([], { type: 'image/jpeg' }), new Blob(['png'], { type: 'image/png' }),
    new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/jpeg' })]) {
    await assert.rejects(predictPhotoG(file, JSON.stringify(metadata), 'http://127.0.0.1:8766', options));
  }
  await assert.rejects(predictPhotoG(image, '{}', 'http://127.0.0.1:8766', options));
  assert.equal(calls, 0);
});

test('서버 오류·HTML·다른 촬영시각·잘못된 모델은 실패 유지', async () => {
  for (const response of [new Response(JSON.stringify({ error: 'MODEL_NOT_READY' }), { status: 503 }),
    new Response('<html>Starting</html>'), new Response(JSON.stringify({ ...reading, status: 'pilot' })),
    new Response(JSON.stringify({ ...reading, captured_at: '2026-11-06T08:31:00+09:00' })),
    new Response(JSON.stringify({ ...reading, image_sha256: '0'.repeat(64) }))]) {
    await assert.rejects(predictPhotoG(image, JSON.stringify(metadata), 'http://127.0.0.1:8766', { fetchImpl: async () => response }));
  }
});

test('취소·시간 초과를 전달하고 완료 후 타이머 정리', async () => {
  const abortable = async (url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(predictPhotoG(image, JSON.stringify(metadata), 'http://127.0.0.1:8766', {
    fetchImpl: abortable, signal: controller.signal,
  }), { name: 'AbortError' });
  await assert.rejects(predictPhotoG(image, JSON.stringify(metadata), 'http://127.0.0.1:8766', {
    fetchImpl: abortable, timeoutMs: 5,
  }), { name: 'AbortError' });
});
