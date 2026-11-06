import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_W, UNDERPASSES, at } from './road';

export function underpassAt(s: number, direction = 1) {
  const distance = (u: typeof UNDERPASSES[number]) => Math.max(u.s0 - s, s - u.s1, 0);
  const u = UNDERPASSES.filter(u => s >= u.s0 - u.ramp - 150 && s <= u.s1 + u.ramp + 150)
    .sort((a, b) => distance(a) - distance(b))[0];
  if (!u) return null;
  const covered = s >= u.s0 && s <= u.s1;
  const entry = direction > 0 ? u.s0 : u.s1, exit = direction > 0 ? u.s1 : u.s0;
  const toEntry = (entry - s) * direction, toExit = (exit - s) * direction;
  const penetration = covered ? Math.max(0, Math.min(s - u.s0, u.s1 - s)) : 0;
  // Open portals admit skylight; deep inside the roof blocks direct sunlight.
  const sky = covered ? Math.exp(-penetration / 10) * .45 : 1;
  return { ...u, covered, toEntry, toExit, sky, phase: covered ? 'inside' : toEntry > 0 ? 'approach' : 'exit' };
}

/** Cut real openings in the ground so the descending roadway remains visible. */
export function groundGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-30000, -30000); shape.lineTo(30000, -30000); shape.lineTo(30000, 30000); shape.lineTo(-30000, 30000); shape.closePath();
  for (const u of UNDERPASSES) {
    const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
    for (let s = u.s0 - u.ramp - 2; s <= u.s1 + u.ramp + 6; s += 4) {
      const p = at(s), r = ROAD_W / 2 + 7.2;
      left.push(new THREE.Vector2(p.x - p.dz * r, -(p.z + p.dx * r)));
      right.push(new THREE.Vector2(p.x + p.dz * r, -(p.z - p.dx * r)));
    }
    shape.holes.push(new THREE.Path([...left, ...right.reverse()]));
  }
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

export function buildUnderpasses(scene: THREE.Scene) {
  const occluders: THREE.Mesh[] = [];
  const batches = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; blocks: boolean }>();
  const wall = new THREE.MeshStandardMaterial({ color: 0x77746b, roughness: .96 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0x3a3935, roughness: 1, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ color: 0xc1bbaa, roughness: .9 });
  const light = new THREE.MeshBasicMaterial({ color: 0xffdca0 });
  const stripe = new THREE.MeshBasicMaterial({ color: 0xd4b444 });
  function box(s: number, offset: number, y: number, width: number, height: number, length: number, mat: THREE.Material, blocks = false) {
    const p = at(s), m = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mat);
    m.position.set(p.x - p.dz * offset, y, p.z + p.dx * offset); m.rotation.y = Math.atan2(p.dx, p.dz);
    m.updateMatrix(); m.geometry.applyMatrix4(m.matrix);
    if (!batches.has(mat)) batches.set(mat, { geometries: [], blocks: false });
    const batch = batches.get(mat)!; batch.geometries.push(m.geometry); batch.blocks ||= blocks;
  }
  for (const u of UNDERPASSES) {
    // Retaining walls extend along the ramps; roof exists only between surveyed portals.
    for (let s = u.s0 - u.ramp; s < u.s1 + u.ramp; s += 4) {
      const end = Math.min(s + 4, u.s1 + u.ramp), mid = (s + end) / 2, p = at(mid);
      const covered = mid >= u.s0 && mid <= u.s1;
      const top = covered ? -u.depth + u.clearance : .8, height = Math.max(.8, top - p.y);
      for (const side of [-1, 1]) {
        box(mid, side * (ROAD_W / 2 + .9), p.y + height / 2, .7, height, end - s + .12, wall, true);
        box(mid, side * (ROAD_W / 2 + .48), p.y + .25, .35, .5, end - s + .12, curb);
        box(mid, side * (ROAD_W / 2 + .51), p.y + .85, .035, .16, end - s + .12, stripe);
      }
    }
    for (let s = u.s0; s < u.s1; s += 4) {
      const end = Math.min(s + 4, u.s1), mid = (s + end) / 2;
      box(mid, 0, -u.depth + u.clearance + .4, ROAD_W + 3, .8, end - s + .15, ceiling, true);
    }
    for (const s of [u.s0, u.s1]) {
      box(s, 0, -u.depth + u.clearance + .45, ROAD_W + 4, 1, .8, curb, true);
      for (const side of [-1, 1]) box(s, side * (ROAD_W / 2 + 1), -u.depth + u.clearance / 2, 1.1, u.clearance, 1.5, curb, true);
    }
    for (let s = u.s0 + 7; s < u.s1; s += 18) {
      for (const side of [-1, 1]) box(s, side * (ROAD_W / 2 - .6), -u.depth + u.clearance - .25, .3, .12, 2.5, light);
    }
  }
  // Hundreds of structural segments share five draw calls, including mirrors.
  for (const [material, batch] of batches) {
    const merged = mergeGeometries(batch.geometries)!;
    batch.geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); if (batch.blocks) occluders.push(mesh);
  }
  return occluders;
}
