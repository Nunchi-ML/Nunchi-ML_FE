import { useEffect, useRef, useState } from 'react';
import { getEngine } from '../game/engine';
import { Back } from './Phone';

const NAMES = ['정상', '눈부심', '심한 눈부심'], COLS = ['#3BA55C', '#FF8A1F', '#F2522E'];
let acknowledged = false;

interface Reading { lv: number; p: [number, number, number]; why: string[]; ring: { x: number; y: number } | null }

/** 화면 숫자로 만든 임시 규칙 — 학습한 모델 ②가 아님. API가 연결되면 서버 판정으로 바꾼다 */
function analyze(g: CanvasRenderingContext2D, W: number, H: number): Reading {
  const d = g.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H);
  let white = 0, lowSat = 0;
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], L = 0.299 * r + 0.587 * gg + 0.114 * b;
    lum[i] = L; if (L > 245) white++; if (Math.max(r, gg, b) - Math.min(r, gg, b) < 20) lowSat++;
  }
  let blob = 0, cells = 0, mx = -1, mxi = 0;
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    let s = 0; for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) s += lum[(y + yy) * W + x + xx] || 0;
    s /= 64; cells++; if (s > 230) blob++; if (s > mx) { mx = s; mxi = y * W + x; }
  }
  let lap = 0, nl = 0;
  for (let y = Math.floor(H * .6); y < H * .85; y++) for (let x = Math.floor(W * .2) + 1; x < W * .8 - 1; x++) {
    const i = y * W + x, l = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W]; lap += l * l; nl++;
  }
  const wr = white / (W * H), bb = blob / cells, sharp = lap / nl, ls = lowSat / (W * H);
  const score = Math.min(1, wr * 5 + bb * 3 + Math.max(0, 1 - sharp / 900) * 0.35 + ls * 0.15);
  const p2 = Math.max(0, Math.min(1, (score - 0.45) / 0.35)), p0 = Math.max(0, Math.min(1, (0.35 - score) / 0.3)), p1 = Math.max(0, 1 - p0 - p2);
  const lv = p2 > 0.5 ? 2 : p0 > 0.5 ? 0 : 1;
  const bx = (mxi % W) / W, by = Math.floor(mxi / W) / H, why: string[] = [];
  if (bb > 0.04) why.push('밝은 빛 덩어리 큼'); if (wr > 0.03) why.push('하얗게 날아간 부분 많음');
  if (mx > 200) why.push(`가장 밝은 곳 ${bx < .4 ? '왼쪽' : bx > .6 ? '오른쪽' : '가운데'} ${by < .4 ? '위' : '아래'}`);
  if (sharp < 500) why.push('도로 윤곽 흐림'); if (!why.length) why.push('또렷함');
  return { lv, p: [p0, p1, p2], why, ring: lv >= 1 && mx > 200 ? { x: bx, y: by } : null };
}

export function CameraApp() {
  const [src, setSrc] = useState<'real' | 'game'>('game');
  const [ack, setAck] = useState(acknowledged);
  const [r, setR] = useState<Reading | null>(null);
  const [hist, setHist] = useState<number[]>([]);
  const [err, setErr] = useState('');
  const cv = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, alive = true;
    setHist([]); setErr('');
    const tick = () => {
      const c = cv.current, g = c?.getContext('2d', { willReadFrequently: true }); if (!c || !g) return;
      const from: HTMLVideoElement | HTMLCanvasElement | undefined = src === 'real' && stream ? video.current ?? undefined : getEngine()?.canvas;
      if (!from) return;
      const sw = (from as HTMLVideoElement).videoWidth || (from as HTMLCanvasElement).width, sh = (from as HTMLVideoElement).videoHeight || (from as HTMLCanvasElement).height;
      if (!sw) return;
      const tw = sh * c.width / c.height, sx = (sw - tw) / 2;
      g.drawImage(from, Math.max(0, sx), 0, Math.min(tw, sw), sh, 0, 0, c.width, c.height);
      const res = analyze(g, c.width, c.height);
      setR(res); setHist(h => [...h.slice(-29), res.lv]);
    };
    (async () => {
      if (src === 'real') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
          video.current!.srcObject = stream; await video.current!.play();
        } catch { setErr('카메라를 열 수 없어요 (권한 또는 https 필요). 시뮬레이터 화면으로 시험해 보세요.'); setSrc('game'); return; }
      }
      timer = window.setInterval(tick, 500); tick();
    })();
    return () => { alive = false; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [src]);

  const lv = r?.lv ?? 0;
  return (
    <div className="pv">
      <Back />
      <h3>눈부심 카메라</h3>
      {!ack && <div className="safety">실제 운전 중에는 <b>동승자만</b> 사용하세요. 카메라 화면은 판정만 하고 <b>저장하지 않아요.</b><br />
        <button className="pbtn" style={{ marginTop: 8, width: '100%' }} onClick={() => { acknowledged = true; setAck(true); }}>확인</button></div>}
      <div className="srcs">
        <button className={src === 'real' ? 'on' : ''} onClick={() => setSrc('real')}>실제 카메라</button>
        <button className={src === 'game' ? 'on' : ''} onClick={() => setSrc('game')}>시뮬레이터 화면 · 실험</button>
      </div>
      <div className="cam">
        <video ref={video} playsInline muted className={src === 'real' ? '' : 'hidden'} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
        <canvas ref={cv} width={240} height={320} />
        <div className="lv" style={{ background: COLS[lv] }}>{NAMES[lv]}</div>
        {r?.ring && <div className="ring" style={{ display: 'block', left: `${r.ring.x * 100 + 2}%`, top: `${r.ring.y * 100 + 2}%` }} />}
      </div>
      <div className="bars">{(r?.p ?? [1, 0, 0]).map((p, i) => <div key={i} style={{ background: COLS[i], width: `${p * 100}%` }} />)}</div>
      <div className="small">{err || (r ? `규칙 점수 · 정상 ${Math.round(r.p[0] * 100)} · 눈부심 ${Math.round(r.p[1] * 100)} · 심함 ${Math.round(r.p[2] * 100)}` : '-')}</div>
      <div className="chips">{r?.why.map(w => <span key={w} className="chip">{w}</span>)}</div>
      <div className="tl">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ background: hist[i] == null ? '#E6DACB' : COLS[hist[i]] }} />)}</div>
      <div className="small">⚠️ 지금은 <b>임시 밝기 규칙</b>으로 판정해요 (모델 ② 아님). 학습한 모델 ②는 API가 준비되면 연결됩니다. 동그라미는 해가 아니라 <b>가장 밝은 곳</b>이에요.</div>
    </div>
  );
}
