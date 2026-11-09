import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/game/vehicleCollision.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {resolvePlayerContacts:resolve}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const player=(s=100)=>({s,laneX:0,targetX:0,laneV:0,v:20});
const car=(s,x=0)=>({s,x,len:4.6,kind:'sedan',v:10});

test('a front collision matches the front speed and leaves steering unchanged in either direction',()=>{
 for(const dir of [-1,1]){
  const p=player(dir*100),c=car(dir*104);p.targetX=.3;p.laneV=.2;
  const result=resolve(p,[c],dir);
  assert.ok((c.s-p.s)*dir>=4.6);assert.equal(p.v,10);
  assert.equal(p.laneX,0);assert.equal(p.targetX,.3);assert.equal(p.laneV,.2);assert.equal(result.impactSpeed,10);
 }
});

test('a side contact stops penetration without an opposite steering kick or longitudinal speed loss',()=>{
 for(const dir of [-1,1])for(const side of [-1,1]){
  const p=player(dir*100),c=car(dir*100,side*1.7);p.targetX=side*.5;p.laneV=side*2;
  const result=resolve(p,[c],dir);
  assert.ok(Math.abs(c.x-p.laneX)>=1.82);assert.equal(p.targetX,p.laneX);
  assert.equal(p.laneV,0);assert.equal(p.v,20);assert.equal(result.impactSpeed,2);
  p.targetX=p.laneX-side; p.laneV=-side;
  resolve(p,[c],dir,result.contacts);
  assert.equal(p.targetX,p.laneX-side);assert.equal(p.laneV,-side,'the driver can steer away');
 }
});

test('sustained scraping is stable at 10, 30 and 60 fps and counts one impact until separation',()=>{
 for(const dt of [.1,1/30,1/60]){
  const p=player(),c=car(100,1.7);c.v=p.v;let contacts=new Set(),impacts=0;
  for(let t=0;t<3-dt/2;t+=dt){
   p.laneV=1;p.laneX+=dt;p.targetX=p.laneX+.1;
   const hit=resolve(p,[c],1,contacts);contacts=hit.contacts;if(hit.impactSpeed>.5)impacts++;
   assert.ok(c.x-p.laneX>=1.82-1e-8);assert.equal(p.v,20);
  }
  assert.equal(impacts,1);
  p.laneX=-4;contacts=resolve(p,[c],1,contacts).contacts;assert.equal(contacts.size,0);
  p.laneX=0;p.laneV=1;assert.equal(resolve(p,[c],1,contacts).impactSpeed,1);
 }
});

test('rear impacts do not teleport or accelerate the player; separated cars have no effect',()=>{
 for(const dir of [-1,1]){
  const p=player(dir*100),rear=car(dir*96);rear.v=25;
  const hit=resolve(p,[rear],dir);
  assert.equal(p.s,dir*100);assert.equal(p.v,20);assert.equal(p.targetX,0);assert.equal(rear.v,20);
  assert.ok((p.s-rear.s)*dir>=4.6);assert.equal(hit.impactSpeed,5);
  const before={...p};assert.equal(resolve(p,[car(dir*110),car(dir*100,4)],dir).contacts.size,0);assert.deepEqual(p,before);
 }
});
