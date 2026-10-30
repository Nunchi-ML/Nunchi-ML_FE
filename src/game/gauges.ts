import { BANK_KM, D, TOTAL, at, kmToS, riskAt, riskColor, sToKm, type Dir } from './road';
import { BANK_POS } from './city';

export function drawSpeedo(c: HTMLCanvasElement, kmh: number, danger: boolean, max = 140) {
  const g = c.getContext('2d')!, W = c.width, cx = W / 2, cy = W / 2 + 20, R = W * 0.4;
  g.clearRect(0, 0, W, W);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (v: number) => a0 + (a1 - a0) * Math.min(v, max) / max;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(18,13,10,.72)'; g.lineWidth = 46; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = 'rgba(255,248,231,.18)'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  g.strokeStyle = danger ? '#F2522E' : '#FFD45E'; g.beginPath(); g.arc(cx, cy, R, a0, ang(kmh)); g.stroke();
  g.fillStyle = '#e9d8bd'; g.font = '700 20px "Noto Sans KR"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= max; v += max > 160 ? 40 : 20) { const a = ang(v); g.fillText(String(v), cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)); }
  const a = ang(kmh); g.strokeStyle = '#F2522E'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.stroke();
  g.fillStyle = '#120d0a'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
  g.fillStyle = '#FFF8E7'; g.font = '84px "Black Han Sans"'; g.fillText(String(Math.round(kmh)), cx, cy + 76);
  g.font = '700 20px "Noto Sans KR"'; g.fillStyle = '#d9c7ad'; g.fillText('km/h', cx, cy + 126);
  g.font = '28px "Black Han Sans"'; g.fillStyle = '#FFD45E'; g.fillText('D', cx + R * 0.62, cy + 104);
}

/** 진행 방향이 위로 오게 돌아가는 미니맵 (반경 약 550 m) */
export function drawMinimap(c: HTMLCanvasElement, p: { x: number; z: number }, head: number, s0: number, dir: number, startKm: number, endKm: number) {
  const g = c.getContext('2d')!, W = c.width, sc = W / 1100;
  g.clearRect(0, 0, W, W); g.save(); g.translate(W / 2, W / 2 + 40); g.rotate(-head);
  const dirK: Dir = dir > 0 ? 'E' : 'W';
  for (let s = Math.max(0, s0 - 900); s < Math.min(TOTAL, s0 + 900); s += 50) {
    const a = at(s), b = at(s + 50);
    g.strokeStyle = riskColor(riskAt(sToKm(s), dirK).ratio); g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo((a.x - p.x) * sc, (a.z - p.z) * sc); g.lineTo((b.x - p.x) * sc, (b.z - p.z) * sc); g.stroke();
  }
  const r0 = kmToS(Math.min(startKm, endKm)), r1 = kmToS(Math.max(startKm, endKm));
  g.strokeStyle = '#FFD45E'; g.lineWidth = 5; g.setLineDash([10, 8]); g.beginPath();
  for (let s = Math.max(r0, s0 - 900); s <= Math.min(r1, s0 + 900); s += 30) { const a = at(s); g.lineTo((a.x - p.x) * sc, (a.z - p.z) * sc); }
  g.stroke(); g.setLineDash([]);
  const upright = (x: number, y: number, fn: () => void) => { g.save(); g.translate(x, y); g.rotate(head); fn(); g.restore(); };
  const mark = (km: number, txt: string, col: string) => {
    const a = at(kmToS(km));
    upright((a.x - p.x) * sc, (a.z - p.z) * sc, () => {
      g.fillStyle = col; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = '700 16px "Noto Sans KR"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 1);
    });
  };
  D.stations.forEach(st => {
    const a = at(kmToS(st.km)); if (Math.hypot(a.x - p.x, a.z - p.z) >= 700) return;
    upright((a.x - p.x) * sc, (a.z - p.z) * sc, () => {
      g.fillStyle = '#FFF8E7'; g.font = '700 17px "Noto Sans KR"'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText(st.name, 0, -14); g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill();
    });
  });
  mark(startKm, '출', '#3BA55C'); mark(endKm, '도', '#F2522E');
  const bk = BANK_POS ?? at(kmToS(BANK_KM));
  if (Math.hypot(bk.x - p.x, bk.z - p.z) < 700) upright((bk.x - p.x) * sc, (bk.z - p.z) * sc - 26, () => { g.font = '30px sans-serif'; g.textAlign = 'center'; g.fillText('🏦', 0, 0); });
  g.restore();
  g.fillStyle = '#F2522E'; g.beginPath(); g.moveTo(W / 2, W / 2 + 14); g.lineTo(W / 2 - 16, W / 2 + 62); g.lineTo(W / 2, W / 2 + 50); g.lineTo(W / 2 + 16, W / 2 + 62); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#FFD45E'; g.font = '700 22px "Noto Sans KR"'; g.textAlign = 'center'; g.fillText('N', W / 2 + Math.sin(-head) * 180, W / 2 + 40 - Math.cos(-head) * 180 + 8);
}
