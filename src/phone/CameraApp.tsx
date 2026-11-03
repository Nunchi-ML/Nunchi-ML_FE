import { useEffect, useRef, useState } from 'react';
import { getEngine } from '../game/engine';
import { Back } from './Phone';
import { frameSize, MAX_IMAGE_BYTES, predictGlare, type GlareReading } from './glareApi';

const NAMES = ['정상', '눈부심', '많이 눈부심'], COLS = ['#3BA55C', '#FF8A1F', '#F2522E'];
let acknowledged = false;
export function CameraApp() {
  const [src, setSrc] = useState<'real' | 'game'>('game');
  const [ack, setAck] = useState(acknowledged);
  const [reading, setReading] = useState<GlareReading | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [state, setState] = useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [aspect, setAspect] = useState(4 / 3);
  const canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let alive = true, stream: MediaStream | null = null, timer = 0;
    let controller: AbortController | null = null;
    setReading(null); setHistory([]); setError(''); setState('waiting');
    if (!ack) return;
    const analyze = async () => {
      if (!alive) return;
      const from = src === 'real' ? video.current : getEngine()?.canvas;
      const c = canvas.current, g = c?.getContext('2d');
      if (!from || !c || !g) { timer = window.setTimeout(analyze, 500); return; }
      const width = from instanceof HTMLVideoElement ? from.videoWidth : from.width;
      const height = from instanceof HTMLVideoElement ? from.videoHeight : from.height;
      const size = frameSize(width, height);
      if (!size) { timer = window.setTimeout(analyze, 500); return; }
      c.width = size.width; c.height = size.height; setAspect(width / height);
      setReading(null); setState('loading');
      let timeout = 0;
      try {
        // 전체 프레임, 비율 유지, 확대 없음, JPEG95. 요청을 겹치지 않는다.
        g.drawImage(from, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob | null>(resolve => c.toBlob(resolve, 'image/jpeg', 0.95));
        if (!alive) return;
        if (!blob || blob.size > MAX_IMAGE_BYTES) {
          setState('error'); setError('이번 화면은 전송 용량을 넘었어요. 다음 프레임을 기다려 주세요.');
          timer = window.setTimeout(analyze, 3000); return;
        }
        controller = new AbortController();
        timeout = window.setTimeout(() => controller?.abort(), 90000);
        const result = await predictGlare(blob, src === 'real' ? 'camera' : 'game', controller.signal);
        if (!alive) return;
        setReading(result); setState('ready'); setError('');
        setHistory(h => [...h.slice(-29), result.level]);
        timer = window.setTimeout(analyze, 3000);
      } catch (e) {
        if (!alive) return;
        setReading(null); setState('error');
        setError(e instanceof DOMException && e.name === 'AbortError' ? '서버 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.'
          : e instanceof Error ? e.message : '분석에 실패했어요. 다시 시도해 주세요.');
      } finally { clearTimeout(timeout); }
    };
    void (async () => {
      try {
        if (src === 'real') {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
          video.current!.srcObject = stream; await video.current!.play();
        }
        if (alive) void analyze();
      } catch { if (alive) { setState('error'); setError('카메라를 열 수 없어요. 권한을 확인하거나 시뮬레이터 화면을 선택해 주세요.'); } }
    })();
    return () => { alive = false; clearTimeout(timer); controller?.abort(); stream?.getTracks().forEach(t => t.stop()); };
  }, [src, ack, retry]);
  const scores = reading ? [reading.scores.normal, reading.scores.glare, reading.scores.severe] : null;
  return (
    <div className="pv">
      <Back /><h3>눈부심 카메라 <small className="small">모델 ② · 시범</small></h3>
      {!ack && <div className="safety">실제 운전 중에는 <b>동승자만</b> 사용하세요. 분석을 시작하면 화면을 분석 서버로 전송해요. 서버는 사진을 저장하지 않아요.
        <button className="pbtn" onClick={() => { acknowledged = true; setAck(true); }}>확인하고 분석 시작</button></div>}
      <div className="srcs">
        <button className={src === 'real' ? 'on' : ''} disabled={!ack} onClick={() => setSrc('real')}>실제 카메라</button>
        <button className={src === 'game' ? 'on' : ''} onClick={() => setSrc('game')}>시뮬레이터 화면 · 실험</button>
      </div>
      <div className="cam" style={{ aspectRatio: aspect }}>
        <video ref={video} playsInline muted style={{ display: 'none' }} /><canvas ref={canvas} />
        <div className="lv" style={{ background: reading ? COLS[reading.level] : '#655d55' }}>
          {reading ? NAMES[reading.level] : state === 'loading' ? '분석 대기 중' : state === 'error' ? '판정 불가' : '분석 전'}
        </div>
        {reading && <div className="ring" style={{ display: 'block', left: `${reading.brightest.x * 100}%`, top: `${reading.brightest.y * 100}%` }} />}
      </div>
      <div role="status" aria-live="polite" className="small">{error || (reading
        ? `시범 모델 점수 · 정상 ${Math.round(reading.scores.normal * 100)} · 눈부심 ${Math.round(reading.scores.glare * 100)} · 많이 ${Math.round(reading.scores.severe * 100)}`
        : state === 'loading' ? '서버가 깨어나는 첫 분석은 최대 90초 걸릴 수 있어요.' : '확인 후 분석을 시작해 주세요.')}</div>
      {state === 'error' && <button className="pbtn" onClick={() => setRetry(n => n + 1)}>다시 분석</button>}
      {scores && <div className="bars">{scores.map((score, i) => <div key={i} style={{ background: COLS[i], width: `${score * 100}%` }} />)}</div>}
      <div className="tl">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ background: history[i] == null ? '#E6DACB' : COLS[history[i]] }} />)}</div>
      <div className="small">{reading && <>모델 {reading.model_version}<br /></>}동그라미는 가장 밝은 곳 후보예요. 점수는 사고확률이 아니며, 시뮬레이터 영상에 대한 정확도는 별도 검증이 필요해요.</div>
    </div>
  );
}
