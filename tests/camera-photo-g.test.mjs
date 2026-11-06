import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// 시뮬레이터 카메라 → 발표 선정 모델(/predict/glare/photo-g) 요청 계약.
const source = await readFile(new URL('../src/phone/glareApi.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { kstIso, simulatorContext, parsePhotoGReading, predictPhotoG } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const meta = { latitude: 35.8612, longitude: 128.606, headingDeg: 265.4, horizontalFovDeg: 90 };
const reading = { model_version: 'photo-g-candidate-v1', status: 'prototype', variant: 'B_geometry_aug', level: 1, label: '눈부심',
  scores: { normal: .2, glare: .5, severe: .3 }, alert_score: .8, conditional_severe_score: .4, image_sha256: 'a'.repeat(64), captured_at: '2026-04-05T18:00:00+09:00' };

test('시뮬레이터 시각(분)을 한국 시간 ISO로', () => {
  assert.equal(kstIso('2026-04-05', 18 * 60), '2026-04-05T18:00:00+09:00');
  assert.equal(kstIso('2026-04-05', 8 * 60 + 25.5), '2026-04-05T08:25:30+09:00');
  assert.equal(kstIso('2026-04-05', -10), '2026-04-04T23:50:00+09:00');
});

test('촬영 정보: 위치·방향·화각·크기·날씨를 서버 계약대로', () => {
  const c = simulatorContext(meta, { width: 1280, height: 720 }, '2026-04-05', 18 * 60, 'clear');
  assert.equal(c.lat, 35.8612); assert.equal(c.heading, 265.4);
  assert.ok(Math.abs(c.focal - 0.5) < 1e-9, '90° 화각, 가로가 긴 변이면 초점거리 = 0.5');
  assert.deepEqual([c.width, c.height, c.cloud, c.sunshine], [1280, 720, 0, 1]);
  assert.equal(c.captured_at, '2026-04-05T18:00:00+09:00');
  assert.equal(c.weather_observed_at, '2026-04-05T17:50:00+09:00');
  assert.equal(c.projection, 'legacy_level_assumed');
  const over = simulatorContext({ ...meta, headingDeg: -5 }, { width: 720, height: 1280 }, '2026-04-05', 600, 'over');
  assert.equal(over.heading, 355); assert.deepEqual([over.cloud, over.sunshine], [9, 0]);
  assert.ok(Math.abs(over.focal - 360 / 1280) < 1e-9, '세로 화면은 긴 변(높이) 기준');
});

test('선정 모델 응답 검증: 형식이 틀리면 정상으로 바꾸지 않고 오류', () => {
  assert.equal(parsePhotoGReading(reading).level, 1);
  assert.throws(() => parsePhotoGReading({ ...reading, status: 'pilot' }));
  assert.throws(() => parsePhotoGReading({ ...reading, image_sha256: 'x' }));
  assert.throws(() => parsePhotoGReading({ ...reading, scores: { normal: .9, glare: .9, severe: .9 } }));
});

test('요청: image + context(JSON)를 선정 모델 주소로, 오류 코드는 사용자 문구로', async () => {
  const jpeg = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' });
  const ctx = simulatorContext(meta, { width: 1280, height: 720 }, '2026-04-05', 1080, 'clear');
  const got = await predictPhotoG(jpeg, ctx, new AbortController().signal, async (url, options) => {
    assert.equal(url, '/api/predict/glare/photo-g');
    assert.deepEqual(JSON.parse(options.body.get('context')), ctx);
    assert.ok(options.body.get('image') instanceof Blob);
    return new Response(JSON.stringify(reading));
  });
  assert.equal(got.variant, 'B_geometry_aug');
  await assert.rejects(predictPhotoG(jpeg, ctx, new AbortController().signal, async () => new Response('', { status: 400 })), /촬영 정보/);
  await assert.rejects(predictPhotoG(jpeg, ctx, new AbortController().signal, async () => new Response('', { status: 503 })), /선정 모델/);
});
