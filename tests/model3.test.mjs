import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/game/model3.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const M = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const presets = JSON.parse(await readFile(new URL('../src/data/model3_presets.json', import.meta.url), 'utf8'));
const reading = grade => ({ grade, warn_distance_m: 155, screen_effect: presets.screen_effect[grade], source: 'photo' });

test('요청서 v3 어둡기 표: 상 85→38→9→0, 중 60→27→7→0, 하 30→13→3→0', () => {
  const table = { 상: [.85, .38, .09, 0], 중: [.60, .27, .07, 0], 하: [.30, .13, .03, 0] };
  for (const [g, want] of Object.entries(table)) {
    const e = presets.screen_effect[g];
    assert.equal(e.recover_s, 3); assert.deepEqual(e.countdown, [3, 2, 1]);
    want.forEach((v, t) => assert.ok(Math.abs(M.darkAt(e, t) - v) < .006, `${g} ${t}s ${M.darkAt(e, t)}`));
    assert.ok(M.darkAt(e, .25) < e.start_dark_opacity && M.darkAt(e, .25) > M.darkAt(e, .5));
    assert.equal(M.darkAt(e, 9), 0);
  }
});

test('API 응답 검사: 등급 · 거리 · 곡선이 이상하면 받지 않음', () => {
  const ok = { grade: '상', warn_distance_m: 155, screen_effect: presets.screen_effect['상'] };
  assert.equal(M.parseModel3Reading(ok, 'photo').grade, '상');
  for (const bad of [null, { ...ok, grade: 'high' }, { ...ok, warn_distance_m: -1 }, { ...ok, screen_effect: { ...ok.screen_effect, start_dark_opacity: 2 } }, { ...ok, screen_effect: { ...ok.screen_effect, curve: [] } }]) {
    assert.throws(() => M.parseModel3Reading(bad, 'photo'));
  }
});

test('미리 받아 둔 표: 맑고 해가 높으면 상, 해가 낮으면 하, 범위 밖은 끝 칸', () => {
  assert.equal(M.presetReading(presets, 70, 0).grade, '상');
  assert.equal(M.presetReading(presets, 5, 9).grade, '하');
  assert.equal(M.presetReading(presets, -40, 9).grade, '하');
  assert.equal(M.presetReading(presets, 200, 0).grade, '상');
  assert.equal(M.presetReading(presets, 70, 6).source, 'preset');
});

test('한국 시각 문자열 (시간대 없이)', () => {
  assert.equal(M.model3Time('2026-10-12', 750), '2026-10-12T12:30:00');
  assert.equal(M.model3Time('2026-10-12', 1440 + 5.5), '2026-10-12T00:05:30');
});

test('판정 순서: 사진 → 해 높이·구름 → 미리 받아 둔 표', async () => {
  const ctx = { date: '2026-10-12', minutes: 750, lat: 35.87, lon: 128.6, cloud: 0, sunAlt: 70, speedKmh: 60 };
  const body = { grade: '중', warn_distance_m: 155, screen_effect: presets.screen_effect['중'] };
  const calls = [];
  const fetcher = fails => async url => { calls.push(url); return fails.some(f => url.endsWith(f)) ? { ok: false, status: 500 } : { ok: true, json: async () => url.endsWith('features') ? [body] : body }; };
  const image = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
  assert.equal((await M.requestModel3(image, ctx, presets, undefined, fetcher([]))).source, 'photo');
  assert.equal((await M.requestModel3(image, ctx, presets, undefined, fetcher(['photo']))).source, 'sun');
  const off = await M.requestModel3(image, ctx, presets, undefined, fetcher(['photo', 'features']));
  assert.equal(off.source, 'preset'); assert.equal(off.grade, '상');
  assert.ok(calls.every(u => u.startsWith('/model3/predict/')));
  // 배포 사이트처럼 HTML이 200으로 오면 받지 않고 표로 넘어간다.
  const html = async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } });
  assert.equal((await M.requestModel3(image, ctx, presets, undefined, html)).source, 'preset');
});

const tick = () => new Promise(r => setTimeout(r, 0));
test('장면: 205m에서 판정 요청 → 155m 알림 · 경고음 1번 → 입구에서 어두워짐 · 3·2·1 → 3초 뒤 평소', async () => {
  let asked = 0;
  const scene = M.createModel3Scene(async () => { asked++; return reading('상'); });
  const sec = (toEntry, covered = false) => ({ s0: 1000, covered, toEntry, phase: covered ? 'inside' : toEntry > 0 ? 'approach' : 'exit' });
  assert.equal(scene.update(sec(260), .1).alert, null); assert.equal(asked, 0);
  scene.update(sec(204), .1); await tick(); assert.equal(asked, 1);
  assert.equal(scene.update(sec(170), .1).alert, null);
  const warn = scene.update(sec(155), .1);
  assert.equal(warn.alert.grade, '상'); assert.equal(warn.beep, true); assert.equal(warn.dark, 0);
  assert.equal(scene.update(sec(60), .1).beep, false);
  const seen = [];
  let v = scene.update(sec(0, true), 0);
  assert.equal(v.dark, .85); assert.equal(v.countdown, 3); assert.equal(v.alert, null);
  for (let t = 0; t < 3.2; t += .1) { v = scene.update(sec(-5, true), .1); if (v.countdown) seen.push(v.countdown); }
  assert.deepEqual([...new Set(seen)], [3, 2, 1]);
  assert.equal(v.dark, 0); assert.equal(v.countdown, null);
  assert.equal(asked, 1);
});

test('출구 쪽에서 시작하면 알림 없음, 판정을 못 받으면 연출 없이 통과', async () => {
  const exitOnly = M.createModel3Scene(async () => reading('상'));
  for (const s of [-10, -50, -120]) assert.equal(exitOnly.update({ s0: 1, covered: false, toEntry: s, phase: 'exit' }, .1).alert, null);
  const fail = M.createModel3Scene(async () => { throw new Error('off'); });
  fail.update({ s0: 2, covered: false, toEntry: 200, phase: 'approach' }, .1); await tick();
  assert.equal(fail.update({ s0: 2, covered: false, toEntry: 150, phase: 'approach' }, .1).alert, null);
  const inside = fail.update({ s0: 2, covered: true, toEntry: 0, phase: 'inside' }, .1);
  assert.equal(inside.dark, 0); assert.equal(inside.countdown, null);
});

test('다음 지하차도는 새로 판정하고, 주행을 멈추면 초기화', async () => {
  let n = 0; const scene = M.createModel3Scene(async () => reading(++n === 1 ? '상' : '하'));
  scene.update({ s0: 1, covered: false, toEntry: 200, phase: 'approach' }, .1); await tick();
  assert.equal(scene.update({ s0: 1, covered: false, toEntry: 150, phase: 'approach' }, .1).alert.grade, '상');
  scene.update({ s0: 2, covered: false, toEntry: 200, phase: 'approach' }, .1); await tick();
  assert.equal(scene.update({ s0: 2, covered: false, toEntry: 150, phase: 'approach' }, .1).alert.grade, '하');
  scene.update(null, 0, false); assert.equal(scene.reading, null);
});

test('운전자 문구에는 모델 번호 · "순응" · 사고 표현이 없다', () => {
  for (const g of ['하', '중', '상']) {
    const text = M.model3AlertText(g) + ' ' + M.MODEL3_ALERT_NOTE[g];
    assert.ok(text.includes(`위험 ${g}`));
    for (const bad of ['모델', '③', '순응', '사고', '%']) assert.ok(!text.includes(bad), `${g}: ${bad}`);
  }
});
