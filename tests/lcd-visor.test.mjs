import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/visorMath.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { VISOR, visorHit, visorCells, darkCells } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const dir = (azDeg, altDeg) => { const a = azDeg * Math.PI / 180, e = altDeg * Math.PI / 180; return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: -Math.cos(a) * Math.cos(e) }; };

test('A low sun straight ahead passes through the visor, a high or rear sun does not', () => {
  const hit = visorHit(dir(0, 12));
  assert.ok(hit, 'low frontal sun hits the panel');
  assert.ok(Math.abs(hit.u - .47) < .1, `near the driver centre, u=${hit.u}`);
  assert.equal(visorHit(dir(0, 45)), null, 'high sun is above the panel');
  assert.equal(visorHit(dir(0, -3)), null, 'sun below the panel edge');
  assert.equal(visorHit(dir(180, 10)), null, 'sun behind');
});

test('Only a few hexagon cells around the sun are darkened; the rest stays clear', () => {
  const { cells } = visorCells();
  const dark = darkCells(visorHit(dir(5, 10)));
  assert.ok(dark.length >= 3 && dark.length <= 14, `dark=${dark.length}`);
  assert.ok(dark.length < cells.length * .1, 'less than 10% of the panel');
  assert.deepEqual(darkCells(null), []);
  // 해가 오른쪽으로 옮겨 가면 어두운 칸도 오른쪽으로
  const meanU = ids => ids.reduce((s, i) => s + cells[i].u, 0) / ids.length;
  assert.ok(meanU(darkCells(visorHit(dir(15, 10)))) > meanU(dark));
});

test('Cells tile the panel inside its edges', () => {
  const { cells } = visorCells();
  assert.ok(cells.length > 150);
  assert.ok(cells.every(c => c.u >= 0 && c.u <= 1 && c.v >= 0 && c.v <= 1));
  assert.ok(VISOR.z < 0 && VISOR.w > VISOR.h);
});
