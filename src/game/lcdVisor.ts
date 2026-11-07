/** 운전석 앞 LCD 차광판: 투명한 판 위 육각형 칸 중 해가 눈에 들어오는 칸만 어둡게 한다.
 * 카메라 없이 해 위치·차 방향(기하 계산)만으로 칸을 고르는 체험이며, 실제 장치의 얼굴 추적·제어를 흉내 낸 것은 아니다. */
import * as THREE from 'three';
import { VISOR, VISOR_COLS, VISOR_ROWS, darkCells, visorCells, visorHit } from './visorMath';

export function createLcdVisor() {
  const group = new THREE.Group(); group.name = 'lcd-visor';
  const W = 1024, H = Math.round(W * VISOR.h / VISOR.w);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(VISOR.w, VISOR.h), mat);
  panel.renderOrder = 20; group.add(panel);                                 // 구름층(10)보다 나중에 그려야 하늘 위에서도 보인다
  // 테두리(검은 틀)와 위쪽 고정 막대
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: .6, transparent: true, opacity: 0 });
  const bar = (w: number, h: number, x: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .012), frameMat); m.position.set(x, y, 0); m.renderOrder = 20; group.add(m); };
  bar(VISOR.w + .02, .014, 0, VISOR.h / 2 + .004); bar(VISOR.w + .02, .01, 0, -VISOR.h / 2 - .004);
  bar(.01, VISOR.h + .02, -VISOR.w / 2 - .004, 0); bar(.01, VISOR.h + .02, VISOR.w / 2 + .004, 0);
  group.position.set(VISOR.x, VISOR.y, VISOR.z);

  const { cells, dx } = visorCells();
  const hexR = dx * W / Math.sqrt(3) * 1.02;               // 육각형 꼭짓점 반지름(px)
  function hex(cx: number, cy: number, r: number) {
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    g.closePath();
  }
  let lastKey = '';
  function draw(dark: number[]) {
    const key = dark.join(','); if (key === lastKey) return; lastKey = key;
    const on = new Set(dark);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(70,82,95,0.16)'; g.fillRect(0, 0, W, H);            // 살짝 비치는 판(옅은 회색)
    cells.forEach((c, i) => {
      hex(c.u * W, c.v * H, hexR * .96);
      if (on.has(i)) { g.fillStyle = 'rgba(6,7,10,1)'; g.fill(); }           // 해가 지나는 칸: 완전히 가림
      g.strokeStyle = on.has(i) ? 'rgba(0,0,0,1)' : 'rgba(225,232,240,0.32)'; g.lineWidth = 1.6; g.stroke();
    });
    tex.needsUpdate = true;
  }
  draw([]);

  let shown = 0;
  return {
    group,
    /** sunLocal: 운전석 기준 해 방향(단위벡터). 반환: 해가 판을 지나는지와 어둡게 한 칸 수. */
    update(on: boolean, sunLocal: THREE.Vector3, dt: number) {
      shown += ((on ? 1 : 0) - shown) * Math.min(1, dt * 6);
      group.visible = shown > .01;
      mat.opacity = shown; frameMat.opacity = shown * .95;
      group.position.y = VISOR.y + (1 - shown) * .12;                         // 켤 때 위에서 내려온다
      const hit = on ? visorHit(sunLocal) : null;
      const dark = darkCells(hit, VISOR_COLS, VISOR_ROWS);
      draw(dark);
      return { hit, darkCount: dark.length };
    },
    dispose() { tex.dispose(); mat.dispose(); frameMat.dispose(); panel.geometry.dispose(); },
  };
}
