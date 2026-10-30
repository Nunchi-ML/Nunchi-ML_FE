import type { CSSProperties } from 'react';
import { getEngine } from '../game/engine';
import { isTouch } from '../store';

function Btn({ label, style, down, up }: { label: string; style: CSSProperties; down: () => void; up?: () => void }) {
  const off = (e: React.PointerEvent<HTMLDivElement>) => { e.currentTarget.classList.remove('on'); up?.(); };
  return (
    <div className="tbtn" style={style}
      onPointerDown={e => { e.preventDefault(); e.currentTarget.classList.add('on'); down(); }}
      onPointerUp={off} onPointerLeave={off} onPointerCancel={off}>{label}</div>
  );
}

export function Touch() {
  if (!isTouch) return null;
  const e = () => getEngine();
  return (
    <div id="touch">
      <Btn label="◀" style={{ left: 16, bottom: 96, width: 76, height: 64 }} down={() => e()?.setSteer(-1)} up={() => e()?.setSteer(0)} />
      <Btn label="▶" style={{ left: 16, bottom: 20, width: 76, height: 64 }} down={() => e()?.setSteer(1)} up={() => e()?.setSteer(0)} />
      <Btn label="브레이크" style={{ right: 190, bottom: 20, width: 96, height: 64, fontSize: 15 }} down={() => e()?.setPedal('brake', 1)} up={() => e()?.setPedal('brake', 0)} />
      <Btn label="가속" style={{ right: 190, bottom: 96, width: 96, height: 110 }} down={() => e()?.setPedal('throttle', 1)} up={() => e()?.setPedal('throttle', 0)} />
    </div>
  );
}
