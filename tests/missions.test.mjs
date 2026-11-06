import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const audit=JSON.parse(await readFile(new URL('../src/data/course_audit.json',import.meta.url),'utf8'));
const inputs=JSON.parse(await readFile(new URL('../src/data/route_inputs.json',import.meta.url),'utf8'));
test('Recommended courses are audited and include a short iM bank drive',async()=>{
  const source=(await readFile(new URL('../src/game/missions.ts',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const hash=createHash('sha256').update(source).digest('hex');
  assert.equal(audit.missionSha256,hash,'rerun npm run prepare:routes after course changes');
  assert.equal(audit.courses.length,7); assert.ok(audit.courses.every(c=>c.passed));
  const bank=audit.courses.find(c=>c.id==='im-bank-sunset');assert.ok(bank.bankIncluded);assert.ok(bank.distanceKm<=1.5);assert.ok(bank.frontFraction>.85);
  for(const c of audit.courses.filter(c=>c.road==='dalgu')){assert.ok(c.sunAltitude>0&&c.sunAltitude<15);assert.ok(c.frontFraction>=.75);}
  for(const c of audit.courses.filter(c=>c.road==='sincheon'))assert.ok(c.underpasses>=1);
});
test('Offline inputs cover weather scenarios without fake final model results',async()=>{
  assert.equal(inputs.predictionsReady,false);assert.equal(inputs.cases.length,21);
  assert.equal(inputs.missionSha256,audit.missionSha256);
  for(const c of inputs.cases){assert.ok(c.segments.length>0);assert.equal(c.referenceView.flow,0);assert.equal(c.source,'selected-simulation-conditions');for(const s of c.segments){assert.ok(s.km1>s.km0);assert.ok(s.km>=s.km0&&s.km<=s.km1);assert.equal(s.level,undefined);}}
  const predictions=JSON.parse(await readFile(new URL('../src/data/route_analysis.json',import.meta.url),'utf8'));assert.deepEqual(predictions.cases,[]);
});

test('The longest real underpass is offered with a reproducible observation speed and an honest roof time',()=>{
  const long=audit.courses.find(c=>c.id==='chimsan-observation'),short=audit.courses.find(c=>c.id==='jungdong-exit');
  assert.ok(long&&short);assert.equal(long.observationKmh,40);assert.equal(short.observationKmh,40);
  assert.equal(long.tunnelObservations.length,1);const a=long.tunnelObservations[0],b=short.tunnelObservations[0];
  assert.ok(a.roofM>190&&a.roofM<193);assert.ok(a.roofM>b.roofM*2);
  assert.ok(a.secondsAt40>=17&&a.secondsAt40<18);assert.ok(b.secondsAt40>8&&b.secondsAt40<9);
  assert.equal(a.secondsAt40,Number((a.roofM/40*3.6).toFixed(1)));
  assert.ok(long.distanceKm*1000>a.roofM+400,'entry and recovery must be included');
});

test('Recommended sunlight courses include a current actual-scene occlusion audit',async()=>{
  const scene=JSON.parse(await readFile(new URL('../src/data/course_visibility_audit.json',import.meta.url),'utf8'));
  assert.equal(scene.missionSha256,audit.missionSha256,'rerun npm run audit:scene after course changes');
  assert.equal(scene.courses.length,3);
  for(const c of scene.courses){
    assert.equal(c.samples.length,12);assert.ok(c.noticeableFraction>=.5);assert.ok(c.severeFraction>=.25);
    const recorded=audit.courses.find(r=>r.id===c.id);assert.equal(c.m,recorded.minutes);assert.equal(c.date,recorded.date);
    assert.equal(c.noticeableFraction,c.samples.filter(s=>s.intensity>=.22&&s.onScreen).length/12);
  }
});
