import { useGame, type AppId } from '../store';
import { hm } from '../game/sun';
import { riskColor, stationLabel } from '../game/road';
import { CameraApp } from './CameraApp';
import { MapApp } from './MapApp';
import { ResultsApp } from './ResultsApp';
import { SettingsApp } from './SettingsApp';

const APPS: [AppId, string, string, string][] = [['cam', '📷', '눈부심 카메라', 'a1'], ['map', '🗺️', '위험 지도', 'a2'], ['res', '🏆', '분석 결과', 'a3'], ['set', '⚙️', '설정', 'a4']];
const GLARE = ['정상', '눈부심', '심함'];

export function Back() {
  return <button className="back" onClick={() => useGame.setState({ app: 'home' })}>‹ 홈</button>;
}

export function Phone() {
  const open = useGame(s => s.phoneOpen), app = useGame(s => s.app), openApp = useGame(s => s.openApp);
  const minutes = useGame(s => s.settings.minutes), h = useGame(s => s.hud);
  return (
    <div id="phone" className={open ? 'open' : ''}><div className="body"><div className="scr">
      <div className="notch" />
      <div className="top"><span className="num">{hm(minutes % 1440)}</span><span>📶 🔋</span></div>
      {open && app === 'home' && (
        <div className="pv">
          <h3>눈치 폰</h3>
          <div className="loc">달구벌대로 · {stationLabel(h.station)} 부근</div>
          <div className="apps">
            {APPS.map(([id, ico, name, cls]) => <button key={id} className={`app ${cls}`} onClick={() => openApp(id)}><span>{ico}</span>{name}</button>)}
          </div>
          <div className="widget">지금 구간 <b style={{ color: riskColor(h.riskRatio) }}>{h.riskRatio.toFixed(1)}배</b> <span className="small">체험 예시</span> · 눈부심 <b className={`lv${h.glareLv}`}>{GLARE[h.glareLv]}</b></div>
          <button className="pbtn" onClick={() => useGame.setState({ phoneOpen: false })}>시뮬레이터로 돌아가기</button>
        </div>
      )}
      {open && app === 'cam' && <CameraApp />}
      {open && app === 'map' && <MapApp />}
      {open && app === 'res' && <ResultsApp />}
      {open && app === 'set' && <SettingsApp />}
    </div></div></div>
  );
}
