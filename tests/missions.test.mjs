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
  assert.equal(audit.courses.length,6); assert.ok(audit.courses.every(c=>c.passed));
  const bank=audit.courses.find(c=>c.id==='im-bank-sunset');assert.ok(bank.bankIncluded);assert.ok(bank.distanceKm<=1.5);assert.ok(bank.frontFraction>.85);
  for(const c of audit.courses.filter(c=>c.road==='dalgu')){assert.ok(c.sunAltitude>0&&c.sunAltitude<15);assert.ok(c.frontFraction>=.85);}
  for(const c of audit.courses.filter(c=>c.road==='sincheon'))assert.ok(c.underpasses>=1);
});
test('Offline inputs cover weather scenarios without fake final model results',async()=>{
  assert.equal(inputs.predictionsReady,false);assert.equal(inputs.cases.length,18);
  assert.equal(inputs.missionSha256,audit.missionSha256);
  for(const c of inputs.cases){assert.ok(c.segments.length>0);assert.equal(c.referenceView.flow,0);assert.equal(c.source,'selected-simulation-conditions');for(const s of c.segments){assert.ok(s.km1>s.km0);assert.ok(s.km>=s.km0&&s.km<=s.km1);assert.equal(s.level,undefined);}}
  const predictions=JSON.parse(await readFile(new URL('../src/data/route_analysis.json',import.meta.url),'utf8'));assert.deepEqual(predictions.cases,[]);
});
