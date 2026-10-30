import { useEffect, useRef, useState } from 'react';
import { createEngine, getEngine, setEngine, type Els } from './game/engine';
import { Hud } from './components/Hud';
import { Menu } from './components/Menu';
import { Result } from './components/Result';
import { Touch } from './components/Touch';
import { Phone } from './phone/Phone';
import { useGame } from './store';

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const el = useRef<Els>({});
  const [ready, setReady] = useState(false);
  const screen = useGame(s => s.screen);

  useEffect(() => {
    const e = createEngine(canvas.current!);
    Object.assign(e.els, el.current);
    setEngine(e); setReady(true);
    return () => { setEngine(null); e.dispose(); };
  }, []);

  // 매 프레임 바뀌는 요소는 엔진이 직접 고침 (React 재렌더 없이)
  const bind = <K extends keyof Els>(k: K) => (node: Els[K] | null) => {
    el.current[k] = node ?? undefined;
    const e = getEngine(); if (e) e.els[k] = node ?? undefined;
  };

  return (
    <>
      <canvas id="gl" ref={canvas} />
      <div id="wash" ref={bind('wash')} />
      <div id="glare" ref={bind('glare')} />
      <div id="shade" ref={bind('shade')} />
      {ready && (
        <>
          <Hud visible={screen === 'driving'} bind={bind} />
          {screen === 'driving' && <Touch />}
          {screen === 'menu' && <Menu />}
          {screen === 'result' && <Result />}
          <Phone />
        </>
      )}
      <div id="rotate"><div><div className="title">가로로 돌려 주세요</div><p>눈치 드라이브는 가로 화면에서 달려요.</p></div></div>
    </>
  );
}
