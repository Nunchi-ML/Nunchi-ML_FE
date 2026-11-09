import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { getEngine } from '../game/engine';
import { Back } from './Phone';
import { frameSize, MAX_IMAGE_BYTES, predictGlare, predictPhotoG, realCameraContext, simulatorContext, type GlareReading, type PhotoGReading } from './glareApi';
import { sensorReadiness, startPhoneSensors, stopPhoneSensors } from './phoneSensors';
import { cameraGuidance } from './cameraGuidance';

const WEATHER_CHOICES: [string, string][] = [['clear', '맑음'], ['cloud', '구름'], ['over', '흐림']];
const COLS = ['#3BA55C', '#FF8A1F', '#F2522E'];
let acknowledged = false, startReal = false;
/** 메인 화면 버튼: 주행 없이 휴대폰을 열고 실제 카메라로 바로 시작한다. 클릭 안에서 불러야 iOS 방향 권한을 물을 수 있다. */
export function openGlareCamera() {
  startReal = true; void startPhoneSensors();
  useGame.setState({ phoneOpen: true, app: 'cam', camOnly: true });
}
export function CameraApp() {
  // 초기값 함수는 개발 모드에서 두 번 불릴 수 있어 읽기만 하고, 표시는 마운트 뒤에 지운다.
  const [src, setSrc] = useState<'real' | 'game'>(() => startReal ? 'real' : 'game');
  useEffect(() => { startReal = false; }, []);
  const [ack, setAck] = useState(acknowledged);
  const [reading, setReading] = useState<GlareReading | PhotoGReading | null>(null);
  const [state, setState] = useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [aspect, setAspect] = useState(4 / 3);
  const canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null);
  const [realWeather, setRealWeather] = useState('clear'), weatherRef = useRef('clear');
  const [basis, setBasis] = useState('');
  const sceneLevel = useGame(s => s.hud.glareLv);
  const guidance = cameraGuidance(reading?.level ?? null, src, sceneLevel);
  useEffect(() => () => stopPhoneSensors(), []);
  useEffect(() => {
    let alive = true, stream: MediaStream | null = null, timer = 0;
    let controller: AbortController | null = null;
    setReading(null); setError(''); setState('waiting');
    useGame.setState({ currentFrame: { state: 'unavailable' } });
    if (!ack) return;
    const analyze = async () => {
      if (!alive) return;
      const gameFrame = src === 'game' ? getEngine()?.captureCameraFrame() : null;
      const from = src === 'real' ? video.current : gameFrame?.image;
      const c = canvas.current, g = c?.getContext('2d');
      if (!from || !c || !g) { timer = window.setTimeout(analyze, 500); return; }
      const width = from instanceof HTMLVideoElement ? from.videoWidth : from.width;
      const height = from instanceof HTMLVideoElement ? from.videoHeight : from.height;
      const size = frameSize(width, height);
      if (!size) { timer = window.setTimeout(analyze, 500); return; }
      c.width = size.width; c.height = size.height; setAspect(width / height);
      setReading(null); setState('loading'); useGame.setState({ currentFrame: { state: 'analyzing' } });
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
        // 시뮬레이터 화면: 가상 카메라 위치·방향·화각과 설정 시각·날씨로 발표 선정 모델 판정.
        // 실제 카메라: 휴대폰 GPS·나침반·현재 시각·직접 고른 날씨로 선정 모델 판정. 센서를 못 받으면 시범 모델로 판정하고 이유를 밝힌다.
        const engine = getEngine();
        let result: GlareReading | PhotoGReading;
        if (src === 'game' && engine && gameFrame) {
          result = await predictPhotoG(blob, simulatorContext(gameFrame.metadata, size, useGame.getState().settings.date,
            engine.S.minutes, useGame.getState().settings.weather), controller.signal);
          setBasis('고정 화각의 가상 전방 카메라 · 시뮬레이터 설정 시각과 날씨');
        } else {
          const ready = sensorReadiness();
          if (ready.ok) {
            result = await predictPhotoG(blob, realCameraContext(ready, size, weatherRef.current), controller.signal);
            setBasis(`휴대폰 GPS · 방향 ${Math.round(ready.headingDeg)}° · 현재 시각 · 날씨 ${WEATHER_CHOICES.find(w => w[0] === weatherRef.current)?.[1]}(직접 선택) · 화각은 일반 휴대폰 값으로 가정`);
          } else {
            result = await predictGlare(blob, 'camera', controller.signal);
            setBasis(`${ready.reason} → 사진만 보는 시범 모델로 판정했어요`);
          }
        }
        if (!alive) return;
        setReading(result); setState('ready'); setError('');
        useGame.setState({ currentFrame: { state: 'ready', level: result.level, at: new Date().toISOString(), source: src === 'real' ? 'camera' : 'game' } });
      } catch (e) {
        if (!alive) return;
        setReading(null); setState('error'); useGame.setState({ currentFrame: { state: 'unavailable' } });
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
    return () => { useGame.setState({ currentFrame: { state: 'unavailable' } }); alive = false; clearTimeout(timer); controller?.abort(); stream?.getTracks().forEach(t => t.stop()); };
  }, [src, ack, retry]);
  return (
    <div className="pv">
      <Back /><h3>전방 눈부심</h3>
      <p className="phone-lead cam-desc">지금 사진의 눈부심을 확인해요.</p>
      {!ack && <div className="safety"><b>분석을 시작할까요?</b><p>사진과 촬영 정보(위치·방향·시각·날씨)를 분석 서버로 보냅니다.</p><details className="phone-fold"><summary>전송 정보 자세히</summary><p>시뮬레이터는 가상 촬영 정보를 사용해요. 실제 카메라는 휴대폰 권한이 필요하며, 센서 정보를 받지 못하면 사진만 분석해요.</p><p>사진과 위치는 저장하지 않아요.</p></details>
        <button className="pbtn" onClick={() => { acknowledged = true; setAck(true); }}>확인하고 분석 시작</button></div>}
      {/* 카메라와 판정 결과. 낮고 넓은 화면(휴대폰 가로)에서는 CSS가 둘을 좌우로 나란히 놓는다. */}
      <div className="cam-layout">
      <div className="cam-controls">
      <div className="srcs">
        <button className={src === 'real' ? 'on' : ''} disabled={!ack} onClick={() => { void startPhoneSensors(); setSrc('real'); }}>실제 카메라</button>
        <button className={src === 'game' ? 'on' : ''} onClick={() => { stopPhoneSensors(); setSrc('game'); }}>가상 주행 화면</button>
      </div>
      {src === 'real' && <div className="srcs" role="group" aria-label="지금 날씨">
        {WEATHER_CHOICES.map(([id, name]) => <button key={id} className={realWeather === id ? 'on' : ''} onClick={() => { weatherRef.current = id; setRealWeather(id); }}>지금 {name}</button>)}
      </div>}
      </div>
      <div className={`cam${aspect < 1 ? ' portrait' : ''}`} style={aspect < 1 ? { aspectRatio: aspect, width: 'auto', alignSelf: 'center', margin: '0 auto' } : { aspectRatio: aspect }}>
        <video ref={video} playsInline muted style={{ display: 'none' }} /><canvas ref={canvas} />
        <div className="lv" style={{ background: reading ? guidance.mismatch ? '#655d55' : COLS[reading.level] : '#655d55' }}>
          {reading ? `사진 · ${guidance.label}` : state === 'loading' ? '분석 대기 중' : state === 'error' ? '판정 불가' : '분석 전'}
        </div>
        {reading && 'brightest' in reading && <div className="ring" style={{ display: 'block', left: `${reading.brightest.x * 100}%`, top: `${reading.brightest.y * 100}%` }} />}
      </div>
      <div className="cam-info">
      <div role="status" aria-live="polite" className="phone-camera-status">{error || (reading
        ? guidance.detail
        : state === 'loading' ? '첫 분석은 최대 90초 걸릴 수 있어요.' : '확인 후 분석을 시작해 주세요.')}</div>
      {reading && basis && <details className="phone-fold"><summary>분석 방법 보기</summary><p>{basis}</p><p>현재 사진의 결과이며, 앞 구간의 상태를 뜻하지 않아요.</p></details>}
      {state === 'error' && <button className="pbtn" onClick={() => setRetry(n => n + 1)}>다시 분석</button>}
      {state === 'ready' && <button className="pbtn" onClick={() => setRetry(n => n + 1)}>다시 찍어 분석</button>}
      {guidance.mismatch && <p className="phone-scene-warning">주행 주의는 유지돼요.<br/>사진 분석과 주행 화면의 빛 상태가 다르게 나왔어요.</p>}
      </div>
      </div>
      <p className="phone-caption">{src === 'game' ? '가상 주행 화면을 분석합니다.' : '현재 카메라 사진을 분석합니다.'} 실제 운전 중에는 휴대폰을 조작하지 마세요.</p>
    </div>
  );
}
