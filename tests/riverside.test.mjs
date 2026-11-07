import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';

const require = createRequire(import.meta.url);
let source = await readFile(new URL('../src/game/riverside.ts', import.meta.url), 'utf8');
source = source.replace("from 'three'", `from '${pathToFileURL(require.resolve('three')).href}'`);
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const R = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const { road } = await loadRoad(true);
const toXZ = ([lon, lat]) => ({ x: (lon - 128.59) * 111320 * Math.cos(35.866 * Math.PI / 180), z: -(lat - 35.866) * 110940 });
const line = []; for (let s = 0; s <= road.TOTAL; s += 20) { const p = road.at(s); line.push({ x: p.x, z: p.z }); }

test('둔치는 도로(차도 + 보도)와 겹치지 않고, 도로에서 먼 곳은 최대 폭', () => {
  for (const river of road.D.rivers) {
    const pts = river.poly.map(toXZ), f = R.bankWidths(pts, river.width, line);
    pts.forEach((p, i) => {
      for (const s of [-1, 1]) {
        const w = s < 0 ? f[i].left : f[i].right;
        assert.ok(w >= 0 && w <= R.RIVER_BANK_MAX);
        if (w > 0) {
          const edge = { x: p.x + f[i].nx * s * (river.width / 2 + w), z: p.z + f[i].nz * s * (river.width / 2 + w) };
          assert.ok(R.distanceToPolyline(edge, line) >= R.ROAD_CLEAR - 1.5, `${river.name} ${i} ${s}`);
        }
      }
    });
  }
  const far = R.bankWidths([{ x: 0, z: 0 }, { x: 0, z: 100 }], 30, [{ x: 5000, z: 0 }, { x: 5000, z: 100 }]);
  assert.ok(far.every(b => b.left === R.RIVER_BANK_MAX && b.right === R.RIVER_BANK_MAX));
});

test('신천대로 구간에서는 신천 둔치가 실제로 깔린다 (빈 갈색 땅이 아님)', () => {
  const sin = road.D.rivers.find(r => r.name === '신천'), pts = sin.poly.map(toXZ), f = R.bankWidths(pts, sin.width, line);
  const nearRoad = f.filter((b, i) => R.distanceToPolyline(pts[i], line) < 150);
  assert.ok(nearRoad.length > 20);
  assert.ok(nearRoad.filter(b => Math.min(b.left, b.right) > 5).length / nearRoad.length > .6);
});
