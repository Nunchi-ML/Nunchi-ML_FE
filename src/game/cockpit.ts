import * as THREE from 'three';

/**
 * 운전석 실내 (차에 붙은 rig 안). 운전자 눈이 원점, 앞이 -z, 위가 +y.
 * 한국 차는 왼쪽 운전석이라 차 중심은 오른쪽(+x) 약 0.37 m.
 * 지붕 · A필러 · 대시보드가 실제로 해를 가리는지도 이 메시로 검사한다.
 */
const CAR_X = 0.37;

/** 가운데가 볼록하고 옆 · 앞이 둥글게 말려 내려가는 보닛 */
function hoodGeometry() {
  const W = 0.8, L = 1.7, nu = 28, nv = 24, pos: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = -W + 2 * W * i / nu, v = L * j / nv, a = Math.abs(u);
    let y = 0.04 * (1 - (u / W) ** 2);                                        // 가운데 볼록
    y += 0.007 * Math.exp(-(((a - 0.27) / 0.035) ** 2));                     // 양쪽 캐릭터 라인
    y -= Math.max(0, (a - 0.6) / 0.2) ** 2 * 0.09;                           // 옆으로 말려 내려감
    y -= Math.max(0, (v - 1.45) / 0.25) ** 2 * 0.07;                         // 앞쪽 끝 둥글게
    const x = u * (1 - 0.06 * v / L);                                         // 앞으로 갈수록 살짝 좁아짐
    pos.push(x, y - 0.088 * v, -v);                                           // 앞으로 내려가는 경사
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createCockpit(paint = 0xb2331f) {
  const g = new THREE.Group();
  const trim = new THREE.MeshStandardMaterial({ color: 0x1d1916, roughness: 0.85 });
  const dash = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
  const soft = new THREE.MeshStandardMaterial({ color: 0x3a312a, roughness: 0.95 });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ab, roughness: 0.3, metalness: 0.2 });
  const paintMat = new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6a07c, roughness: 0.7 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c3646, roughness: 0.9 });
  const headliner = new THREE.MeshStandardMaterial({ color: 0x8c8377, roughness: 1 });
  const door = new THREE.MeshStandardMaterial({ color: 0x2e2722, roughness: 0.8 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x3b2c24, roughness: 0.75 });
  const vent = new THREE.MeshStandardMaterial({ color: 0x111010, roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9c3ba, roughness: 0.3, metalness: 0.35 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x151312, roughness: 0.45, metalness: 0.2 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1715, roughness: 1 });
  const rearGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4bd, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const clusterTex = (() => {                                                   // 계기판 그림 (속도 · 회전수 바늘판)
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const x = c.getContext('2d')!;
    x.fillStyle = '#07090b'; x.fillRect(0, 0, 512, 160);
    for (const [cx, col] of [[110, '#ffb347'], [402, '#7fd6ff']] as const) {
      x.strokeStyle = '#2a2f36'; x.lineWidth = 10; x.beginPath(); x.arc(cx, 92, 60, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
      x.strokeStyle = col; x.lineWidth = 4;
      for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.8 + Math.PI * 1.4 * i / 10; x.beginPath(); x.moveTo(cx + Math.cos(a) * 50, 92 + Math.sin(a) * 50); x.lineTo(cx + Math.cos(a) * 60, 92 + Math.sin(a) * 60); x.stroke(); }
      x.strokeStyle = '#ff5a3c'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx, 92); x.lineTo(cx + Math.cos(Math.PI * 1.25) * 48, 92 + Math.sin(Math.PI * 1.25) * 48); x.stroke();
    }
    x.fillStyle = '#9fd8ff'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('D', 256, 70);
    x.fillStyle = '#5c6670'; x.font = '18px sans-serif'; x.fillText('눈치', 256, 120);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clusterMat = new THREE.MeshBasicMaterial({ map: clusterTex, toneMapped: false });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0x1d4f6e, emissiveIntensity: 0.6, roughness: 0.2 });

  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, parent: THREE.Object3D = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); parent.add(b); return b;
  };
  /** 두 점을 잇는 막대 · 캡슐 */
  const link = (a: THREE.Vector3, b: THREE.Vector3, geo: (len: number) => THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = g) => {
    const len = a.distanceTo(b), mesh = new THREE.Mesh(geo(len), m);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(mesh); return mesh;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  const blockers: THREE.Object3D[] = [];
  // 차 뼈대(앞유리 · A필러 · 앞 테두리 · 문)는 그대로 두고, 지붕 뚜껑(roof)만 뒤로 접혀 들어간다
  const roof = new THREE.Group(); g.add(roof);
  const onRoof = (o: THREE.Object3D) => { roof.add(o); blockers.push(o); return o; };
  const fixed = (o: THREE.Object3D) => { blockers.push(o); return o; };
  // 지붕 · 천장 · 앞 지붕 테두리 · 선바이저
  onRoof(box(2.6, 0.06, 2.1, trim, CAR_X, 0.46, 0.4, 0, 0, 0, roof));
  roof.add(box(2.3, 0.02, 1.95, headliner, CAR_X, 0.425, 0.42, 0, 0, 0, roof));
  for (const x of [-0.82, 1.56]) onRoof(link(V(x, 0.42, 1.38), V(x, -0.12, 1.78), l => new THREE.BoxGeometry(0.12, l, 0.3), trim, roof));   // C필러
  roof.add(link(V(CAR_X, 0.42, 1.4), V(CAR_X, -0.1, 1.8), l => new THREE.PlaneGeometry(2.3, l), rearGlassMat, roof));                   // 뒷유리
  fixed(box(2.4, 0.07, 0.14, soft, CAR_X, 0.41, -0.62, -0.25));                // 앞유리 위 테두리 (뼈대)
  onRoof(box(0.36, 0.025, 0.2, soft, -0.02, 0.385, -0.56, -0.35, 0, 0, roof));
  onRoof(box(0.36, 0.025, 0.2, soft, 0.76, 0.385, -0.56, -0.35, 0, 0, roof));
  // A필러 · 앞유리 (뼈대)
  fixed(link(V(-0.78, -0.4, -1.08), V(-0.84, 0.42, -0.6), l => new THREE.BoxGeometry(0.07, l, 0.12), trim));
  fixed(link(V(1.52, -0.4, -1.08), V(1.58, 0.42, -0.6), l => new THREE.BoxGeometry(0.07, l, 0.12), trim));
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  const shield = (topY: number, topZ: number) => {                             // 카울에서 위쪽 틀까지 걸친 앞유리
    const m = link(V(CAR_X, -0.5, -1.1), V(CAR_X, topY, topZ), l => new THREE.PlaneGeometry(2.25, l), glassMat);
    m.renderOrder = 5; return m;
  };
  shield(0.4, -0.62);
  // 문 · 창틀 (고개를 옆으로 돌리면 보임)
  for (const [x, side] of [[-0.88, -1], [1.62, 1]] as const) {
    box(0.08, 0.6, 2.9, door, x, -0.56, 0.45);                                  // 앞문 · 뒷문 안쪽
    box(0.14, 0.05, 2.9, soft, x - side * 0.03, -0.26, 0.45);                   // 팔걸이 · 창턱
    box(0.03, 0.12, 0.06, chrome, x - side * 0.05, -0.35, -0.55);               // 손잡이
    onRoof(box(0.06, 0.06, 2.0, trim, x, 0.38, 0.4, 0, 0, 0, roof));            // 창 위 틀 (지붕과 같이 접힘)
    onRoof(box(0.07, 0.82, 0.1, trim, x, 0.0, 0.62, 0, 0, 0, roof));            // B필러 (뚜껑과 같이 접힘)
  }
  // 좌석 (옆자리) · 가운데 콘솔 · 변속기
  box(0.5, 0.12, 0.5, seat, 1.08, -0.72, 0.05);
  box(0.5, 0.75, 0.12, seat, 1.08, -0.3, 0.33, -0.18);
  box(0.28, 0.16, 0.08, seat, 1.08, 0.13, 0.4, -0.18);
  box(0.24, 0.22, 0.9, dash, CAR_X, -0.7, -0.15);
  box(2.4, 0.04, 3.0, floorMat, CAR_X, -0.86, 0.3);                           // 바닥
  box(1.9, 0.16, 0.55, seat, CAR_X, -0.62, 1.05);                             // 뒷좌석 방석
  box(1.9, 0.62, 0.14, seat, CAR_X, -0.27, 1.38, -0.15);                      // 뒷좌석 등받이
  for (const x of [-0.25, CAR_X, 1.0]) box(0.26, 0.14, 0.08, seat, x, 0.1, 1.42, -0.15);   // 뒷좌석 머리 받침
  box(2.3, 0.04, 0.4, dash, CAR_X, -0.06, 1.62, 0.1);                         // 뒤 선반
  box(2.3, 0.06, 0.9, paintMat, CAR_X, -0.14, 2.15, 0.05);                    // 트렁크 덮개 (오픈카일 때 보임)
  box(0.5, 0.75, 0.12, seat, 0, -0.38, 0.34, -0.18);                         // 운전석 등받이
  for (const x of [-0.2, 0.2]) box(0.08, 0.3, 0.1, seat, x, 0.02, 0.28, -0.18);   // 등받이 어깨 (머리 양옆)
  box(0.03, 0.12, 0.03, chrome, CAR_X, -0.53, -0.2);
  box(0.06, 0.05, 0.08, trim, CAR_X, -0.46, -0.2);
  // 대시보드
  blockers.push(box(2.4, 0.06, 0.5, dash, CAR_X, -0.42, -0.86, 0.1));
  box(2.4, 0.4, 0.1, dash, CAR_X, -0.64, -0.6, -0.25);
  box(0.46, 0.09, 0.22, trim, 0.0, -0.33, -0.74, 0.1);                         // 계기판 덮개
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.13), clusterMat);   // 계기판 (빛나는 바늘판)
  cluster.position.set(0, -0.385, -0.69); cluster.rotation.x = -0.25; g.add(cluster);
  box(0.3, 0.16, 0.04, screenMat, 0.5, -0.4, -0.64, -0.3);                     // 가운데 화면
  for (const x of [-0.45, 0.33, 0.67, 1.2]) box(0.14, 0.05, 0.03, vent, x, -0.47, -0.585, -0.25);   // 송풍구
  box(2.3, 0.012, 0.012, chrome, CAR_X, -0.405, -0.6, 0.1);                    // 대시보드 장식 띠
  // 백미러 · 사이드미러
  const mirrorFaceMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ea });
  const mirrorFaces: THREE.Mesh[] = [];
  const rearMirror = (y: number, z: number, parent: THREE.Object3D, list?: THREE.Object3D[]) => {
    const h = box(0.24, 0.07, 0.035, frame, 0.36, y, z, 0, 0, 0, parent);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.058), mirrorFaceMat);
    face.position.set(0.36, y, z + 0.019); face.rotation.y = -0.06; parent.add(face); mirrorFaces.push(face);
    const stem = box(0.015, 0.09, 0.015, frame, 0.36, y + 0.07, z - 0.01, 0, 0, 0, parent);
    if (list) list.push(h, face, stem);
  };
  rearMirror(0.31, -0.7, g);                                                    // 앞 테두리에 달려 있어 뚜껑을 열어도 남음
  for (const [x, r] of [[-0.98, 0.35], [1.72, -0.35]] as const) {              // 사이드미러 (하우징 + 거울면)
    box(0.18, 0.12, 0.07, paintMat, x, -0.22, -0.95, 0, r, 0);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.09), mirrorMat); f.position.set(x, -0.22, -0.91); f.rotation.y = r; g.add(f);
  }

  // 보닛 · 앞유리 아래 카울 · 와이퍼
  const hood = new THREE.Mesh(hoodGeometry(), paintMat); hood.position.set(CAR_X, -0.55, -1.2); g.add(hood);
  box(1.62, 0.03, 0.14, trim, CAR_X, -0.53, -1.14);
  for (const [x, r] of [[0.05, 0.16], [0.62, 0.12]] as const) box(0.62, 0.012, 0.018, trim, x, -0.505, -1.13, 0, r, 0);

  // 운전대 + 손 (손은 운전대와 같이 돌아감)
  const wheel = new THREE.Group(); wheel.position.set(0, -0.3, -0.56); wheel.rotation.x = 0.45;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 10, 40), trim));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 16), dash); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (const a of [Math.PI, 0, -Math.PI / 2]) {                                // 살 3개 (좌 · 우 · 아래)
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.015), dash);
    sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0); sp.rotation.z = a; wheel.add(sp);
  }
  for (const side of [-1, 1]) {                                                 // 9시 15분 자세
    const a = side < 0 ? Math.PI - 0.35 : 0.35, hx = Math.cos(a) * 0.185, hy = Math.sin(a) * 0.185;
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.06, 4, 10), skin);
    hand.position.set(hx, hy, 0.012); hand.rotation.z = a + Math.PI / 2; wheel.add(hand);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.03, 3, 8), skin);
    thumb.position.set(hx - side * 0.02, hy + 0.02, 0.03); thumb.rotation.set(0.6, 0, side * 0.6); wheel.add(thumb);
    link(V(hx, hy - 0.01, 0.03), V(hx + side * 0.1, hy - 0.3, 0.22), l => new THREE.CapsuleGeometry(0.03, l, 4, 10), skin, wheel);       // 손목 ~ 팔뚝
    link(V(hx + side * 0.1, hy - 0.3, 0.22), V(hx + side * 0.17, hy - 0.55, 0.38), l => new THREE.CapsuleGeometry(0.045, l, 4, 10), sleeve, wheel);   // 소매
  }
  box(0.08, 0.08, 0.3, dash, 0, -0.36, -0.69, 0.45);                           // 운전대 기둥
  g.add(wheel);

  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });

  // k: 0 = 지붕 닫힘, 1 = 오픈카. 지붕이 뒤로 밀리며 내려가고, 반쯤 지나면 앞유리 · 필러가 바뀜
  let k = 0, target = 0;
  const apply = () => {
    const e = k * k * (3 - 2 * k);
    roof.position.set(0, -0.32 * e, 1.7 * e); roof.rotation.x = 0.35 * e; roof.visible = k < 0.999;
  };
  apply();

  return {
    group: g, mirrorFaces, mirrorFaceMat,
    /** 오픈카로 바꾸기 (instant면 애니메이션 없이) */
    setOpen: (v: boolean, instant = false) => { target = v ? 1 : 0; if (instant) { k = target; apply(); } },
    /** 지붕 접힘 애니메이션 (약 1.6초) */
    get progress() { return k; },
    update: (dt: number) => { if (k === target) return; k = target > k ? Math.min(target, k + dt / 1.6) : Math.max(target, k - dt / 1.6); apply(); },
    get opening() { return k !== target; },
    /** 지금 보이는 부품 중 해를 가리는 것 (접히는 중인 지붕은 반 이상 열리면 제외) */
    get blockers() { return blockers.filter(o => o.visible && (o.parent !== roof || k < 0.3)); },
    /** 운전대 돌리기 (차선 변경 정도에 맞춰) */
    steer: (a: number) => { wheel.rotation.z = a; },
  };
}
