import { getEngine } from '../game/engine';
import { useGame } from '../store';

export function Result() {
  const r = useGame(s => s.result);
  if (!r) return null;
  const tip = r.glareSec < 1 ? '이번 코스에선 해가 정면에 오지 않았어요. 시간이나 방향을 바꿔 보세요.'
    : r.glareMax > 60 ? '눈부심 속에서 60 km/h를 넘겼어요. 해가 정면이면 앞차가 잘 안 보여요. 미리 속도를 줄여 보세요.'
    : '눈부심 구간에서 속도를 잘 줄였어요!';
  return (
    <div id="result"><div className="box">
      <div className="small" style={{ color: '#d9c7ad' }}>도착</div>
      <h2>{r.title}</h2>
      <div className="grid">
        <div>안전 점수<b>{r.score}</b></div>
        <div>걸린 시간<b>{Math.floor(r.sec / 60)}분 {Math.round(r.sec % 60)}초</b></div>
        <div>눈부심 구간 주행<b>{Math.round(r.glareSec)}초</b></div>
        <div>눈부심 속 최고 속도<b>{Math.round(r.glareMax)} km/h</b></div>
      </div>
      <div className="small" style={{ color: '#d9c7ad' }}>{tip} 안전 점수는 시뮬레이터 규칙이에요.</div>
      <button style={{ background: 'var(--sun)', color: 'var(--ink)' }} onClick={() => getEngine()?.startRun()}>같은 코스 다시</button>
      <button style={{ background: 'transparent', color: 'var(--cream)', border: '1px solid #fff4' }} onClick={() => getEngine()?.toMenu()}>코스 고르기</button>
    </div></div>
  );
}
