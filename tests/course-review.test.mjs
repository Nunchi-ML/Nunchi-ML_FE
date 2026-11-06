import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadRoad } from './helpers/road.mjs';
const { road, url } = await loadRoad(true);
const source = (await readFile(new URL('../src/game/courseReview.ts', import.meta.url),'utf8')).replace("from './road'",`from '${url}'`);
const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const { coursePassages } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Covered time uses the actual roof, excludes ramps, and works in both directions',()=>{
 const u=road.UNDERPASSES.reduce((a,b)=>b.s1-b.s0>a.s1-a.s0?b:a);
 for(const dir of [-1,1]){
  const a=road.sToKm(dir>0?u.s0-200:u.s1+200),b=road.sToKm(dir>0?u.s1+200:u.s0-200);
  const [p]=coursePassages(a,b);assert.ok(p.fullPassage);assert.ok(Math.abs(p.roofM-(u.s1-u.s0))<.001);
  assert.ok(p.secondsAt(40)>17&&p.secondsAt(40)<18);assert.equal(p.secondsAt(40),p.secondsAt(80)*2);
 }
});
test('Partial and absent roof sections are not presented as full tunnel traversals',()=>{
 const u=road.UNDERPASSES[0];
 const [p]=coursePassages(road.sToKm(u.s0+10),road.sToKm(u.s1-10));
 assert.equal(p.fullPassage,false);assert.ok(Math.abs(p.coveredM-(u.s1-u.s0-20))<.001);
 assert.deepEqual(coursePassages(0,.1),[]);
});
