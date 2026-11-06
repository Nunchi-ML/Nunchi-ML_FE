import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let source=await readFile(new URL('../src/game/routeAnalysis.ts',import.meta.url),'utf8');
source=source.replace("import raw from '../data/route_analysis.json';",'const raw={cases:[]};');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {lookupRouteAnalysis}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const settings={date:'2026-09-20',minutes:1070,weather:'clear',startKm:22.95,endKm:21.8};
const sample={km0:22.7,km1:22.8,km:22.75,level:1,scores:{normal:.2,glare:.7,severe:.1},imageSha256:'fixture',geometricGlare:0};
const entry={id:'fixture',road:'dalgu',status:'final',date:settings.date,minutes:1070,weather:'clear',direction:-1,modelVersion:'test-fixture-only',samples:[sample]};
test('No final model values are fabricated or served for unmatched conditions',()=>{
  assert.equal(lookupRouteAnalysis('dalgu',settings,22.75),null);
  for(const change of [{minutes:1071},{date:'2026-09-21'},{weather:'over'},{endKm:24}]) assert.equal(lookupRouteAnalysis('dalgu',{...settings,...change},22.75,{cases:[entry]}),null);
  assert.equal(lookupRouteAnalysis('sincheon',settings,22.75,{cases:[entry]}),null);
  assert.equal(lookupRouteAnalysis('dalgu',settings,22.4,{cases:[entry]}),null);
  assert.equal(lookupRouteAnalysis('dalgu',settings,22.75,{cases:[{...entry,status:'pilot'}]}),null);
  assert.equal(lookupRouteAnalysis('dalgu',settings,22.75,{cases:[entry]}).sample.level,1);
});
