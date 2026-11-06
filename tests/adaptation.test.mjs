import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';

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

test('Daylight exit accent requires a sustained dark approach and recovers without persistent haze', () => {
  const s=newAdaptation(); stepAdaptation(s,4000,0,true,{covered:false,outsideLuminance:4000});
  for(let i=0;i<100;i++)stepAdaptation(s,9,.05,true,{covered:true,outsideLuminance:4000});
  const exit=stepAdaptation(s,4000,.05,true,{covered:false,outsideLuminance:4000});
  assert.ok(exit.exitPulse>.4);
  const paused=s.exitAge;stepAdaptation(s,4000,0,true,{covered:false,outsideLuminance:4000});assert.equal(s.exitAge,paused);
  let last;for(let i=0;i<120;i++)last=stepAdaptation(s,4000,.05,true,{covered:false,outsideLuminance:4000});
  assert.ok(last.exitPulse<.002);assert.ok(last.white<.03);
  resetAdaptation(s);assert.equal(stepAdaptation(s,4000,.05,true,{covered:false,outsideLuminance:4000}).exitPulse,0);
  for(let i=0;i<10;i++)stepAdaptation(s,9,.05,true,{covered:true,outsideLuminance:4000});
  assert.equal(stepAdaptation(s,4000,.05,true,{covered:false,outsideLuminance:4000}).exitPulse,0);
  resetAdaptation(s);stepAdaptation(s,.15,0,true,{covered:false,outsideLuminance:.15});
  for(let i=0;i<100;i++)stepAdaptation(s,9,.05,true,{covered:true,outsideLuminance:.15});
  assert.equal(stepAdaptation(s,.15,.05,true,{covered:false,outsideLuminance:.15}).exitPulse,0);
});

test('Continuous traversal of the actual short underpass produces an exit accent in both directions and at different speeds', async () => {
  const { road } = await loadRoad(true), u = road.UNDERPASSES[0], outside = sceneLuminance(40, 'clear');
  for (const dir of [-1, 1]) for (const speed of [14, 28, 45]) {
    const state = newAdaptation(), entry = dir > 0 ? u.s0 : u.s1, exit = dir > 0 ? u.s1 : u.s0;
    let peak = 0;
    for (let s = entry - dir * 30; (exit + dir * 90 - s) * dir > 0; s += dir * speed / 60) {
      const covered = s >= u.s0 && s <= u.s1;
      const penetration = covered ? Math.min(s - u.s0, u.s1 - s) : 0;
      const sky = covered ? Math.exp(-penetration / 10) : 1;
      const light = outside * sky + 9 * (1 - sky);
      const v = stepAdaptation(state, light, 1 / 60, true, { covered, outsideLuminance: outside });
      peak = Math.max(peak, v.exitPulse);
    }
    assert.ok(peak > .35, `No perceptible exit transition at ${speed} m/s, direction ${dir}`);
    let recovered; for (let i = 0; i < 420; i++) recovered = stepAdaptation(state, outside, 1 / 60, true, { covered: false, outsideLuminance: outside });
    assert.ok(recovered.exitPulse < .002); assert.ok(recovered.white < .01);
  }
});
