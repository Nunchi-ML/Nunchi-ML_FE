import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/game/vehicleGeometry.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace(/from '([^']+)'/g, (_, specifier) => `from '${import.meta.resolve(specifier)}'`);
const { sculptedBody, alloyWheel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
function validMesh(geometry) {
  assert.ok(geometry.index.count % 3 === 0);
  const pos = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  assert.ok([...pos.array, ...normals.array].every(Number.isFinite));
  assert.ok([...geometry.index.array].every(i => i >= 0 && i < pos.count));
  assert.equal(pos.count, normals.count);
}
test('차체가 세단/SUV/로드스터 규격과 지면 위 경계를 유지', () => {
  for (const [length, width, base, shoulder] of [[4.6, 1.82, .28, .9], [4.7, 1.9, .34, 1.08], [4.6, 1.84, .3, .86]]) {
    const geometry = sculptedBody(length, width, base, shoulder);
    validMesh(geometry);
    const box = geometry.boundingBox;
    assert.ok(Math.abs((box.max.z - box.min.z) - length) < 1e-5);
    assert.ok(Math.abs((box.max.x - box.min.x) - width) < 1e-5);
    assert.ok(box.min.y > 0); assert.ok(box.max.y < shoulder + .1);
    // 별도 끝면 정점의 법선은 앞/뒤를 향해야 한다.
    const normals = geometry.getAttribute('normal');
    assert.ok(normals.getZ(normals.count - 1) > .99);
    assert.ok(normals.getZ(normals.count - 12) < -.99);
    geometry.dispose();
  }
});
test('휠은 공유 가능한 하나의 유효한 메시이며 타이어 반경 안에 있음', () => {
  for (const radius of [.33, .38, .5]) {
    const geometry = alloyWheel(radius); validMesh(geometry);
    const b = geometry.boundingBox;
    assert.ok(b.max.y < radius && b.min.y > -radius);
    assert.ok(b.max.z < radius && b.min.z > -radius);
    assert.ok(b.max.x - b.min.x < .1);
    geometry.dispose();
  }
});
