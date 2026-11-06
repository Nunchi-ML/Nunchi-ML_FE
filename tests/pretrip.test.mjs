import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/game/preTrip.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {assessSegment,assessRoute,selectRoute,warningLeadMeters}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const now='2026-11-06T08:02:00Z';
const segment={id:'one',km0:1,km1:1.1,distanceM:100,headingDeg:90,eta:'2026-11-06T08:03:00Z'};
const observation={id:'camera-one',road:'test',km0:1,km1:1.2,camera:{id:'east',latitude:35.86,longitude:128.6,headingDeg:90,horizontalFovDeg:60,directionValidated:true},photo:{url:'/fixture.jpg',sha256:'a'.repeat(64),capturedAt:'2026-11-06T08:00:00Z',validUntil:'2026-11-06T08:10:00Z',source:'roadside'},context:{at:'2026-11-06T08:00:00Z',sunAltitude:8,sunAzimuth:90,weather:'clear'},prediction:{method:'photo+G',status:'validated',level:2,modelVersion:'test-fixture'}};
const copy=()=>structuredClone(observation);
const assess=o=>assessSegment('test',segment,o,now,'connected');
test('Roadside photo + capture-time G yields an observation, not an accident probability',()=>{
 const s=assess([observation]);assert.equal(s.state,'caution');assert.equal(s.level,2);
 const normal=copy();normal.prediction.level=0;assert.equal(assess([normal]).state,'normal');
 assert.equal(assess([]).state,'unknown');assert.equal(assess([null,{}]).state,'unknown');
});
test('Missing, stale, wrong-direction and ETA-expired information never becomes normal',()=>{
 const cases=[['missing-photo',o=>o.photo.url=''],['direction',o=>o.camera.headingDeg=270],['outside-view',o=>o.km0=2],['stale',o=>o.photo.validUntil='2026-11-06T08:01:00Z'],['stale',o=>o.photo.capturedAt='2026-11-06T08:04:00Z'],['arrival-expiry',o=>o.photo.validUntil='2026-11-06T08:02:30Z'],['capture-context',o=>o.context.at='2026-11-06T08:03:00Z'],['missing-photo',o=>o.photo.sha256=''],['capture-context',o=>o.context.sunAltitude=NaN]];
 for(const [reason,change] of cases){const o=copy();change(o);const s=assess([o]);assert.equal(s.state,'unknown');assert.equal(s.level,null);assert.equal(s.reason,reason);}
});
test('G-only, photo-only, pilot and unvalidated fixed-camera direction are not production route results',()=>{
 for(const change of [o=>o.prediction.method='G-only',o=>o.prediction.method='photo-only',o=>o.prediction.status='pilot',o=>o.camera.directionValidated=false]){const o=copy();change(o);assert.equal(assess([o]).reason,'model-pending');}
 const demo=copy();demo.photo.source='simulator-example';demo.prediction.status='authored-example';demo.camera.directionValidated=false;
 assert.equal(assess([demo]).reason,'example-only');assert.equal(assessSegment('test',segment,[demo],now,'example').state,'caution');
});
test('Newest invalid observation cannot expose an older normal as current',()=>{
 const normal=copy();normal.prediction.level=0;const recent=copy();recent.photo.capturedAt='2026-11-06T08:01:00Z';recent.context.at=recent.photo.capturedAt;recent.prediction.status='pending';
 assert.equal(assess([normal,recent]).state,'unknown');
});
const route={id:'base',name:'base',road:'test',distanceM:100,durationSec:60,timeSource:'traffic-cache',traffic:'slow',closure:'open',segments:[segment]};
test('Exposure comparison respects time/distance limits, closure and unknown coverage',()=>{
 const base=assessRoute(route,[observation],now,'connected');assert.equal(base.cautionM,100);assert.equal(base.unknownM,0);
 const noGlare=copy();noGlare.prediction.level=0;
 const alternate=assessRoute({...route,id:'alt',durationSec:180,distanceM:150},[noGlare],now,'connected');
 const prefs={preference:'exposure',extraMinutes:3,extraKm:1};
 assert.equal(selectRoute([base,alternate],'base',prefs).selected.route.id,'alt');
 assert.equal(selectRoute([base,alternate],'base',{...prefs,extraMinutes:1}).selected.route.id,'base');
 assert.equal(selectRoute([base,alternate],'base',{...prefs,extraKm:0}).selected.route.id,'base');
 const unknown=assessRoute({...route,id:'unknown'},[],now,'connected');assert.equal(selectRoute([base,unknown],'base',prefs).selected.route.id,'base');
 const closed={...alternate,route:{...alternate.route,closure:'closed'}};assert.equal(selectRoute([base,closed],'base',prefs).selected.route.id,'base');
 assert.equal(selectRoute([{...base,route:{...route,closure:'closed'}}],'base',prefs).selected,null);
 const simulation={...base,route:{...route,timeSource:'simulation'}};assert.equal(selectRoute([simulation,alternate],'base',prefs).reason,'basic-warning');
 assert.equal(selectRoute([base,alternate],'base',{...prefs,preference:'arrival'}).selected.route.id,'base');
});
test('Sensitivity changes warning lead, never the observed image grade',()=>{
 const before=assess([observation]);assert.ok(warningLeadMeters(80,'sensitive')>warningLeadMeters(80,'standard'));assert.deepEqual(assess([observation]),before);
 assert.ok(warningLeadMeters(Infinity,'sensitive')>=180);
});

test('Bundled workflow pictures are synthetic opt-in examples and never live predictions',async()=>{
 const {createHash}=await import('node:crypto');
 const feed=JSON.parse(await readFile(new URL('../src/data/roadside_feed.json',import.meta.url),'utf8'));
 assert.deepEqual(feed.observations,[]);assert.deepEqual(feed.routes,[]);
 const examples=JSON.parse(await readFile(new URL('../src/data/roadside_examples.json',import.meta.url),'utf8'));
 assert.equal(examples.observations.length,2);
 for(const o of examples.observations){
   const photo=await readFile(new URL('../public/'+o.photo.url.replace('./',''),import.meta.url));
   assert.equal(createHash('sha256').update(photo).digest('hex'),o.photo.sha256);
   assert.equal(o.photo.source,'simulator-example');assert.equal(o.prediction.status,'authored-example');assert.equal(o.camera.directionValidated,false);
   const s={...segment,km0:o.km0,km1:o.km1,headingDeg:o.camera.headingDeg,eta:new Date(Date.parse(o.photo.capturedAt)+120000).toISOString()};
   assert.equal(assessSegment(o.road,s,[o],s.eta,'connected').state,'unknown');
   assert.equal(assessSegment(o.road,s,[o],s.eta,'example').state,'caution');
 }
});
