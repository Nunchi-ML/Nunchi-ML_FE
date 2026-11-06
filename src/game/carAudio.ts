/** 주행 소리(엔진 · 노면 · 바람)와 안내 알림음. 소리 파일 없이 Web Audio로 만든다. */
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

export function createCarAudio() {
  let nodes: null | {
    master: GainNode; engGain: GainNode; eng1: OscillatorNode; eng2: OscillatorNode; engFilter: BiquadFilterNode;
    roadGain: GainNode; roadFilter: BiquadFilterNode; windGain: GainNode;
  } = null;
  function build(c: Ctx) {
    const master = c.createGain(); master.gain.value = 0; master.connect(c.destination);
    // 엔진: 낮은 톱니파·삼각파를 살짝 어긋나게 겹쳐 웅웅거림을 만들고 저역만 통과
    const engFilter = c.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 260; engFilter.Q.value = .7;
    const engGain = c.createGain(); engGain.gain.value = 0;
    const eng1 = c.createOscillator(), eng2 = c.createOscillator(); eng1.type = 'sawtooth'; eng2.type = 'triangle';
    eng1.connect(engFilter); eng2.connect(engFilter); engFilter.connect(engGain).connect(master);
    // 노면: 낮은 웅웅거림(갈색 소음), 바람: 흰 소음을 중역만 통과. 둘 다 속도에 비례
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { b = .985 * b + .015 * (Math.random() * 2 - 1); d[i] = b * 6; }
    const road = c.createBufferSource(); road.buffer = buf; road.loop = true;
    const roadFilter = c.createBiquadFilter(); roadFilter.type = 'lowpass'; roadFilter.frequency.value = 400;
    const roadGain = c.createGain(); roadGain.gain.value = 0; road.connect(roadFilter).connect(roadGain).connect(master);
    const wbuf = c.createBuffer(1, len, c.sampleRate), wd = wbuf.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    const wind = c.createBufferSource(); wind.buffer = wbuf; wind.loop = true;
    const windFilter = c.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 900; windFilter.Q.value = .5;
    const windGain = c.createGain(); windGain.gain.value = 0; wind.connect(windFilter).connect(windGain).connect(master);
    eng1.start(); eng2.start(); road.start(); wind.start();
    nodes = { master, engGain, eng1, eng2, engFilter, roadGain, roadFilter, windGain };
  }
  return {
    /** 출발 버튼 클릭 안에서 부른다. */
    start() { const c = audioContext(); if (c && !nodes) build(c); },
    /** 매 프레임: on=false면 서서히 조용해진다(휴대폰을 보거나 메뉴일 때). */
    update(on: boolean, kmh: number, throttle: number) {
      if (!nodes || !ctx) return;
      const t = ctx.currentTime, k = .12, v = Math.max(0, Math.min(1, kmh / 110));
      nodes.master.gain.setTargetAtTime(on ? 1 : 0, t, .25);
      const rpm = engineRpm(kmh, throttle), f = rpm / 60 * 2;                // 4기통: 한 바퀴에 두 번 폭발 → 기본음
      nodes.eng1.frequency.setTargetAtTime(f, t, k); nodes.eng2.frequency.setTargetAtTime(f * 1.007, t, k);
      nodes.engFilter.frequency.setTargetAtTime(180 + rpm / 12 + throttle * 120, t, k);
      nodes.engGain.gain.setTargetAtTime(.05 + throttle * .05 + (rpm - 800) / 2200 * .03, t, k);
      nodes.roadGain.gain.setTargetAtTime(.02 + v * .09, t, k); nodes.roadFilter.frequency.setTargetAtTime(250 + v * 500, t, k);
      nodes.windGain.gain.setTargetAtTime(v * v * .035, t, k);
    },
    stop() { if (nodes && ctx) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, .15); },
  };
}
