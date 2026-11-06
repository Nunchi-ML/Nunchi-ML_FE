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
const { roadsideMessage } = await load(false);

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
  const example = roadsideMessage(1000, 1, 1500, [zone]); assert.equal(example.state, 'caution'); assert.match(example.source, /가상 관측 예시/);
  const actual = roadsideMessage(1000, 1, 1500, [{ ...zone, source: 'roadside' }]); assert.match(actual.source, /도로변 사진 \+ 태양·날씨/);
  assert.notEqual(roadsideMessage(1300, 1, 1500, [zone]).state, 'caution');
  assert.notEqual(roadsideMessage(1000, 1, 1050, [zone]).state, 'caution');
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
