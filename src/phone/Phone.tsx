import { ROAD_NAME } from '../game/roadSelection';
import { useEffect, useRef } from 'react';
import { getEngine } from '../game/engine';
import { useGame, type AppId } from '../store';
import { compass, hm, simDate, sunPos } from '../game/sun';
import { stationLabel } from '../game/road';
import { CameraApp } from './CameraApp';
import { MapApp } from './MapApp';
import { ResultsApp } from './ResultsApp';
import { SettingsApp } from './SettingsApp';

const APPS: [AppId, string, string, string][] = [
  ['cam', '📷', '현재 전방 사진','linear-gradient(145deg,#FFD45E,#FF8A1F)'],
  ['map', '🗺️', '경로 사전 안내', 'linear-gradient(145deg,#7fd6a6,#2f9d6a)'],
  ['res', 'ℹ️', '기능 연결 상태', 'linear-gradient(145deg,#ffb199,#F2522E)'],
  ['set', '⚙️', '설정', 'linear-gradient(145deg,#d7d2cb,#8f877d)'],
];
const GLARE = ['정상', '눈부심', '많이 눈부심'];
const BASE_W = 390, BASE_H = 800;                       // 폰 기준 크기 (px) — 화면에 맞춰 통째로 확대

export function Back() {
  return <button className="back" onClick={() => useGame.setState({ app: 'home' })}>‹ 홈</button>;
}

/** 상태 표시줄 아이콘: 신호 · 와이파이 · 배터리 */
function StatusIcons({ dark }: { dark: boolean }) {
  const c = dark ? '#2B1A12' : '#fff';
  return (
    <svg width="68" height="14" viewBox="0 0 68 14" aria-hidden>
      {[0, 1, 2, 3].map(i => <rect key={i} x={i * 5} y={10 - i * 3} width="3.4" height={4 + i * 3} rx="1" fill={c} />)}
      <path d="M27 5.2a8.5 8.5 0 0 1 12 0M29.4 7.8a5 5 0 0 1 7.2 0M31.8 10.4a1.6 1.6 0 0 1 2.4 0" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <rect x="44" y="2" width="20" height="10" rx="3" stroke={c} strokeWidth="1.3" fill="none" opacity=".8" />
      <rect x="46" y="4" width="14" height="6" rx="1.5" fill={c} />
      <rect x="65" y="5.5" width="1.8" height="3" rx=".8" fill={c} opacity=".7" />
    </svg>
  );
}

export function Phone() {
  const open = useGame(s => s.phoneOpen), app = useGame(s => s.app), openApp = useGame(s => s.openApp);
  const st = useGame(s => s.settings), h = useGame(s => s.hud), current = useGame(s => s.currentFrame);
  // 위치 · 크기 · 투명도는 엔진이 매 프레임 정함 (1인칭: 손에 든 3D 폰 자리에 겹침, 3인칭: 화면 가운데에 크게)
  const phoneEl = useRef<HTMLDivElement>(null), dimEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const e = getEngine(); if (!e) return;
    e.els.phone = phoneEl.current ?? undefined; e.els.phoneDim = dimEl.current ?? undefined;
    return () => { e.els.phone = undefined; e.els.phoneDim = undefined; };
  }, []);
  const close = () => useGame.setState({ phoneOpen: false });
  const sp = sunPos(simDate(st.date, st.minutes));
  const home = app === 'home';
  const [mo, d] = st.date.slice(5).split('-').map(Number);

  return (
    <>
      <div id="phoneDim" ref={dimEl} className={open ? 'open' : ''} onClick={close} />
      <div id="phone" ref={phoneEl} className={open ? 'open' : ''} style={{ width: BASE_W, height: BASE_H }}>
        <div className="frame">
          <i className="btn b1" /><i className="btn b2" /><i className="btn b3" /><i className="btn b4" />
          <div className={`scr${home ? ' home' : ''}`}>
            <div className="island" />
            <div className="status"><span className="num">{hm(st.minutes % 1440)}</span><StatusIcons dark={!home} /></div>

            {open && home && (
              <div className="homeview">
                <div className="sunbg" style={{ ['--alt' as string]: Math.max(-5, Math.min(40, sp.alt)) }} />
                <div className="bigclock num">{hm(st.minutes % 1440)}</div>
                <div className="bigdate">{mo}월 {d}일 · {sp.alt < 0 ? '해 진 뒤' : `해 ${compass(sp.az)}쪽 ${sp.alt.toFixed(0)}°`}</div>
                <div className="glasswidget">
                  <div className="wl">📍 {ROAD_NAME} · {stationLabel(h.station)} 부근</div>
                  <div className="wrow">
                    <div><small>앞 구간 관측</small><b>{h.navigation?.source === 'example' ? '예시' : h.navigation?.source === 'roadside' ? '관측 있음' : '미확인'}</b><em>도로변 사진 기준</em></div>
                    <div><small>현재 사진</small><b>{current.state === 'ready' && current.level != null ? GLARE[current.level] : '미분석'}</b><em>사진 1장 시범 분석</em></div>
                    <div><small>밝기 변화</small><b>{h.adaptation ? '체험 중' : '구간 대기'}</b><em>순응 연출</em></div>
                  </div>
                </div>
                <div className="icons">
                  {APPS.map(([id, ico, name, bg]) => (
                    <button key={id} className="icon" onClick={() => openApp(id)}>
                      <span style={{ background: bg }}>{ico}</span>{name}
                    </button>
                  ))}
                </div>
                <div className="dock">
                  <button onClick={close}><span>🚗</span>운전으로 돌아가기</button>
                </div>
              </div>
            )}
            {open && app === 'cam' && <CameraApp />}
            {open && app === 'map' && <MapApp />}
            {open && app === 'res' && <ResultsApp />}
            {open && app === 'set' && <SettingsApp />}
            <div className="homebar" onClick={() => (home ? close() : useGame.setState({ app: 'home' }))} />
          </div>
        </div>
      </div>
    </>
  );
}
