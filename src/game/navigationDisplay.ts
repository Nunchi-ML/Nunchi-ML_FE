import { D, TOTAL, at, kmToS, locationLabel } from './road';
import { BANK_POS, nearbyMapBuildings } from './city';
import { nearbyMapWays } from './navigationMap';
import { ROAD_NAME } from './roadSelection';
import { hm } from './sun';
import { navigationCue, type NavigationZone } from './navigationGuidance';

const FONT = '"Noto Sans KR", sans-serif';
export function drawNavigationDisplay(canvas: HTMLCanvasElement, s: number, dir: number, startKm: number, endKm: number, kmh: number, zones: NavigationZone[], guidance: boolean, voice: boolean, voiceAvailable: boolean, running: boolean, minutes: number, night: boolean) {
  const g = canvas.getContext('2d')!, W = canvas.width, H = canvas.height, split = 400;
  const p = at(s), f = { x: p.dx * dir, z: p.dz * dir }, scale = .95;
  const T = (x: number, z: number) => ({ x: split + (W - split) * .53 + ((x - p.x) * -f.z + (z - p.z) * f.x) * scale,
    y: 290 - ((x - p.x) * f.x + (z - p.z) * f.z) * scale });
  const colors = night ? { land: '#18262c', building: '#2e3e45', edge: '#3c5057', road: '#51616a', roadEdge: '#23333c', park: '#233e35', water: '#274e61', text: '#b7c9d2' }
    : { land: '#eff0e8', building: '#d9ddd5', edge: '#c4cbc1', road: '#ffffff', roadEdge: '#d1d8cf', park: '#d6e4c9', water: '#b5d9e9', text: '#697b81' };
  g.fillStyle = '#0c151e'; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); g.rect(split, 86, W - split, H - 162); g.clip();
  g.fillStyle = colors.land; g.fillRect(split, 86, W - split, H - 162);
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
  path(Math.max(lo, s - 850), Math.min(hi, s + 850), '#1679f5', 14);
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
  const car = T(p.x, p.z); g.shadowColor = '#174da955'; g.shadowBlur = 12;
  g.fillStyle = '#1977f3'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(car.x, car.y - 27); g.lineTo(car.x - 22, car.y + 23); g.lineTo(car.x, car.y + 13); g.lineTo(car.x + 22, car.y + 23); g.closePath(); g.fill(); g.stroke(); g.shadowBlur = 0;
  g.textAlign = 'right'; g.font = `13px ${FONT}`; g.fillStyle = colors.text; g.fillText('© OpenStreetMap · 브이월드', W - 14, H - 84); g.restore();
  // Integrated driver display: restrained white type and one blue accent.
  g.fillStyle = '#101e2a'; g.fillRect(0, 0, split, H);
  const gradient = g.createLinearGradient(0, 0, split, H); gradient.addColorStop(0, '#162b3b'); gradient.addColorStop(1, '#09121b'); g.fillStyle = gradient; g.fillRect(0, 0, split, H);
  g.textAlign = 'left'; g.fillStyle = '#b5d5e6'; g.font = `500 21px ${FONT}`; g.fillText('NUNCHI  DRIVE', 28, 39);
  g.textAlign = 'right'; g.fillStyle = '#91b1c3'; g.fillText(hm(minutes), split - 26, 39);
  g.strokeStyle = '#2d4a5c'; g.lineWidth = 8; g.beginPath(); g.arc(split / 2, 235, 139, Math.PI * .82, Math.PI * 2.18); g.stroke();
  g.strokeStyle = '#52c4f3'; g.beginPath(); g.arc(split / 2, 235, 139, Math.PI * .82, Math.PI * (.82 + 1.36 * Math.min(1, kmh / 140))); g.stroke();
  g.fillStyle = '#f2f8fb'; g.textAlign = 'center'; g.font = `500 112px ${FONT}`; g.fillText(String(Math.round(kmh)), split / 2, 252);
  g.font = `20px ${FONT}`; g.fillStyle = '#9ab7c8'; g.fillText('km/h', split / 2, 287);
  g.font = `bold 29px ${FONT}`; g.fillStyle = '#a6e0f5'; g.fillText('D', split / 2, 349);
  g.font = `19px ${FONT}`; g.fillStyle = '#8fa9b8'; g.fillText('SIMULATION  ·  눈치', split / 2, 404);
  g.fillStyle = '#1c3343'; g.fillRect(split - 1, 0, 2, H);
  const cue = guidance ? navigationCue(s, dir, kmToS(endKm), zones) : null;
  const urgent = !!cue && (cue.active || cue.meters <= 100), attention = !!cue && (cue.active || cue.meters <= 180);
  const accent = urgent ? '#ff7778' : attention ? '#ffd38a' : '#7bd5ff';
  g.fillStyle = urgent ? '#3a2029' : attention ? '#393126' : '#102635'; g.fillRect(split, 0, W - split, 86);
  g.fillStyle = accent; g.font = `bold 45px ${FONT}`; g.textAlign = 'left'; g.fillText(cue ? '!' : '↑', split + 24, 56);
  g.font = `bold 30px ${FONT}`; g.fillStyle = '#eff8ff'; g.fillText(cue ? `${cue.active ? '지금' : `${cue.meters} m 앞`}  ${cue.text}` : running ? '경로를 따라 주행하세요' : '경로 안내 준비', split + 76, 39, W - split - 250);
  g.font = `18px ${FONT}`; g.fillStyle = urgent ? '#f8c7c7' : '#9cb7c8';
  g.fillText(cue ? `${cue.kind === 'exit' ? '출구 안팎의 밝기가 크게 달라져요' : '햇빛 때문에 전방 식별이 어려울 수 있어요'}  ·  ${cue.source === 'model' ? '사전 분석' : '체험 안내'}` : `${ROAD_NAME}  ·  ${guidance ? '주행 안내' : '시야 안내 꺼짐'}`, split + 76, 68);
  g.textAlign = 'right'; g.fillStyle = '#abc7d6'; g.fillText(voiceAvailable ? voice ? '음성 ON' : '음성 OFF' : '음성 미지원', W - 24, 45);
  g.fillStyle = '#f5f7f6'; g.fillRect(split, H - 76, W - split, 76);
  const remain = Math.max(0, (kmToS(endKm) - s) * dir / TOTAL * D.total_km), eta = Math.max(1, Math.ceil(remain / Math.max(20, kmh || 40) * 60));
  g.textAlign = 'left'; g.fillStyle = '#334f60'; g.font = `bold 25px ${FONT}`;
  const badgeWidth = attention ? 170 : 0;
  if (attention) {
    g.fillStyle = urgent ? '#fff0f0' : '#fff4df'; g.beginPath(); g.roundRect(split + 18, H - 61, 142, 44, 12); g.fill();
    g.fillStyle = urgent ? '#bd353e' : '#986316'; g.font = `bold 23px ${FONT}`; g.fillText(urgent ? '시야 주의' : '주의 구간 앞', split + 34, H - 31);
  }
  g.fillStyle = '#334f60'; g.font = `bold 25px ${FONT}`; g.fillText(locationLabel(endKm), split + 24 + badgeWidth, H - 30, 690 - badgeWidth);
  g.textAlign = 'right'; g.fillStyle = '#0d70ca'; g.font = `bold 31px ${FONT}`; g.fillText(`${remain < 1 ? `${Math.round(remain * 1000)} m` : `${remain.toFixed(1)} km`}  ·  약 ${eta}분`, W - 26, H - 28);
  if (attention) {
    // Persistent, restrained border; no flashing or claim about accident probability.
    g.save(); g.strokeStyle = urgent ? '#ef565f' : '#e6ae50'; g.lineWidth = urgent ? 8 : 5;
    g.shadowColor = urgent ? '#ff626266' : '#e6ae5044'; g.shadowBlur = urgent ? 14 : 7;
    g.beginPath(); g.roundRect(split + 5, 5, W - split - 10, H - 10, 14); g.stroke(); g.restore();
  }
  return cue;
}
