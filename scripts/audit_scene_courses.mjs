/** Reproducible 3D course visibility check, not an ML or real-driver evaluation.
 * Start a local preview first. Uses the Playwright CLI, without repository dependencies.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const base = process.argv[2] ?? 'http://127.0.0.1:4343';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(base)) throw new Error('Use a local preview origin');
const source = (await readFile(new URL('src/game/missions.ts', root),'utf8')).replace(/\r\n/g,'\n');
const json = await readFile(new URL('src/data/sincheon.json',root),'utf8');
const code=ts.transpileModule(source.replace("import sincheon from '../data/sincheon.json';",`const sincheon=${json};`),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText;
const {ROAD_MISSIONS,missionDate}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
const cases=ROAD_MISSIONS.dalgu.map(m=>({id:m.id,a:m.a,b:m.b,m:m.m,date:missionDate(m,year)}));
const session='nunchi-scene-audit';
const run=(...args)=>{
 const prefix=process.env.PLAYWRIGHT_CLI ? [process.env.PLAYWRIGHT_CLI] : [process.env.npm_execpath,'exec','--yes','--package=@playwright/cli','--','playwright-cli'];
 if(!prefix[0])throw new Error('Run through npm run audit:scene or set PLAYWRIGHT_CLI');
 return execFileSync(process.execPath,[...prefix,'--session',session,...args],{encoding:'utf8',timeout:180000,maxBuffer:8e6});
};
await mkdir(new URL('output/playwright/',root),{recursive:true});
const config={browser:{browserName:'chromium',launchOptions:{headless:true,args:['--enable-unsafe-swiftshader'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})},contextOptions:{viewport:{width:1280,height:720}}},outputDir:'output/playwright'};
await writeFile(new URL('output/playwright/scene-audit.config.json',root),JSON.stringify(config));
const script=`async(page)=>{
 await page.waitForFunction(()=>!!window.__nunchi);
 const results=[];
 for(const c of ${JSON.stringify(cases)}){
  await page.evaluate(c=>{const e=window.__nunchi;e.store.getState().set({startKm:c.a,endKm:c.b,date:c.date,minutes:c.m,weather:'clear',mode:'normal',voice:false,gfx:'low',flow:0,glass:false});e.startRun();e.S.minutes=c.m;},c);
  const samples=[];
  for(let i=0;i<12;i++){
   const km=c.a+(c.b-c.a)*(i+.5)/12;
   samples.push(await page.evaluate(async km=>{const e=window.__nunchi;e.prepareReference(km);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {km,...e.inspectGlare()};},km));
  }
  results.push({...c,samples,noticeableFraction:samples.filter(s=>s.intensity>=.22&&s.onScreen).length/12,severeFraction:samples.filter(s=>s.intensity>=.5&&s.onScreen).length/12});
 }
 return results;
}`;
await writeFile(new URL('output/playwright/scene-audit-run.js',root),script);
try{
 run('open',base+'/?road=dalgu','--config','output/playwright/scene-audit.config.json');
 const output=run('run-code','--filename','output/playwright/scene-audit-run.js');
 await writeFile(new URL('output/playwright/scene-audit.log',root),output);
 const match=output.match(/### Result\s*([\s\S]*?)\n###/);
 if(!match)throw new Error('Missing browser audit result');
 const courses=JSON.parse(match[1]);
 if(courses.some(c=>c.noticeableFraction<.5||c.severeFraction<.25))throw new Error('A recommended course lacks visible sun exposure in the scene');
 const result={format:'nunchi-scene-course-audit-v1',missionSha256:createHash('sha256').update(source).digest('hex'),note:'12 authored cockpit scene probes per course, clear weather, normal mode, glass off. Includes actual scene buildings and car blocking. Not a learned-model, physiological or real-driver performance result.',courses};
 await writeFile(new URL('src/data/course_visibility_audit.json',root),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(courses.map(({samples,...c})=>c),null,2));
}finally{run('close');}
