import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';

const { road, url } = await loadRoad(true);
const { road: dalgu } = await loadRoad(false);
const require = createRequire(import.meta.url);
let source = await readFile(new URL('../src/game/underpasses.ts', import.meta.url), 'utf8');
source = source.replace("from './road'", `from '${url}'`)
  .replace("from 'three'", `from '${pathToFileURL(require.resolve('three')).href}'`)
  .replace("from 'three/examples/jsm/utils/BufferGeometryUtils.js'", `from '${pathToFileURL(require.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')).href}'`);
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { underpassAt, groundGeometry, buildUnderpasses } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Surveyed Sincheon route has plausible continuous geometry and sourced portals', () => {
  assert.ok(road.D.total_km > 14 && road.D.total_km < 19);
  assert.ok(road.UNDERPASSES.length >= 10);
  assert.equal(road.LANE_COUNT, 2);
  for (let i = 1; i < road.P.length; i++) assert.ok(Math.hypot(road.P[i].x - road.P[i-1].x, road.P[i].z - road.P[i-1].z) < 10);
  for (const u of road.UNDERPASSES) {
    assert.ok(u.osmWayIds.length > 0); assert.ok(u.s1 > u.s0);
    assert.equal(road.at((u.s0 + u.s1) / 2).y, -u.depth);
    for (const s of [u.s0-u.ramp, u.s0, u.s1, u.s1+u.ramp]) {
      assert.ok(Math.abs(road.at(s-.01).y - road.at(s+.01).y) < .005);
    }
    for (let s = u.s0-u.ramp; s <= u.s1+u.ramp; s++) assert.ok(Math.abs(road.at(s+1).y-road.at(s).y) < .11);
  }
  assert.equal(dalgu.UNDERPASSES.length, 0);
  assert.equal(dalgu.at(dalgu.TOTAL / 2).y, 0);
  assert.equal(dalgu.LANE_COUNT, 4);
  assert.notEqual(road.locationLabel(.94), road.locationLabel(.4));
});

test('Both directions encounter approach, coverage, exit in the correct order', () => {
  for (const u of road.UNDERPASSES) for (const dir of [-1, 1]) {
    const entry = dir > 0 ? u.s0 : u.s1, exit = dir > 0 ? u.s1 : u.s0;
    assert.equal(underpassAt(entry-dir*20, dir).phase, 'approach');
    assert.equal(underpassAt((u.s0+u.s1)/2, dir).covered, true);
    assert.equal(underpassAt(exit+dir*20, dir).phase, 'exit');
  }
});

test('Ground holes expose sunken road; actual roofs block sun rays', () => {
  const ground = new THREE.Mesh(groundGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const scene = new THREE.Scene(); const blockers = buildUnderpasses(scene); scene.updateMatrixWorld(true);
  assert.ok(scene.children.length <= 10, 'underpass details should share material batches');
  for (const u of road.UNDERPASSES) {
    const p = road.at((u.s0+u.s1)/2);
    const fromAbove = new THREE.Raycaster(new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0,-1,0));
    assert.equal(fromAbove.intersectObject(ground).length, 0, 'ground must not seal the underpass');
    const fromDriver = new THREE.Raycaster(new THREE.Vector3(p.x, p.y+1.2, p.z), new THREE.Vector3(0,1,0));
    assert.ok(fromDriver.intersectObjects(blockers).length > 0, 'roof must block direct sunlight');
    for (const offset of [-5.25, -1.75, 1.75, 5.25]) {
      const clearance = new THREE.Raycaster(new THREE.Vector3(p.x-p.dz*offset, p.y+.2, p.z+p.dx*offset), new THREE.Vector3(0,1,0), 0, 2);
      assert.equal(clearance.intersectObjects(scene.children).length, 0, 'median and furnishings must leave vehicle lanes clear');
    }
  }
});

test('Building footprints contain surveyed floors and no copied bank landmark', async () => {
  const data = JSON.parse(await readFile(new URL('../src/data/sincheon_buildings.json', import.meta.url), 'utf8'));
  assert.equal(data.road, 'sincheon'); assert.equal(data.bank, null); assert.ok(data.b.length > 9000);
  for (const b of data.b) { assert.ok(b.p.length >= 6); assert.ok(b.f >= 1); assert.ok(Number.isFinite(b.h) && b.h > 0); }
});

test('Terrain meets the outside of retaining walls instead of leaving empty strips',()=>{
 const ground=new THREE.Mesh(groundGeometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));ground.updateMatrixWorld(true);
 for(const u of road.UNDERPASSES)for(let s=u.s0-u.ramp+8;s<u.s1+u.ramp-8;s+=8)for(const side of [-1,1]){
  const p=road.at(s),offset=side*(road.ROAD_W/2+1.6);
  const ray=new THREE.Raycaster(new THREE.Vector3(p.x-p.dz*offset,15,p.z+p.dx*offset),new THREE.Vector3(0,-1,0));
  assert.ok(ray.intersectObject(ground).length,`${u.name}: missing ground outside wall at ${s}`);
 }
});

test('Portal skylight joins daylight continuously in both directions',()=>{
 for(const u of road.UNDERPASSES)for(const dir of [-1,1]){
  const entry=dir>0?u.s0:u.s1,exit=dir>0?u.s1:u.s0;
  for(const s of [entry,exit]){
   const before=underpassAt(s-.001,dir),after=underpassAt(s+.001,dir);
   assert.ok(Math.abs(before.sky-after.sky)<.001,`${u.name}: portal illumination pop`);
  }
 }
});
