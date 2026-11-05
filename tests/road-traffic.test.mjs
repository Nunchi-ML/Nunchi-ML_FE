import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';
const load = source => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText).toString('base64')}`);
const { road } = await loadRoad();
const { separateTraffic } = await load(await readFile(new URL('../src/game/trafficSpacing.ts', import.meta.url), 'utf8'));

test('모든 차로 중심과 버스 폭이 차선 경계 안에 있음', () => {
  const edges = [0, ...road.LANE_BOUNDARIES, road.LANE_COUNT * road.LANE_WIDTH];
  for (let lane = 0; lane < road.LANE_COUNT; lane++) {
    const center = road.laneOffset(lane);
    assert.ok(center - 1.25 > edges[lane]); assert.ok(center + 1.25 < edges[lane + 1]);
    assert.ok(center + 1.25 < road.ROAD_W / 2);
  }
});
test('양 끝 바깥 차량이 한 점에 쌓이지 않고 접선을 따라 이어짐', () => {
  for (const end of [0, road.TOTAL]) {
    const sign = end === 0 ? -1 : 1, a = road.at(end), b = road.at(end + sign * 300);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 300) < 1e-5);
    assert.ok(Math.abs(Math.hypot(b.dx, b.dz) - 1) < 1e-8);
    assert.ok(Math.hypot(road.at(end + .001).x - road.at(end - .001).x,
      road.at(end + .001).z - road.at(end - .001).z) < .01);
  }
});
test('양방향에서 이미 겹친 차량·버스의 간격도 복구', () => {
  for (const direction of [-1, 1]) {
    const cars = [
      { lane: 1, s: direction * 100, len: 11, v: 8 },
      { lane: 1, s: direction * 100, len: 4.6, v: 20 },
      { lane: 1, s: direction * 99, len: 4.7, v: 18 },
      { lane: 2, s: direction * 100, len: 4.6, v: 12 },
    ];
    separateTraffic(cars, direction);
    const lane = cars.filter(c => c.lane === 1).sort((a, b) => (b.s - a.s) * direction);
    for (let i = 1; i < lane.length; i++) {
      assert.ok((lane[i - 1].s - lane[i].s) * direction >= (lane[i - 1].len + lane[i].len) / 2 + 2 - 1e-8);
      assert.ok(lane[i].v <= lane[i - 1].v);
    }
    assert.equal(cars[3].s, direction * 100);
  }
});
