import { useEffect, useRef, useState } from 'react';
import { BANK_KM, D, P, TOTAL, at, kmToS, locationLabel, riskAt, riskColor, sToKm, type Dir } from '../game/road';
import { compass, hm, simDate, sunPos } from '../game/sun';
import { getEngine } from '../game/engine';
import { BANK_POS } from '../game/city';
import { MISSIONS, missionDate, useGame, type Weather } from '../store';

import { IS_SINCHEON, ROAD_ID, chooseRoad } from '../game/roadSelection';

type Tf = (x: number, z: number) => [number, number];

function drawRouteMap(c: HTMLCanvasElement, startKm: number, endKm: number, dir: Dir): Tf | null {
  const g = c.getContext('2d')!; if (!c.width) return null;
  const pr = devicePixelRatio;
  const xs = P.map(p => p.x), zs = P.map(p => p.z);
  const minx = Math.min(...xs), maxx = Math.max(...xs), minz = Math.min(...zs), maxz = Math.max(...zs);
  const pad = 70 * pr, sc = Math.min((c.width - pad * 2) / (maxx - minx), (c.height - pad * 2) / (maxz - minz));
  const ox = (c.width - (maxx - minx) * sc) / 2, oy = (c.height - (maxz - minz) * sc) / 2;
  const T: Tf = (x, z) => [ox + (x - minx) * sc, oy + (z - minz) * sc];
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,170,80,.08)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 40 * pr) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 40 * pr) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  for (let s = 0; s < TOTAL; s += 200) {                          // 구간 위험 색 (체험용 예시)
    const p1 = at(s), p2 = at(s + 200), [x1, y1] = T(p1.x, p1.z), [x2, y2] = T(p2.x, p2.z);
    g.strokeStyle = IS_SINCHEON ? '#8da0a9' : riskColor(riskAt(sToKm(s), dir).ratio); g.lineWidth = 7 * pr; g.lineCap = 'round';
    g.globalAlpha = .55; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.globalAlpha = 1;
  }
  const s0 = kmToS(Math.min(startKm, endKm)), s1 = kmToS(Math.max(startKm, endKm));
  g.strokeStyle = '#FFD45E'; g.lineWidth = 13 * pr; g.beginPath();
  for (let s = s0; s <= s1; s += 50) { const p = at(s), [x, y] = T(p.x, p.z); if (s === s0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  g.font = `${12 * pr}px "Noto Sans KR"`; g.textAlign = 'center';
  const placed: number[][] = [];
  // iM뱅크 본점: 실제 건물 자리에 점, 선으로 이은 초록 이름표 (역 이름보다 먼저 자리 잡아 겹치지 않게)
  const bpos = BANK_POS ?? at(kmToS(BANK_KM)), [bx, by] = T(bpos.x, bpos.z);
  const rp = at(kmToS(BANK_KM)), ry = T(rp.x, rp.z)[1], below = by >= ry;
  const bLabel = '🏦 iM뱅크 본점';
  g.font = `700 ${12 * pr}px "Noto Sans KR"`;
  const bw = g.measureText(bLabel).width + 18 * pr, bh = 22 * pr, bly = by + (below ? 50 : -50) * pr;
  if (!IS_SINCHEON) placed.push([bx - bw / 2, bly - bh / 2, bw, bh]);
  g.font = `${12 * pr}px "Noto Sans KR"`;
  const key = (st: { km: number; name: string }) => st.km === startKm || st.km === endKm || st.name === '대구은행';
  [...D.stations].sort((a, b) => +key(b) - +key(a)).forEach(st => {
    const p = at(kmToS(st.km)), [x, y] = T(p.x, p.z);
    g.fillStyle = key(st) ? '#FFD45E' : '#FFF8E7'; g.beginPath(); g.arc(x, y, (key(st) ? 6 : 4) * pr, 0, 7); g.fill();
    const w = g.measureText(st.name).width + 6 * pr, h = 16 * pr;
    for (const dy of [-14, 24, -30, 40]) {                       // 겹치지 않는 자리 찾기
      const ly = y + dy * pr, box = [x - w / 2, ly - h + 4 * pr, w, h];
      if (placed.some(b => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
      placed.push(box); g.fillStyle = key(st) ? '#FFF8E7' : 'rgba(233,216,189,.75)'; g.fillText(st.name, x, ly); break;
    }
  });
  const pin = (km: number, col: string, label: string) => {
    const p = at(kmToS(km)), [x, y] = T(p.x, p.z), r = 13 * pr;
    g.fillStyle = col; g.beginPath(); g.arc(x, y - r * 1.6, r, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x - r * .6, y - r); g.lineTo(x + r * .6, y - r); g.lineTo(x, y); g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${11 * pr}px "Noto Sans KR"`; g.fillText(label, x, y - r * 1.35);
  };
  if (!IS_SINCHEON) {
  g.strokeStyle = '#2fd3a2'; g.lineWidth = 1.5 * pr; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, bly + (below ? -bh / 2 : bh / 2)); g.stroke();
  g.fillStyle = '#00a07a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * pr;
  g.fillRect(bx - 4 * pr, by - 4 * pr, 8 * pr, 8 * pr); g.strokeRect(bx - 4 * pr, by - 4 * pr, 8 * pr, 8 * pr);   // 건물 자리
  g.beginPath(); g.roundRect(bx - bw / 2, bly - bh / 2, bw, bh, 11 * pr); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.font = `700 ${12 * pr}px "Noto Sans KR"`; g.textBaseline = 'middle'; g.fillText(bLabel, bx, bly + 1 * pr); g.textBaseline = 'alphabetic';
  }
  if (IS_SINCHEON) {
    for (const u of D.underpasses ?? []) {
      const p = at(kmToS((u.s0 + u.s1) / 2000)), [x, y] = T(p.x, p.z);
      g.fillStyle = '#79cbd9'; g.fillRect(x - 4 * pr, y - 4 * pr, 8 * pr, 8 * pr);
    }
  }
  pin(startKm, '#3BA55C', '출발'); pin(endKm, '#F2522E', '도착');
  return T;
}

const WXS: [Weather, string][] = [['clear', '맑음'], ['cloud', '구름'], ['over', '흐림']];

export function Menu() {
  const st = useGame(s => s.settings), set = useGame(s => s.set);
  const cv = useRef<HTMLCanvasElement>(null), T = useRef<Tf | null>(null);
  const [picking, setPicking] = useState<0 | 1>(0);
  const [size, setSize] = useState(0);
  const dir: Dir = st.endKm >= st.startKm ? 'E' : 'W';

  useEffect(() => {
    const on = () => setSize(n => n + 1); addEventListener('resize', on); return () => removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const c = cv.current!; c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio;
    T.current = drawRouteMap(c, st.startKm, st.endKm, dir);
  }, [st.startKm, st.endKm, dir, size]);

  const sp = sunPos(simDate(st.date, st.minutes));
  const head = getEngine()?.routeHead() ?? 0;
  const diff = Math.abs(((sp.az - head + 540) % 360) - 180);
  const front = sp.alt > 0 && sp.alt < 25 && diff < 30 && st.weather !== 'over';
  const a = locationLabel(st.startKm), b = locationLabel(st.endKm);
  // picking은 다음 지도 클릭의 역할일 뿐, 화면에 표시된 코스의 유효성과 무관하다.
  const validCourse = Math.abs(st.endKm - st.startKm) >= 0.1;

  const onMap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!T.current) return; const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * devicePixelRatio, y = (e.clientY - r.top) * devicePixelRatio;
    let best = null as null | (typeof D.stations)[number], bd = 1e9;
    D.stations.forEach(s => { const p = at(kmToS(s.km)), [sx, sy] = T.current!(p.x, p.z), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = s; } });
    if (!best || bd > 40 * devicePixelRatio) return;
    const hit = best as (typeof D.stations)[number];
    if (picking === 0) { set({ startKm: hit.km, mission: null }); setPicking(1); }
    else { if (hit.km === st.startKm) return; set({ endKm: hit.km, mission: null }); setPicking(0); }
  };

  return (
    <div id="menu">
      <div className="left">
        <div className="logo">
          <img src="./logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div><h1>눈치 <em>드라이브</em></h1><div className="sub">해가 눈을 가리기 전에, 먼저 알아챈다</div></div>
        </div>

        <div className="sect">① 어떤 시야 변화를 체험할까요?</div>
        <div className="roads" role="group" aria-label="도로와 체험 선택">
          <button className={`road${ROAD_ID === 'dalgu' ? ' on' : ''}`} aria-pressed={ROAD_ID === 'dalgu'} onClick={() => chooseRoad('dalgu')}>
            <span className="road-purpose">햇빛과 전방 시야</span>
            <b>달구벌대로</b>
            <span className="road-experience">눈앞으로 들어오는 햇빛,<br />앞이 얼마나 잘 보일까요?</span>
            <small>동서 · 32.8 km</small>
          </button>
          <button className={`road${IS_SINCHEON ? ' on' : ''}`} aria-pressed={IS_SINCHEON} onClick={() => chooseRoad('sincheon')}>
            <span className="road-purpose">밝기 변화와 눈의 적응</span>
            <b>신천대로</b>
            <span className="road-experience">어두운 지하차도에서 밝은 밖으로,<br />눈은 어떻게 적응할까요?</span>
            <small>남북·서측 · {IS_SINCHEON ? D.total_km.toFixed(1) : '14.3'} km</small>
          </button>
        </div>
        <div className="road-guide" aria-live="polite">
          <b>{IS_SINCHEON ? '밝은 출구에서 달라지는 시야를 느껴보세요' : '햇빛 아래에서 앞이 잘 보이는지 확인해보세요'}</b>
          <p>{IS_SINCHEON
            ? '지하차도에 들어갈 때 어두워지는 시야와, 밝은 밖으로 나와 서서히 적응하는 과정을 체험해요.'
            : '정면 햇빛 때문에 전방을 알아보기 어려워지는 순간을 체험하고, 운전 중 어떤 안내가 필요한지 살펴봐요.'}</p>
        </div>

        {IS_SINCHEON && <div className="note">실제 도로·건물 데이터 · 지하차도 {D.underpasses?.length}곳<br />입·출구는 OSM 좌표, 깊이·높이와 눈의 회복 연출은 시뮬레이션 가정입니다.</div>}
        <div className="sect">② 추천 코스</div>
        <div className="missions">
          {MISSIONS.map((m, i) => (
            <button key={i} className={`mission${st.mission === i ? ' on' : ''}`}
              onClick={() => { setPicking(0); set({ mission: i, startKm: m.a, endKm: m.b, minutes: m.m, date: missionDate(m), weather: 'clear', flow: 0 }); }}>
              <div><div className="mt">{m.t}</div><div className="ms">{m.s}</div></div>
              {m.badge && <span className="badge">{m.badge}</span>}
            </button>
          ))}
        </div>

        <div className="note">추천 코스는 출발 때의 햇빛과 날씨를 유지해 같은 조건으로 체험해요.</div>
        <div className="sect">③ 언제 달릴까</div>
        <div className="row"><label>날짜</label>
          <input aria-label="출발 날짜" type="date" value={st.date} onChange={e => e.target.value && set({ date: e.target.value })}
            style={{ flex: 1, background: 'transparent', color: 'var(--cream)', border: '1px solid #fff4', borderRadius: 8, padding: '4px 8px', font: 'inherit' }} /></div>
        <div className="row"><label>시간</label>
          <input aria-label="출발 시간" type="range" min={0} max={1439} step={1} value={st.minutes} onChange={e => set({ minutes: +e.target.value })} />
          <span className="val num">{hm(st.minutes)}</span></div>
        <div className="row"><label>날씨</label><div className="seg">
          {WXS.map(([w, t]) => <button key={w} className={st.weather === w ? 'on' : ''} onClick={() => set({ weather: w })}>{t}</button>)}
        </div></div>
        <div id="hint" style={{ background: front ? 'rgba(242,82,46,.25)' : 'rgba(59,165,92,.16)', borderColor: front ? 'rgba(242,82,46,.6)' : 'rgba(59,165,92,.5)' }}>
          {sp.alt <= 0 ? '🌙 태양이 지평선 아래에 있어요. 태양 직광 눈부심 계산은 꺼져 있어요.'
            : front ? <>☀️ <b>이 시간엔 해가 정면</b>이에요 (높이 {sp.alt.toFixed(0)}°, 진행 방향과 {diff.toFixed(0)}° 차이). 눈부심 주의!</>
            : `해가 진행 방향과 ${diff.toFixed(0)}° 떨어져 있어요. ${sp.alt >= 25 ? '해가 높아서' : '정면이 아니라서'} 눈부심은 약해요.`}
        </div>

        <div className="row"><label>음성 안내</label><div className="seg"><button className={st.voice ? 'on' : ''} onClick={() => set({ voice: true })}>켜기</button><button className={!st.voice ? 'on' : ''} onClick={() => set({ voice: false })}>끄기</button></div></div>
        <button id="go" disabled={!validCourse} onClick={() => validCourse && getEngine()?.startRun()}><span>{validCourse ? '출발하기 ▶' : '서로 다른 출발·도착 지점을 선택하세요'}</span></button>
        <div className="note">시뮬레이터 화면은 실제 장소를 본떠 단순화한 것입니다. 실제 운전 중에는 사용하지 마세요.</div>
      </div>
      <div className="right">
        <div id="mapwrap">
          <canvas id="mapcv" ref={cv} onClick={onMap} />
          <div id="maptip">{picking === 0
            ? <>지도에서 <b style={{ color: 'var(--green)' }}>출발</b> → <b style={{ color: 'var(--red)' }}>도착</b> 지점을 차례로 누르세요</>
            : validCourse
              ? <>출발 <b style={{ color: 'var(--green)' }}>{a}</b> · 도착 <b style={{ color: 'var(--red)' }}>{b}</b> · 바로 출발하거나 도착 지점을 바꿀 수 있어요</>
              : <>출발 <b style={{ color: 'var(--green)' }}>{a}</b> · 이제 다른 <b style={{ color: 'var(--red)' }}>도착</b> 지점을 누르세요</>}</div>
          <div id="legend">{!IS_SINCHEON && <><span><i style={{ background: 'var(--green)' }} />낮음</span><span><i style={{ background: 'var(--orange)' }} />보통</span><span><i style={{ background: 'var(--red)' }} />높음</span></>}<span>· {IS_SINCHEON ? '파란 표시: 밝기가 달라지는 지하차도' : '구간 위험 (체험용 예시)'}</span></div>
        </div>
        <div id="sumbar">
          <div className="slab"><div className="in"><div className="k">코스</div><div className="v">{a} → {b}</div></div></div>
          <div className="slab"><div className="in"><div className="k">거리 · 방향</div><div className="v">{Math.abs(st.endKm - st.startKm).toFixed(1)} km · {compass(head)}쪽</div></div></div>
          <div className="slab"><div className="in"><div className="k">해 위치</div><div className="v">{sp.alt < 0 ? '해 진 뒤' : `${compass(sp.az)} · 높이 ${sp.alt.toFixed(0)}°`}</div></div></div>
        </div>
      </div>
    </div>
  );
}
