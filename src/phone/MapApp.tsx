import { PreTripPanel } from '../components/PreTripPanel';
import { D } from '../game/road';
import { useGame } from '../store';
import { Back } from './Phone';
export function MapApp() {
  const st = useGame(s => s.settings), lo = Math.min(st.startKm,st.endKm), hi = Math.max(st.startKm,st.endKm);
  const passages = (D.underpasses ?? []).filter(u => u.s1 / 1000 >= lo && u.s0 / 1000 <= hi);
  if (st.endKm < st.startKm) passages.reverse();
  return <div className="pv"><Back /><h3>앞 구간 안내</h3><PreTripPanel inPhone />
    {passages.length > 0 && <details className="phone-fold"><summary>지하차도 {passages.length}곳 보기</summary><p>터널 안팎의 밝기 변화를 체험할 수 있어요.</p><div className="seglist">{passages.map(u => <div className="r" key={u.s0}><span>{u.name}</span><span>{((u.s0 + u.s1)/2000).toFixed(1)} km 부근</span></div>)}</div></details>}
  </div>;
}
