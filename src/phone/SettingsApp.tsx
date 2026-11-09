import { getEngine } from '../game/engine';
import { hm } from '../game/sun';
import { useGame, type DriveMode, type Gfx, type Weather } from '../store';
import { Back } from './Phone';
function Seg<T extends string | number | boolean>({ items, value, on }: { items: [T, string][]; value: T; on: (v: T) => void }) {
  return <div className="seg">{items.map(([v, t]) => <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => on(v)}>{t}</button>)}</div>;
}
export function SettingsApp() {
  const st = useGame(s => s.settings), set = useGame(s => s.set);
  const setMinutes = (m: number) => { set({ minutes: m }); const e = getEngine(); if (e) e.S.minutes = m; };
  return <div className="pv"><Back /><h3>설정</h3><div className="set">
    <div className="row"><label>음성 안내</label><Seg items={[[true,'켜기'],[false,'끄기']]} value={st.voice} on={v=>set({voice:v})}/></div>
    <div className="row"><label>차 소리</label><Seg items={[[true,'켜기'],[false,'끄기']]} value={st.carSound} on={v=>set({carSound:v})}/></div>
    <div className="row"><label>시야 안내</label><Seg items={[[true,'켜기'],[false,'끄기']]} value={st.guidance} on={v=>set({guidance:v})}/></div>
    <div className="row"><label>LCD 차광판</label><Seg items={[[true,'켜기'],[false,'끄기']]} value={st.glass} on={v=>set({glass:v})}/></div>
    <details className="phone-fold"><summary>안내 기준</summary>
      <div className="row"><label>안내 시점</label><Seg items={[['standard','보통'],['sensitive','조금 일찍']]} value={st.sensitivity} on={v=>set({sensitivity:v as typeof st.sensitivity})}/></div>
      <div className="row"><label>경로 선호</label><Seg items={[['arrival','빠른 도착'],['exposure','눈부심 회피']]} value={st.preference} on={v=>set({preference:v as typeof st.preference})}/></div>
      <div className="row"><label>추가 시간</label><Seg items={[[0,'0분'],[3,'3분'],[5,'5분'],[10,'10분']]} value={st.extraMinutes} on={v=>set({extraMinutes:v})}/></div>
      <div className="row"><label>추가 거리</label><Seg items={[[0,'0 km'],[1,'1 km'],[2,'2 km'],[5,'5 km']]} value={st.extraKm} on={v=>set({extraKm:v})}/></div>
      <p>안내 시점만 바뀌며 눈부심 판정은 바뀌지 않아요.</p>
    </details>
    <details className="phone-fold"><summary>시간과 날씨</summary>
      <div className="row"><label>시간</label><input aria-label="시뮬레이션 시간" type="range" min={0} max={1439} value={Math.round(st.minutes)} onChange={e=>setMinutes(+e.target.value)}/><span className="num">{hm(st.minutes)}</span></div>
      <div className="row"><label>시간 흐름</label><Seg items={[[0,'고정'],[1,'1배'],[10,'10배'],[60,'60배']]} value={st.flow} on={v=>set({flow:v})}/></div>
      <div className="row"><label>날씨</label><Seg<Weather> items={[['clear','맑음'],['cloud','구름'],['over','흐림']]} value={st.weather} on={v=>set({weather:v})}/></div>
    </details>
    <details className="phone-fold"><summary>주행과 화면</summary>
      <div className="row"><label>주행 모드</label><Seg<DriveMode> items={[['normal','일반'],['sport','스포츠']]} value={st.mode} on={v=>set({mode:v})}/></div>
      <div className="row"><label>속도 상한</label><Seg items={[[40,'40'],[60,'60'],[80,'80'],[0,'자유']]} value={st.observationSpeed} on={v=>set({observationSpeed:v as typeof st.observationSpeed})}/></div>
      <p>단위는 km/h예요. 자유 주행은 관찰 상한을 해제해요.</p>
      <div className="row"><label>그래픽</label><Seg<Gfx> items={[['high','높음'],['low','낮음']]} value={st.gfx} on={v=>set({gfx:v})}/></div>
    </details>
    <button className="pbtn" onClick={()=>getEngine()?.toMenu()}>코스 다시 고르기</button>
    <details className="phone-fold"><summary>앱 정보</summary><p>팀 눈치 · iM Digital Banker Academy<br/>데이터: OpenStreetMap · 한국도로공사 · 기상청 · GLARE (CC BY 4.0)</p></details>
  </div></div>;
}
