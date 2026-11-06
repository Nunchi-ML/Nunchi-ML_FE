import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';
const { road, url }=await loadRoad(true),require=createRequire(import.meta.url);
const source=(await readFile(new URL('../src/game/tunnelLighting.ts',import.meta.url),'utf8'))
 .replace("from './road'",`from '${url}'`).replace("from 'three'",`from '${pathToFileURL(require.resolve('three')).href}'`);
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createTunnelLighting}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('Roof shade follows the actual curved walls for every underpass, including the longest one',()=>{
 const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial();scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 const light=createTunnelLighting(scene),shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <lights_fragment_end>'};material.onBeforeCompile(shader);
 for(const u of road.UNDERPASSES){
  light.update((u.s0+u.s1)/2);const points=shader.uniforms.tunnelPoints.value;
  assert.ok(Math.abs(shader.uniforms.tunnelLength.value-(u.s1-u.s0))<.001);
  for(let s=u.s0+5;s<u.s1-5;s+=5)for(const side of [-1,1]){
   const p=road.at(s),q=new THREE.Vector2(p.x-p.dz*(road.ROAD_W/2+4)*side,p.z+p.dx*(road.ROAD_W/2+4)*side);
   const distances=points.slice(0,-1).map((a,i)=>{const b=points[i+1],axis=b.clone().sub(a),t=THREE.MathUtils.clamp(q.clone().sub(a).dot(axis)/axis.lengthSq(),0,1);return q.distanceTo(a.clone().addScaledVector(axis,t));});
   assert.ok(Math.min(...distances)<shader.uniforms.tunnelHalfWidth.value-.5,`${u.name} wall outside roof shade`);
  }
 }
 light.update(0);assert.equal(shader.uniforms.tunnelEnabled.value,0);
});
