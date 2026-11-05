import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/game/adaptation.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { adaptationScores, newAdaptation, resetAdaptation, sceneLuminance, stepAdaptation } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Model3 score agrees with Python draft luminance-ratio formula', () => {
  for (const icsr of [0, .3, 1, 3, 4]) {
    const L = .15 * icsr * (1_000_000 / 3600) * 126 / Math.PI;
    const dimming = Math.max(.25, Math.min(1, Math.ceil(L / 4000 * 4) / 4));
    const score = r => Math.max(0, Math.min(1, Math.log10(Math.max(1, r)) / 2));
    const actual = adaptationScores(L);
    assert.ok(Math.abs(actual.entry - score(L / (280 * dimming))) < 1e-12);
    assert.ok(Math.abs(actual.exit - score(L / 45)) < 1e-12);
  }
  assert.deepEqual(adaptationScores(NaN), { entry: 0, exit: 0 });
});

test('Darkness history increases exit washout, which then recovers', () => {
  const short = newAdaptation(), long = newAdaptation();
  stepAdaptation(short, 4000, 0); stepAdaptation(long, 4000, 0);
  for (let i = 0; i < 10; i++) stepAdaptation(short, 9, .05);
  for (let i = 0; i < 200; i++) stepAdaptation(long, 9, .05);
  const brief = stepAdaptation(short, 4000, .05), sustained = stepAdaptation(long, 4000, .05);
  assert.ok(sustained.white > brief.white + .2);
  let last = sustained;
  for (let i = 0; i < 200; i++) last = stepAdaptation(long, 4000, .05);
  assert.ok(last.white < .01);
  assert.ok(last.pupil < sustained.pupil);
});

test('Entry darkening, pause, and new-run reset preserve correct state', () => {
  const state = newAdaptation(); stepAdaptation(state, 4000, 0);
  assert.ok(stepAdaptation(state, 9, .05).dark > .5);
  const paused = state.logL; stepAdaptation(state, 9, 0); assert.equal(state.logL, paused);
  resetAdaptation(state); const reset = stepAdaptation(state, 9, .05);
  assert.equal(reset.white, 0); assert.equal(reset.dark, 0);
});

test('Weather and night change scene brightness without false daylight at night', () => {
  assert.ok(sceneLuminance(35, 'clear') > sceneLuminance(35, 'over') * 3);
  assert.equal(sceneLuminance(-10, 'clear'), .15);
  assert.equal(adaptationScores(sceneLuminance(-10, 'clear')).exit, 0);
});
