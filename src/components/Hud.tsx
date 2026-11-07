import { useEffect, useState } from 'react';
import { getEngine, type Els } from '../game/engine';
import { ROAD_NAME } from '../game/roadSelection';
import { hm } from '../game/sun';
import { useGame } from '../store';
import { useTouchControls } from './useTouchControls';
import { DriveIcon, type DriveIconName } from './DriveIcon';
import { MODEL3_ALERT_NOTE, MODEL3_SOURCE_LABEL } from '../game/model3';

const WEATHER = { clear: '맑음', cloud: '구름', over: '흐림' };
function DriveButton({ icon, label, hint, active, pressed, onClick }: { icon: DriveIconName; label: string; hint: string; active?: boolean; pressed?: boolean; onClick: () => void }) {
  return <button type="button" className={`drive-action${active ? ' active' : ''}`} aria-label={label} aria-pressed={pressed} title={`${label} · ${hint}`} onClick={onClick}>
    <DriveIcon name={icon} /><span>{hint}</span>
  </button>;
}
function DriveToast() {
  const banner = useGame(s => s.banner), [show, setShow] = useState(false);
  useEffect(() => { if (!banner) return; setShow(true); const timer = setTimeout(() => setShow(false), 2600); return () => clearTimeout(timer); }, [banner]);
  return <div className={`drive-toast${show ? ' show' : ''}`} role="status" title={banner?.s}>
    <span className="drive-toast-dot" /><div><small>{banner?.k}</small><strong>{banner?.v}</strong></div>
  </div>;
}

