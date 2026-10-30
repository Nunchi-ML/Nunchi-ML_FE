import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { D, ROAD_W, TOTAL, at, kmToS, stationLabel } from './road';
import { createVehicles, type Vehicle } from './vehicles';
import { buildCity } from './city';
import { buildIntersections, nearCrossing } from './intersections';

/** 결정적 난수 (매번 같은 도시) */
export function makeRand(seed = 7) { let r = seed; return () => (r = (r * 16807) % 2147483647) / 2147483647; }

export interface World {
  scene: THREE.Scene; sky: Sky; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; sunDisc: THREE.Mesh;
  occluders: THREE.Object3D[]; buildings: THREE.Mesh[]; bankGlow: THREE.MeshStandardMaterial | null; me: Vehicle; softTop: { set: (k: number) => void }; traffic: Vehicle[];
  lampHeads: THREE.MeshStandardMaterial; dispose: () => void;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function roadTexture() {
  const t = canvasTex(512, 256, g => {
    g.fillStyle = '#56504b'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .05})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    const lane = 512 / 9;
    g.fillStyle = '#e8dfc8';
    for (const k of [1, 2, 3, 6, 7, 8]) { const x = k * lane - 2; for (let y = 0; y < 256; y += 128) g.fillRect(x, y, 4, 64); }
    g.fillStyle = '#f0c040'; g.fillRect(256 - 7, 0, 4, 256); g.fillRect(256 + 3, 0, 4, 256);
    g.fillStyle = '#ddd4c2'; g.fillRect(0, 0, 6, 256); g.fillRect(506, 0, 6, 256);
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** 창문 한 칸 (가로 4 m · 층고 3.5 m) — 건물 크기에 맞춰 반복되게 셰이더에서 UV를 늘림 */
function windowTexture() {
  const t = canvasTex(64, 64, g => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#9fa7ad'; g.fillRect(8, 12, 48, 38);          // 유리
    g.fillStyle = '#c4ccd1'; g.fillRect(8, 12, 48, 6);           // 위쪽 반사
    g.fillStyle = '#e6e1d8'; g.fillRect(31, 12, 2, 38);          // 창틀
    g.fillStyle = '#d8d2c8'; g.fillRect(0, 54, 64, 4);           // 층 띠
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

function signTex(text: string, bg: string, fg: string, w = 512, h = 128) {
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `900 ${h * 0.6}px "Noto Sans KR", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  });
}

function ribbon(scene: THREE.Scene, width: number, y: number, mat: THREE.Material, step = 10) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let n = 0;
  for (let s = 0; s <= TOTAL; s += step) {
    const p = at(s), rx = -p.dz, rz = p.dx;
    pos.push(p.x - rx * width / 2, y, p.z - rz * width / 2, p.x + rx * width / 2, y, p.z + rz * width / 2);
    uv.push(0, s / 60, 1, s / 60);
    if (n) { const a = (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  const rand = makeRand(7);

  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const u = sky.material.uniforms;
  u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.0025; u.mieDirectionalG.value = 0.95;

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x4a3a30, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 900 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.4; scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.Fog(0xf0c89a, 700, 5200);

  // 해 원반: 실제 시직경(약 0.53°)에 가깝게 — 6000 m 거리에 반지름 30 m
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  scene.add(sunDisc);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: 0x86765f }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);

  ribbon(scene, ROAD_W + 14, 0.01, new THREE.MeshLambertMaterial({ color: 0xb8a990, side: THREE.DoubleSide }));   // 보도
  ribbon(scene, ROAD_W + 1.2, 0.06, new THREE.MeshLambertMaterial({ color: 0xcfc6b4, side: THREE.DoubleSide }));   // 연석
  ribbon(scene, ROAD_W, 0.08, new THREE.MeshLambertMaterial({ map: roadTexture(), side: THREE.DoubleSide }));  // 차도

  /* ---------- 건물: OpenStreetMap 실제 건물 윤곽 · 층수 (없으면 용도별 추정) ---------- */
  const winTex = windowTexture();
  const city = buildCity(scene, winTex);
  const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);

  /* ---------- 가로수 · 가로등 ---------- */
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 3, 6); trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.3, 1); crownGeo.translate(0, 4.6, 0);
  const NT = 1400;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5b4636 }), NT);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), NT);
  crowns.castShadow = true;
  const leaf = [0x5f7d3f, 0x6f8a45, 0x7d8b3c, 0x8e8a3a, 0xa0782f];                // 가을 느낌 섞기
  let nt = 0;
  for (let s = 8; s < TOTAL && nt < NT; s += 17) for (const side of [-1, 1]) {
    if (nt >= NT || rand() < 0.18 || nearCrossing(s)) continue;           // 사거리 · 횡단보도 자리는 비움
    const p = at(s), off = side * (ROAD_W / 2 + 3.6), x = p.x - p.dz * off, z = p.z + p.dx * off, k = 0.8 + rand() * 0.45;
    q.identity(); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(k, k, k));
    trunks.setMatrixAt(nt, m4); crowns.setMatrixAt(nt, m4); crowns.setColorAt(nt, col.setHex(leaf[(rand() * leaf.length) | 0])); nt++;
  }
  trunks.count = crowns.count = nt; scene.add(trunks, crowns);

  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 8, 6); poleGeo.translate(0, 4, 0);
  const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.4); armGeo.translate(0, 7.9, -1.1);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9); headGeo.translate(0, 7.8, -2.2);
  const NL = 900;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4d4a47 });
  const lampHeads = new THREE.MeshStandardMaterial({ color: 0x2a2724, emissive: 0xffc77a, emissiveIntensity: 0 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, NL), arms = new THREE.InstancedMesh(armGeo, poleMat, NL), heads = new THREE.InstancedMesh(headGeo, lampHeads, NL);
  let np = 0;
  for (let s = 20; s < TOTAL && np < NL; s += 45) {
    if (nearCrossing(s, 4)) continue;
    const side = (np % 2) ? 1 : -1, p = at(s), off = side * (ROAD_W / 2 + 1.2);
    q.setFromAxisAngle(up, Math.atan2(-side * p.dz, side * p.dx));      // 팔이 차도 쪽을 향하게
    m4.compose(new THREE.Vector3(p.x - p.dz * off, 0, p.z + p.dx * off), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(np, m4); arms.setMatrixAt(np, m4); heads.setMatrixAt(np, m4); np++;
  }
  poles.count = arms.count = heads.count = np; scene.add(poles, arms, heads);

  /* ---------- 역마다 사거리 · 횡단보도 · 신호등 · 지하철 출입구 ---------- */
  buildIntersections(scene);

  /* ---------- 역 이정표 ---------- */
  const poleSignMat = new THREE.MeshLambertMaterial({ color: 0x4a3a30 });
  D.stations.forEach(st => {
    const p = at(kmToS(st.km)), rx = -p.dz, rz = p.dx;
    const signMat = new THREE.MeshBasicMaterial({ map: signTex(stationLabel(st.name), '#1b5e9b', '#fff'), side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const off = side * (ROAD_W / 2 + 2);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), poleSignMat); pole.position.set(p.x + rx * off, 3, p.z + rz * off);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMat);
      sg.position.set(p.x + rx * off, 6.4, p.z + rz * off); sg.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2;
      scene.add(pole, sg);
    }
  });

  /* ---------- 차 ---------- */
  const { me, softTop, traffic, dispose: disposeCars } = createVehicles(scene, rand);

  return {
    scene, sky, sun, hemi, sunDisc, occluders: [...city.meshes, ...(city.bank ? [city.bank.group] : [])], buildings: city.meshes, bankGlow: city.bank?.glow ?? null, me, softTop, traffic, lampHeads,
    dispose: () => {
      disposeCars();
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach(mt => { const t = (mt as THREE.MeshBasicMaterial).map; if (t) t.dispose(); mt.dispose(); });
      });
    },
  };
}
