import { PreTripPanel } from '../components/PreTripPanel';
import { D } from '../game/road';
import { useGame } from '../store';
import { Back } from './Phone';
export function MapApp() {
  const st = useGame(s => s.settings), lo = Math.min(st.startKm,st.endKm), hi = Math.max(st.startKm,st.endKm);
  const passages = (D.underpasses ?? []).filter(u => u.s1 / 1000 >= lo && u.s0 / 1000 <= hi);
  if (st.endKm < st.startKm) passages.reverse();
  return <div className="pv"><Back /><h3>경로 사전 안내</h3><PreTripPanel inPhone />
    {passages.length > 0 && <div className="widget"><b>밝기 전환 체험 구간</b><p>도로변 사진 관측과 별도로 지하차도 출구의 밝기 변화와 회복 과정을 체험합니다. 실제 순응시간이나 사고확률 예측은 아닙니다.</p><div className="seglist">{passages.map(u => <div className="r" key={u.s0}><span>{u.name}</span><span>{((u.s0 + u.s1)/2000).toFixed(1)} km 부근</span></div>)}</div></div>}
    <div className="small">관측이 없는 구간을 정상으로 채우거나 현재 차량 사진의 정상 판정으로 이후 경고를 일괄 해제하지 않습니다.</div>
  </div>;
}
