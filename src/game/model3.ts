/* 모델 ③ (밝기 전환 부담) — 터널 입구 순응 위험 하 · 중 · 상.
 * 서버: AI 저장소 src/tunnel/simulator_api (FastAPI). 요청서 v4 장면:
 *   입구 155m 전 알림(거리 숫자는 안 띄움) → 입구 통과 순간 0.1초 안에 화면 95% 어두워짐 + 숫자 2 → 1초에 숫자 1 → 2초에 평소 밝기 회복.
 * 출구에는 알림을 띄우지 않는다. 사고 확률·"여기서 사고" 문구는 쓰지 않는다.
 */
export type Model3Grade = '하' | '중' | '상';
export interface ScreenEffect { start_dark_opacity: number; recover_s: number; curve: { t_s: number; dark_opacity: number }[] }
export type Model3Source = 'photo' | 'sun' | 'preset';
export interface Model3Reading { grade: Model3Grade; warn_distance_m: number; screen_effect: ScreenEffect; source: Model3Source }
export interface Model3Presets { alt0: number; alt1: number; clouds: number[]; grid: Record<string, string>; warn_distance_m: number; screen_effect: Record<string, ScreenEffect> }

export const MODEL3_COLOR: Record<Model3Grade, string> = { 하: '#3BA55C', 중: '#F2C230', 상: '#F2522E' };
export const MODEL3_SOURCE_LABEL: Record<Model3Source, string> = {
  photo: '시뮬레이터 화면 사진 + 해 높이 · 구름', sun: '해 높이 · 구름 (사진 없이)', preset: '미리 받아 둔 결과 (해 높이 · 구름)',
};
/** 입구 몇 m 전에 화면을 찍어 판정을 요청할지. 알림(155m)보다 먼저 결과가 와 있도록 앞서 찍는다. */
export const MODEL3_CAPTURE_M = 205;
/** 시뮬레이터 날씨 → ASOS 전운량 0~10 (휴대폰 판정과 같은 값). */
export const MODEL3_CLOUD: Record<string, number> = { clear: 0, cloud: 5, over: 9 };

const GRADES = ['하', '중', '상'];
/** 운전자에게 보이는 문구: 요청서 v4 규격 ("모델 ③ · 지하차도 입구 순응 위험 상" + "감속하세요"). 사고 확률 표현은 쓰지 않는다. */
export const model3AlertText = (g: Model3Grade) => `모델 ③ · 지하차도 입구 순응 위험 ${g}`;
export const MODEL3_ALERT_NOTE: Record<Model3Grade, string> = {
  상: '감속하세요 · 진입 후 2초 동안 시야가 급격히 어두워집니다',
  중: '감속하세요 · 진입 후 잠깐 앞이 어두워집니다',
  하: '앞차 간격을 유지하세요',
};

function parseEffect(v: unknown): ScreenEffect {
  const e = v as Partial<ScreenEffect> | null;
  if (!e || typeof e.start_dark_opacity !== 'number' || !(e.start_dark_opacity >= 0 && e.start_dark_opacity <= 1) ||
      typeof e.recover_s !== 'number' || !(e.recover_s > 0 && e.recover_s <= 10) || !Array.isArray(e.curve) || e.curve.length < 2 ||
      !e.curve.every(p => p && Number.isFinite(p.t_s) && Number.isFinite(p.dark_opacity) && p.dark_opacity >= 0 && p.dark_opacity <= 1)) {
    throw new Error('모델 ③ 응답의 screen_effect 형식이 올바르지 않아요.');
  }
  return { start_dark_opacity: e.start_dark_opacity, recover_s: e.recover_s, curve: e.curve };
}
export function parseModel3Reading(value: unknown, source: Model3Source): Model3Reading {
  const r = value as { grade?: unknown; warn_distance_m?: unknown; screen_effect?: unknown } | null;
  if (!r || typeof r !== 'object' || !GRADES.includes(r.grade as string) || typeof r.warn_distance_m !== 'number' || !(r.warn_distance_m > 0 && r.warn_distance_m < 1000)) {
    throw new Error('모델 ③ 응답 형식이 올바르지 않아요.');
  }
  return { grade: r.grade as Model3Grade, warn_distance_m: r.warn_distance_m, screen_effect: parseEffect(r.screen_effect), source };
}

/** 서버 없이 재생할 때: 미리 받아 둔 표에서 가장 가까운 해 높이 · 구름 칸. */
export function presetReading(table: Model3Presets, sunAlt: number, cloud: number): Model3Reading {
  const c = table.clouds.reduce((a, b) => Math.abs(b - cloud) < Math.abs(a - cloud) ? b : a);
  const i = Math.round(Math.max(table.alt0, Math.min(table.alt1, sunAlt))) - table.alt0;
  const grade = ({ l: '하', m: '중', h: '상' } as const)[table.grid[c][i] as 'l' | 'm' | 'h'];
  return { grade, warn_distance_m: table.warn_distance_m, screen_effect: parseEffect(table.screen_effect[grade]), source: 'preset' };
}

/** 들어간 뒤 t초의 검은 막 진하기. API가 준 0.5초 간격 값을 선으로 잇는다. */
export function darkAt(effect: ScreenEffect, t: number) {
  const c = effect.curve;
  if (!(t > c[0].t_s)) return c[0].dark_opacity;
  for (let i = 1; i < c.length; i++) if (t <= c[i].t_s) {
    const k = (t - c[i - 1].t_s) / (c[i].t_s - c[i - 1].t_s);
    return c[i - 1].dark_opacity + (c[i].dark_opacity - c[i - 1].dark_opacity) * k;
  }
  return t >= effect.recover_s ? 0 : c[c.length - 1].dark_opacity;
}

