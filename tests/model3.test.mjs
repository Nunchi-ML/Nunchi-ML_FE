import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/game/model3.ts', import.meta.url), 'utf8');
const presets = JSON.parse(await readFile(new URL('../src/data/model3_presets.json', import.meta.url), 'utf8'));
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const M = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const reading = (grade = '상') => ({ grade, warn_distance_m: presets.warn_distance_m, screen_effect: presets.screen_effect[grade], source: 'preset' });

test('요청서 v4 어둡기 표: 회복 2초 (상 95→75→50→25→0, 중 65→37→16→4→0, 하 35→20→9→2→0)', () => {
  const table = {
    상: [0.95, 0.75, 0.50, 0.25, 0],
    중: [0.65, 0.37, 0.16, 0.04, 0],
    하: [0.35, 0.20, 0.09, 0.02, 0],
  };
  for (const [g, want] of Object.entries(table)) {
    const e = presets.screen_effect[g];
    assert.equal(e.recover_s, 2);
    assert.deepEqual(e.countdown, [2, 1]);
    [0, 0.5, 1, 1.5, 2].forEach((t, idx) => assert.ok(Math.abs(M.darkAt(e, t) - want[idx]) < 0.006, `${g} ${t}s ${M.darkAt(e, t)}`));
    assert.ok(M.darkAt(e, 0.25) < e.start_dark_opacity && M.darkAt(e, 0.25) > M.darkAt(e, 0.5));
    assert.equal(M.darkAt(e, 9), 0);
  }
});

test('미리 받아 둔 표(해 높이 · 구름): 한낮 맑은 날은 상, 밤은 하, 흐린 날은 한 단계 낮아짐', () => {
  assert.equal(M.presetReading(presets, 75, 0).grade, '상');
  assert.equal(M.presetReading(presets, 38, 0).grade, '중');
  assert.equal(M.presetReading(presets, 38, 9).grade, '하');
  assert.equal(M.presetReading(presets, -5, 0).grade, '하');
  for (const g of ['하', '중', '상']) {
    const text = M.model3AlertText(g);
    assert.match(text, /지하차도 진입 · 밝기 변화/);
    assert.doesNotMatch(text, /모델|순응/);
    assert.doesNotMatch(text + M.MODEL3_ALERT_NOTE[g], /사고|확률|%/);
  }
});

test('응답 형식 검증: 이상한 값이면 거절', () => {
  assert.throws(() => M.parseModel3Reading(null, 'photo'));
  assert.throws(() => M.parseModel3Reading({ grade: '위험', warn_distance_m: 155, screen_effect: presets.screen_effect.상 }, 'photo'));
  assert.throws(() => M.parseModel3Reading({ grade: '상', warn_distance_m: -10, screen_effect: presets.screen_effect.상 }, 'photo'));
  assert.throws(() => M.parseModel3Reading({ grade: '상', warn_distance_m: 155, screen_effect: { start_dark_opacity: 2, recover_s: 2, curve: [] } }, 'photo'));
});

test('판정 순서: 사진 → 해 높이·구름 → 미리 받아 둔 표', async () => {
  const ctx = { date: '2026-06-21', minutes: 750, lat: 35.87, lon: 128.6, cloud: 0, sunAlt: 75, speedKmh: 100 };
  const calls = [];
  const photoOk = await M.requestModel3(new Blob(['x']), ctx, presets, undefined, async (url, init) => {
    calls.push(url); assert.equal(init.body.get('captured_at'), '2026-06-21T12:30:00');
    return new Response(JSON.stringify(reading('중')), { status: 200 });
  });
  assert.equal(photoOk.source, 'photo'); assert.equal(photoOk.grade, '중'); assert.equal(calls.length, 1);

  const sunOk = await M.requestModel3(new Blob(['x']), ctx, presets, undefined, async url => {
    if (String(url).endsWith('/predict/photo')) return new Response('err', { status: 502 });
    return new Response(JSON.stringify([reading('하')]), { status: 200 });
  });
  assert.equal(sunOk.source, 'sun'); assert.equal(sunOk.grade, '하');

  const fallback = await M.requestModel3(new Blob(['x']), ctx, presets, undefined, async () => { throw new Error('offline'); });
  assert.equal(fallback.source, 'preset'); assert.equal(fallback.grade, '상');
});

const tick = () => new Promise(r => setTimeout(r, 0));
test('장면: 205m에서 판정 요청 → 알림 · 경고음 1번 → 입구에서 어두워짐 · 2초 뒤 평소', async () => {
  let asked = 0;
  const scene = M.createModel3Scene(async () => { asked++; return reading('상'); });
  const sec = (toEntry, covered = false) => ({ s0: 1000, covered, toEntry, phase: covered ? 'inside' : toEntry > 0 ? 'approach' : 'exit' });
  assert.equal(scene.update(sec(230), .1).alert, null); assert.equal(asked, 0);
  scene.update(sec(200), .1); assert.equal(asked, 1); await tick();
  assert.equal(scene.update(sec(presets.warn_distance_m + 15), .1).alert, null);
  const warn = scene.update(sec(presets.warn_distance_m - 5), .1);
  assert.equal(warn.alert?.grade, '상'); assert.equal(warn.beep, true);
  assert.equal(scene.update(sec(60), .1).beep, false);
  const seen = [];
  let v = scene.update(sec(0, true), 0);
  assert.equal(v.dark, .95); assert.equal(v.countdown, 2); assert.equal(v.alert, null);
  for (let t = 0; t < 2.2; t += .1) { v = scene.update(sec(-5, true), .1); if (v.countdown) seen.push(v.countdown); }
  assert.deepEqual([...new Set(seen)], [2, 1]);
  assert.equal(v.dark, 0); assert.equal(v.countdown, null);
  assert.equal(asked, 1);
});

test('출구 쪽에서 시작하면 알림 없음, 판정을 못 받으면 연출 없이 통과', async () => {
  const scene = M.createModel3Scene(async () => reading('상'));
  assert.equal(scene.update({ s0: 1, covered: false, toEntry: -20, phase: 'exit' }, .1).alert, null);
  const fail = M.createModel3Scene(async () => { throw new Error('down'); });
  fail.update({ s0: 2, covered: false, toEntry: 200, phase: 'approach' }, .1); await tick();
  assert.equal(fail.update({ s0: 2, covered: false, toEntry: 150, phase: 'approach' }, .1).alert, null);
  const inside = fail.update({ s0: 2, covered: true, toEntry: 0, phase: 'inside' }, .1);
  assert.equal(inside.dark, 0); assert.equal(inside.countdown, null);
});

test('다음 지하차도는 새로 판정하고, 주행을 멈추면 초기화', async () => {
  let n = 0;
  const scene = M.createModel3Scene(async () => reading((['하', '상'][n++] ?? '상')));
  scene.update({ s0: 100, covered: false, toEntry: 190, phase: 'approach' }, .1); await tick();
  assert.equal(scene.update({ s0: 100, covered: false, toEntry: 80, phase: 'approach' }, .1).alert?.grade, '하');
  scene.update({ s0: 500, covered: false, toEntry: 190, phase: 'approach' }, .1); await tick();
  assert.equal(scene.update({ s0: 500, covered: false, toEntry: 80, phase: 'approach' }, .1).alert?.grade, '상');
  assert.equal(scene.update({ s0: 500, covered: false, toEntry: 80, phase: 'approach' }, .1, false).alert, null);
});
