import * as THREE from 'three';
import { D, ROAD_W, at, kmToS, stationLabel } from './road';

/**
 * 역마다 사거리: 교차 도로 · 교차로 바닥 · 횡단보도 · 정지선 · 신호등 · 도시철도 2호선 출입구.
 * 달구벌대로의 2호선 역은 대부분 큰 교차로 아래에 있다 (배치는 단순화).
 */
export const CROSS_W = 22;                                   // 교차 도로 폭 (m)
const CROSS_LEN = 170;                                      // 교차 도로를 양옆으로 그리는 길이
const SIDE = ROAD_W / 2 + 7;                                // 보도 바깥 끝

/** s(m) 지점이 교차로 근처인지 (가로수 · 가로등을 비울 때 씀) */
export const nearCrossing = (s: number, pad = 14) => D.stations.some(st => Math.abs(kmToS(st.km) - s) < CROSS_W / 2 + pad);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildIntersections(scene: THREE.Scene) {
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x55504b });
  const walk = new THREE.MeshLambertMaterial({ color: 0xb8a990 });
  const paint = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: 0.6, metalness: 0.4 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.7 });
  const lampOn = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5 });
  const green = lampOn(0x30e07a), red = lampOn(0xff3b2f);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xa9c7cf, roughness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  const lineGreen = 0x00a650;                                                    // 2호선 색

  const stripes: THREE.Matrix4[] = [];                                           // 흰 줄 (횡단보도 · 정지선) 모아서 한 번에
  const m4 = (x: number, z: number, yaw: number, w: number, l: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, 0.095, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(w, 1, l));

  const plane = (w: number, l: number, m: THREE.Material, x: number, y: number, z: number, yaw: number) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, l), m); o.rotation.set(-Math.PI / 2, 0, yaw); o.position.set(x, y, z); o.receiveShadow = true; scene.add(o); return o;
  };

  D.stations.forEach(st => {
    const s = kmToS(st.km), p = at(s), dx = p.dx, dz = p.dz, rx = -dz, rz = dx;
    const yawD = Math.atan2(dx, dz);                                             // 달구벌대로 방향
    const P = (along: number, lat: number) => [p.x + dx * along + rx * lat, p.z + dz * along + rz * lat] as const;

    // 교차 도로 (양옆) · 보도 · 교차로 바닥 (차선 끊김)
    for (const sd of [-1, 1]) {
      const c = P(0, sd * (SIDE + CROSS_LEN / 2));
      plane(CROSS_W, CROSS_LEN, asphalt, c[0], 0.06, c[1], yawD + Math.PI / 2);
      for (const e of [-1, 1]) { const w = P(e * (CROSS_W / 2 + 3.5), sd * (SIDE + CROSS_LEN / 2)); plane(7, CROSS_LEN, walk, w[0], 0.02, w[1], yawD + Math.PI / 2); }
      const ctr = P(0, sd * (ROAD_W / 2 + 3.5)); plane(CROSS_W, 7.2, asphalt, ctr[0], 0.065, ctr[1], yawD + Math.PI / 2);   // 보도 끊고 차도 이어짐
    }
    const box = plane(ROAD_W - 1, CROSS_W, asphalt, p.x, 0.088, p.z, yawD);      // 교차로 안 (차선 없음)
    box.renderOrder = 1;

    // 횡단보도: 달구벌대로를 건너는 것 (교차로 양쪽) · 옆길을 건너는 것 (모서리)
    for (const e of [-1, 1]) {
      const along = e * (CROSS_W / 2 + 3);
      for (let lat = -ROAD_W / 2 + 1; lat <= ROAD_W / 2 - 1; lat += 1.1) { const q = P(along, lat); stripes.push(m4(q[0], q[1], yawD, 0.55, 4)); }
      // 정지선: 교차로로 들어오는 쪽 차로에만
      const stopAt = e * (CROSS_W / 2 + 6), lane = -e;                            // 교차로 앞쪽 차로 (진행 방향 오른쪽)
      const sl = P(stopAt, lane * ROAD_W / 4); stripes.push(m4(sl[0], sl[1], yawD + Math.PI / 2, 0.45, ROAD_W / 2 - 1));
    }
    for (const sd of [-1, 1]) {                                                  // 옆길을 건너는 횡단보도
      for (let a = -CROSS_W / 2 + 1; a <= CROSS_W / 2 - 1; a += 1.1) { const q = P(a, sd * (SIDE + 3)); stripes.push(m4(q[0], q[1], yawD + Math.PI / 2, 0.55, 3.5)); }
    }

    // 신호등: 네 모서리에 기둥 · 차도 위로 뻗은 팔 · 신호등 (달구벌대로 방향은 초록)
    const heads: THREE.Object3D[] = [];
    for (const [ea, sd] of [[-1, -1], [1, 1], [1, -1], [-1, 1]] as const) {
      const base = P(ea * (CROSS_W / 2 + 1.5), sd * (ROAD_W / 2 + 1.2));
      const g = new THREE.Group(); g.position.set(base[0], 0, base[1]);
      // 팔은 차도 쪽 (−sd 방향)으로, 신호는 다가오는 차를 마주봄
      g.rotation.y = yawD + (sd > 0 ? 0 : Math.PI);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 10), poleMat); pole.position.y = 3.5; pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.18, 0.18), poleMat); arm.position.set(4.5, 6.8, 0);
      g.add(pole, arm);
      for (const x of [4.5, 8.2]) {
        const head = new THREE.Group(); head.position.set(x, 6.3, 0); heads.push(head);
        head.add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.32), housing));
        [[-0.4, red, false], [0, lampOff, false], [0.4, green, true]].forEach(([lx, mat, on]) => {
          const l = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), on ? mat as THREE.Material : lampOff); l.position.set(lx as number, 0, 0.165); head.add(l);
        });
        g.add(head);
      }
      // 보행 신호 (작은 상자) · 버튼
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.25), housing); ped.position.set(0, 2.8, 0.25); g.add(ped);
      const pedL = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), red); pedL.position.set(0, 2.8, 0.38); g.add(pedL);
      scene.add(g); g.updateMatrixWorld(true);
      // 신호는 이 팔 아래 차로로 들어오는 차를 마주봄 (+r 쪽 차로는 +d로 달리므로 −d를 봄)
      heads.forEach(h => { const w = h.getWorldPosition(new THREE.Vector3()); h.lookAt(w.x - sd * dx, w.y, w.z - sd * dz); });
      heads.length = 0;
    }

    // 도시철도 2호선 출입구: 대각선 두 모서리, 보도 위 (계단 벽 · 유리 지붕 · 역 이름 간판)
    const sign = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(512, 128, x => {
      x.fillStyle = '#' + lineGreen.toString(16).padStart(6, '0'); x.fillRect(0, 0, 512, 128);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 42, 0, 7); x.fill();
      x.fillStyle = '#' + lineGreen.toString(16).padStart(6, '0'); x.font = '900 56px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('2', 64, 68);
      x.fillStyle = '#fff'; x.font = '900 52px "Noto Sans KR", sans-serif'; x.textAlign = 'left'; x.fillText(stationLabel(st.name).replace(/역$/, '') + '역', 124, 54);
      x.font = '500 24px "Noto Sans KR", sans-serif'; x.fillText('도시철도 2호선', 126, 102);
    }) });
    for (const [ea, sd] of [[1, 1], [-1, -1]] as const) {
      const c = P(ea * (CROSS_W / 2 + 12), sd * (ROAD_W / 2 + 4.6));
      const g = new THREE.Group(); g.position.set(c[0], 0, c[1]); g.rotation.y = yawD;
      for (const x of [-1.25, 1.25]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 7), wallMat); w.position.set(x, 0.55, 0); w.castShadow = true; g.add(w); }
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.75, 2.6, 0.25), wallMat); back.position.set(0, 1.3, -ea * 3.5); g.add(back);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 7.4), glassMat); roof.position.set(0, 2.55, 0); roof.rotation.x = ea * 0.06; g.add(roof);
      for (const x of [-1.35, 1.35]) for (const z of [-3.4, 3.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), poleMat); post.position.set(x, 1.3, z); g.add(post); }
      const stair = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 6.6), housing); stair.rotation.x = -Math.PI / 2; stair.position.set(0, 0.03, 0); g.add(stair);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), sign); sg.position.set(0, 2.95, ea * 3.55); sg.rotation.y = ea > 0 ? 0 : Math.PI; g.add(sg);
      const sgPole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), poleMat); sgPole.position.set(0, 2.7, ea * 3.55); g.add(sgPole);
      scene.add(g);
    }
  });

  const stripeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const inst = new THREE.InstancedMesh(stripeGeo, paint, stripes.length);
  stripes.forEach((m, i) => inst.setMatrixAt(i, m)); inst.receiveShadow = true; inst.renderOrder = 2; scene.add(inst);
}
