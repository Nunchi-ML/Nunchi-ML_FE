import { D, TOTAL, at, kmToS, locationLabel } from './road';
import { BANK_POS, nearbyMapBuildings } from './city';
import { nearbyMapWays } from './navigationMap';
import { ROAD_NAME } from './roadSelection';
import { hm } from './sun';
import { navigationCue, type NavigationZone } from './navigationGuidance';

const brandLogo = new Image();
brandLogo.src = `${import.meta.env.BASE_URL}logo.png`;

const FONT = '"Noto Sans KR", sans-serif';
export const isCompactNavigation = () => matchMedia('(any-pointer: coarse), (max-width: 900px) and (orientation: landscape)').matches;

export function drawNavigationDisplay(canvas: HTMLCanvasElement, s: number, dir: number, startKm: number, endKm: number, kmh: number, zones: NavigationZone[], guidance: boolean, voice: boolean, voiceAvailable: boolean, running: boolean, minutes: number, night: boolean) {
  const compact = isCompactNavigation();
  const g = canvas.getContext('2d')!, W = canvas.width, H = canvas.height, split = compact ? 0 : 400, header = compact ? 122 : 86;
  const p = at(s), f = { x: p.dx * dir, z: p.dz * dir }, scale = .95;
  const T = (x: number, z: number) => ({ x: split + (W - split) * .53 + ((x - p.x) * -f.z + (z - p.z) * f.x) * scale,
    y: 290 - ((x - p.x) * f.x + (z - p.z) * f.z) * scale });
  const colors = night ? { land: '#26221c', building: '#39342c', edge: '#4e463b', road: '#655d50', roadEdge: '#322c24', park: '#233e35', water: '#274e61', text: '#d0c5b4' }
    : { land: '#eff0e8', building: '#d9ddd5', edge: '#c4cbc1', road: '#ffffff', roadEdge: '#d1d8cf', park: '#d6e4c9', water: '#b5d9e9', text: '#697b81' };
  g.fillStyle = '#181513'; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); g.rect(split, header, W - split, H - header - 76); g.clip();
  g.fillStyle = colors.land; g.fillRect(split, header, W - split, H - header - 76);
  const polygon = (points: [number, number][], fill: string, stroke?: string) => {
    g.beginPath(); points.forEach(([x, z], i) => { const q = T(x, z); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath();
    g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = .9; g.stroke(); }
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
  if (guidance) for (const z of zones) {
    const a = Math.max(Math.min(z.start, z.end), s - 800), b = Math.min(Math.max(z.start, z.end), s + 800);
    path(a, b, '#ed8d39', 16);
    const q = T(at(z.start).x, at(z.start).z); g.fillStyle = '#fff5dc'; g.strokeStyle = '#dd8b38'; g.lineWidth = 2;
    g.beginPath(); g.arc(q.x, q.y, 15, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#9f591e'; g.font = `bold 21px ${FONT}`; g.textAlign = 'center'; g.fillText('!', q.x, q.y + 8);
  }
  const labels: { x: number; y: number }[] = [];
  for (const road of context.roads.filter(r => r.rank === 3 && r.name && r.name !== ROAD_NAME)) {
    const q = T(...road.p[Math.floor(road.p.length / 2)]);
    if (q.x < split + 80 || q.x > W - 100 || q.y < 120 || q.y > H - 105 || labels.some(l => Math.hypot(l.x - q.x, l.y - q.y) < 160)) continue;
    g.font = `500 19px ${FONT}`; g.fillStyle = colors.text; g.textAlign = 'center'; g.fillText(road.name, q.x, q.y - 16); labels.push(q); if (labels.length >= 4) break;
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
  if (!compact) {
    // Shared Nunchi identity: charcoal, cream, sun yellow and orange.
    g.fillStyle = '#1e1915'; g.fillRect(0, 0, split, H);
    const gradient = g.createLinearGradient(0, 0, split, H); gradient.addColorStop(0, '#30251b'); gradient.addColorStop(1, '#151210'); g.fillStyle = gradient; g.fillRect(0, 0, split, H);
    if (brandLogo.complete && brandLogo.naturalWidth) g.drawImage(brandLogo, 25, 15, 42, 42);
    g.textAlign = 'left'; g.fillStyle = '#f2dcc0'; g.font = `600 20px ${FONT}`; g.fillText('NUNCHI DRIVE', 78, 42);
    g.textAlign = 'right'; g.fillStyle = '#cbb79d'; g.fillText(hm(minutes), split - 26, 39);
    g.strokeStyle = '#58452f'; g.lineWidth = 8; g.beginPath(); g.arc(split / 2, 235, 139, Math.PI * .82, Math.PI * 2.18); g.stroke();
    g.strokeStyle = '#ffd45e'; g.beginPath(); g.arc(split / 2, 235, 139, Math.PI * .82, Math.PI * (.82 + 1.36 * Math.min(1, kmh / 140))); g.stroke();
    g.fillStyle = '#fff8e7'; g.textAlign = 'center'; g.font = `500 112px ${FONT}`; g.fillText(String(Math.round(kmh)), split / 2, 252);
    g.font = `20px ${FONT}`; g.fillStyle = '#d6c2a7'; g.fillText('km/h', split / 2, 287);
    g.font = `bold 29px ${FONT}`; g.fillStyle = '#ffd45e'; g.fillText('D', split / 2, 349);
    g.font = `19px ${FONT}`; g.fillStyle = '#baa58b'; g.fillText('SIMULATION  ·  눈치', split / 2, 404);
    g.fillStyle = '#4a3826'; g.fillRect(split - 1, 0, 2, H);
  }
  const cue = guidance ? navigationCue(s, dir, kmToS(endKm), zones) : null;
  const urgent = !!cue && (cue.active || cue.meters <= 100), attention = !!cue && (cue.active || cue.meters <= 180);
  const accent = urgent ? '#ff7778' : attention ? '#ffd38a' : '#ffd45e';
  g.fillStyle = urgent ? '#3a2029' : attention ? '#393126' : '#261e17'; g.fillRect(split, 0, W - split, header);
  const navCenter = split + (W - split) / 2;
  g.textAlign = 'center'; g.font = `bold ${compact ? 70 : 38}px ${FONT}`; g.fillStyle = '#fff8e7';
  g.fillText(cue ? `${cue.active ? '지금' : `${cue.meters} m 앞`}  ${cue.text}` : running ? '경로를 따라 주행하세요' : '경로 안내 준비', navCenter, compact ? 61 : 41, W - split - 200);
  g.font = `${compact ? 32 : 21}px ${FONT}`; g.fillStyle = urgent ? '#f8c7c7' : '#e1cdb3';
  g.fillText(cue ? `${cue.kind === 'exit' ? '출구 안팎의 밝기가 크게 달라져요' : '햇빛 때문에 전방 식별이 어려울 수 있어요'}  ·  ${cue.source === 'model' ? '사전 분석' : '체험 안내'}` : `${ROAD_NAME}  ·  ${guidance ? '주행 안내' : '시야 안내 꺼짐'}`, navCenter, compact ? 106 : 72, W - split - 160);
  g.textAlign = 'right'; g.font = `16px ${FONT}`; g.fillStyle = '#d7c2a6'; g.fillText(voiceAvailable ? voice ? '음성 ON' : '음성 OFF' : '음성 미지원', W - 22, 22);
  if (attention) {
    // The central map area stays visible beside the steering wheel.
    const width = Math.min(compact ? 1600 : 900, W - split - 80), left = navCenter - width / 2;
    g.fillStyle = urgent ? '#5a1825f5' : '#46331bf5'; g.beginPath(); g.roundRect(left, compact ? 138 : 108, width, compact ? 112 : 80, 16); g.fill();
    g.strokeStyle = urgent ? '#ff9399' : '#f3c67c'; g.lineWidth = 2; g.stroke();
    g.fillStyle = accent; g.textAlign = 'center'; g.font = `bold ${compact ? 64 : 36}px ${FONT}`;
    g.fillText(urgent ? compact ? '시야 주의 · 감속하세요' : '시야 주의 · 속도를 줄이세요' : compact ? '주의 구간 앞 · 미리 감속하세요' : '주의 구간 앞 · 미리 속도를 줄이세요', navCenter, compact ? 186 : 144, width - 40);
    g.font = `${compact ? 32 : 20}px ${FONT}`; g.fillStyle = '#f5e8e6';
    g.fillText(cue!.kind === 'exit' ? '출구에서 앞차와의 간격을 유지하세요' : '전방 차선과 앞차를 확인하세요', navCenter, compact ? 229 : 174, width - 40);
  }
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
  return cue;
}
