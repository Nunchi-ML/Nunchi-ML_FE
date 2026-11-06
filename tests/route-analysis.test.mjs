import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let source=await readFile(new URL('../src/game/routeAnalysis.ts',import.meta.url),'utf8');
source=source.replace("import raw from '../data/route_analysis.json';",'const raw={cases:[]};');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {lookupRouteAnalysis,routeAnalysisWarnings,routeAnalysisSummary}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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

test('An entrance-only candidate never becomes a validated exit prediction',()=>{
 const adaptation={method:'ml-luminance',modelVersion:'scope-fixture',outsideLuminance:3000,entry:.5,exit:.9};
 const lookup=a=>lookupRouteAnalysis('dalgu',settings,22.75,{cases:[{...entry,adaptation:a}]});
 assert.equal(lookup(adaptation).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:['entry']}).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:['exit']}).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:['entry','exit']}).adaptation.exit,.9);
 assert.equal(lookup({...adaptation,validatedZones:['entry','exit'],exit:NaN}).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:'entryexit'}).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:['entry','exit'],modelVersion:' '}).adaptation,undefined);
 assert.equal(lookup({...adaptation,validatedZones:['entry']}).sample.level,1,'scope checks must not replace photo labels');
});

test('Route warnings retain severity, clip to the route and reject mismatched conditions',()=>{
 const data={cases:[{...entry,samples:[sample,{...sample,km0:22.6,km1:22.7,km:22.65,level:2},{...sample,km0:22.5,km1:22.6,km:22.55,level:0}]}]};
 const warnings=routeAnalysisWarnings('dalgu',{...settings,startKm:22.76,endKm:22.55},data);
 assert.equal(warnings.length,2);assert.equal(warnings[0].km1,22.76);assert.deepEqual(warnings.map(w=>w.level),[1,2]);
 for(const change of [{date:'2026-09-21'},{minutes:1071},{weather:'over'},{endKm:24},{startKm:NaN}])assert.deepEqual(routeAnalysisWarnings('dalgu',{...settings,...change},data),[]);
 assert.deepEqual(routeAnalysisWarnings('sincheon',settings,data),[]);
 assert.deepEqual(routeAnalysisWarnings('dalgu',{...settings,startKm:20,endKm:19},data),[]);
});

test('Pre-trip summary counts model levels by distance only for the matching condition',()=>{
  const samples=[{...sample,km0:22.7,km1:22.8,km:22.75,level:2},{...sample,km0:22.6,km1:22.7,km:22.65,level:0},{...sample,km0:22.5,km1:22.6,km:22.55,level:1}];
  const data={cases:[{...entry,samples}]};
  const s=routeAnalysisSummary('dalgu',settings,data);
  assert.deepEqual([s.severeM,s.glareM,s.normalM,s.points],[100,100,100,3]);
  assert.deepEqual(s.levels,[2,0,1],'ordered along the driving direction');
  assert.equal(routeAnalysisSummary('dalgu',{...settings,weather:'over'},data),null);
  assert.equal(routeAnalysisSummary('dalgu',{...settings,endKm:24},data),null);
  assert.equal(routeAnalysisSummary('dalgu',settings,{cases:[{...entry,samples,status:'pilot'}]}),null);
});
