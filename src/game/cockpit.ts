import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

/**
 * 손 모델(WebXR generic-hand, W3C Software and Document License)을 불러와 운전대를 쥔 자세로 만든다.
 * 손 좌표: 손가락 방향 −Z, 손등 +Y. 운전대에서는 손등이 운전자 쪽, 손가락이 바깥으로 뻗어 테두리 뒤로 감김.
 */
type Spot = { side: number; C: THREE.Vector3; up: THREE.Vector3; rv: THREE.Vector3; wrist: THREE.Vector3; elbow: THREE.Vector3 };
function loadHands(wheel: THREE.Object3D, spots: Spot[], skin: THREE.Material, tube: number, refs: Record<number, THREE.Object3D>) {
  const loader = new GLTFLoader();
  spots.forEach(({ side, up, rv, wrist, elbow }) => {
    loader.load(side < 0 ? './models/hand_left.glb' : './models/hand_right.glb', gltf => {
      const hand = gltf.scene;
      hand.traverse(o => { const m = o as THREE.SkinnedMesh; if (m.isMesh) { m.material = skin; m.castShadow = false; m.frustumCulled = false; } });
      const n = new THREE.Vector3(0, 0, 1);
      const bone = (name: string) => hand.getObjectByName(name) as THREE.Object3D | undefined;
      wheel.add(hand); hand.updateMatrixWorld(true);
      // 모델 안에서 손의 방향을 관절 위치로 직접 잼: 손가락 방향 · 검지↔새끼 가로축 · 손등 방향
      const loc = (nm: string) => { const b = bone(nm); return b ? hand.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(); };
      const wristL = loc('wrist');
      const fingerL = loc('middle-finger-phalanx-proximal').sub(wristL).normalize();
      const acrossL = loc('index-finger-phalanx-proximal').sub(loc('pinky-finger-phalanx-proximal'));
      acrossL.addScaledVector(fingerL, -acrossL.dot(fingerL)).normalize();
      const dorsalL = side > 0 ? new THREE.Vector3().crossVectors(fingerL, acrossL) : new THREE.Vector3().crossVectors(acrossL, fingerL);
      // 원하는 방향: 손가락은 팔뚝이 뻗은 방향을 이어받되 테두리 바깥으로 살짝 (손목이 꺾이지 않게),
      // 검지 쪽 → 12시(up), 손등 → 운전자 쪽
      const fingerW = wrist.clone().sub(elbow).normalize().multiplyScalar(0.55).addScaledVector(rv, 0.45).normalize();
      const acrossW = up.clone().addScaledVector(fingerW, -up.dot(fingerW)).normalize();
      const dorsalW = new THREE.Vector3().crossVectors(fingerW, acrossW);
      if (dorsalW.dot(n) < 0) dorsalW.negate();
      const mL = new THREE.Matrix4().makeBasis(acrossL, dorsalL, fingerL);
      const mW = new THREE.Matrix4().makeBasis(acrossW, dorsalW, fingerW);
      hand.quaternion.setFromRotationMatrix(mW.multiply(mL.transpose()));
      hand.userData.mLt = mL.clone();                                            // (이미 전치됨) 폰 들기 자세 계산용
      hand.userData.wristLocal = wristL.clone();
      // 손목 관절이 팔뚝 끝 자리에 오도록 옮김
      const wristTarget = wrist.clone();
      hand.position.set(0, 0, 0); hand.updateMatrixWorld(true);
      const wristNow = wheel.worldToLocal(bone('wrist')!.getWorldPosition(new THREE.Vector3()));
      hand.position.copy(wristTarget).sub(wristNow); hand.updateMatrixWorld(true);
      const wristP = new THREE.Vector3(); bone('wrist')?.getWorldPosition(wristP);
      const tipDist = (tip: THREE.Object3D) => { hand.updateMatrixWorld(true); return tip.getWorldPosition(new THREE.Vector3()).distanceTo(wristP); };
      // 손가락을 손바닥 쪽으로 구부리는 축: 검지 · 새끼 첫마디를 잇는 가로축
      const across = new THREE.Vector3();
      const ip = bone('index-finger-phalanx-proximal'), pp = bone('pinky-finger-phalanx-proximal');
      if (ip && pp) across.subVectors(ip.getWorldPosition(new THREE.Vector3()), pp.getWorldPosition(new THREE.Vector3())).normalize();
      // 이 모델은 관절이 서로 연결되지 않은 평평한 구조(XR이 관절을 하나씩 넣어 주는 용도)라,
      // 손가락 마디 위치를 직접 계산해 옮긴다: 첫마디부터 가로축을 기준으로 누적 회전
      const arm = bone('wrist')!.parent!;                                        // 모든 관절의 부모 (Armature)
      const armQ = arm.getWorldQuaternion(new THREE.Quaternion()).invert();
      const wq = wheel.getWorldQuaternion(new THREE.Quaternion());
      const palmA = n.clone().negate().applyQuaternion(wq).applyQuaternion(armQ);   // 손바닥 쪽 (Armature 좌표)
      const acrossA = across.clone().applyQuaternion(armQ).normalize();
      const deg = Math.PI / 180, R = new THREE.Quaternion();
      // 손가락마다 두 자세를 미리 계산: 운전대 쥐기(많이 말림) · 폰 들기(거의 편 채 끝만 살짝)
      type P = [THREE.Vector3, THREE.Quaternion];
      type Pose = { b: THREE.Object3D; grip: P; open: P; hold: P }[];
      const poses: Pose = [];
      for (const f of ['index', 'middle', 'ring', 'pinky']) {
        const js = ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(j => bone(`${f}-finger-${j}`));
        if (js.some(b => !b)) continue;
        const bs = js as THREE.Object3D[];
        const base = bs.map(b => [b.position.clone(), b.quaternion.clone()] as const);
        const d0 = base[1][0].clone().sub(base[0][0]).normalize();
        const sgn = Math.sign(new THREE.Vector3().crossVectors(acrossA, d0).dot(palmA)) || 1;
        const k = f === 'pinky' ? 1.1 : f === 'index' ? 0.9 : 1;                // 검지는 덜, 새끼는 더 말림
        const lens = [1, 2, 3].map(i => base[i][0].distanceTo(base[i - 1][0]));
        const curl = (degs: number[]) => {
          const out: [THREE.Vector3, THREE.Quaternion][] = [];
          let acc = 0, pos = base[0][0].clone();
          for (let i = 0; i < 4; i++) {
            if (i > 0) pos = pos.clone().addScaledVector(d0.clone().applyQuaternion(R.setFromAxisAngle(acrossA, acc)), lens[i - 1]);
            if (i < 3) acc += degs[i] * deg * k * sgn;
            out.push([pos.clone(), base[i][1].clone().premultiply(R.setFromAxisAngle(acrossA, acc))]);
          }
          return out;
        };
        // 폰 쥐기: 첫 마디는 거의 펴서 폰 뒷면을 가로지르고, 모서리에서 둘째 · 끝마디만 굽혀 감쌈
        const grip = curl([62, 88, 52]), open = curl([4, 8, 8]), hold = curl([4, 46, 60]);
        bs.forEach((b, i) => poses.push({ b, grip: grip[i], open: open[i], hold: hold[i] }));
      }
      /** 0 = 운전대 쥐기 → 0.5 = 손가락 폄 → 1 = 폰 쥐기 (말린 채로 바로 넘어가면 손가락이 폰을 뚫음) */
      hand.userData.setPose = (e: number) => {
        const [a, b2, t] = e < 0.5 ? ['grip', 'open', e * 2] as const : ['open', 'hold', e * 2 - 1] as const;
        poses.forEach(p => { p.b.position.lerpVectors(p[a][0], p[b2][0], t); p.b.quaternion.slerpQuaternions(p[a][1], p[b2][1], t); });
        arm.updateMatrixWorld(true);
      };
      hand.userData.setPose(0);
      hand.userData.homePos = hand.position.clone(); hand.userData.homeQuat = hand.quaternion.clone();
      refs[side] = hand;
      void tipDist; void tube;
    });
  });
}

