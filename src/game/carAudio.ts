/** 주행 소리(엔진 · 타이어 · 바람)와 안내 알림음. 소리 파일 없이 Web Audio로 만든다.
 * 휴대폰 스피커는 300 Hz 아래를 거의 못 내서, 낮은 소리만 쓰면 아무것도 안 들린다.
 * 그래서 엔진은 '배음(2~8차)'을 부드러운 사인파로 겹쳐 200~800 Hz에서 들리게 하고,
 * 타이어 소리는 250~900 Hz 대역의 분홍 소음으로 만든다. 날카로운 고음(2 kHz 이상)은 쓰지 않는다. */
type Ctx = AudioContext;
let ctx: Ctx | null = null;

/** 클릭·터치 같은 사용자 동작 안에서 불러야 소리가 난다(브라우저 자동재생 정책). */
export function audioContext(): Ctx | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  // iPhone: 무음 스위치가 켜져 있으면 웹 소리가 꺼지는 문제 → 재생(playback) 종류로 지정
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) try { session.type = 'playback'; } catch { /* 지원 안 함 */ }
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
}
/** 화면을 처음 누를 때 소리를 깨운다(출발 버튼 전에 다른 곳을 눌러도 되게, 탭 전환 뒤에도 다시). */
if (typeof window !== 'undefined') {
  const unlock = () => { if (ctx) { if (ctx.state !== 'running') void ctx.resume(); } };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
}

/** 음성 안내 앞의 부드러운 두 음 알림(딩-동). 말을 시작할 때까지 기다릴 시간(초)을 돌려준다. */
export function chime(): number {
  const c = audioContext(); if (!c) return 0;
  const t = c.currentTime + .02;
  ([[784, 0], [1047, .16]] as const).forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.12, t + d + .02); g.gain.exponentialRampToValueAtTime(.0005, t + d + .55);
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

/** 분홍 소음(고음이 적고 고르게 '쏴-' 하는 소리). 흰 소음보다 덜 거슬린다. */
function pinkNoise(c: Ctx, seconds: number) {
  const len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
    b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926; peak = Math.max(peak, Math.abs(d[i]));
  }
  // 처음과 끝을 이어 붙여 반복할 때 '틱' 소리가 나지 않게
  const fade = Math.floor(c.sampleRate * .05);
  for (let i = 0; i < len; i++) { d[i] /= peak || 1; if (i < fade) d[i] *= i / fade; if (i > len - fade) d[i] *= (len - i) / fade; }
  return buf;
}
const band = (c: Ctx, type: BiquadFilterType, f: number, q = .7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

export function createCarAudio() {
  let nodes: null | {
    master: GainNode; engGain: GainNode; eng: OscillatorNode; engFilter: BiquadFilterNode;
    tireGain: GainNode; tireBand: BiquadFilterNode; windGain: GainNode;
    sources: AudioScheduledSourceNode[]; connections: AudioNode[];
  } = null;
  function build(c: Ctx) {
    const master = c.createGain(); master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.knee.value = 12;
    master.connect(comp).connect(c.destination);
    // 엔진: 기본음(점화 주파수)은 아주 작게, 2~8차 배음을 부드러운 사인 합으로. 1.2 kHz 위는 걸러 날카로움 제거
    const amp = [0, .25, .9, .55, .7, .35, .3, .15, .1];
    const wave = c.createPeriodicWave(new Float32Array(amp.length), new Float32Array(amp));
    const eng = c.createOscillator(); eng.setPeriodicWave(wave);
    const engFilter = band(c, 'lowpass', 900, .4), engHp = band(c, 'highpass', 120, .5);
    const engGain = c.createGain(); engGain.gain.value = 0;
    eng.connect(engHp).connect(engFilter).connect(engGain).connect(master);
    // 타이어·노면: 분홍 소음을 250~900 Hz로. 속도가 빨라질수록 크고 약간 높게
    const tire = c.createBufferSource(); tire.buffer = pinkNoise(c, 3); tire.loop = true;
    const tireBand = band(c, 'bandpass', 400, .6), tireLp = band(c, 'lowpass', 1400, .5);
    const tireGain = c.createGain(); tireGain.gain.value = 0;
    tire.connect(tireBand).connect(tireLp).connect(tireGain).connect(master);
    // 바람: 빠를 때만 아주 작게, 천천히 커졌다 작아지는 돌풍
    const wind = c.createBufferSource(); wind.buffer = pinkNoise(c, 4.3); wind.loop = true;
    const windBand = band(c, 'bandpass', 700, .5), windLp = band(c, 'lowpass', 1800, .4);
    const windGain = c.createGain(); windGain.gain.value = 0;
    const gust = c.createGain(); gust.gain.value = 1;
    const lfo = c.createOscillator(), lfoDepth = c.createGain(); lfo.frequency.value = .11; lfoDepth.gain.value = .35;
    lfo.connect(lfoDepth).connect(gust.gain);
    wind.connect(windBand).connect(windLp).connect(windGain).connect(gust).connect(master);
    eng.start(); tire.start(); wind.start(); lfo.start();
    nodes = { master, engGain, eng, engFilter, tireGain, tireBand, windGain,
      sources: [eng, tire, wind, lfo],
      connections: [master, comp, eng, engFilter, engHp, engGain, tire, tireBand, tireLp, tireGain, wind, windBand, windLp, windGain, gust, lfo, lfoDepth] };
  }
  return {
    /** 출발 버튼 클릭 안에서 부른다. */
    start() { const c = audioContext(); if (c && !nodes) build(c); },
    /** 매 프레임: on=false면 서서히 조용해진다(휴대폰을 보거나 메뉴일 때). */
    update(on: boolean, kmh: number, throttle: number) {
      if (!nodes || !ctx) return;
      const t = ctx.currentTime, k = .2, v = Math.max(0, Math.min(1, kmh / 110));
      nodes.master.gain.setTargetAtTime(on ? 1 : 0, t, .3);
      // 실제 점화음(회전당 2번)의 한 옥타브 위를 기본음으로: 공회전도 휴대폰 스피커에서 들리게
      const rpm = engineRpm(kmh, throttle), f = rpm / 60 * 4;
      nodes.eng.frequency.setTargetAtTime(f, t, k);
      nodes.engFilter.frequency.setTargetAtTime(600 + rpm / 6 + throttle * 200, t, k);
      nodes.engGain.gain.setTargetAtTime(.11 + throttle * .08 + (rpm - 800) / 2200 * .05, t, k);
      nodes.tireGain.gain.setTargetAtTime(v * .42, t, k); nodes.tireBand.frequency.setTargetAtTime(300 + v * 300, t, k);
      nodes.windGain.gain.setTargetAtTime(Math.max(0, v - .35) ** 2 * .35, t, k);
    },
    stop() { if (nodes && ctx) nodes.master.gain.setTargetAtTime(0, ctx.currentTime, .15); },
    /** Engine teardown must stop looping sources, not only mute their output. */
    dispose() {
      if (!nodes) return;
      nodes.sources.forEach(source => source.stop());
      nodes.connections.forEach(node => node.disconnect());
      nodes = null;
    },
  };
}