const apiBase = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MODEL3_API_URL || '/model3').replace(/\/$/, '');
/** 'YYYY-MM-DD' + 분 → API가 받는 한국 시각 'YYYY-MM-DDTHH:MM:SS' (시간대 없이). */
export function model3Time(date: string, minutes: number) {
  const s = ((Math.floor(minutes * 60) % 86400) + 86400) % 86400, p = (n: number) => String(n).padStart(2, '0');
  return `${date}T${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}
export interface Model3Context { date: string; minutes: number; lat: number; lon: number; cloud: number; sunAlt: number; speedKmh: number }
/** 사진 판정 → 안 되면 해 높이 · 구름만으로 판정 → 그것도 안 되면 미리 받아 둔 표. */
export async function requestModel3(image: Blob | null, ctx: Model3Context, presets: Model3Presets, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Model3Reading> {
  if (image) try {
    const body = new FormData();
    body.append('image', image, 'frame.jpg'); body.append('captured_at', model3Time(ctx.date, ctx.minutes));
    body.append('lat', String(ctx.lat)); body.append('lon', String(ctx.lon)); body.append('cloud', String(ctx.cloud));
    body.append('speed_kmh', String(Math.max(1, ctx.speedKmh)));
    const r = await fetcher(`${apiBase}/predict/photo`, { method: 'POST', body, signal });
    if (r.ok) return parseModel3Reading(await r.json(), 'photo');
  } catch (e) { if (signal?.aborted) throw e; }
  try {
    const r = await fetcher(`${apiBase}/predict/features`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: 'simulator', features: {}, sun_alt: ctx.sunAlt, cloud: ctx.cloud, speed_kmh: Math.max(1, ctx.speedKmh) }]) });
    if (r.ok) { const rows = await r.json(); if (Array.isArray(rows)) return parseModel3Reading(rows[0], 'sun'); }
  } catch (e) { if (signal?.aborted) throw e; }
  return presetReading(presets, ctx.sunAlt, ctx.cloud);
}

/* ── 지하차도 하나를 지나는 동안의 장면 순서 ─────────────────────────── */
export interface Model3Section { s0: number; covered: boolean; toEntry: number; phase: string }
export interface Model3View { alert: Model3Reading | null; dark: number; countdown: number | null; elapsed: number; active: boolean; beep: boolean }
type Phase = 'idle' | 'requested' | 'warned' | 'dark' | 'done';
export function createModel3Scene(request: () => Promise<Model3Reading>) {
  let key: number | null = null, phase: Phase = 'idle', reading: Model3Reading | null = null, t = 0, token = 0;
  const reset = () => { key = null; phase = 'idle'; reading = null; t = 0; token++; };
  function update(section: Model3Section | null, dt: number, running = true): Model3View {
    const none: Model3View = { alert: null, dark: 0, countdown: null, elapsed: 0, active: false, beep: false };
    if (!running) { reset(); return none; }
    if (!section || (section.s0 !== key && key !== null && phase !== 'dark')) reset();
    if (!section) return none;
    // 출구 쪽(이미 지난 지하차도)에는 새 판정을 시작하지 않는다.
    if (phase === 'idle' && section.phase === 'approach' && section.toEntry <= MODEL3_CAPTURE_M) {
      key = section.s0; phase = 'requested'; const mine = ++token;
      request().then(r => { if (mine === token) reading = r; }, () => { /* 판정을 못 받으면 이 지하차도는 연출 없이 지나간다 */ });
    }
    if (key !== section.s0 && phase !== 'dark') return none;
    let beep = false;
    if (phase === 'requested' && reading && section.phase === 'approach' && section.toEntry <= reading.warn_distance_m) { phase = 'warned'; beep = true; }
    if ((phase === 'warned' || phase === 'requested') && section.covered) {
      if (reading) { phase = 'dark'; t = 0; } else phase = 'done';
    }
    if (phase === 'dark' && reading) {
      t += Math.max(0, Math.min(dt, .1));
      const e = reading.screen_effect;
      if (t >= e.recover_s) { phase = 'done'; return { ...none, elapsed: t, active: true }; }
      const countdown = Math.max(1, Math.ceil(e.recover_s - t));
      return { alert: null, dark: darkAt(e, t), countdown, elapsed: t, active: true, beep: false };
    }
    if (phase === 'done' && section.covered) {
      t += Math.max(0, Math.min(dt, .1));
      return { ...none, elapsed: t, active: true };
    }
    if (phase === 'warned') return { alert: reading, dark: 0, countdown: null, elapsed: 0, active: true, beep };
    return { ...none, active: false };
  }
  return { update, reset, get reading() { return reading; } };
}

/** 알림음: 짧게 두 번. 소리를 못 내는 환경이면 조용히 넘어간다. */
let ctx: AudioContext | null = null;
export function model3Beep(grade: Model3Grade) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return; ctx ??= new AC(); void ctx.resume();
    const f = { 하: 660, 중: 780, 상: 920 }[grade], now = ctx.currentTime;
    for (const start of [0, .22]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(.18, now + start + .02); g.gain.exponentialRampToValueAtTime(.001, now + start + .16);
      o.connect(g).connect(ctx.destination); o.start(now + start); o.stop(now + start + .18);
    }
  } catch { /* 소리 없이 진행 */ }
}
