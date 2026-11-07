import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/visorMath.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { VISOR, VISOR_MOUNT, visorHit, visorCells, darkCells, visorDeployment, visorFrame, visorPose, visorSupports, visorTransmission } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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

test('Head movement uses the actual eye origin and rejects a panel behind the ray', () => {
  const eye = { x: .05, y: .03, z: -.02 }, u = .7, v = .3;
  const target = { x: VISOR.x + (u - .5) * VISOR.w, y: VISOR.y + (.5 - v) * VISOR.h, z: VISOR.z };
  const ray = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const hit = visorHit(ray, VISOR, eye);
  assert.ok(Math.abs(hit.u - u) < 1e-10 && Math.abs(hit.v - v) < 1e-10);
  assert.equal(visorHit(dir(0, 12), VISOR, { x: 0, y: 0, z: -.7 }), null);
});

test('Deployment shading follows the visible pose and opacity at different frame rates', () => {
  assert.equal(visorHit(dir(0, 12), visorPose(0)), null, 'raised panel does not suppress the sun');
  assert.equal(visorHit(dir(0, 12), visorPose(.5)), null, 'half-folded panel stays above the low sun');
  assert.equal(visorTransmission(visorHit(dir(0, 12)), .1), .5);
  assert.equal(visorTransmission(null, 1), 1);
  assert.equal(visorTransmission(visorHit(dir(0, 12)), 1), 0);
  const step = fps => { let p = 0; for (let i = 0; i < fps; i++) p = visorDeployment(p, true, 1 / fps); return p; };
  assert.ok(Math.abs(step(20) - step(60)) < 1e-10);
  assert.equal(visorDeployment(.4, true, 0), .4, 'paused animation stays still');
  let p = 1; for (let i = 0; i < 120; i++) p = visorDeployment(p, false, 1 / 60);
  assert.equal(p, 0);
});

test('Both supports stay anchored to the windshield frame while the panel travels', () => {
  for (const progress of [0, .2, .5, .8, 1]) {
    const supports = visorSupports(progress), p = visorFrame(progress);
    assert.equal(supports.length, 2);
    for (const s of supports) {
      assert.equal(s.top.y, VISOR_MOUNT.y); assert.equal(s.top.z, VISOR_MOUNT.z);
      assert.equal(s.bottom.y, p.y + p.h / 2 + .009); assert.equal(s.bottom.z, p.z);
      assert.ok(s.top.y > s.bottom.y, 'rail connects downward from the ceiling');
      assert.ok(Math.abs(s.bottom.x) < p.w / 2);
    }
    assert.equal(supports[0].bottom.x, -supports[1].bottom.x);
  }
});

test('The folding plate and eye ray agree at intermediate angles and reverse without jumping', () => {
  const eye = { x: .03, y: .01, z: .005 }, u = .6, v = .4;
  for (const progress of [.1, .4, .7, 1]) {
    const p = visorPose(progress), angle = p.tilt, dy = (.5 - v) * p.h;
    const target = { x: p.x + (u - .5) * p.w, y: p.y + dy * Math.cos(angle), z: p.z + dy * Math.sin(angle) };
    const hit = visorHit({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }, p, eye);
    assert.ok(hit && Math.abs(hit.u - u) < 1e-10 && Math.abs(hit.v - v) < 1e-10);
  }
  const start = .5, opened = visorDeployment(start, true, .02), reversed = visorDeployment(opened, false, .02);
  assert.ok(Math.abs(reversed - start) < 1e-12);
  assert.equal(visorPose(0).tilt, -Math.PI / 2); assert.equal(visorPose(1).tilt, 0);
});
