import { useEffect, useRef, useState } from 'react';
import { getEngine } from '../game/engine';
import { useGame } from '../store';
import { useTouchControls } from './useTouchControls';
import { DriveIcon } from './DriveIcon';

type Action = 'left' | 'right' | 'throttle' | 'brake';
function HoldButton({ action, label, children, pressed, on }: {
  action: Action; label: string; children: React.ReactNode; pressed: boolean;
  on: (action: Action, pressed: boolean) => void;
}) {
  const pointer = useRef<number | null>(null);
  const release = () => { pointer.current = null; on(action, false); };
  return <button type="button" className={`drive-hold ${action}${pressed ? ' pressed' : ''}`} aria-label={label} aria-pressed={pressed}
    onPointerDown={e => {
      if (e.button !== 0 || pointer.current !== null) return;
      e.preventDefault(); pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); on(action, true);
    }}
    onPointerUp={e => { if (pointer.current === e.pointerId) release(); }}
    onPointerCancel={release} onLostPointerCapture={release} onBlur={release}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) on(action, true); } }}
    onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); release(); } }}>
    {children}
  </button>;
}

export function Touch() {
  const enabled = useTouchControls();
  const phoneOpen = useGame(s => s.phoneOpen), glass = useGame(s => s.settings.glass);
  const voice = useGame(s => s.settings.voice), set = useGame(s => s.set);
  const speed = useGame(s => s.hud.kmh);
  const active = useRef(new Set<Action>()), [pressed, setPressed] = useState<Action[]>([]);
  const change = (action: Action, down: boolean) => {
    if (down) active.current.add(action); else active.current.delete(action);
    const held = active.current, engine = getEngine();
    engine?.setSteer(Number(held.has('right')) - Number(held.has('left')));
    engine?.setPedal('throttle', Number(held.has('throttle')));
    engine?.setPedal('brake', Number(held.has('brake')));
    setPressed([...held]);
  };
  useEffect(() => {
    const release = () => {
      active.current.clear(); setPressed([]);
      const engine = getEngine();
      engine?.setSteer(0); engine?.setPedal('throttle', 0); engine?.setPedal('brake', 0);
    };
    const onVisibility = () => { if (document.hidden) release(); };
    release(); window.addEventListener('blur', release); document.addEventListener('visibilitychange', onVisibility);
    return () => { release(); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, phoneOpen]);
  if (!enabled || phoneOpen) return null;
  const button = (action: Action, label: string, content: React.ReactNode) =>
    <HoldButton action={action} label={label} pressed={pressed.includes(action)} on={change}>{content}</HoldButton>;
  return <div id="touch">
    <div className="steering-pad" role="group" aria-label="조향">
      {button('left', '왼쪽으로 조향', <><span aria-hidden="true">‹</span><small>왼쪽</small></>)}
      {button('right', '오른쪽으로 조향', <><span aria-hidden="true">›</span><small>오른쪽</small></>)}
    </div>
    <div className="pedal-pad" role="group" aria-label="페달">
      {button('brake', '브레이크', <><span className="pedal-bars" aria-hidden="true">━━</span><small>브레이크</small></>)}
      {button('throttle', '가속', <><span className="pedal-bars" aria-hidden="true">Ⅱ</span><small>가속</small></>)}
    </div>
    <div className="touch-speed" aria-label={`현재 속도 ${Math.round(speed)}킬로미터 매시`}><b>{Math.round(speed)}</b><span>km/h</span></div>
    <div className="drive-tools" role="group" aria-label="주행 도구">
      <button aria-label="내비게이션 음성 안내" aria-pressed={voice} className={voice ? 'active' : ''} onClick={() => set({ voice: !voice })}><DriveIcon name={voice ? 'voice' : 'muted'} /><small>음성</small></button>
      <button aria-label="휴대폰 열기" onClick={() => useGame.setState({ phoneOpen: true, app: 'home' })}><DriveIcon name="apps" /><small>앱</small></button>
      <button aria-label="스마트 유리" aria-pressed={glass} className={glass ? 'active' : ''} onClick={() => getEngine()?.toggleGlass()}><DriveIcon name="glass" /><small>차광</small></button>
      <button aria-label="시점 전환" onClick={() => getEngine()?.toggleCam()}><DriveIcon name="view" /><small>시점</small></button>
      <button aria-label="코스 메뉴" onClick={() => getEngine()?.toMenu()}><DriveIcon name="menu" /><small>코스</small></button>
    </div>
  </div>;
}
