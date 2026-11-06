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
        <div className="row"><label>음성 안내</label><Seg items={[[true, '켜기'], [false, '끄기']]} value={st.voice} on={v => set({ voice: v })} /></div>
        <div className="row"><label>시야 안내</label><Seg items={[[true, '켜기'], [false, '끄기']]} value={st.guidance} on={v => set({ guidance: v })} /></div>
        <div className="row"><label>체감 민감도</label><Seg items={[['standard', '보통'], ['sensitive', '민감 · 일찍 안내']]} value={st.sensitivity} on={v => set({ sensitivity: v as typeof st.sensitivity })} /></div>
        <div className="row"><label>경로 선호</label><Seg items={[['arrival', '빠른 도착'], ['exposure', '노출 회피']]} value={st.preference} on={v => set({ preference: v as typeof st.preference })} /></div>
        <div className="row"><label>추가시간 허용</label><Seg items={[[0, '0분'], [3, '3분'], [5, '5분'], [10, '10분']]} value={st.extraMinutes} on={v => set({ extraMinutes: v })} /></div>
        <div className="row"><label>추가거리 허용</label><Seg items={[[0, '0 km'], [1, '1 km'], [2, '2 km'], [5, '5 km']]} value={st.extraKm} on={v => set({ extraKm: v })} /></div>
        <div className="small">민감도는 안내 시점에만 반영해요. 예측 등급을 임의로 올리거나 질환·수술명을 수집하지 않습니다.</div>
        <div className="row"><label>시간</label>
          <input aria-label="시뮬레이션 시간" type="range" min={0} max={1439} step={1} value={Math.round(st.minutes)} onChange={e => setMinutes(+e.target.value)} />
          <span className="num" style={{ minWidth: 44 }}>{hm(st.minutes)}</span></div>
        <div className="row"><label>시간 흐름</label><Seg items={[[0, '고정'], [1, '1배'], [10, '10배'], [60, '60배']]} value={st.flow} on={v => set({ flow: v })} /></div>
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
