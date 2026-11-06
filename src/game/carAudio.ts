/** 주행 소리(엔진 · 노면 · 바람)와 안내 알림음. 소리 파일 없이 Web Audio로 만든다.
 * 차 안에서 들리는 소리처럼: 날카로운 파형·흰 소음 대신 낮고 둥근 소리만 쓰고, 크기도 작게 둔다. */
type Ctx = AudioContext;
let ctx: Ctx | null = null;

/** 클릭 같은 사용자 동작 안에서 처음 불러야 소리가 난다(브라우저 자동재생 정책). */
export function audioContext(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 음성 안내 앞의 부드러운 두 음 알림(딩-동). 말을 시작할 때까지 기다릴 시간(초)을 돌려준다. */
export function chime(): number {
  const c = audioContext(); if (!c) return 0;
  const t = c.currentTime + .02;
  ([[784, 0], [1047, .16]] as const).forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.09, t + d + .02); g.gain.exponentialRampToValueAtTime(.0005, t + d + .55);
    o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + .6);
  });
  return .38;
}

/** 엔진 회전수: 속도에 따라 5단 자동변속처럼 오르내린다. */
export function engineRpm(kmh: number, throttle: number) {
  const tops = [20, 40, 62, 88, 999];
  const gear = tops.findIndex(top => kmh < top);
  const lo = gear ? tops[gear - 1] : 0, hi = Math.min(tops[gear], 130);
  const r = Math.max(0, Math.min(1, (kmh - lo) / (hi - lo)));
  return 800 + r * 2200 * (gear ? .75 : 1) + throttle * 250;
}

/** 낮은 소리 위주의 소음(갈색 소음). 흰 소음처럼 '쉬-' 하는 소리가 나지 않는다. */
function brownNoise(c: Ctx, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let b = 0, peak = 0;
  for (let i = 0; i < len; i++) { b = (b + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b; peak = Math.max(peak, Math.abs(b)); }
  // 처음과 끝을 이어 붙여 반복할 때 '틱' 소리가 나지 않게
  const fade = Math.floor(c.sampleRate * .05);
  for (let i = 0; i < len; i++) { d[i] /= peak || 1; if (i < fade) d[i] *= i / fade; if (i > len - fade) d[i] *= (len - i) / fade; }
  return buf;
}

export function createCarAudio() {
  let nodes: null | {
    master: GainNode; engGain: GainNode; eng: OscillatorNode; engSub: OscillatorNode; engFilter: BiquadFilterNode;
    roadGain: GainNode; roadFilter: BiquadFilterNode; windGain: GainNode; windFilter: BiquadFilterNode;
  } = null;
  function build(c: Ctx) {
    const master = c.createGain(); master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3;
    master.connect(comp).connect(c.destination);
    // 엔진: 배음이 빨리 줄어드는 둥근 파형(톱니파 X) + 한 옥타브 아래 사인파. 저역만 통과시켜 '웅-' 하는 실내음
    const harmonics = [0, 1, .6, .4, .25, .15, .08];
    const wave = c.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
    const eng = c.createOscillator(); eng.setPeriodicWave(wave);
    const engSub = c.createOscillator(); engSub.type = 'sine';
    const engFilter = c.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 220; engFilter.Q.value = .3;
    const subGain = c.createGain(); subGain.gain.value = .35;
    const engGain = c.createGain(); engGain.gain.value = 0;
    eng.connect(engFilter); engSub.connect(subGain).connect(engFilter); engFilter.connect(engGain).connect(master);
    // 노면: 타이어가 굴러가는 낮은 웅웅거림
    const road = c.createBufferSource(); road.buffer = brownNoise(c, 3); road.loop = true;
    const roadHp = c.createBiquadFilter(); roadHp.type = 'highpass'; roadHp.frequency.value = 35;
    const roadFilter = c.createBiquadFilter(); roadFilter.type = 'lowpass'; roadFilter.frequency.value = 160; roadFilter.Q.value = .4;
    const roadGain = c.createGain(); roadGain.gain.value = 0;
    road.connect(roadHp).connect(roadFilter).connect(roadGain).connect(master);
    // 바람: 높은 '쉬-' 소리는 빼고 부드러운 '후-'만. 느린 흔들림(돌풍)을 줘서 기계음처럼 들리지 않게
    const wind = c.createBufferSource(); wind.buffer = brownNoise(c, 4.3); wind.loop = true;
    const windHp = c.createBiquadFilter(); windHp.type = 'highpass'; windHp.frequency.value = 220;
    const windFilter = c.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 450; windFilter.Q.value = .2;
    const windGain = c.createGain(); windGain.gain.value = 0;
    const gust = c.createGain(); gust.gain.value = 1;
    const lfo = c.createOscillator(), lfoDepth = c.createGain(); lfo.frequency.value = .11; lfoDepth.gain.value = .3;
    lfo.connect(lfoDepth).connect(gust.gain);
    wind.connect(windHp).connect(windFilter).connect(windGain).connect(gust).connect(master);
    eng.start(); engSub.start(); road.start(); wind.start(); lfo.start();
    nodes = { master, engGain, eng, engSub, engFilter, roadGain, roadFilter, windGain, windFilter };
  }
  return {
    /** 출발 버튼 클릭 안에서 부른다. */
    start() { const c = audioContext(); if (c && !nodes) build(c); },
    /** 매 프레임: on=false면 서서히 조용해진다(휴대폰을 보거나 메뉴일 때). */
    update(on: boolean, kmh: number, throttle: number) {
      if (!nodes || !ctx) return;
      const t = ctx.currentTime, k = .2, v = Math.max(0, Math.min(1, kmh / 110));
      nodes.master.gain.setTargetAtTime(on ? .9 : 0, t, .3);
      const rpm = engineRpm(kmh, throttle), f = rpm / 60 * 2;                // 4기통: 한 바퀴에 두 번 폭발 → 기본음
      nodes.eng.frequency.setTargetAtTime(f, t, k); nodes.engSub.frequency.setTargetAtTime(f / 2, t, k);
      nodes.engFilter.frequency.setTargetAtTime(240 + rpm / 9 + throttle * 120, t, k);   // 휴대폰 스피커로도 들리게 중저역까지
      nodes.engGain.gain.setTargetAtTime(.035 + throttle * .03 + (rpm - 800) / 2200 * .015, t, k);
      nodes.roadGain.gain.setTargetAtTime(v * .16, t, k); nodes.roadFilter.frequency.setTargetAtTime(180 + v * 320, t, k);
      nodes.windGain.gain.setTargetAtTime(v * v * .09, t, k); nodes.windFilter.frequency.setTargetAtTime(420 + v * 480, t, k);
    },
    stop() { if (nodes && ctx) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, .15); },
  };
}
