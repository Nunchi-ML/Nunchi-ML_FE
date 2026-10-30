import { getEngine } from '../game/engine';
import { riskAt, riskColor, sToKm, type Dir } from '../game/road';
import { useGame } from '../store';
import { Back } from './Phone';

export function MapApp() {
  const { startKm, endKm } = useGame(s => s.settings);
  const e = getEngine();
  const dir: Dir = endKm >= startKm ? 'E' : 'W', lo = Math.min(startKm, endKm), hi = Math.max(startKm, endKm);
  const now = e ? sToKm(e.S.s) : startKm;
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
