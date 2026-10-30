import { useEffect, useState } from 'react';
import { getEngine, type Els } from '../game/engine';
import { riskLv } from '../game/road';
import { hm } from '../game/sun';
import { useGame } from '../store';

const GLARE = ['정상', '눈부심', '심함'];
const WX = { clear: '맑음', cloud: '구름', over: '흐림' };

function Stat({ id, ico, k, v, cls, tag, flash }: { id: string; ico: string; k: string; v: string; cls: string; tag: string; flash?: boolean }) {
  return (
    <div className={`stat slab${flash ? ' flash' : ''}`} id={id}>
      <div className="in" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <div className="ico">{ico}</div><div><div className="k">{k}</div><div className={`v num ${cls}`}>{v}</div></div><div className="tag">{tag}</div>
      </div>
    </div>
  );
}

function Banner() {
  const b = useGame(s => s.banner);
  const [show, setShow] = useState(false);
  useEffect(() => { if (!b) return; setShow(true); const t = setTimeout(() => setShow(false), 3200); return () => clearTimeout(t); }, [b]);
  return (
    <div id="banner" className={`hud${show ? ' show' : ''}`}>
      <div className="slab"><div className="in"><div className="k">{b?.k}</div><div className="v">{b?.v}</div><div className="s">{b?.s}</div></div></div>
    </div>
  );
}

export function Hud({ visible, bind }: { visible: boolean; bind: <K extends keyof Els>(k: K) => (n: Els[K] | null) => void }) {
  const h = useGame(s => s.hud);
  const { minutes, date, weather } = useGame(s => s.settings);
  const running = useGame(s => s.screen === 'driving');
  const sport = useGame(s => s.settings.mode === 'sport');
  const togglePhone = () => running && useGame.setState(s => ({ phoneOpen: !s.phoneOpen, app: 'home' }));

  return (
    <>
      <div id="hud" style={{ display: visible ? 'block' : 'none' }}>
        <div id="status" className="hud">
          <Stat id="sRisk" ico="🛣️" k="구간 위험" v={`${h.riskRatio.toFixed(1)}배`} cls={`lv${riskLv(h.riskRatio)}`} tag="체험용 예시" />
          <Stat id="sGlare" ico="🕶️" k="눈부심" v={GLARE[h.glareLv]} cls={`lv${h.glareLv}`} tag="시뮬레이션 계산" flash={h.glareLv === 2} />
        </div>

        <div id="route" className="hud"><div className="slab" style={{ padding: '8px 18px 10px' }}><div className="in">
          <div className="names"><b>{h.from}</b><span>{h.remainKm.toFixed(1)} km 남음</span><b>{h.to}</b></div>
          <div className="bar">
            <div className="fill" style={{ width: `${h.prog * 100}%` }} />
            {h.ticks.map((t, i) => <div key={i} className="tick" style={{ left: `${t * 100}%` }} />)}
            <div className="car" style={{ left: `${h.prog * 100}%` }} />
          </div>
        </div></div></div>

        <div id="clock" className="hud">
          <div className="slab"><div className="in"><div className="t num">{hm(minutes % 1440)}</div><div className="d">{date.slice(5).replace('-', '/')} · {WX[weather]}</div></div></div>
          <div className="slab" id="score"><div className="in"><span style={{ fontSize: 11, color: '#d9c7ad' }}>안전 점수 </span><span className="v num">{h.score}</span><span style={{ fontSize: 10, color: '#bfa98c', marginLeft: 8 }}>{h.fps} fps</span></div></div>
        </div>

        <Banner />
        <div id="warn" className={`hud${h.warn ? ' show' : ''}`}><div className="slab"><div className="in"><div className="v">☀ 눈부심 구간 — 속도를 줄이세요</div></div></div></div>

        <div id="mmlabel" className="hud"><div className="slab"><div className="in">달구벌대로 · {h.from} → {h.to}</div></div></div>
        <div id="minimap" className="hud"><canvas ref={bind('minimap')} width={420} height={420} /></div>
        <div id="speedo" className="hud"><canvas ref={bind('speedo')} width={500} height={500} /></div>
        <div id="glass" className="hud"><div className="slab"><div className="in">🕶️ 스마트 유리 <b>{h.glassText}</b> <span style={{ fontSize: 11, color: '#d9c7ad' }}>(G)</span></div></div></div>
        <div id="keys" className="hud"><kbd>W</kbd><kbd>↑</kbd> 가속 · <kbd>S</kbd><kbd>↓</kbd> 브레이크 · <kbd>A</kbd><kbd>D</kbd> 차선 · <kbd>C</kbd> 시점 · 화면 끌기 고개 돌리기 · <kbd>V</kbd> 정면 · <kbd>M</kbd> 스포츠 · <kbd>G</kbd> 스마트 유리 · <kbd>P</kbd> 휴대폰 · <kbd>Esc</kbd> 코스</div>
      </div>
      <button id="sportBtn" className={sport ? 'on' : ''} aria-label="스포츠 모드" style={{ display: visible ? 'block' : 'none' }}
        onClick={() => getEngine()?.toggleSport()}>🏎️<small>{sport ? '스포츠' : '일반'} · M</small></button>
      <button id="phoneBtn" aria-label="휴대폰 열기" style={{ display: visible ? 'block' : 'none' }} onClick={togglePhone}>📱<small>P</small></button>
    </>
  );
}
