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
  return (
    <div className="pv">
      <Back />
      <h3>설정</h3>
      <div className="set">
        <div className="row"><label>시간</label>
          <input type="range" min={300} max={1260} step={5} value={Math.round(st.minutes)} onChange={e => setMinutes(+e.target.value)} />
          <span className="num" style={{ minWidth: 44 }}>{hm(st.minutes)}</span></div>
        <div className="row"><label>시간 흐름</label><Seg items={[[1, '1배'], [10, '10배'], [60, '60배']]} value={st.flow} on={v => set({ flow: v })} /></div>
        <div className="row"><label>날씨</label><Seg<Weather> items={[['clear', '맑음'], ['cloud', '구름'], ['over', '흐림']]} value={st.weather} on={v => set({ weather: v })} /></div>
        <div className="row"><label>스마트 유리</label><Seg items={[[true, '켜기'], [false, '끄기']]} value={st.glass} on={v => set({ glass: v })} /></div>
        <div className="row"><label>주행 모드</label><Seg<DriveMode> items={[['normal', '일반'], ['sport', '스포츠']]} value={st.mode} on={v => set({ mode: v })} /></div>
        <div className="row"><label>그래픽</label><Seg<Gfx> items={[['high', '높음'], ['low', '낮음']]} value={st.gfx} on={v => set({ gfx: v })} /></div>
        <button className="pbtn" onClick={() => getEngine()?.toMenu()}>코스 다시 고르기</button>
        <div className="small">팀 「눈치」 · iM Digital Banker Academy<br />데이터: OpenStreetMap · 한국도로공사 · 기상청 · GLARE (CC BY 4.0)</div>
      </div>
    </div>
  );
}
