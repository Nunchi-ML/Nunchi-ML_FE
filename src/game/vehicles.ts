import * as THREE from 'three';
import { alloyWheel, sculptedBody } from './vehicleGeometry';

/** 차 한 대. 모델은 +z가 앞쪽, 바닥이 y = 0 */
export interface Vehicle { m: THREE.Group; kind: Kind; len: number; s: number; lane: number; x: number; v: number; want: number; brakeMat: THREE.MeshStandardMaterial; wheels: THREE.Group[]; frontWheelPivots: THREE.Group[]; wheelRadius: number }
type Kind = 'sedan' | 'suv' | 'bus';

/** 옆모습 윤곽(z, y)을 폭만큼 밀어낸 몸체 — 상자보다 차처럼 보이게 */
function profileGeo(pts: [number, number][], width: number, bevel = 0.06, smooth = 0) {
  let ps = pts.map(([z, y]) => new THREE.Vector2(z, y));
  for (let it = 0; it < smooth; it++) {                                        // Chaikin: 꺾인 모서리를 둥글게 깎음
    const out: THREE.Vector2[] = [];
    ps.forEach((a, i) => { const b = ps[(i + 1) % ps.length]; out.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75)); });
    ps = out;
  }
  const sh = new THREE.Shape(ps);
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 4 });
  g.rotateY(-Math.PI / 2);                         // 윤곽의 가로축(z) → 차 길이, 밀어낸 방향 → 폭(x)
  g.translate(width / 2 - bevel, 0, 0);
  g.computeVertexNormals();
  return g;
}

function paneGeo(a: [number, number], b: [number, number], width: number) {
  const A = new THREE.Vector2(...a), B = new THREE.Vector2(...b), d = B.clone().sub(A), n = new THREE.Vector2(d.y, -d.x).normalize();
  const p0 = A.clone().lerp(B, 0.1), p1 = A.clone().lerp(B, 0.9);
  return profileGeo([p0.clone().addScaledVector(n, 0.012), p1.clone().addScaledVector(n, 0.012), p1.clone().addScaledVector(n, -0.03), p0.clone().addScaledVector(n, -0.03)].map(v => [v.x, v.y] as [number, number]), width, 0.01);
}
/** 윤곽을 안쪽으로 d만큼 줄임 (옆창: 둘레에 차체색 기둥 · 지붕이 남도록) */
function inset(pts: [number, number][], d: number): [number, number][] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([z, y]) => { const dz = z - cx, dy = y - cy, l = Math.hypot(dz, dy); return [z - dz / l * d * 1.6, y - dy / l * d]; });
}

interface Spec { len: number; w: number; body: [number, number][]; glass: [number, number][]; wheelZ: number[]; wheelR: number; lightY: number }
const SPECS: Record<Kind, Spec> = {
  sedan: {
    len: 4.6, w: 1.82, wheelZ: [1.38, -1.4], wheelR: 0.33, lightY: 0.72,
    body: [[-2.3, 0.28], [2.3, 0.28], [2.32, 0.62], [2.18, 0.82], [1.0, 0.9], [-1.55, 0.92], [-2.25, 0.86], [-2.32, 0.6]],
    glass: [[0.95, 0.88], [0.25, 1.36], [-0.95, 1.38], [-1.6, 0.9]],
  },
  suv: {
    len: 4.7, w: 1.9, wheelZ: [1.45, -1.45], wheelR: 0.38, lightY: 0.85,
    body: [[-2.35, 0.34], [2.35, 0.34], [2.36, 0.78], [2.2, 1.02], [1.25, 1.08], [-2.3, 1.1], [-2.37, 0.76]],
    glass: [[1.2, 1.05], [0.65, 1.68], [-2.15, 1.7], [-2.28, 1.08]],
  },
  bus: {
    len: 11, w: 2.5, wheelZ: [3.6, -3.1], wheelR: 0.5, lightY: 0.9,
    body: [[-5.5, 0.35], [5.5, 0.35], [5.52, 3.0], [5.3, 3.15], [-5.4, 3.15], [-5.52, 2.9]],
    glass: [[5.45, 2.85], [5.45, 1.25], [-5.35, 1.25], [-5.35, 2.85]],
  },
};

