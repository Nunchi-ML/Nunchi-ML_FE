import { IS_SINCHEON, ROAD_NAME } from '../game/roadSelection';
import { useEffect, useState } from 'react';
import { getEngine, type Els } from '../game/engine';
import { riskLv } from '../game/road';
import { hm } from '../game/sun';
import { useGame } from '../store';
import { useTouchControls } from './useTouchControls';

const GLARE = ['정상', '눈부심', '많이 눈부심'];
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
  const compact = useTouchControls();
  const { minutes, date, weather } = useGame(s => s.settings);
  const running = useGame(s => s.screen === 'driving');
  const voice = useGame(s => s.settings.voice), guidance = useGame(s => s.settings.guidance);
  const set = useGame(s => s.set);
  const sport = useGame(s => s.settings.mode === 'sport');
  const togglePhone = () => running && useGame.setState(s => ({ phoneOpen: !s.phoneOpen, app: 'home' }));

  return (
    <>
      <div id="hud" className={compact ? 'compact-controls' : ''} style={{ display: visible ? 'block' : 'none' }}>
        <div id="status" className="hud">
          {IS_SINCHEON
            ? <Stat id="sRisk" ico="◐" k="밝기 변화" v={h.adaptation ? h.adaptation.score > .66 ? '차이 큼' : h.adaptation.score > .33 ? '차이 보통' : '차이 작음' : '구간 대기'} cls="lv1" tag="장면 밝기 추정" />
            : <Stat id="sRisk" ico="🛣️" k="구간 위험" v={`${h.riskRatio.toFixed(1)}배`} cls={`lv${riskLv(h.riskRatio)}`} tag="체험용 예시" />}
          <Stat id="sGlare" ico="🕶️" k={h.analysis ? '구간 전방 시야' : '눈부심'}
            v={h.analysis ? ['양호', '식별 주의', '식별 어려움'][h.analysis.level] : GLARE[h.glareLv]}
            cls={`lv${h.analysis?.level ?? h.glareLv}`} tag={h.analysis ? 'AI 사전 분석 · 참고' : '시뮬레이션 계산'} flash={h.analysis?.level === 2} />
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
        {h.analysis && <div id="roadAssistant" className="hud" role="status">
          <b>{h.analysis.aheadMeters != null ? `${h.analysis.aheadMeters} m 앞 · 전방 식별 주의 구간` : h.analysis.level > 0 ? '이 구간은 전방을 알아보기 어려울 수 있어요' : '현재 구간의 전방 시야 분석을 확인했어요'}</b>
          <small>출발 조건의 구간 영상을 미리 분석한 결과 · 화면 전송 없이 재생</small>
        </div>}
        {h.adaptation && <div id="adaptationHud" className="hud" role="status">
          <div className="eye-diagram" aria-label="밝기 이력에 따른 동공 반응 도식">
            <i style={{ transform: `scale(${.22 + h.adaptation.pupil * .65})` }} />
          </div>
          <div><b>{h.adaptation.name}</b><div>{h.adaptation.phase}</div>
            <small>{h.adaptation.distance > 0 ? `밝기가 달라지는 지점까지 ${Math.round(h.adaptation.distance)} m` : '밝은 출구를 통과했어요'}<br />눈이 밝기에 적응하는 과정을 표현한 체험입니다</small>
          </div>
        </div>}
        <div id="warn" className={`hud${h.warn ? ' show' : ''}`}><div className="slab"><div className="in"><div className="v">☀ 눈부심 구간 — 속도를 줄이세요</div></div></div></div>

        <div id="mmlabel" className="hud" style={{ display: h.navigation?.inCab ? 'none' : 'block' }}><div className="slab"><div className="in">{ROAD_NAME} · {h.from} → {h.to}</div></div></div>
        <div id="minimap" className="hud" style={{ display: h.navigation?.inCab ? 'none' : 'block' }}><canvas ref={bind('minimap')} width={420} height={420} /></div>
        <div id="speedo" className="hud" style={{ display: h.navigation?.inCab ? 'none' : 'block' }}><canvas ref={bind('speedo')} width={500} height={500} /></div>
        <div id="glass" className="hud"><div className="slab"><div className="in">🕶️ 스마트 유리 <b>{h.glassText}</b> <span style={{ fontSize: 11, color: '#d9c7ad' }}>(G)</span></div></div></div>
        <div id="navigationControls"><button aria-label="내비게이션 음성 안내" aria-pressed={voice} onClick={() => set({ voice: !voice })}>{voice ? '🔊 음성 켜짐' : '🔇 음성 꺼짐'}</button><button aria-label="내비게이션 시야 안내" aria-pressed={guidance} onClick={() => set({ guidance: !guidance })}>{guidance ? '시야 안내 켜짐' : '시야 안내 꺼짐'}</button></div>
        <span className="sr-only" role="status" aria-label="차량 내비게이션 안내">{h.navigation?.text} {h.navigation?.meters ? `${h.navigation.meters}미터 앞` : ''}</span>
        <div id="keys" className="hud"><kbd>W</kbd><kbd>↑</kbd> 가속 · <kbd>S</kbd><kbd>↓</kbd> 브레이크 · <kbd>A</kbd><kbd>D</kbd> 차선 · <kbd>C</kbd> 시점 · 화면 끌기 고개 돌리기 · <kbd>V</kbd> 정면 · <kbd>M</kbd> 스포츠 · <kbd>G</kbd> 스마트 유리 · <kbd>P</kbd> 휴대폰 · <kbd>Esc</kbd> 코스</div>
      </div>
      <button id="sportBtn" className={sport ? 'on' : ''} aria-label="스포츠 모드" style={{ display: visible && !compact ? 'block' : 'none' }}
        onClick={() => getEngine()?.toggleSport()}>🏎️<small>{sport ? '스포츠' : '일반'} · M</small></button>
      <button id="phoneBtn" aria-label="휴대폰 열기" style={{ display: visible && !compact ? 'block' : 'none' }} onClick={togglePhone}>📱<small>P</small></button>
    </>
  );
}
