import { getEngine } from '../game/engine';
import { D, riskAt, riskColor, sToKm, type Dir } from '../game/road';
import { IS_SINCHEON } from '../game/roadSelection';
import { adaptationScores, sceneLuminance } from '../game/adaptation';
import { simDate, sunPos } from '../game/sun';
import { useGame } from '../store';
import { Back } from './Phone';

export function MapApp() {
  const { startKm, endKm, date, minutes, weather } = useGame(s => s.settings);
  const e = getEngine();
  const dir: Dir = endKm >= startKm ? 'E' : 'W', lo = Math.min(startKm, endKm), hi = Math.max(startKm, endKm);
  const now = e ? sToKm(e.S.s) : startKm;
  if (IS_SINCHEON) {
    const sun = sunPos(simDate(date, minutes)), A = adaptationScores(sceneLuminance(sun.alt, weather));
    const passages = (D.underpasses ?? []).filter(u => u.s1 / 1000 >= lo && u.s0 / 1000 <= hi);
    if (dir === 'W') passages.reverse();
    const difference = (score: number) => score > .66 ? '큼' : score > .33 ? '보통' : '작음';
    return <div className="pv"><Back /><h3>지하차도 밝기 변화</h3>
      <div className="small">선택한 시간과 날씨에서 지하차도 안팎의 밝기 차이를 살펴봐요. 장면 밝기를 가정한 체험 안내입니다.</div>
      <div className="seglist">{passages.map(u => <div key={u.s0} className="r">
        <span>{u.name}<small style={{ display: 'block' }}>{((u.s0 + u.s1) / 2000).toFixed(1)} km 부근</small></span>
        <b>진입 차이 {difference(A.entry)}<br />진출 차이 {difference(A.exit)}</b>
      </div>)}</div>
    </div>;
  }
  const rows: { km: number; name: string; ratio: number }[] = [];
  for (let km = lo; km < hi; km += 0.4) { const r = riskAt(km, dir); rows.push({ km, ...r }); }
  return (
    <div className="pv">
      <Back />
      <h3>위험 지도</h3>
      <div className="small">이번 코스 구간별 위험 (평균 구간 대비) · <b>체험용 예시값</b>이에요. 모델 ① 고속도로 결과는 준비 중</div>
      <div className="seglist">
        {rows.map(r => (
          <div key={r.km} className={`r${Math.abs(r.km - now) < 0.2 ? ' me' : ''}`}>
            <span>{r.name}</span><b style={{ color: riskColor(r.ratio) }}>{r.ratio.toFixed(1)}배</b>
          </div>
        ))}
      </div>
    </div>
  );
}