interface Shared { upper: THREE.BufferGeometry | null; body: THREE.BufferGeometry; glass: THREE.BufferGeometry; wheel: THREE.BufferGeometry; light: THREE.BufferGeometry; rim: THREE.BufferGeometry; win: THREE.BufferGeometry[]; arch: THREE.BufferGeometry }
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x344b5b, roughness: 0.13, metalness: 0.42, clearcoat: 1, clearcoatRoughness: 0.09, envMapIntensity: 0.8 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.6 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.2, metalness: 0.9 });
const plateMat = (() => {                                                       // 번호판
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d')!;
  x.fillStyle = '#f4f4ef'; x.fillRect(0, 0, 128, 32); x.strokeStyle = '#333'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 30);
  x.fillStyle = '#1a1a1a'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('12가 3456', 64, 17);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
})();
const tireMat = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.23, metalness: 0.85 });
const headMat = new THREE.MeshPhysicalMaterial({ color: 0xf6f4ee, emissive: 0xfff0c8, emissiveIntensity: 0.45, roughness: 0.05, clearcoat: 1 });

export function createVehicles(scene: THREE.Scene, rand: () => number) {
  const shared = {} as Record<Kind, Shared>;
  (Object.keys(SPECS) as Kind[]).forEach(k => {
    const sp = SPECS[k];
    const wheel = new THREE.CylinderGeometry(sp.wheelR, sp.wheelR, 0.26, 24); wheel.rotateZ(Math.PI / 2);
    shared[k] = {
      upper: k === 'bus' ? profileGeo(sp.body.map(([z, y]) => [z, Math.max(1.08, y)] as [number, number]), sp.w, .08, 1) : null,
      body: sculptedBody(sp.len, sp.w, k === 'bus' ? .35 : k === 'suv' ? .34 : .28, k === 'bus' ? 1.16 : k === 'suv' ? 1.08 : .9, sp.wheelZ, sp.wheelR),
      glass: k === 'bus' ? profileGeo(sp.glass, sp.w + 0.02, 0.01) : profileGeo(sp.glass, sp.w * 0.88, 0.05, 2),
      wheel, light: new THREE.BoxGeometry(0.42, 0.14, 0.06),
      rim: alloyWheel(sp.wheelR),
      // 승용차: 옆창(안쪽으로 줄인 윤곽) · 앞유리 · 뒷유리 — 캐빈 자체는 차체색
      win: k === 'bus' ? [] : [
        profileGeo(inset(sp.glass, 0.07), sp.w * 0.88 + 0.014, 0.01, 2),
        paneGeo(sp.glass[0], sp.glass[1], sp.w * 0.88 - 0.16),
        paneGeo(sp.glass[2], sp.glass[3], sp.w * 0.88 - 0.16),
      ],
      arch: new THREE.TorusGeometry(sp.wheelR + .065, .022, 6, 24, Math.PI).rotateY(Math.PI / 2),
    };
  });

  const make = (kind: Kind, color: number): Vehicle => {
    const sp = SPECS[kind], sh = shared[kind], g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.55, clearcoat: 0.85, clearcoatRoughness: 0.1, envMapIntensity: 0.9 });
    const body = new THREE.Mesh(sh.body, paint); body.castShadow = true; body.receiveShadow = true;
    const glass = new THREE.Group();                                             // 캐빈(지붕 · 기둥) + 창문 — 내 차는 통째로 숨김
    if (sh.upper) { const upper = new THREE.Mesh(sh.upper, paint); upper.castShadow = true; glass.add(upper); }
    const cabin = new THREE.Mesh(sh.glass, kind === 'bus' ? glassMat : paint); cabin.castShadow = true; glass.add(cabin);
    for (const w of sh.win) glass.add(new THREE.Mesh(w, glassMat));
    if (kind !== 'bus') {                                                          // B필러 (검은색)
      const gl = sp.glass, top = Math.min(gl[1][1], gl[2][1]) - 0.1, bot = gl[0][1] + 0.04;
      const bp = new THREE.Mesh(new THREE.BoxGeometry(sp.w * 0.88 + 0.03, top - bot, 0.08), trimMat);
      bp.position.set(0, (top + bot) / 2, gl[1][0] * 0.35 + gl[2][0] * 0.65); glass.add(bp);
    }
    g.add(body, glass);
    const wheels: THREE.Group[] = [], frontWheelPivots: THREE.Group[] = [];
    for (const z of sp.wheelZ) for (const sx of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(sx * (sp.w / 2 - 0.12), sp.wheelR, z);
      const wheel = new THREE.Group(); pivot.add(wheel);
      const tire = new THREE.Mesh(sh.wheel, tireMat); tire.castShadow = true; wheel.add(tire);
      const rim = new THREE.Mesh(sh.rim, rimMat); rim.position.x = sx * .14; wheel.add(rim);
      g.add(pivot); wheels.push(wheel);
      if (z === Math.max(...sp.wheelZ)) { pivot.name = 'front-wheel-steering'; frontWheelPivots.push(pivot); }
      const arch = new THREE.Mesh(sh.arch, trimMat); arch.position.set(sx * (sp.w / 2 + 0.005), sp.wheelR, z); g.add(arch);
    }
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a0d08, emissive: 0xff2a10, emissiveIntensity: 0.5 });
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    const fz = sp.len / 2, bw = sp.w;
    for (const sx of [-1, 1]) {
      part(sh.light, headMat, sx * (bw / 2 - 0.32), sp.lightY, fz + 0.01);
      part(sh.light, brakeMat, sx * (bw / 2 - 0.32), sp.lightY + 0.05, -fz - 0.01);
    }
    if (kind !== 'bus') {
      part(new THREE.BoxGeometry(bw * 0.42, 0.13, 0.04), trimMat, 0, sp.lightY - 0.04, fz + 0.012);              // 그릴
      part(new THREE.BoxGeometry(bw * 0.4, 0.012, 0.045), chromeMat, 0, sp.lightY + 0.03, fz + 0.013);          // 그릴 테두리
      part(new THREE.BoxGeometry(bw * 0.84, 0.1, 0.06), trimMat, 0, 0.36, fz + 0.005);                          // 앞 범퍼 아래
      part(new THREE.BoxGeometry(bw * 0.84, 0.1, 0.06), trimMat, 0, 0.36, -fz - 0.005);                         // 뒤 범퍼 아래
      part(new THREE.BoxGeometry(bw * 0.7, 0.04, 0.03), brakeMat, 0, sp.lightY + 0.05, -fz - 0.012);            // 뒤 가로 등
      for (const sx of [-1, 1]) {                                                                                 // 사이드미러
        const m = part(new THREE.BoxGeometry(0.18, 0.1, 0.12), paint, sx * (bw / 2 + 0.06), sp.lightY + 0.32, sp.len * 0.18);
        m.rotation.y = sx * 0.25;
      }
      part(new THREE.BoxGeometry(bw * 1.002, 0.012, sp.len * 0.55), trimMat, 0, sp.lightY + 0.05, -0.1);        // 옆 몰딩 라인
    }
    part(new THREE.PlaneGeometry(0.52, 0.12), plateMat, 0, 0.5, fz + 0.04);                                     // 앞 번호판
    part(new THREE.PlaneGeometry(0.52, 0.12), plateMat, 0, sp.lightY - 0.12, -fz - 0.04).rotation.y = Math.PI; // 뒤 번호판
    scene.add(g);
    return { m: g, kind, len: sp.len, s: 0, lane: 0, x: 0, v: 0, want: 0, brakeMat, wheels, frontWheelPivots, wheelRadius: sp.wheelR };
  };

  const me = make('sedan', 0xf2522e);
  const softTop = addSoftTop(me);
  const colors = [0xeeebe6, 0x30353d, 0x8a8f96, 0x1f3b5a, 0xd9c7a0, 0x5a2f2a, 0xf4f4f2, 0x6b7a5a];
  const traffic: Vehicle[] = [];
  for (let i = 0; i < 18; i++) {
    const kind: Kind = i % 9 === 4 ? 'bus' : i % 3 === 1 ? 'suv' : 'sedan';
    traffic.push(make(kind, kind === 'bus' ? (rand() < .5 ? 0x2f8f5b : 0x2b6fb3) : colors[(rand() * colors.length) | 0]));
  }
  return {
    me, softTop, traffic,
    dispose: () => {
      (Object.values(shared)).forEach(s => { s.body.dispose(); s.upper?.dispose(); s.glass.dispose(); s.wheel.dispose(); s.light.dispose(); s.rim.dispose(); s.arch.dispose(); s.win.forEach(w => w.dispose()); });
    },
  };
}



