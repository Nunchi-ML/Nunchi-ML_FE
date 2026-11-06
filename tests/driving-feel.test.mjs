import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/game/drivingFeel.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {newDrivingFeel,updateDrivingFeel,stepDriveSpeed}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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

test('Normal simulator driving accelerates promptly and remains consistent at 10 and 60 fps',()=>{
 const run=(mode,dt)=>{const feel=newDrivingFeel();let speed=0;for(let t=0;t<4-.0001;t+=dt){updateDrivingFeel(feel,1,0,speed,0,dt,true);speed=stepDriveSpeed(speed,feel.throttle,feel.brake,dt,mode);}return speed;};
 const normal=run('normal',1/60),slowFrames=run('normal',.1),sport=run('sport',1/60);
 assert.ok(normal*3.6>60&&normal*3.6<90);assert.ok(Math.abs(normal-slowFrames)<1);assert.ok(sport>normal);
 let braking=normal;for(let i=0;i<180;i++)braking=stepDriveSpeed(braking,0,1,1/60,'normal');assert.equal(braking,0);
 assert.equal(stepDriveSpeed(0,0,0,.1,'normal'),0);
});

test('Optional observation speed is reproducible, can be released, and does not override stronger driver braking',()=>{
 for(const mode of ['normal','sport'])for(const dt of [1/60,.1]){
  let speed=0;for(let t=0;t<30;t+=dt)speed=stepDriveSpeed(speed,1,0,dt,mode,40);
  assert.ok(Math.abs(speed*3.6-40)<.001);
  const slowed=stepDriveSpeed(25,1,0,dt,mode,40);assert.ok(slowed<25&&slowed>24,'lowering a cap should decelerate smoothly');
  assert.ok(stepDriveSpeed(25,0,1,dt,mode,40)<slowed,'the driver can brake harder');
  for(let t=0;t<4;t+=dt)speed=stepDriveSpeed(speed,1,0,dt,mode,0);
  assert.ok(speed*3.6>60,'free driving must restore normal performance');
 }
});
