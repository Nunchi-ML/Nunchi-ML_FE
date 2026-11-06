import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// 실제 휴대폰 카메라 → 선정 모델: 방향 계산과 촬영 정보 계약.
const source = await readFile(new URL('../src/phone/glareApi.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { rearCameraDirection, trueHeading, nowKstIso, realCameraContext } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('세로로 세운 휴대폰: 뒷면 카메라는 화면 윗변이 가리키던 방위를 본다', () => {
  // α=0(북쪽), β=90(세워 듦) → 뒷면 카메라는 북쪽 수평
  let d = rearCameraDirection(0, 90, 0); near(angle(d.heading, 0), 0); near(d.pitch, 0, 1e-9);
  // α=90 → W3C α는 반시계 회전이라 서쪽(270°)
  d = rearCameraDirection(90, 90, 0); near(angle(d.heading, 270), 0);
  d = rearCameraDirection(270, 90, 0); near(angle(d.heading, 90), 0);
});
test('눕혀 둔 휴대폰은 카메라가 땅을 봐서 기울기가 −90°', () => {
  near(rearCameraDirection(0, 0, 0).pitch, -90);
  assert.ok(Math.abs(rearCameraDirection(0, 60, 0).pitch) > 25, '30° 기울면 판정하지 않을 만큼 기울어짐');
});
test('자북 → 진북 (대구 편각 −8.5°)', () => {
  near(trueHeading(0), 351.5); near(trueHeading(100), 91.5);
});
test('현재 시각을 한국 시간으로', () => {
  assert.equal(nowKstIso(Date.UTC(2026, 10, 7, 9, 0, 0)), '2026-11-07T18:00:00+09:00');
  assert.equal(nowKstIso(Date.UTC(2026, 10, 7, 9, 0, 0), -10), '2026-11-07T17:50:00+09:00');
});
test('실제 카메라 촬영 정보: GPS·방향·가정 화각·고른 날씨', () => {
  const c = realCameraContext({ latitude: 35.86, longitude: 128.6, headingDeg: -10 }, { width: 720, height: 1280 }, 'cloud', Date.UTC(2026, 10, 7, 8, 0, 0));
  assert.equal(c.heading, 350); assert.deepEqual([c.cloud, c.sunshine], [5, 0.5]);
  near(c.focal, 0.5 / Math.tan(33 * Math.PI / 180));
  assert.equal(c.captured_at, '2026-11-07T17:00:00+09:00'); assert.equal(c.weather_source, 'user_selected_weather');
  assert.equal(c.projection, 'legacy_level_assumed');
});