/**
 * 내 차: 천 지붕 컨버터블. 몸체 · 앞유리 · 실내는 그대로이고,
 * 천 지붕(옆 창 · 뒷창 포함)만 좌석 뒤로 접혀 들어가며 접힌 지붕 묶음이 남는다.
 */
function addSoftTop(me: Vehicle) {
  const g = me.m, W = 1.84;
  g.children[1].visible = false;                                                 // 세단 통유리는 쓰지 않음
  const bodyMesh = g.children[0] as THREE.Mesh, paint = bodyMesh.material as THREE.Material;
  // 낮고 긴 보닛 · 짧은 트렁크의 쐐기형 몸체 (벨트라인 0.86 m)
  bodyMesh.geometry = sculptedBody(4.6, W, .3, .86, [1.38, -1.4], .33, { start: -1.25, end: .75, floor: .48 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151313, roughness: 0.75 });
  const leather = new THREE.MeshStandardMaterial({ color: 0xb98c5e, roughness: 0.55 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0x1e1d21, roughness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4bd, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  const tint = new THREE.MeshStandardMaterial({ color: 0x23292e, roughness: 0.15, metalness: 0.5, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a07c, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.9 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, parent: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  };
  // 실내: 트인 객실 · 대시보드 · 좌석 · 운전대 · 운전자 (왼쪽 운전석 = 차 기준 +x)
  add(new THREE.BoxGeometry(1.4, .025, 1.75), dark, 0, .49, -.28);
  add(new THREE.BoxGeometry(.18, .18, 1.0), dark, 0, .61, -.3);
  add(new THREE.BoxGeometry(1.56, 0.12, 0.34), dark, 0, 0.93, 0.62);
  for (const x of [-0.4, 0.4]) {
    add(new THREE.BoxGeometry(.5, .12, .55), leather, x, .68, -.5);
    add(new THREE.BoxGeometry(0.48, 0.5, 0.1), leather, x, 1.02, -0.82, -0.2);
    add(new THREE.BoxGeometry(0.26, 0.16, 0.08), leather, x, 1.3, -0.9, -0.2);
  }
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24), dark);
  sw.position.set(0.4, 1.0, -.03); sw.rotation.x = -1.0; g.add(sw);
  // 운전자: 시트에 기대 앉아 어깨가 문 위로 나오고, 두 팔이 운전대를 잡음
  const torso = add(new THREE.CapsuleGeometry(.15, .2, 6, 12), shirt, 0.4, 1.04, -0.6, -0.2); torso.scale.set(1.15, 1, 0.75);
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), skin, 0.4, 1.26, -0.64);                       // 목
  add(new THREE.SphereGeometry(0.105, 18, 14), skin, 0.4, 1.35, -0.62);                                 // 머리
  add(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), dark, 0.4, 1.37, -0.635); // 머리카락
  for (const sx of [-1, 1]) {                                                                             // 어깨 → 팔꿈치 → 손
    const sh = new THREE.Vector3(0.4 + sx * 0.18, 1.16, -0.6), el = new THREE.Vector3(0.4 + sx * 0.23, .94, -.34), hand = new THREE.Vector3(0.4 + sx * 0.14, 1.0, -.03);
    const parts: [THREE.Vector3, THREE.Vector3, number, THREE.Material][] = [[sh, el, 0.055, shirt], [el, hand, 0.045, skin]];
    for (const [a, b, rad, m] of parts) {
      const len = a.distanceTo(b), arm = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 8), m);
      arm.position.copy(a).add(b).multiplyScalar(0.5); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      arm.castShadow = true; g.add(arm);
    }
  }
  const trousers = new THREE.MeshStandardMaterial({ color: 0x273340, roughness: .9 });
  for (const side of [-1, 1]) {
    const x = .4 + side * .105;
    add(new THREE.BoxGeometry(.15, .12, .38), trousers, x, .78, -.29, -.08);
    add(new THREE.CapsuleGeometry(.055, .17, 4, 8), trousers, x, .65, -.1, -.15);
    add(new THREE.BoxGeometry(.14, .08, .24), dark, x, .54, -.02);
  }
  // 문 위 몰딩 · 좌석 뒤 차체색 혹 (로드스터 느낌)
  for (const x of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.05, 0.03, 2.0), dark, x, 0.88, -0.4);
  for (const x of [-0.4, 0.4]) { const h = add(new THREE.CapsuleGeometry(0.12, 0.45, 4, 12), paint, x, 0.9, -1.45, Math.PI / 2); h.scale.set(1, 1, 0.65); }
  // 앞유리 (뼈대 · 고정): 두꺼운 검은 테두리
  const bot = new THREE.Vector3(0, 0.86, 0.95), topP = new THREE.Vector3(0, 1.42, 0.3);
  const len = bot.distanceTo(topP), ang = Math.atan2(topP.z - bot.z, topP.y - bot.y);
  const ws = new THREE.Group(); ws.position.copy(bot); ws.rotation.x = ang; g.add(ws);
  add(new THREE.PlaneGeometry(1.6, len), glass, 0, len / 2, 0, 0, ws);
  add(new THREE.BoxGeometry(1.7, 0.06, 0.06), dark, 0, len, 0, 0, ws);
  for (const x of [-0.83, 0.83]) add(new THREE.BoxGeometry(0.05, len, 0.05), dark, x, len / 2, 0, 0, ws);
  for (const x of [-1, 1]) { const m = add(new THREE.BoxGeometry(0.12, 0.08, 0.16), paint, x * 0.98, 0.95, 0.72); m.rotation.y = x * 0.3; }   // 사이드미러

  // 천 지붕: 앞유리 위에서 좌석 뒤까지 둥글게 덮음 + 옆 창 · 뒷창
  const top = new THREE.Group(); g.add(top);
  add(profileGeo([[0.3, 1.39], [0.24, 1.46], [-0.1, 1.52], [-0.95, 1.51], [-1.4, 1.24], [-1.66, 0.88], [-1.44, 0.88], [-1.05, 1.22], [-0.9, 1.45], [0.24, 1.43]], W - 0.12, 0.04), canvas, 0, 0, 0, 0, top);
  for (const x of [-1, 1]) {                                                    // 옆 창 (짙은 유리) · 천 테두리
    const shp = new THREE.Shape([new THREE.Vector2(0.3, 0.88), new THREE.Vector2(0.28, 1.4), new THREE.Vector2(-0.9, 1.44), new THREE.Vector2(-1.4, 0.9)]);
    const win = new THREE.Mesh(new THREE.ShapeGeometry(shp), tint); win.rotation.y = -Math.PI / 2 * x; win.position.x = x * (W / 2 - 0.08); win.castShadow = true;
    if (x < 0) win.scale.x = -1;
    top.add(win);
  }
  add(new THREE.PlaneGeometry(0.9, 0.3), tint, 0, 1.2, -1.42, -0.85, top);     // 작은 뒷창
  // 접힌 지붕 묶음 (열렸을 때 좌석 뒤에 남음)
  const stack = add(new THREE.BoxGeometry(1.5, 0.16, 0.42), canvas, 0, 0.96, -1.62);
  stack.visible = false;

  return {
    /** k: 0 닫힘 → 1 열림. 앞에서부터 뒤로 접히며 낮아짐 */
    set: (k: number) => {
      const e = k * k * (3 - 2 * k);
      top.visible = k < 0.98;
      top.scale.set(1, 1 - 0.7 * e, 1 - 0.75 * e); top.position.set(0, 0.25 * e, -1.6 * 0.75 * e * 0.6);
      stack.visible = k > 0.55; stack.scale.set(1, Math.min(1, (k - 0.55) / 0.45), 1);
    },
  };
}
