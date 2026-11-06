import { getEngine } from '../game/engine';
import { useGame } from '../store';

export function Result() {
  const r = useGame(s => s.result);
  if (!r) return null;
  const tip = r.passages.length ? '지하차도 내부와 출구의 밝기 변화를 관찰했어요. 관찰 기록을 펼쳐 지붕 아래 머문 시간을 비교해 보세요.' : r.glareSec < 1 ? '이번 주행에서는 정면 햇빛 눈부심이 기록되지 않았어요. 시간·방향·가림 조건에 따라 달라져요.'
    : r.glareMax > 60 ? '눈부심 속에서 60 km/h를 넘겼어요. 해가 정면이면 앞차가 잘 안 보여요. 미리 속도를 줄여 보세요.'
    : '눈부심 구간에서 속도를 잘 줄였어요!';
  return (
    <div id="result"><div className="box">
      <div className="small" style={{ color: '#d9c7ad' }}>도착</div>
      <h2>{r.title}</h2>
      <div className="grid">
        <div>걸린 시간<b>{Math.floor(Math.round(r.sec) / 60)}분 {Math.round(r.sec) % 60}초</b></div>
        <div>정면 햇빛 구간<b>{Math.round(r.glareSec)}초</b></div>
        <div>그 구간 최고 속도<b>{Math.round(r.glareMax)} km/h</b></div>
      </div>
      {!!r.passages.length && <details className="result-passages"><summary>밝기 전환 관찰 기록 · {r.passages.length}개 구간</summary>
        {r.passages.map((p, i) => <p key={i}><b>{p.name}</b> · 지붕 약 {Math.round(p.roofM)} m<br />지붕 아래 {p.seconds.toFixed(1)}초 · {p.completed ? '통과 완료' : '부분 통과'}</p>)}
        <small>시뮬레이션 내부 체류 시간이며 실제 순응시간·모델 정확도가 아닙니다.</small>
      </details>}
      <div className="small" style={{ color: '#d9c7ad' }}>{tip} 이 기록은 노출 감소·사고 예방 효과를 평가한 결과가 아닙니다.</div>
      <div className="result-actions"><button style={{ background: 'var(--sun)', color: 'var(--ink)' }} onClick={() => getEngine()?.startRun()}>같은 코스 다시</button>
      <button style={{ background: 'transparent', color: 'var(--cream)', border: '1px solid #fff4' }} onClick={() => getEngine()?.toMenu()}>코스 고르기</button></div>
    </div></div>
  );
}