export function createCockpit(paint = 0xb2331f) {
  const g = new THREE.Group();
  const fill = new THREE.PointLight(0xffe6cc, 0.8, 1.6, 2); fill.position.set(0.15, 0.15, -0.25); g.add(fill);   // 실내 보조광: 손 · 운전대 입체감
  const trim = new THREE.MeshStandardMaterial({ color: 0x1d1916, roughness: 0.85 });
  const dash = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
  const soft = new THREE.MeshStandardMaterial({ color: 0x3a312a, roughness: 0.95 });
  const paintMat = new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xd9a585, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffb59a) });   // 살결 (가장자리가 살짝 붉게 번짐)
  const sleeve = new THREE.MeshStandardMaterial({ color: 0xaeb9c7, roughness: 0.9 });   // 밝은 셔츠 (어두운 대시보드와 구분되게)
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
    // 몸체와 거울면을 한 묶음으로 같이 돌림 (거울면만 돌리면 반쯤 몸체 속에 묻혀 반만 보임)
    const unit = new THREE.Group(); unit.position.set(0.36, y, z); unit.rotation.y = -0.06; parent.add(unit);
    const h = box(0.24, 0.07, 0.035, frame, 0, 0, 0, 0, 0, 0, unit);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.058), mirrorFaceMat);
    face.position.set(0, 0, 0.0185); unit.add(face); mirrorFaces.push(face);
    const stem = box(0.015, 0.15, 0.015, frame, 0.36, y + 0.1, z - 0.01, 0, 0, 0, parent);
    if (list) list.push(h, face, stem);
  };
  rearMirror(0.26, -0.7, g);                                                    // 위쪽 안내 바에 가리지 않게 조금 내림 (앞 테두리에 달려 있어 뚜껑을 열어도 남음)
  // 사이드미러: 실제로 뒤쪽을 비춤. 왼쪽은 정면을 볼 때 화면 왼쪽 끝에 보이고, 오른쪽은 고개를 돌리면 보임
  const sideMirrorMats = [-1, 1].map(() => new THREE.MeshBasicMaterial({ color: 0xdfe6ea }));
  // 문 앞쪽 위 모서리(삼각 받침)에 붙고, 짧은 팔로 바깥에 나와 있음 — 보닛 밖 허공에 뜨지 않게
  ([[-0.88, -1, 0.45, 0], [1.62, 1, -0.45, 1]] as const).forEach(([doorX, out, r, i]) => {
    const base = V(doorX + out * 0.02, -0.25, -0.98);                            // 문 위 모서리
    fixed(box(0.05, 0.1, 0.16, paintMat, base.x, base.y + 0.03, base.z, 0, 0, 0));   // 삼각 받침 (문에 붙은 판)
    const unit = new THREE.Group(); unit.position.set(doorX + out * 0.16, -0.19, -1.02); unit.rotation.y = r; g.add(unit);
    box(0.2, 0.13, 0.07, paintMat, 0, 0, 0, 0, 0, 0, unit);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.1), sideMirrorMats[i]); f.position.z = 0.036; unit.add(f); mirrorFaces.push(f);
    link(base, unit.position.clone().add(V(-out * 0.07, -0.04, 0)), l => new THREE.BoxGeometry(0.04, l, 0.035), paintMat);   // 받침 → 거울 팔
  });

  // 보닛 · 앞유리 아래 카울 · 와이퍼
  const hood = new THREE.Mesh(hoodGeometry(), paintMat); hood.position.set(CAR_X, -0.55, -1.2); g.add(hood);
  box(1.62, 0.03, 0.14, trim, CAR_X, -0.53, -1.14);
  for (const [x, r] of [[0.05, 0.16], [0.62, 0.12]] as const) box(0.62, 0.012, 0.018, trim, x, -0.505, -1.13, 0, r, 0);

  // 운전대 + 손 (손은 운전대와 같이 돌아감)
  const wheel = new THREE.Group(); wheel.position.set(0, -0.265, -0.54); wheel.rotation.x = 0.45;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.022, 10, 40), trim));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 16), dash); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (const a of [Math.PI, 0, -Math.PI / 2]) {                                // 살 3개 (좌 · 우 · 아래)
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.015), dash);
    sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0); sp.rotation.z = a; wheel.add(sp);
  }
  // 손 (10시 · 2시 자세): WebXR 표준 손 모델(관절 25개)에 검은 가죽 운전 장갑을 씌워 테두리를 쥠
  const R0 = 0.185, TUBE = 0.022;
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x95a1b1, roughness: 0.85 });
  const glove = new THREE.MeshPhysicalMaterial({ color: 0x1c1816, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.5, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x6b5a4e) });
  const gripSpots: Spot[] = [];
  // 팔 부품 (높이 1짜리 원기둥을 두 점 사이에 늘려 놓음): 장갑 손목 · 맨 손목 · 소매 끝단 · 팔뚝 소매 · 위팔
  const buildArm = (parent: THREE.Object3D) => ([
    [0.034, 0.027, glove], [0.029, 0.028, skin], [0.044, 0.042, cuffMat], [0.05, 0.042, sleeve], [0.055, 0.055, sleeve],
  ] as const).map(([rt, rb, m]) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, 16), m); parent.add(o); return o; });
  const Y = new THREE.Vector3(0, 1, 0);
  const span = (o: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    o.position.copy(a).add(b).multiplyScalar(0.5); o.scale.set(1, a.distanceTo(b), 1);
    o.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
  };
  const placeArm = (p: THREE.Mesh[], wrist: THREE.Vector3, elbow: THREE.Vector3, shoulder: THREE.Vector3) => {
    const gloveEnd = wrist.clone().lerp(elbow, 0.13), cuff = wrist.clone().lerp(elbow, 0.28);
    span(p[0], wrist, gloveEnd); span(p[1], gloveEnd, cuff);
    span(p[2], cuff.clone().lerp(elbow, -0.04), cuff.clone().lerp(elbow, 0.12)); span(p[3], cuff, elbow);
    span(p[4], elbow, shoulder);
  };
  const staticArms: Record<number, THREE.Object3D> = {};
  for (const side of [-1, 1]) {
    const a = side < 0 ? Math.PI - 0.55 : 0.55;                                 // 10시 · 2시 자세 (손이 화면에 잘 보이게)
    const rv = V(Math.cos(a), Math.sin(a), 0);                                   // 테두리 바깥쪽
    const up = V(-Math.sin(a), Math.cos(a), 0).multiplyScalar(side < 0 ? -1 : 1); // 테두리를 따라 12시 쪽 (엄지 방향)
    const C = rv.clone().multiplyScalar(R0);
    // 팔꿈치 · 어깨는 운전자 몸 기준(눈 = 원점)으로 잡아 운전대 좌표로 바꿈: 팔이 몸 쪽에서 앞으로 뻗어 나옴
    const toWheel = new THREE.Matrix4().compose(wheel.position, wheel.quaternion, new THREE.Vector3(1, 1, 1)).invert();
    const elbow = V(side * 0.36, -0.45, -0.22).applyMatrix4(toWheel);
    // 손가락 방향 = 팔뚝 방향과 테두리 바깥 방향의 중간 (손목이 꺾이지 않게). 손가락 뿌리 관절이 테두리 위에 오도록 손목 자리를 역산
    const fore = C.clone().addScaledVector(rv, -0.07).sub(elbow).normalize();
    const fingerW = fore.multiplyScalar(0.55).addScaledVector(rv, 0.45).normalize();
    const wrist = C.clone().addScaledVector(fingerW, -0.055).addScaledVector(rv, 0.02).add(V(0, 0, 0.02));   // 손바닥 한가운데가 테두리에 걸치게
    const shoulder = V(side * 0.2, -0.24, 0.12).applyMatrix4(toWheel);
    gripSpots.push({ side, C, up, rv, wrist, elbow });
    const arm = new THREE.Group(); wheel.add(arm); staticArms[side] = arm;
    placeArm(buildArm(arm), wrist, elbow, shoulder);
  }
  const handRefs: Record<number, THREE.Object3D> = {};
  loadHands(wheel, gripSpots, glove, TUBE, handRefs);

  // 게임 속 폰 (3D): 오른손이 운전대에서 들어 눈앞으로 가져옴. 다 올라오면 화면 폰(DOM)이 이 자리에 겹쳐 나타남
  const PH_W = 0.0742, PH_H = 0.152;                                            // 화면 폰 390×800 비율과 같게
  const phone3D = new THREE.Group(); phone3D.visible = false;
  {
    // 화면 폰(390×800, 모서리 58px)과 같은 둥근 모서리 몸체 · 화면 (상자처럼 보이지 않게)
    const rrect = (w: number, h: number, r: number) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
    };
    const px = PH_W / 390, T = 0.0078, BV = 0.0013;
    const bodyGeo = new THREE.ExtrudeGeometry(rrect(PH_W - BV * 2, PH_H - BV * 2, 56 * px), { depth: T - BV * 2, bevelEnabled: true, bevelThickness: BV, bevelSize: BV, bevelSegments: 4, curveSegments: 10 });
    bodyGeo.translate(0, 0, -(T - BV * 2) / 2);
    const shell = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({ color: 0x3b3631, roughness: 0.28, metalness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    const sw = PH_W - 22 * px, shh = PH_H - 22 * px, scrGeo = new THREE.ShapeGeometry(rrect(sw, shh, 48 * px), 12);
    const pos = scrGeo.attributes.position, uv = scrGeo.attributes.uv;               // 모양 좌표 → 0~1 텍스처 좌표
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, pos.getY(i) / shh + 0.5);
    const scr = new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({ toneMapped: false, map: (() => {
      // 화면 폰 홈 화면을 닮게: 노을 배경 · 큰 시계 · 위젯 · 앱 4개 · 아래 버튼
      const W = 368, H = 778, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
      const gr = x.createLinearGradient(0, 0, 0, H);
      [[0, '#2a2350'], [0.35, '#6a3f72'], [0.62, '#d0663f'], [0.78, '#f2a748'], [0.9, '#7a4a2a'], [1, '#2c1c12']].forEach(([o, col]) => gr.addColorStop(o as number, col as string));
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      const sun = x.createRadialGradient(W / 2, H * 0.74, 0, W / 2, H * 0.74, 120); sun.addColorStop(0, 'rgba(255,240,200,.95)'); sun.addColorStop(0.3, 'rgba(255,214,150,.5)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
      x.fillStyle = sun; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = 'bold 84px sans-serif'; x.fillText('17:00', W / 2, 150);
      x.font = '20px sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText('10월 30일', W / 2, 186);
      x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.roundRect(22, 214, W - 44, 140, 24); x.fill();
      ['#f2a13a', '#5bb57a', '#e46a4a', '#9a9a9a'].forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.roundRect(22 + i * 86, 560, 64, 64, 16); x.fill(); });
      x.fillStyle = 'rgba(40,24,16,.55)'; x.beginPath(); x.roundRect(22, 670, W - 44, 60, 30); x.fill();
      x.fillStyle = '#050404'; x.beginPath(); x.roundRect(W / 2 - 59, 12, 118, 34, 17); x.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })() }));
    scr.position.z = T / 2 + 0.0002;
    const btn = new THREE.MeshStandardMaterial({ color: 0x5a5047, roughness: 0.35, metalness: 0.7 });  // 옆 버튼
    for (const [sx, y, h] of [[-1, 0.032, 0.012], [-1, 0.012, 0.012], [1, 0.022, 0.018]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.0012, h, 0.0028), btn); b.position.set(sx * (PH_W / 2 + 0.0004), y, 0); phone3D.add(b);
    }
    phone3D.add(shell, scr);
  }
  g.add(phone3D);
  // 폰을 든 자세: 눈앞 0.18 m, 살짝 아래 · 화면이 눈을 향함
  const PH_POS = V(0.004, 0.002, -0.158), PH_Q = new THREE.Quaternion();
  // 폰을 드는 동안의 오른팔: 손목은 손을 따라가고, 팔꿈치는 몸 옆에서 앞으로 들림 (운전대에 붙은 팔은 숨김)
  const liveArm = buildArm(g); liveArm.forEach(o => o.visible = false);
  const ELBOW_WHEEL = V(0.36, -0.45, -0.22), ELBOW_HOLD = V(0, 0, 0), SHOULDER = V(0.2, -0.24, 0.12);
  let held = false; const startPos = new THREE.Vector3(), startQuat = new THREE.Quaternion();
  const holdPos = new THREE.Vector3(), holdQuat = new THREE.Quaternion();
  const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /** t: 0 = 운전대 위, 1 = 눈앞. 손 모델이 아직 없으면 false */
  const holdPhone = (t: number) => {
    const R = handRefs[1]; if (!R) return false;
    if (t <= 0) {
      if (held) {
        wheel.add(R); R.position.copy(R.userData.homePos); R.quaternion.copy(R.userData.homeQuat); R.userData.setPose(0); held = false;
        R.children.forEach(c => { c.visible = c !== phone3D; });
        staticArms[1].visible = true; liveArm.forEach(o => o.visible = false);
      }
      phone3D.visible = false; return true;
    }
    if (!held) {
      g.attach(R); startPos.copy(R.position); startQuat.copy(R.quaternion); held = true;
      // 한 손으로 폰 쥐기: 손바닥이 폰 뒷면을 받치고, 손가락은 왼쪽 모서리를 감싸며, 엄지 쪽이 위
      holdQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, -1), V(-1, 0, 0)).multiply(R.userData.mLt as THREE.Matrix4));
      // 손가락이 왼쪽 위 대각선을 향하게 기울이고, 팔꿈치를 그 연장선(오른쪽 아래)에 둬서 손목이 꺾이지 않게
      // 손가락은 폰 뒷면을 거의 가로로(살짝 위로) 지나 왼쪽 모서리에서 감싸고, 팔꿈치는 그 연장선보다 조금 아래 (손목은 살짝만 꺾임)
      const TILT = -0.45, Z = V(0, 0, 1);
      holdQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(Z, TILT));
      const fingerHold = V(-1, 0, 0).applyAxisAngle(Z, TILT);
      const wristG = PH_POS.clone().add(V(0.004, -0.008, -0.026)).addScaledVector(fingerHold, -0.088);   // 손가락 뿌리가 폰 가운데 뒤
      ELBOW_HOLD.copy(wristG).addScaledVector(fingerHold, -0.24).add(V(0, -0.08, 0.05));
      holdPos.copy(wristG).sub((R.userData.wristLocal as THREE.Vector3).clone().applyQuaternion(holdQuat));
      // 폰은 손에 붙여서 같이 움직이게: 들기 자세에서의 손 기준 상대 위치
      const mHand = new THREE.Matrix4().compose(holdPos, holdQuat, V(1, 1, 1));
      const rel = mHand.invert().multiply(new THREE.Matrix4().compose(PH_POS, PH_Q, V(1, 1, 1)));
      R.add(phone3D); rel.decompose(phone3D.position, phone3D.quaternion, phone3D.scale);
      staticArms[1].visible = false; liveArm.forEach(o => o.visible = true);
    }
    const e = ease(Math.min(1, t));
    R.position.lerpVectors(startPos, holdPos, e).y += Math.sin(Math.PI * e) * 0.035;   // 살짝 위로 호를 그리며
    R.quaternion.slerpQuaternions(startQuat, holdQuat, e);
    R.userData.setPose(e);                                                    // 운전대를 놓으며 손가락을 펴고, 다 올라오면서 폰을 감쌈
    const wristNow = (R.userData.wristLocal as THREE.Vector3).clone().applyQuaternion(R.quaternion).add(R.position);
    placeArm(liveArm, wristNow, ELBOW_WHEEL.clone().lerp(ELBOW_HOLD, e), SHOULDER);
    // 다 올라와 화면 폰이 겹치면 3D 폰 · 손 · 팔은 숨김 (폰 화면만 보이게 — 3D 폰 모서리가 검은 테두리로 비치지 않게)
    const showHand = t < 0.96;
    phone3D.visible = e > 0.3 && showHand;                                    // 손가락이 펴진 뒤에 폰이 손에 잡힘 R.children.forEach(c => { if (c !== phone3D) c.visible = showHand; }); liveArm.forEach(o => o.visible = showHand);
    return true;
  };
  /** 3D 폰이 화면에 보이는 중심 · 높이 (px) — 화면 폰을 정확히 겹치는 데 씀 */
  const phoneRect = (camera: THREE.Camera, w: number, h: number) => {
    phone3D.updateMatrixWorld(true);
    const top = phone3D.localToWorld(V(0, PH_H / 2, 0)).project(camera), bot = phone3D.localToWorld(V(0, -PH_H / 2, 0)).project(camera);
    return { cx: ((top.x + bot.x) / 2 * 0.5 + 0.5) * w, cy: (-(top.y + bot.y) / 2 * 0.5 + 0.5) * h, hpx: Math.abs(top.y - bot.y) * 0.5 * h };
  };
  box(0.08, 0.08, 0.3, dash, 0, -0.325, -0.67, 0.45);                         // 운전대 기둥
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
    group: g, mirrorFaces, mirrorFaceMat, sideMirrorMats,
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
    holdPhone, phoneRect,
  };
}
