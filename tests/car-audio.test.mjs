import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/carAudio.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { engineRpm, createCarAudio, chime } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Engine rpm stays in a car-like range and drops at each gear change', () => {
  for (let kmh = 0; kmh <= 130; kmh += 1) {
    const rpm = engineRpm(kmh, 0);
    assert.ok(rpm >= 800 && rpm <= 3300, `${kmh} km/h → ${rpm}`);
  }
  assert.ok(engineRpm(19.9, 0) > engineRpm(20.1, 0), 'shifts up at 20 km/h');
  assert.ok(engineRpm(50, 1) > engineRpm(50, 0), 'throttle raises rpm');
});

test('Audio helpers are silent no-ops without a browser', () => {
  const audio = createCarAudio();
  audio.start(); audio.update(true, 60, 1); audio.stop();
  assert.equal(chime(), 0);
});
