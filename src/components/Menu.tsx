import { useEffect, useRef, useState } from 'react';
import { openGlareCamera } from '../phone/CameraApp';
import { BANK_KM, D, P, TOTAL, at, kmToS, locationLabel } from '../game/road';
import { compass, hm, simDate, sunPos } from '../game/sun';
import { getEngine } from '../game/engine';
import { BANK_POS } from '../game/city';
import { MISSIONS, missionDate, useGame, type Weather } from '../store';

import { PreTripPanel } from './PreTripPanel';
import { CourseObservation } from './CourseObservation';
import { RoadScene } from './RoadScene';
import { getRoutePreview } from '../game/routePreview';
import { routeAnalysisSummary } from '../game/routeAnalysis';
import type { SegmentAssessment } from '../game/preTrip';
import { useTouchControls } from './useTouchControls';

import { IS_SINCHEON, ROAD_ID, chooseRoad } from '../game/roadSelection';

type Tf = (x: number, z: number) => [number, number];

function drawRouteMap(c: HTMLCanvasElement, startKm: number, endKm: number, view: { focus: boolean; zoom: number; pan: { x: number; y: number }; compact: boolean }, assessments: SegmentAssessment[]): Tf | null {
  const g = c.getContext('2d')!; if (!c.width) return null;
  const pr = devicePixelRatio;
  const begin = kmToS(Math.min(startKm, endKm)), finish = kmToS(Math.max(startKm, endKm));
  const points = view.focus ? Array.from({ length: Math.ceil((finish - begin) / 25) + 1 }, (_, i) => at(Math.min(finish, begin + i * 25))) : P;
  const xs = points.map(p => p.x), zs = points.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const spanX = Math.max(400, Math.max(...xs) - Math.min(...xs)), spanZ = Math.max(400, Math.max(...zs) - Math.min(...zs));
  const pad = (view.compact ? 76 : 70) * pr;
  const sc = Math.max(.001, Math.min((c.width - pad * 2) / spanX, (c.height - pad * 2) / spanZ)) * view.zoom;
  const T: Tf = (x, z) => [c.width / 2 + (x - cx) * sc + view.pan.x * pr, c.height / 2 + (z - cz) * sc + view.pan.y * pr];
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,170,80,.08)'; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 40 * pr) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 40 * pr) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  for (let s = 0; s < TOTAL; s += 200) {                          // 구간 위험 색 (체험용 예시)
    const p1 = at(s), p2 = at(s + 200), [x1, y1] = T(p1.x, p1.z), [x2, y2] = T(p2.x, p2.z);
    g.strokeStyle = '#8b8680'; g.lineWidth = 7 * pr; g.lineCap = 'round';
    g.globalAlpha = .55; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.globalAlpha = 1;
  }
  const s0 = kmToS(Math.min(startKm, endKm)), s1 = kmToS(Math.max(startKm, endKm));
  g.strokeStyle = '#FFD45E'; g.lineWidth = 13 * pr; g.beginPath();
  for (let s = s0; s <= s1; s += 50) { const p = at(s), [x, y] = T(p.x, p.z); if (s === s0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  for (const a of assessments) {
    const first = at(kmToS(a.segment.km0)), last = at(kmToS(a.segment.km1));
    const [x0,y0] = T(first.x,first.z), [x1,y1] = T(last.x,last.z);
    g.strokeStyle = a.state === 'unknown' ? '#98938a' : a.level === 2 ? '#F2522E' : a.level === 1 ? '#FF8A1F' : '#3BA55C';
    g.lineWidth = 6 * pr; g.setLineDash(a.state === 'unknown' ? [5 * pr,4 * pr] : []);
    g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
  }
  g.setLineDash([]);
  g.font = `${12 * pr}px "Noto Sans KR"`; g.textAlign = 'center';
  const placed: number[][] = [];
  const startPoint = at(kmToS(startKm)), endPoint = at(kmToS(endKm));
  const startPin = T(startPoint.x, startPoint.z), endPin = T(endPoint.x, endPoint.z);
  const separatePins = Math.hypot(startPin[0] - endPin[0], startPin[1] - endPin[1]) < 62 * pr;
  for (const [point, side] of [[startPin, -1], [endPin, 1]] as const) {
    placed.push([point[0] + (separatePins ? side * 26 * pr : 0) - 30 * pr, point[1] - 52 * pr, 60 * pr, 60 * pr]);
  }
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
    const label = st.name.replace(/\s*\([^)]*\)/g, '');
    const w = g.measureText(label).width + 6 * pr, h = 16 * pr;
    for (const dy of [-14, 24, -30, 40]) {                       // 겹치지 않는 자리 찾기
      const ly = y + dy * pr, box = [x - w / 2, ly - h + 4 * pr, w, h];
      if (box[0] < 8 * pr || box[0] + w > c.width - 8 * pr || box[1] < 78 * pr || box[1] + h > c.height - (view.compact ? 94 : 64) * pr) continue;
      if (placed.some(b => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
      placed.push(box); g.fillStyle = key(st) ? '#FFF8E7' : 'rgba(233,216,189,.75)'; g.fillText(label, x, ly); break;
    }
  });
  const pin = (km: number, col: string, label: string, side: number) => {
    const p = at(kmToS(km)), [px, y] = T(p.x, p.z), r = 13 * pr, x = px + (separatePins ? side * 26 * pr : 0);
    if (separatePins) { g.strokeStyle = col; g.lineWidth = 1.5 * pr; g.beginPath(); g.moveTo(px, y); g.lineTo(x, y); g.stroke(); }
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
  pin(startKm, '#3BA55C', '출발', -1); pin(endKm, '#F2522E', '도착', 1);
  return T;
}

const WXS: [Weather, string][] = [['clear', '맑음'], ['cloud', '구름'], ['over', '흐림']];

export function Menu() {
  const st = useGame(s => s.settings), set = useGame(s => s.set);
  const preview = getRoutePreview(st);
  const modelSummary = routeAnalysisSummary(ROAD_ID, st);
  const cv = useRef<HTMLCanvasElement>(null), T = useRef<Tf | null>(null);
  const [picking, setPicking] = useState<0 | 1>(0);
  const [size, setSize] = useState(0);
  const compact = useTouchControls();
  const [mapExpanded, setMapExpanded] = useState(false), [mapFocus, setMapFocus] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const [mapZoom, setMapZoom] = useState(1), [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>()), mapDragged = useRef(false);
  const resetMap = () => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); };
  useEffect(() => { setMapFocus(false); resetMap(); }, [compact]);
  useEffect(resetMap, [st.startKm, st.endKm]);
  useEffect(() => {
    const observer = new ResizeObserver(() => setSize(n => n + 1)); observer.observe(cv.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!mapExpanded) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMapExpanded(false); };
    addEventListener('keydown', escape); return () => removeEventListener('keydown', escape);
  }, [mapExpanded]);

  useEffect(() => {
    const on = () => setSize(n => n + 1); addEventListener('resize', on); return () => removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const c = cv.current!; c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio;
    T.current = drawRouteMap(c, st.startKm, st.endKm, { focus: mapFocus, zoom: mapZoom, pan: mapPan, compact }, preview.primary.segments);
  }, [st.startKm, st.endKm, size, mapFocus, mapZoom, mapPan, compact, st.date, st.minutes, st.weather, st.observationMode, st.exampleCondition, st.observationSpeed]);

  const sp = sunPos(simDate(st.date, st.minutes));
  const head = getEngine()?.routeHead() ?? 0;
  const diff = Math.abs(((sp.az - head + 540) % 360) - 180);
  const front = sp.alt > 0 && sp.alt < 25 && diff < 30 && st.weather !== 'over';
  const a = locationLabel(st.startKm), b = locationLabel(st.endKm);
  // picking은 다음 지도 클릭의 역할일 뿐, 화면에 표시된 코스의 유효성과 무관하다.
  const validCourse = Math.abs(st.endKm - st.startKm) >= 0.1;
  const selectedMission = st.mission == null ? undefined : MISSIONS[st.mission];
  const weatherLabel = WXS.find(([id]) => id === st.weather)?.[1] ?? '';
  const selectMission = (i: number) => {
    const m = MISSIONS[i]; setPicking(0); setShowCourses(false);
    set({ mission: i, startKm: m.a, endKm: m.b, minutes: m.m, date: missionDate(m), weather: 'clear', flow: 0, mode: 'normal', observationSpeed: 0 });
  };

  const onMap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mapDragged.current) { mapDragged.current = false; return; }
    if (!T.current) return; const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * devicePixelRatio, y = (e.clientY - r.top) * devicePixelRatio;
    let best = null as null | (typeof D.stations)[number], bd = 1e9;
    D.stations.forEach(s => { const p = at(kmToS(s.km)), [sx, sy] = T.current!(p.x, p.z), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = s; } });
    if (!best || bd > 40 * devicePixelRatio) return;
    const hit = best as (typeof D.stations)[number];
    if (picking === 0) { set({ startKm: hit.km, mission: null }); setPicking(1); }
    else { if (hit.km === st.startKm) return; set({ endKm: hit.km, mission: null }); setPicking(0); }
  };

  const moveMap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const old = pointers.current.get(e.pointerId); if (!old) return;
    const before = [...pointers.current.values()];
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const after = [...pointers.current.values()];
    if (after.length === 2) {
      const distance = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const previous = distance(before); if (previous > 5) setMapZoom(z => Math.max(.5, Math.min(6, z * distance(after) / previous)));
      mapDragged.current = true;
    } else if (Math.hypot(e.clientX - old.x, e.clientY - old.y) > 1) {
      setMapPan(p => ({ x: p.x + e.clientX - old.x, y: p.y + e.clientY - old.y })); mapDragged.current = true;
    }
  };
  return (
    <div id="menu">
      <div className="left">
        <div className="menu-scroll">
        <header className="menu-brand">
        <div className="logo">
          <img src="./logo.png" alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <div><h1>눈치 <em>드라이브</em></h1><div className="sub">빛을 읽는 주행 체험</div></div>
        </div>
        <p className="menu-lead">빛이 바뀌는 길,<br /><strong>미리 만나보세요.</strong></p>
        <svg className="menu-horizon" viewBox="0 0 200 130" fill="none" aria-hidden="true">
          <circle cx="145" cy="45" r="28" fill="currentColor" fillOpacity=".12" />
          <circle cx="145" cy="45" r="42" stroke="currentColor" strokeOpacity=".15" />
          <path d="M-10 126c40-70 121-26 157-58M66 134c4-52 64-42 81-66M28 130c22-59 95-31 119-62" stroke="currentColor" strokeOpacity=".3" />
          <path d="M28 130c22-59 95-31 119-62" stroke="currentColor" strokeDasharray="5 6" />
        </svg>
        </header>

        <div className="menu-course-choice">
        <div className="sect">어디를 달릴까요?</div>
        <div className="roads" role="group" aria-label="도로와 체험 선택">
          <button className={`road${ROAD_ID === 'dalgu' ? ' on' : ''}`} aria-pressed={ROAD_ID === 'dalgu'} onClick={() => chooseRoad('dalgu')}>
            <RoadScene />
            <span className="road-title"><b>달구벌대로</b><span className="road-check" aria-hidden="true">{ROAD_ID === 'dalgu' ? '✓' : '↗'}</span></span>
            <span className="road-purpose">햇빛과 전방 시야</span>
            <small>낮은 해의 눈부심을 체험해요</small>
          </button>
          <button className={`road${IS_SINCHEON ? ' on' : ''}`} aria-pressed={IS_SINCHEON} onClick={() => chooseRoad('sincheon')}>
            <RoadScene tunnel />
            <span className="road-title"><b>신천대로</b><span className="road-check" aria-hidden="true">{IS_SINCHEON ? '✓' : '↗'}</span></span>
            <span className="road-purpose">지하차도와 밝기 전환</span>
            <small>어두운 안과 밝은 출구를 비교해요</small>
          </button>
        </div>
        </div>
        <button className="integration-review-open" type="button" onClick={() => useGame.setState({ integrationOpen: true })}><b>안내 미리보기</b><small>눈부심과 터널 밝기 변화를 함께 알려드려요</small></button>
        <div className="menu-selected">
        <div className="sect">선택한 코스</div>
        <div className="selected-course" aria-live="polite">
          <div className="course-kicker"><span>{selectedMission?.badge ?? '직접 고른 코스'}</span><span className="course-distance">{Math.abs(st.endKm - st.startKm).toFixed(1)}<small>km</small></span></div>
          <h2>{selectedMission?.t ?? `${a} → ${b}`}</h2>
          <div className="course-stops"><span><small>출발</small><b>{a}</b></span><span className="course-connector" aria-hidden="true"><i /><i /></span><span><small>도착</small><b>{b}</b></span></div>
          <p><span>{hm(st.minutes)} 출발</span><i />{weatherLabel}</p>
          <button className="menu-map-shortcut" onClick={() => { setMapExpanded(true); resetMap(); }}>지도 크게 보기</button>
        </div>
        </div>
        <div className="menu-options">
        <details className="menu-fold course-picker" open={showCourses} onToggle={e => setShowCourses(e.currentTarget.open)}>
          <summary><span>다른 추천 코스 보기<small>{MISSIONS.length}개 코스 중 선택</small></span><em>선택</em></summary>
        <div className="missions">
          {MISSIONS.map((m, i) => <button key={m.id} className={`mission${st.mission === i ? ' on' : ''}`} aria-pressed={st.mission === i} onClick={() => selectMission(i)}>
              <div><div className="mt">{m.t}</div><div className="ms">{Math.abs(m.b - m.a).toFixed(1)} km · {hm(m.m)} · {m.purpose === 'adaptation' ? '밝기 변화' : '햇빛과 시야'}</div></div>
              {m.badge && <span className="badge">{m.badge}</span>}
            </button>)}
        </div>
        </details>

        <details className="menu-fold">
          <summary><span>날짜·날씨·음성<small>{st.date.slice(5).replace('-', '.')} {hm(st.minutes)} · {weatherLabel} · 음성 {st.voice ? '켜짐' : '꺼짐'}</small></span><em>변경</em></summary>
          <div className="menu-fold-body">
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
        <div className="row"><label>차 소리</label><div className="seg"><button className={st.carSound ? 'on' : ''} onClick={() => set({ carSound: true })}>켜기</button><button className={!st.carSound ? 'on' : ''} onClick={() => set({ carSound: false })}>끄기</button></div></div>
          <p className="note">추천 코스는 출발 시각을 고정해 같은 햇빛 조건으로 체험해요.</p>
          </div>
        </details>
        {IS_SINCHEON && <details className="menu-fold">
          <summary><span>관찰 속도·통과 시간<small>{st.observationSpeed ? `${st.observationSpeed} km/h 상한 적용 중` : '자유 주행 · 관찰 상한 없음'}</small></span><em>선택</em></summary>
          <CourseObservation />
        </details>}
        <details className="menu-fold">
          <summary><span>전방 구간 안내·연결 상태<small>{modelSummary ? `선정 모델 판정 · 심한 눈부심 ${modelSummary.severeM ? `${(modelSummary.severeM / 1000).toFixed(1)} km` : '없음'}` : st.observationMode === 'example' ? '가상 관측 예시 사용 중' : preview.primary.observedM ? '도로변 관측 확인됨' : '도로변 관측 미확인'}</small></span><em>확인</em></summary>
          <PreTripPanel />
        </details>
        <details className="menu-fold">
          <summary><span>체험 방법·데이터 안내<small>이 코스에서 확인할 수 있는 것</small></span><em>읽기</em></summary>
          <div className="menu-fold-body">
            <p>{IS_SINCHEON ? '지하차도 안과 밝은 출구를 지나며 시야 변화를 비교해요. 사진 판정과 전광판 안내 예시는 구간 안내에서 확인할 수 있어요.' : '정면 햇빛 때문에 앞을 알아보기 어려운 순간과, 내비·전광판의 사전 안내를 체험해요.'}</p>
            <p className="note">실제 도로·건물 데이터를 바탕으로 단순화했습니다.{IS_SINCHEON && ` 지하차도 ${D.underpasses?.length}곳의 입·출구는 OSM 좌표이며 깊이·높이·시야 회복은 시뮬레이션 가정입니다.`} 카메라 앱과 주행 화면의 눈부심 판정은 발표 선정 모델(사진 + 해 위치·날씨)이 해요. 도로변 사진 안내 예시는 가상 관측이에요.</p>
          </div>
        </details>
        </div>
        </div>
        <div className="menu-start">
          <div className="menu-start-status"><span>{st.observationSpeed ? `관찰 상한 ${st.observationSpeed} km/h` : '자유 주행'}</span>{st.observationSpeed ? <button onClick={() => set({ observationSpeed: 0 })}>상한 해제</button> : <small>가속·제동은 직접 조작해요</small>}</div>
        <button id="go" disabled={!validCourse} onClick={() => validCourse && getEngine()?.startRun()}><span>{validCourse ? '출발하기 ▶' : '서로 다른 출발·도착 지점을 선택하세요'}</span></button>
        <button className="menu-camera" onClick={openGlareCamera}><b>📷 눈부심 카메라 바로 써 보기</b><small>휴대폰 카메라로 낮에 해 쪽을 비춰 보세요 · 선정 모델이 판정해요</small></button>
        </div>
      </div>
      <div className="right">
        <div id="mapwrap" className={mapExpanded ? 'route-map-expanded' : ''}>
          <canvas id="mapcv" ref={cv} onClick={onMap} aria-label="경로 지도. 끌어서 이동하거나 두 손가락으로 확대할 수 있습니다."
            onPointerDown={e => { if (e.button !== 0) return; if (!pointers.current.size) mapDragged.current = false; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={moveMap} onPointerUp={e => pointers.current.delete(e.pointerId)} onPointerCancel={e => { pointers.current.delete(e.pointerId); mapDragged.current = true; }} />
          <button className="map-expand" aria-expanded={mapExpanded} onClick={() => { setMapExpanded(v => !v); resetMap(); }}>{mapExpanded ? '↙ 지도 접기' : '⛶ 지도 크게 보기'}</button>
          <div className="map-zoom" role="group" aria-label="지도 확대와 이동">
            <button aria-label="지도 축소" disabled={mapZoom <= .5} onClick={() => setMapZoom(z => Math.max(.5, z / 1.4))}>−</button>
            <button aria-label="지도 확대" disabled={mapZoom >= 6} onClick={() => setMapZoom(z => Math.min(6, z * 1.4))}>＋</button>
            <button className="map-focus" onClick={() => { setMapFocus(v => !v); resetMap(); }}>{mapFocus ? '전체 도로' : '선택 코스'}</button>
          </div>
          <div id="maptip">{picking === 0
            ? <>지도에서 <b style={{ color: 'var(--green)' }}>출발</b>·<b style={{ color: 'var(--red)' }}>도착</b> 지점 선택</>
            : validCourse
              ? <>출발 <b style={{ color: 'var(--green)' }}>{a}</b> · 도착 <b style={{ color: 'var(--red)' }}>{b}</b> · 바로 출발하거나 도착 지점을 바꿀 수 있어요</>
              : <>출발 <b style={{ color: 'var(--green)' }}>{a}</b> · 이제 다른 <b style={{ color: 'var(--red)' }}>도착</b> 지점을 누르세요</>}</div>
          <div id="legend"><span><i style={{ background: 'var(--orange)' }} />주의 관측</span><span><i style={{ background: '#98938a' }} />미확인</span>{IS_SINCHEON && <span>· 파란 표시는 지하차도</span>}</div>
        </div>
        <p className="map-mobile-hint">{picking ? '도착 지점을 선택하세요' : '지도 지점을 눌러 출발·도착을 바꿀 수 있어요'}</p>
        <div id="sumbar">
          <div className="slab"><div className="in"><div className="k">코스</div><div className="v">{selectedMission?.t ?? `${a} → ${b}`}</div></div></div>
          <div className="slab"><div className="in"><div className="k">거리 · 방향</div><div className="v">{Math.abs(st.endKm - st.startKm).toFixed(1)} km · {compass(head)}쪽</div></div></div>
          <div className="slab"><div className="in"><div className="k">해 위치</div><div className="v">{sp.alt < 0 ? '해 진 뒤' : `${compass(sp.az)} · 높이 ${sp.alt.toFixed(0)}°`}</div></div></div>
        </div>
      </div>
    </div>
  );
}