export function Hud({ visible, bind }: { visible: boolean; bind: <K extends keyof Els>(k: K) => (n: Els[K] | null) => void }) {
  const h = useGame(s => s.hud), st = useGame(s => s.settings), phoneOpen = useGame(s => s.phoneOpen), set = useGame(s => s.set);
  const compact = useTouchControls(), inCab = h.navigation?.inCab ?? true;
  const sport = st.mode === 'sport', progress = Math.max(0, Math.min(1, h.prog));
  const openPhone = () => useGame.setState({ phoneOpen: true, app: 'home' });
  const m3 = h.model3;
  const adaptation = !m3 && st.guidance && h.adaptation && (h.adaptation.distance < 150 || h.adaptation.burden > .1) ? h.adaptation : null;
  const entering = adaptation?.phase.includes('진입 전');
  const inTunnel = adaptation?.phase.includes('어두워진') || adaptation?.phase.includes('내부');
  // 미리 판정한 경로 결과(route_analysis.json): 시뮬레이터 화면에 사진 + 해 위치·날씨 모델을 적용한 값.
  const a = st.guidance && !adaptation ? h.analysis : undefined;
  const GLARE = ['정상', '눈부심', '심한 눈부심'], GLARE_COLOR = ['#3BA55C', '#FF8A1F', '#F2522E'];
  const mlGlare = a && (a.level > 0 || a.aheadMeters != null) ? (a.level > 0
    ? { color: GLARE_COLOR[a.level], title: `지금 ${GLARE[a.level]}`, note: a.level === 2 ? '앞이 잘 안 보일 수 있어요 · 속도를 줄이고 차간 거리를 넓히세요' : '전방 시야에 주의하세요' }
    : { color: GLARE_COLOR[a.aheadLevel ?? 1], title: `${a.aheadMeters} m 앞 ${GLARE[a.aheadLevel ?? 1]}`, note: '눈부심 구간이 다가와요 · 미리 속도를 줄이세요' }) : null;
  return <div id="hud" className={`drive-hud${compact ? ' compact-controls' : ''}${phoneOpen ? ' phone-open' : ''}`} style={{ display: visible ? 'block' : 'none' }}>
    <header className="drive-header">
      <div className="drive-identity"><img className="drive-mark" src={`${import.meta.env.BASE_URL}logo.png`} alt="눈치" /><div><b>NUNCHI <em>DRIVE</em></b><small>{ROAD_NAME}<i />주행 체험</small></div></div>
      <div className="drive-route-summary" aria-label={`목적지까지 ${h.remainKm.toFixed(1)}킬로미터`}>
        <div className="drive-route-top"><span className="drive-route-origin">{h.from}</span><span className="drive-route-arrow">→</span><strong>{h.to}</strong><span className="drive-route-distance">{h.remainKm < 1 ? `${Math.round(h.remainKm * 1000)} m` : `${h.remainKm.toFixed(1)} km`}</span></div>
        <div className="drive-progress"><i style={{ width: `${progress * 100}%` }} /><span style={{ left: `${progress * 100}%` }} /></div>
      </div>
      <div className="drive-time"><b>{hm(st.minutes % 1440)}</b><span>{st.date.slice(5).replace('-', '.')}<i />{WEATHER[st.weather]}</span></div>
    </header>
    <DriveToast />
    {m3?.text && st.guidance && <div className="model3-alert" role="alert" style={{ borderColor: m3.color, color: m3.color }} title={`판정 근거: ${MODEL3_SOURCE_LABEL[m3.source]}`}>
      <i style={{ background: m3.color }} /><div><b>{m3.text}</b><small>{MODEL3_ALERT_NOTE[m3.grade]}</small></div>
    </div>}
    {m3?.countdown != null && <div className="model3-countdown" aria-live="assertive"><b key={m3.countdown}>{m3.countdown}</b><span>시야 회복 중</span></div>}
    {mlGlare && <aside className="drive-adaptation" aria-label="태양광 눈부심 분류 모델 판정" style={{ borderColor: mlGlare.color }}>
      <div className="drive-eye" style={{ background: mlGlare.color }} />
      <div className="drive-adaptation-copy"><small>태양광 눈부심 판정 <span>선정 모델</span></small><b>{mlGlare.title}</b>
        <p>{mlGlare.note}</p>
      </div>
    </aside>}
    {adaptation && <aside className="drive-adaptation" aria-label="밝기 적응 체험 상태">
      <div className="drive-eye"><i style={{ transform: `scale(${.22 + adaptation.pupil * .65})` }} /></div>
      <div className="drive-adaptation-copy"><small>밝기 변화 안내 <span>체험</span></small><b>{adaptation.phase}</b>
        <p>{entering ? '지하차도 진입 전 속도를 줄이세요' : inTunnel ? `지붕 아래 ${adaptation.coveredSeconds.toFixed(1)}초 · 앞차 간격을 유지하세요` : '시야가 회복될 때까지 천천히 주행하세요'}</p>
      </div>
      <div className="drive-adaptation-meter"><i style={{ width: `${Math.min(100, adaptation.burden * 100)}%` }} /></div>
    </aside>}
    {!compact && <div className={`drive-speed${h.warn ? ' caution' : ''}`} aria-label={`현재 속도 ${Math.round(h.kmh)}킬로미터 매시`}>
      <span className="drive-gear">{sport ? 'S' : 'D'}</span><strong>{Math.round(h.kmh)}</strong><div><span>km/h</span><small>{st.observationSpeed ? `관찰 상한 ${st.observationSpeed}` : h.warn ? '시야 주의' : sport ? 'SPORT' : 'DRIVE'}</small></div>
    </div>}
    {!inCab && <aside className="drive-chase-navigation"><div><span>경로 안내</span><strong>{h.navigation?.text}</strong></div><canvas ref={bind('minimap')} width={420} height={420} /></aside>}
    {!compact && <>
      <div className="drive-key-hints"><span><kbd>W</kbd><kbd>S</kbd> 가속 · 제동</span><span><kbd>A</kbd><kbd>D</kbd> 조향</span><span><kbd>C</kbd> 시점</span></div>
      <nav className="drive-toolbar" aria-label="주행 도구">
        <DriveButton icon="view" label="시점 전환" hint="시점" onClick={() => getEngine()?.toggleCam()} />
        <DriveButton icon={st.voice ? 'voice' : 'muted'} label="내비게이션 음성 안내" hint="음성" active={st.voice} pressed={st.voice} onClick={() => set({ voice: !st.voice })} />
        <DriveButton icon="glass" label="LCD 차광판" hint="차광" active={st.glass} pressed={st.glass} onClick={() => getEngine()?.toggleGlass()} />
        <DriveButton icon="guide" label="내비게이션 시야 안내" hint="안내" active={st.guidance} pressed={st.guidance} onClick={() => set({ guidance: !st.guidance })} />
        <span className="drive-tool-separator" />
        <DriveButton icon="mode" label="스포츠 모드" hint={sport ? '스포츠' : '일반'} active={sport} pressed={sport} onClick={() => getEngine()?.toggleSport()} />
        <DriveButton icon="apps" label="휴대폰 열기" hint="휴대폰" onClick={openPhone} />
        <DriveButton icon="menu" label="코스 메뉴" hint="코스" onClick={() => getEngine()?.toMenu()} />
      </nav>
    </>}
    <span className="sr-only" role="status" aria-label="차량 내비게이션 안내">{h.navigation?.text} {h.navigation?.meters ? `${h.navigation.meters}미터 앞` : ''}</span>
  </div>;
}
