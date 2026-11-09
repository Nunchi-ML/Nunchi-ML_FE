import { D, TOTAL, at, kmToS, locationLabel } from './road';
import { BANK_POS, nearbyMapBuildings } from './city';
import { nearbyMapWays } from './navigationMap';
import { ROAD_NAME } from './roadSelection';
import { hm } from './sun';
import { navigationCue, type NavigationZone } from './navigationGuidance';
import type { Model3Grade } from './model3';

const brandLogo = new Image();
brandLogo.src = `${import.meta.env.BASE_URL}logo.png`;

const FONT = '"Noto Sans KR", sans-serif';
export const isCompactNavigation = () => matchMedia('(any-pointer: coarse), (max-width: 900px) and (orientation: landscape)').matches;

export function drawNavigationDisplay(canvas: HTMLCanvasElement, s: number, dir: number, startKm: number, endKm: number, kmh: number, zones: NavigationZone[], guidance: boolean, voice: boolean, voiceAvailable: boolean, running: boolean, minutes: number, night: boolean, leadMeters = 300, model3Grade?: Model3Grade | null) {
  const compact = isCompactNavigation();
  const g = canvas.getContext('2d')!, W = canvas.width / 2, H = canvas.height / 2, split = 0, header = compact ? 132 : 100;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.textBaseline = 'alphabetic';
  const p = at(s), f = { x: p.dx * dir, z: p.dz * dir }, scale = 1.15;
  const T = (x: number, z: number) => ({ x: W / 2 + ((x - p.x) * -f.z + (z - p.z) * f.x) * scale,
    y: 290 - ((x - p.x) * f.x + (z - p.z) * f.z) * scale });
  const colors = night ? { land: '#19252e', building: '#46545f', edge: '#71818b', road: '#80929b', roadEdge: '#111a23', park: '#284b3d', water: '#285e80', text: '#f2f3e9' }
    : { land: '#f5f3e8', building: '#c3cebf', edge: '#8fa28f', road: '#ffffff', roadEdge: '#96aa99', park: '#c5dfb2', water: '#8bc6e2', text: '#334c50' };
  g.fillStyle = '#181513'; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); g.rect(split, header, W - split, H - header - 76); g.clip();
  g.fillStyle = colors.land; g.fillRect(split, header, W - split, H - header - 76);
  const polygon = (points: [number, number][], fill: string, stroke?: string) => {
    g.beginPath(); points.forEach(([x, z], i) => { const q = T(x, z); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath();
    g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.3; g.stroke(); }
  };
  const context = nearbyMapWays(p.x, p.z);
  context.parks.forEach(park => polygon(park.p, colors.park));
  for (const river of D.rivers ?? []) {
    g.beginPath(); river.poly.forEach(([lon, lat], i) => {
      const q = T((lon - 128.59) * 111320 * Math.cos(35.866 * Math.PI / 180), -(lat - 35.866) * 110940);
      if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
    });
    g.strokeStyle = colors.park; g.lineWidth = river.width * scale + 35; g.stroke();
    g.strokeStyle = colors.water; g.lineWidth = river.width * scale; g.stroke();
  }
  for (const b of nearbyMapBuildings(p.x, p.z, 650)) {
    const points: [number, number][] = [];
    for (let i = 0; i < b.p.length; i += 2) points.push([b.p[i], b.p[i + 1]]);
    polygon(points, b.k === 4 ? night ? '#38504a' : '#d3dfd0' : colors.building, colors.edge);
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const road of context.roads) {
    g.beginPath(); road.p.forEach(([x, z], i) => { const q = T(x, z); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    const width = road.rank === 3 ? 22 : road.rank === 2 ? 13 : 7;
    g.lineWidth = width + 3; g.strokeStyle = colors.roadEdge; g.stroke();
    g.lineWidth = width; g.strokeStyle = colors.road; g.stroke();
  }
  const path = (from: number, to: number, color: string, width: number) => {
    if (from > to) return;
    g.beginPath(); for (let n = from; n <= to; n += 5) { const a = at(n), q = T(a.x, a.z); if (n === from) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); }
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
  };
  path(Math.max(0, s - 850), Math.min(TOTAL, s + 850), colors.roadEdge, 29);
  path(Math.max(0, s - 850), Math.min(TOTAL, s + 850), colors.road, 24);
  const lo = kmToS(Math.min(startKm, endKm)), hi = kmToS(Math.max(startKm, endKm));
  path(Math.max(lo, s - 850), Math.min(hi, s + 850), '#ffffff', 21);
  path(Math.max(lo, s - 850), Math.min(hi, s + 850), '#eb861d', 14);
  // Missing roadside observations must not paint over a known warning layer.
  if (guidance) for (const z of [...zones].filter(z => z.kind !== 'exit').sort((a,b) => Number(b.kind === 'unverified') - Number(a.kind === 'unverified'))) {
    const a = Math.max(Math.min(z.start, z.end), s - 800), b = Math.min(Math.max(z.start, z.end), s + 800);
    g.setLineDash(z.kind === 'unverified' ? [13, 9] : []); path(a, b, z.kind === 'unverified' ? '#8c9294' : z.level === 2 ? '#d95051' : '#ed8d39', z.kind === 'unverified' ? 12 : 16); g.setLineDash([]);
    const q = T(at(z.start).x, at(z.start).z); g.fillStyle = '#fff5dc'; g.strokeStyle = '#dd8b38'; g.lineWidth = 2;
    g.beginPath(); g.arc(q.x, q.y, 15, 0, 7); g.fill(); g.stroke();
    g.fillStyle = z.kind === 'unverified' ? '#59636b' : '#9f591e'; g.font = `bold 21px ${FONT}`; g.textAlign = 'center'; g.fillText(z.kind === 'unverified' ? '?' : '!', q.x, q.y + 8);
  }
  const labels: { x: number; y: number }[] = [];
  for (const road of context.roads.filter(r => r.rank === 3 && r.name && r.name !== ROAD_NAME)) {
    const q = T(...road.p[Math.floor(road.p.length / 2)]);
    if (q.x < split + 80 || q.x > W - 100 || q.y < 120 || q.y > H - 105 || labels.some(l => Math.hypot(l.x - q.x, l.y - q.y) < 160)) continue;
    g.font = `700 24px ${FONT}`; g.fillStyle = colors.text; g.textAlign = 'center'; g.strokeStyle = colors.land; g.lineWidth = 4; g.strokeText(road.name, q.x, q.y - 16); g.fillText(road.name, q.x, q.y - 16); labels.push(q); if (labels.length >= 4) break;
  }
  if (BANK_POS && Math.hypot(BANK_POS.x - p.x, BANK_POS.z - p.z) < 750) {
    const q = T(BANK_POS.x, BANK_POS.z); g.fillStyle = '#098775'; g.beginPath(); g.arc(q.x, q.y, 11, 0, 7); g.fill();
    g.font = `bold 23px ${FONT}`; g.textAlign = 'left'; g.strokeStyle = colors.land; g.lineWidth = 5;
    g.strokeText('iM뱅크 본점', q.x + 17, q.y - 15); g.fillText('iM뱅크 본점', q.x + 17, q.y - 15);
  }
  const goal = at(kmToS(endKm)), dest = T(goal.x, goal.z);
  g.fillStyle = '#ed6750'; g.beginPath(); g.arc(dest.x, dest.y, 12, 0, 7); g.fill();
  g.fillStyle = night ? '#e9f2f8' : '#3a4c5e'; g.font = `bold 19px ${FONT}`; g.textAlign = 'center'; g.fillText('도착', dest.x, dest.y - 22);
  const car = T(p.x, p.z); g.shadowColor = '#a54f1355'; g.shadowBlur = 12;
  g.fillStyle = '#ee7a1a'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(car.x, car.y - 27); g.lineTo(car.x - 22, car.y + 23); g.lineTo(car.x, car.y + 13); g.lineTo(car.x + 22, car.y + 23); g.closePath(); g.fill(); g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'right'; g.font = `13px ${FONT}`; g.fillStyle = colors.text; g.fillText('© OpenStreetMap · 브이월드', W - 14, H - 84); g.restore();
  const rawCue = guidance ? navigationCue(s, dir, kmToS(endKm), zones.filter(z => z.kind !== 'exit' && z.kind !== 'unverified'), leadMeters) : null;
  const cue = rawCue;
  const hasModel3 = Boolean(guidance && model3Grade);
  const urgent = hasModel3 ? model3Grade === '상' : (!!cue && (cue.level === 2 || cue.active || cue.meters <= 100));
  const attention = hasModel3 || (!!cue && (cue.active || cue.meters <= leadMeters));
  const accent = urgent ? '#ff7778' : attention ? '#ffd38a' : '#ffd45e';
  g.fillStyle = urgent ? '#3a2029' : attention ? '#393126' : '#261e17'; g.fillRect(split, 0, W - split, header);
  const navCenter = W / 2;
  if (brandLogo.complete && brandLogo.naturalWidth) {
    g.drawImage(brandLogo, 18, 16, 34, 34);
  }
  g.textAlign = 'center'; g.font = `bold ${compact ? 60 : 42}px ${FONT}`; g.fillStyle = '#fff8e7';
  const heading = hasModel3
    ? `모델 ③ · 순응 위험 ${model3Grade}`
    : cue
      ? `${cue.active ? '지금' : `${cue.meters} m 앞`} · ${cue.text}`
      : running ? '경로를 따라 주행하세요' : '경로 안내 준비';
  g.fillText(heading, navCenter, compact ? 66 : 50, W - 125);
  const sourceLabel = hasModel3
    ? '지하차도 입구 밝기 전환 판정'
    : cue?.source === 'model' ? '시뮬레이션 사진 모델 판정' : cue?.source === 'roadside' ? '도로변 사진·태양·날씨' : cue?.source === 'example' ? '가상 관측 예시' : '현재 3D 햇빛 판정';
  g.font = `500 ${compact ? 42 : 29}px ${FONT}`; g.fillStyle = '#f0dfc5';
  g.fillText(hasModel3 || cue ? sourceLabel : `${ROAD_NAME} · ${guidance ? '주행 안내' : '시야 안내 꺼짐'}`, navCenter, compact ? 120 : 88, W - 64);
  if (attention) {
    // The central map area stays visible beside the steering wheel.
    const width = W - 80, left = (W - width) / 2;
    g.fillStyle = urgent ? '#4c1420' : '#40301b'; g.beginPath(); g.roundRect(left, header + 12, width, compact ? 112 : 94, 16); g.fill();
    g.strokeStyle = urgent ? '#ff9399' : '#f3c67c'; g.lineWidth = 2; g.stroke();
    g.fillStyle = accent; g.textAlign = 'center'; g.font = `bold ${compact ? 52 : 38}px ${FONT}`;
    const alertLine1 = hasModel3
      ? `지하차도 입구 순응 위험 ${model3Grade}`
      : cue!.level === 2 ? '눈부심 강함 · 감속하세요' : urgent ? '시야 주의 · 감속하세요' : '주의 구간 · 미리 감속';
    const alertLine2 = hasModel3 ? '감속하세요 · 앞차와의 간격을 유지하세요' : '앞차와의 간격을 유지하세요';
    g.fillText(alertLine1, navCenter, header + (compact ? 69 : 54), width - 40);
    g.font = `500 ${compact ? 36 : 27}px ${FONT}`; g.fillStyle = '#fff2e8';
    g.fillText(alertLine2, navCenter, header + (compact ? 112 : 89), width - 40);
  }
  // Small speed readout in the map corner; no instrument hidden by the wheel.
  g.fillStyle = '#211a13eb'; g.beginPath(); g.roundRect(W - 205, H - 173, 180, 78, 14); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#fff8e7'; g.font = `bold ${compact ? 46 : 40}px ${FONT}`;
  g.fillText(String(Math.round(kmh)), W - 140, H - 122);
  g.font = `24px ${FONT}`; g.fillStyle = '#e1cdb3'; g.fillText('km/h', W - 68, H - 124);
  g.fillStyle = '#f8f2e7'; g.fillRect(split, H - 76, W - split, 76);
  const remain = Math.max(0, (kmToS(endKm) - s) * dir / TOTAL * D.total_km), eta = Math.max(1, Math.ceil(remain / Math.max(20, kmh || 40) * 60));
  if (!compact) { g.textAlign = 'left'; g.fillStyle = '#56422d'; g.font = `bold 25px ${FONT}`; g.fillText(locationLabel(endKm), split + 24, H - 30, 690); }
  g.textAlign = compact ? 'center' : 'right'; g.fillStyle = '#a54f13'; g.font = `bold ${compact ? 48 : 31}px ${FONT}`; g.fillText(`${remain < 1 ? `${Math.round(remain * 1000)} m` : `${remain.toFixed(1)} km`}  ·  약 ${eta}분`, compact ? navCenter : W - 26, H - 28);
  if (attention) {
    // Persistent, restrained border; no flashing or claim about accident probability.
    g.save(); g.strokeStyle = urgent ? '#ef565f' : '#e6ae50'; g.lineWidth = urgent ? 8 : 5;
    g.shadowColor = urgent ? '#ff626266' : '#e6ae5044'; g.shadowBlur = urgent ? 14 : 7;
    g.beginPath(); g.roundRect(split + 5, 5, W - split - 10, H - 10, 14); g.stroke(); g.restore();
  }
  // A short status replaces tiny text over the main instruction.
  g.textAlign = 'left'; g.font = `20px ${FONT}`; g.fillStyle = colors.text;
  g.fillText(`${hm(minutes)} · ${voiceAvailable ? voice ? '음성 켜짐' : '음성 꺼짐' : '음성 미지원'}`, 20, H - 84);
  return cue;
}
