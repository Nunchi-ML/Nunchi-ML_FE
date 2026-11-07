import * as THREE from 'three';

/* 신천 둔치: 실제 OSM 물길(중심선)을 따라 물 · 호안 · 잔디 둔치 · 산책로 · 갈대 · 둔치 나무를 깐다.
 * 폭·배치는 그림용 가정값이다. 둔치는 차도 · 보도와 겹치지 않도록 도로와의 거리만큼만 넓힌다.
 */
export interface XZ { x: number; z: number }
export const RIVER_BANK_MAX = 70;     // 물가에서 둔치 바깥까지 최대 폭 (m)
export const ROAD_CLEAR = 18;         // 도로 중심선에서 이만큼은 둔치를 깔지 않음 (차도 반폭 + 보도 + 여유)
export const DECOR_RANGE = 450;       // 나무 · 갈대는 도로에서 이 거리 안에만 (멀리는 잔디 · 물만)

function segDist(p: XZ, a: XZ, b: XZ) {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
/** 점에서 도로 중심선까지 거리 (구간별 최솟값). */
export function distanceToPolyline(p: XZ, line: XZ[]) {
  let m = Infinity;
  for (let i = 1; i < line.length; i++) m = Math.min(m, segDist(p, line[i - 1], line[i]));
  return line.length === 1 ? Math.hypot(p.x - line[0].x, p.z - line[0].z) : m;
}
/** 물가 바깥으로 둔치를 몇 m 깔지: 도로 쪽 · 반대쪽을 따로 계산 (도로 쪽은 도로와 닿기 전까지만). */
export function bankWidths(river: XZ[], waterWidth: number, road: XZ[], max = RIVER_BANK_MAX, clear = ROAD_CLEAR) {
  return river.map((p, i) => {
    const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
    // 도로와 충분히 멀면 계산 없이 최대 폭.
    if (distanceToPolyline(p, road) > waterWidth / 2 + max + clear + 1) return { left: max, right: max, nx, nz };
    const side = (s: number) => {
      // 물가에서 바깥으로 1m씩 나가며 도로 여유 거리에 닿기 전까지.
      let w = 0;
      while (w < max) {
        const q = { x: p.x + nx * s * (waterWidth / 2 + w + 1), z: p.z + nz * s * (waterWidth / 2 + w + 1) };
        if (distanceToPolyline(q, road) < clear) break;
        w++;
      }
      return w;
    };
    return { left: side(-1), right: side(1), nx, nz };
  });
}

/** 중심선 기준 [안쪽, 바깥쪽] 거리 띠 (양쪽). 끝이 0이면 그 점은 띠를 비운다. */
function band(pts: XZ[], frames: ReturnType<typeof bankWidths>, y: number, from: (i: number, s: -1 | 1) => number, to: (i: number, s: -1 | 1) => number) {
  const pos: number[] = [], idx: number[] = [];
  for (const s of [-1, 1] as const) {
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      const f = frames[i], a = from(i, s), b = Math.max(a, to(i, s));
      pos.push(p.x + f.nx * s * a, y, p.z + f.nz * s * a, p.x + f.nx * s * b, y, p.z + f.nz * s * b);
      if (i) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildRiverside(scene: THREE.Scene, rivers: { name: string; poly: number[][]; width: number }[], road: XZ[],
  toXZ: (lonLat: number[]) => XZ, rand: () => number, trees: { trunkGeo: THREE.BufferGeometry; crownGeo: THREE.BufferGeometry; trunkMat: THREE.Material; crownMat: THREE.Material }) {
  const meshes: THREE.Object3D[] = [];
  const lambert = (color: number, factor: number) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor * 2 });
  const grass = lambert(0x6f8f4a, 6), path = lambert(0xb5876a, 5), stone = lambert(0xa9a596, 4);
  const water = new THREE.MeshStandardMaterial({ color: 0x4f8592, roughness: .22, metalness: .35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 });
  const reedMat = new THREE.MeshLambertMaterial({ color: 0x8e9a55 });
  const reedGeo = new THREE.ConeGeometry(.45, 1.3, 5); reedGeo.translate(0, .65, 0);
  const placed: { kind: 'tree' | 'reed'; x: number; z: number; k: number; rot: number }[] = [];
  for (const river of rivers) {
    const pts = river.poly.map(toXZ), half = river.width / 2;
    const f = bankWidths(pts, river.width, road);
    const w = (i: number, s: -1 | 1) => (s < 0 ? f[i].left : f[i].right);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => { const mesh = new THREE.Mesh(g, m); mesh.name = `riverside-${name}`; mesh.receiveShadow = true; scene.add(mesh); meshes.push(mesh); };
    add(band(pts, f, -.02, () => 0, () => half), water, 'water');
    // 돌 호안 2m → 잔디 둔치 → 둔치 가운데 산책로·자전거길 3m (둔치가 12m 넘는 곳만)
    add(band(pts, f, -.03, () => half, (i, s) => half + Math.min(2, w(i, s))), stone, 'revetment');
    add(band(pts, f, -.035, (i, s) => half + Math.min(2, w(i, s)), (i, s) => half + w(i, s)), grass, 'grass');
    const pathAt = (i: number, s: -1 | 1) => half + 2 + w(i, s) * .45;
    add(band(pts, f, -.032, (i, s) => w(i, s) > 12 ? pathAt(i, s) : 0, (i, s) => w(i, s) > 12 ? pathAt(i, s) + 3 : 0), path, 'path');
    // 물가 갈대, 둔치 바깥쪽 나무: 물길을 따라 촘촘히 (점 사이를 나눠서)
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / 9));
      for (let j = 0; j < n; j++) {
        const t = (j + rand()) / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        if (distanceToPolyline({ x, z }, road) > DECOR_RANGE) continue;
        const fa = f[i - 1], fb = f[i], nx = fa.nx + (fb.nx - fa.nx) * t, nz = fa.nz + (fb.nz - fa.nz) * t;
        for (const s of [-1, 1] as const) {
          const bank = (s < 0 ? fa.left : fa.right) * (1 - t) + (s < 0 ? fb.left : fb.right) * t;
          if (bank > 4 && rand() < .7) {
            const d = half + 2.5 + rand() * Math.min(5, bank - 3);
            for (let c = 0; c < 3; c++) placed.push({ kind: 'reed', x: x + nx * s * (d + c * .7) + (rand() - .5) * 2, z: z + nz * s * (d + c * .7) + (rand() - .5) * 2, k: .6 + rand() * .6, rot: rand() * 6.3 });
          }
          if (bank > 14 && rand() < .45) {
            const d = half + bank * (.72 + rand() * .22);
            placed.push({ kind: 'tree', x: x + nx * s * d, z: z + nz * s * d, k: .85 + rand() * .45, rot: rand() * 6.3 });
          }
        }
      }
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  const treesAt = placed.filter(p => p.kind === 'tree'), reedsAt = placed.filter(p => p.kind === 'reed');
  if (treesAt.length) {
    const trunk = new THREE.InstancedMesh(trees.trunkGeo, trees.trunkMat, treesAt.length), crown = new THREE.InstancedMesh(trees.crownGeo, trees.crownMat, treesAt.length);
    const leaf = [0x6f9150, 0x7f9a55, 0x8f9c5a, 0x6c8a4c];
    treesAt.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(p.k, p.k * (.9 + (i % 5) * .06), p.k));
      trunk.setMatrixAt(i, m4); crown.setMatrixAt(i, m4); crown.setColorAt(i, color.setHex(leaf[i % leaf.length]));
    });
    trunk.castShadow = crown.castShadow = true; trunk.name = 'riverside-trunks'; crown.name = 'riverside-canopies';
    scene.add(trunk, crown); meshes.push(trunk, crown);
  }
  if (reedsAt.length) {
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedsAt.length);
    reedsAt.forEach((p, i) => { m4.compose(new THREE.Vector3(p.x, -.03, p.z), q.setFromAxisAngle(up, p.rot), new THREE.Vector3(p.k, p.k, p.k)); reeds.setMatrixAt(i, m4); });
    reeds.name = 'riverside-reeds'; scene.add(reeds); meshes.push(reeds);
  }
  return { meshes, trees: treesAt.length, reeds: reedsAt.length };
}
