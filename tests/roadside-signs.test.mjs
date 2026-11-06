import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';
const transpile = s => ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const moduleUrl = s => `data:text/javascript;base64,${Buffer.from(transpile(s)).toString('base64')}`;
const guidance = moduleUrl(await readFile(new URL('../src/game/navigationGuidance.ts', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
async function load(isSincheon) {
  const { road, url } = await loadRoad(isSincheon);
  const source = (await readFile(new URL('../src/game/roadsideSigns.ts', import.meta.url), 'utf8'))
    .replace("from './road'", `from '${url}'`).replace("from './navigationGuidance'", `from '${guidance}'`)
    .replace("from 'three'", `from '${pathToFileURL(require.resolve('three')).href}'`);
  return { road, ...await import(moduleUrl(source)) };
}
const { roadsideMessage, road: dalguRoad } = await load(false);

test('Roadside signs keep unknown photo status separate from tunnel transition guidance', () => {
  for (const dir of [-1, 1]) {
    const s = 1000, end = s + dir * 1000;
    const unknown = { id: 'unknown', start: s - dir * 30, end, kind: 'unverified', name: '未確認', source: 'unknown' };
    const exit = { id: 'exit', start: s + dir * 200, end: s + dir * 300, kind: 'exit', name: '출구', source: 'simulation' };
    const message = roadsideMessage(s, dir, end, [unknown, exit]);
    assert.equal(message.state, 'unknown'); assert.match(message.title, /미확인/);
    assert.match(message.transition, /출구 밝기 변화/); assert.doesNotMatch(message.title, /눈부심 주의|정상|안전/);
  }
});

test('Example versus actual photo sources remain explicit and passed/beyond-destination alerts are not displayed', () => {
  const zone = { id: 'photo', start: 1100, end: 1200, kind: 'glare', name: '사진', source: 'example' };
  const example = roadsideMessage(1000, 1, 1500, [zone]); assert.equal(example.state, 'caution'); assert.match(example.source, /가상 사진 판정 예시/);
  const actual = roadsideMessage(1000, 1, 1500, [{ ...zone, source: 'roadside' }]); assert.match(actual.source, /전방 카메라 사진 \+ 태양·날씨 판정/);
  const model = roadsideMessage(1000, 1, 1500, [{ ...zone, source: 'model', level: 2 }]); assert.match(model.source, /시뮬레이션 사진 모델 판정/); assert.match(model.source, /실제 도로 관측 아님/); assert.match(model.title, /눈부심 강함/);
  assert.notEqual(roadsideMessage(1300, 1, 1500, [zone]).state, 'caution');
  assert.notEqual(roadsideMessage(1000, 1, 1050, [zone]).state, 'caution');
});

test('Forward camera grades and tunnel burden are announced before the entrance in both directions', () => {
  for (const dir of [-1, 1]) {
    const s = 1000, end = s + dir * 1000;
    const photo = { id: 'camera', start: s + dir * 200, end: s + dir * 350, kind: 'glare', name: '카메라 구간', source: 'example', level: 2 };
    const exit = { id: 'exit', start: s + dir * 400, end: s + dir * 500, kind: 'exit', name: '지하차도', source: 'model',
      adaptation: { entryS: s + dir * 150, entry: .45, exit: .9, source: 'model' } };
    const prediction = roadsideMessage(s, dir, end, [photo, exit]);
    assert.match(prediction.title, /전방 200 m · 눈부심 강함/);
    assert.match(prediction.body, /전방 150 m 지하차도/);
    assert.equal(prediction.transition, '출구 밝기 전환 부담 큼');
    assert.match(prediction.source, /밝기 전환 모델 예상/);
    const caution = roadsideMessage(s, dir, end, [{ ...photo, level: 1 }]);
    assert.match(caution.title, /눈부심 주의/); assert.doesNotMatch(caution.title, /강함/);
    const draft = roadsideMessage(s, dir, end, [{ ...exit, source: 'simulation', adaptation: { ...exit.adaptation, source: 'simulation', entry: .8, exit: .2 } }]);
    assert.equal(draft.transition, '진입 밝기 전환 부담 큼'); assert.match(draft.source, /밝기 전환 체험값/);
  }
});

test('Virtual signs are ahead, within the selected trip and outside underpass ramps in both directions', async () => {
  for (const sincheon of [false, true]) {
    const { road, roadsidePlacements } = await load(sincheon);
    for (const dir of [-1, 1]) {
      const start = dir > 0 ? 0 : road.TOTAL, end = dir > 0 ? road.TOTAL : 0;
      const placements = roadsidePlacements(start, end); assert.ok(placements.length);
      placements.forEach((s, i) => {
        assert.ok((s - start) * dir >= 30 && (end - s) * dir >= 30);
        assert.ok(!road.UNDERPASSES.some(u => s >= u.s0 - u.ramp && s <= u.s1 + u.ramp));
        if (i) assert.ok((s - placements[i - 1]) * dir > 100);
      });
    }
    assert.deepEqual(roadsidePlacements(100, 120), []);
  }
});

test('A valid grade zero is reported as an observation, and never clears a later caution', () => {
  const s = 1000, end = 2000;
  const normal = { state: 'normal', level: 0, example: true,
    segment: { km0: dalguRoad.sToKm(1100), km1: dalguRoad.sToKm(1200) } };
  const unknown = { id: 'unknown', start: 1000, end: 2000, kind: 'unverified', source: 'unknown', name: '미확인' };
  const message = roadsideMessage(s, 1, end, [unknown], [normal]);
  assert.equal(message.state, 'observed'); assert.match(message.title, /전방 100 m · 눈부심 관측 없음/);
  assert.match(message.source, /가상 사진 판정 예시/); assert.match(message.source, /도착 시 달라질 수 있음/);
  const later = { id: 'later', start: 1400, end: 1500, kind: 'glare', source: 'example', level: 2, name: '주의' };
  assert.match(roadsideMessage(s, 1, end, [unknown, later], [normal]).title, /전방 400 m · 눈부심 강함/);
  assert.equal(roadsideMessage(s, 1, end, [unknown], [{ ...normal, state: 'unknown' }]).state, 'unknown');
});
