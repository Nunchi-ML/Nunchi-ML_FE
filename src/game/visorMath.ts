/** LCD 차광판 계산 (three.js 없이 테스트할 수 있게 분리).
 * 운전자 눈 = 원점, 앞 = −z, 위 = +y. 차광판은 눈앞 z = panel.z 에 세운 직사각형. */
export interface VisorPanel { x: number; y: number; z: number; w: number; h: number; tilt?: number }
export const VISOR: VisorPanel = { x: 0.0, y: 0.125, z: -0.6, w: 0.56, h: 0.16 };
export const VISOR_COLS = 22, VISOR_ROWS = 7;            // 육각형 칸 수 (가로 × 세로)
export const VISOR_DARK_RADIUS = 1.2;                     // 해 주변 몇 칸까지 어둡게 할지 (칸 지름 기준)
// Fixed to the cockpit's upper windshield frame (y≈.41, z≈-.62).
export const VISOR_MOUNT = { y: .38, z: -.68, offsetX: .20 };
export interface VisorEye { x: number; y: number; z: number }
const ORIGIN: VisorEye = { x: 0, y: 0, z: 0 };

const smooth = (p: number) => { const t = Math.max(0, Math.min(1, p)); return t * t * (3 - 2 * t); };
/** Reversible 0.7-second travel with eased geometry at both ends. */
export function visorDeployment(progress: number, on: boolean, dt: number) {
  return Math.max(0, Math.min(1, progress + (on ? 1 : -1) * Math.max(0, Math.min(.1, dt)) / .7));
}
/** The frame slides up while the plate folds back around its upper hinge. */
export function visorFrame(progress: number, p: VisorPanel = VISOR): VisorPanel {
  const amount = smooth(progress);
  return { ...p, y: p.y + (1 - amount) * .12, tilt: (amount - 1) * Math.PI / 2 };
}
/** Actual plate centre after rotation, used for eye-to-sun intersection. */
export function visorPose(progress: number, p: VisorPanel = VISOR): VisorPanel {
  const frame = visorFrame(progress, p), hinge = p.h / 2 + .009, tilt = frame.tilt!;
  return { ...frame, y: frame.y + hinge * (1 - Math.cos(tilt)), z: frame.z - hinge * Math.sin(tilt) };
}
export function visorSupports(progress: number) {
  const p = visorFrame(progress);
  return [-1, 1].map(side => ({
    top: { x: p.x + side * VISOR_MOUNT.offsetX, y: VISOR_MOUNT.y, z: VISOR_MOUNT.z },
    bottom: { x: p.x + side * VISOR_MOUNT.offsetX, y: p.y + p.h / 2 + .009, z: p.z },
  }));
}
/** Authored direct-light transmission matches the dark cell's rendered opacity. */
export function visorTransmission(hit: { u: number; v: number } | null, progress: number) {
  return hit ? 1 - visorOpacity(progress) : 1;
}
export function visorOpacity(progress: number) {
  return smooth(progress / .2);
}

/** 눈에서 해 쪽으로 그은 선이 차광판 어디를 지나는지 (0~1, 왼쪽 위 = 0,0). 판 밖이면 null. */
export function visorHit(dir: { x: number; y: number; z: number }, p: VisorPanel = VISOR, eye: VisorEye = ORIGIN) {
  if (dir.z >= -1e-6) return null;                        // 해가 뒤쪽·옆쪽
  const angle = p.tilt ?? 0, sn = Math.sin(angle), cs = Math.cos(angle);
  const denominator = -sn * dir.y + cs * dir.z;
  if (Math.abs(denominator) < 1e-6) return null;
  const t = (-sn * (p.y - eye.y) + cs * (p.z - eye.z)) / denominator;
  if (t <= 0 || p.w <= 0 || p.h <= 0) return null;
  const x = eye.x + dir.x * t - p.x, y = eye.y + dir.y * t - p.y, z = eye.z + dir.z * t - p.z;
  const u = .5 + x / p.w, v = .5 - (y * cs + z * sn) / p.h;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v } : null;
}

/** 육각형 칸 중심(0~1 좌표). 짝수 줄과 홀수 줄을 반 칸씩 어긋나게 쌓는다. */
export function visorCells(cols = VISOR_COLS, rows = VISOR_ROWS, aspect = VISOR.w / VISOR.h) {
  const cells: { u: number; v: number; col: number; row: number }[] = [];
  // 뾰족한 꼭짓점이 위인 육각형: 가로 간격 = √3·r, 세로 간격 = 1.5·r (판 가로세로 비율로 0~1 좌표에 맞춤)
  const dx = 1 / cols, dy = 1.5 * dx * aspect / Math.sqrt(3);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols + (row % 2 ? 0 : 1); col++) {
    const u = (col + (row % 2 ? .5 : 0)) * dx, v = .5 + (row - (rows - 1) / 2) * dy;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) cells.push({ u, v, col, row });
  }
  return { cells, dx, dy };
}

/** 해가 지나는 점 주변의 어둡게 할 칸 번호. 해가 판 밖이면 빈 목록. */
export function darkCells(hit: { u: number; v: number } | null, cols = VISOR_COLS, rows = VISOR_ROWS, aspect = VISOR.w / VISOR.h, radius = VISOR_DARK_RADIUS) {
  if (!hit) return [];
  const { cells, dx } = visorCells(cols, rows, aspect);
  const vy = 1 / aspect;                                   // 세로 1 = 가로 1/aspect
  return cells.map((c, i) => ({ i, d: Math.hypot(c.u - hit.u, (c.v - hit.v) * vy) })).filter(c => c.d <= radius * dx).map(c => c.i);
}
