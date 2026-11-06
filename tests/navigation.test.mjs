import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/navigationGuidance.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { navigationCue, createVoiceGuide } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Exit warnings use along-route distance in both travel directions', () => {
  for (const direction of [1,-1]) {
    const zones = [{ id:'exit', start:1000, end:1000+direction*150, kind:'exit', name:'passage', source:'simulation' }];
    const next = navigationCue(1000-direction*120, direction, 1000+direction*400, zones);
    assert.equal(next.meters,120); assert.equal(next.active,false); assert.match(next.spoken,/120미터/);
    assert.equal(navigationCue(1000+direction*30,direction,1000+direction*400,zones).active,true);
    assert.equal(navigationCue(1000+direction*190,direction,1000+direction*400,zones),null);
    assert.equal(navigationCue(1000-direction*120,direction,1000-direction*50,zones),null);
  }
});

test('Voice does not repeat each frame, speak stale queued distances, or speak while muted', () => {
  const spoken=[], voice=createVoiceGuide({cancel(){},speak(text){spoken.push(text);}});
  assert.equal(voice.announce('a','first',0),true);
  assert.equal(voice.announce('a','repeated',10000),false);
  assert.equal(voice.announce('b','too soon',100),false);
  assert.equal(voice.announce('b','current distance',7000),true);
  voice.setEnabled(false); assert.equal(voice.announce('c','muted',14000),false);
  voice.setEnabled(true); voice.reset(); assert.equal(voice.announce('a','new run',15000),true);
  assert.deepEqual(spoken,['first','current distance','new run']);
});

test('A continuing glare stretch is announced once, unless it gets worse', () => {
  const spoken=[], voice=createVoiceGuide({cancel(){},speak(text){spoken.push(text);}}), g=r=>({name:'glare',rank:r});
  assert.equal(voice.announce('z1-ahead','glare ahead',0,false,g(1)),true);
  assert.equal(voice.announce('z1-active','glare now',7000,false,g(1)),false);
  assert.equal(voice.announce('z2-active','glare again',14000,false,g(1)),false);
  assert.equal(voice.announce('z3-active','stronger',21000,false,g(2)),true);
  assert.equal(voice.announce('z4-active','still strong',28000,false,g(2)),false);
  assert.equal(voice.announce('exit','exit',35000),true);
  assert.equal(voice.announce('z5-ahead','much later',60000,false,g(2)),true);
  assert.deepEqual(spoken,['glare ahead','stronger','exit','much later']);
});

test('Unsupported speech stays silent without breaking navigation', () => {
  const voice=createVoiceGuide(null); assert.equal(voice.available,false);
  assert.equal(voice.announce('a','hello',0),false); voice.reset(); voice.stop();
});

test('Severe current glare is visible over unknown observations and future warnings in both directions',()=>{
 for(const dir of [-1,1]){
  const zones=[
   {id:'unknown',start:1000-dir*10,end:1000+dir*200,kind:'unverified',source:'unknown'},
   {id:'future',start:1000+dir*100,end:1000+dir*180,kind:'glare',source:'model',level:1},
   {id:'current',start:1000-dir*2,end:1000+dir*30,kind:'glare',source:'simulation',level:2},
  ];
  const cue=navigationCue(1000,dir,1000+dir*400,zones);
  assert.equal(cue.id,'current');assert.equal(cue.level,2);assert.equal(cue.active,true);assert.match(cue.text,/눈부심 강함/);assert.match(cue.spoken,/속도를 조금 줄이고/);
  const ahead=navigationCue(1000,dir,1000+dir*400,zones.slice(0,2));
  assert.equal(ahead.source,'model');assert.equal(ahead.meters,100);assert.equal(ahead.level,1);
  assert.equal(navigationCue(1000,dir,1000+dir*400,zones.slice(0,1)).kind,'unverified');
 }
});
