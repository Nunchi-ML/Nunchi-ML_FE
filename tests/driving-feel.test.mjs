import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/game/drivingFeel.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {newDrivingFeel,updateDrivingFeel}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('Throttle rises progressively, braking cuts propulsion, and suspension stays bounded',()=>{
 const s=newDrivingFeel(); updateDrivingFeel(s,1,0,0,0,.016,true); assert.ok(s.throttle>0&&s.throttle<.2);
 for(let i=0;i<100;i++)updateDrivingFeel(s,1,0,i*.2,100,.016,true);
 assert.ok(s.throttle>.99);assert.ok(Math.abs(s.roll)<=.025);assert.ok(Math.abs(s.pitch)<.025);
 for(let i=0;i<60;i++)updateDrivingFeel(s,1,1,20-i*.2,0,.016,true);
 assert.ok(s.throttle<.01);assert.ok(s.brake>.99);
 for(let i=0;i<200;i++)updateDrivingFeel(s,1,1,0,0,.016,false);
 assert.ok(Math.abs(s.roll)<.001&&Math.abs(s.pitch)<.001&&s.throttle<.001&&s.brake<.001);
});
test('Control damping is consistent across common frame rates',()=>{
 const a=newDrivingFeel(),b=newDrivingFeel();
 for(let i=0;i<60;i++)updateDrivingFeel(a,1,0,0,1,1/60,true);
 for(let i=0;i<30;i++)updateDrivingFeel(b,1,0,0,1,1/30,true);
 assert.ok(Math.abs(a.throttle-b.throttle)<1e-8);assert.ok(Math.abs(a.roll-b.roll)<1e-8);
});
