// 모델 ③ API(sunsight_api)가 켜져 있을 때, 서버 없이도 재생할 수 있도록 결과를 미리 받아 둔다.
// 사진 없이 해 높이 · 구름만 넣은 결과(사진 숫자 = 학습 중앙값)다. 사진 판정이 안 될 때만 쓴다.
// 실행: node scripts/fetch_model3_presets.mjs [http://127.0.0.1:8000]
import { writeFile } from 'node:fs/promises';

const base = (process.argv[2] || 'http://127.0.0.1:8000').replace(/\/$/, '');
const CLOUDS = [0, 5, 9], ALT0 = -10, ALT1 = 90;
const body = [];
for (const cloud of CLOUDS) for (let alt = ALT0; alt <= ALT1; alt++) body.push({ id: `${alt}|${cloud}`, features: {}, sun_alt: alt, cloud });
const res = await fetch(`${base}/predict/features`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) throw new Error(`모델 ③ API 응답 ${res.status}`);
const rows = await res.json();
const health = await (await fetch(`${base}/health`)).json();
const EN = { 하: 'l', 중: 'm', 상: 'h' };
const grid = Object.fromEntries(CLOUDS.map(c => [c, rows.filter(r => r.id.endsWith(`|${c}`)).map(r => EN[r.grade]).join('')]));
const effects = {}, warn = new Set();
for (const r of rows) { effects[r.grade] ??= r.screen_effect; warn.add(r.warn_distance_m); }
if (warn.size !== 1) throw new Error('warn_distance_m 값이 여러 개');
const out = {
  note: '모델 ③ API /predict/features 결과를 미리 받아 둔 표. 사진 없이 해 높이·구름만 넣음 (사진 숫자는 학습 중앙값). 서버·사진 판정이 안 될 때만 쓴다.',
  model: health.model, sklearn: health.sklearn, created: new Date().toISOString().slice(0, 10),
  alt0: ALT0, alt1: ALT1, clouds: CLOUDS, grid, warn_distance_m: [...warn][0], screen_effect: effects,
};
await writeFile(new URL('../src/data/model3_presets.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('저장 src/data/model3_presets.json', Object.fromEntries(Object.entries(grid).map(([c, g]) => [c, g.length])));
