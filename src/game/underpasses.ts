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

/** Small authored textures; no street-view imagery or network requests. */
function surfaceTexture(width: number, height: number, sample: (x: number, y: number) => number[]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(sample(x, y), (y * width + x) * 4);
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 8; texture.needsUpdate = true; return texture;
}

export function buildUnderpasses(scene: THREE.Scene) {
  const occluders: THREE.Mesh[] = [];
  if (!UNDERPASSES.length) return occluders;
  const batches = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; blocks: boolean }>();
  const concrete = surfaceTexture(256, 128, (x, y) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const grain = (n - Math.floor(n) - .5) * 19;
    const seam = x < 2 || y < 2 ? 39 : 0;
    const stain = Math.max(0, Math.sin(x * .17) + Math.sin(x * .043) - .8) * (1 - y / 128) * 24;
    const value = 192 + grain - seam - stain; return [value, value - 2, value - 12, 255];
  });
  const drainTexture = surfaceTexture(64, 64, (x, y) => {
    const slot = x > 7 && x < 57 && y % 16 < 7;
    return slot ? [24, 27, 27, 255] : [104, 108, 105, 255];
  });
  const fenceTexture = surfaceTexture(64, 64, (x, y) => {
    const wire = (x + y) % 32 < 3 || (x - y + 128) % 32 < 3;
    return [183, 187, 180, wire ? 255 : 0];
  });
  const wall = new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: .025, roughness: .95 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0x343733, roughness: 1, side: THREE.DoubleSide });
  const curb = new THREE.MeshStandardMaterial({ color: 0xbab7a8, roughness: .93 });
  const light = new THREE.MeshBasicMaterial({ color: 0xffe3b1 });
  const stripe = new THREE.MeshBasicMaterial({ color: 0xe6bf58 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9beb8, roughness: .55, metalness: .45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x365f78, roughness: .8 });
  const drain = new THREE.MeshStandardMaterial({ map: drainTexture, roughness: .9 });
  const fence = new THREE.MeshStandardMaterial({ map: fenceTexture, alphaTest: .5, side: THREE.DoubleSide, roughness: .7, metalness: .3 });
  let atlas: THREE.CanvasTexture | undefined;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 2048;
    const g = c.getContext('2d')!;
    UNDERPASSES.forEach((u, i) => {
      const y = i * 128; g.fillStyle = '#176453'; g.fillRect(0, y, 512, 128);
      g.strokeStyle = '#dce7dc'; g.lineWidth = 4; g.strokeRect(6, y + 6, 500, 116);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 38px "Noto Sans KR", sans-serif';
      g.fillText(u.name, 256, y + 56, 476); g.font = '24px "Noto Sans KR", sans-serif';
      g.fillText('지하차도 · 전방 주시', 256, y + 96);
    });
    atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  }
  const signs = new THREE.MeshBasicMaterial({ ...(atlas ? { map: atlas } : {}), color: atlas ? 0xffffff : 0x176453, side: THREE.DoubleSide });
  [wall, ceiling, curb, light, stripe, metal, blue, drain, fence, signs].forEach((m, i) => {
    m.name = ['concrete', 'roof', 'curb', 'lights', 'reflectors', 'railings', 'median-band', 'drains', 'median-fence', 'portal-signs'][i];
  });
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, blocks = false) {
    if (!batches.has(material)) batches.set(material, { geometries: [], blocks: false });
    const batch = batches.get(material)!; batch.geometries.push(geometry); batch.blocks ||= blocks;
  }
  function box(s: number, offset: number, y: number, width: number, height: number, length: number, mat: THREE.Material, blocks = false) {
    const p = at(s), geometry = new THREE.BoxGeometry(width, height, length);
    const position = geometry.getAttribute('position');
    const retaining = mat === wall && Math.abs(offset) > ROAD_W / 2;
    const followsFloor = Math.abs(offset) <= ROAD_W / 2 + .5 && [wall, curb, blue, metal, drain].includes(mat as THREE.MeshStandardMaterial);
    if (retaining || followsFloor) for (let i = 0; i < position.count; i++) {
      if (followsFloor || position.getY(i) < 0) position.setY(i, position.getY(i) + at(s + position.getZ(i)).y - p.y);
    }
    if (mat === wall || mat === drain) {
      const pos = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        const top = Math.abs(normal.getY(i)) > .5;
        uv.setXY(i, top ? pos.getX(i) / .25 : (s + pos.getZ(i)) / 4, top ? (s + pos.getZ(i)) / .4 : (y + pos.getY(i)) / 2);
      }
    }
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(p.x - p.dz * offset, y, p.z + p.dx * offset), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.dx, p.dz)), new THREE.Vector3(1, 1, 1));
    geometry.computeVertexNormals(); geometry.applyMatrix4(matrix); add(geometry, mat, blocks);
  }
  UNDERPASSES.forEach((u, index) => {
    // Open-cut concrete approaches, with a roof only at surveyed tunnel portals.
    for (let s = u.s0 - u.ramp; s < u.s1 + u.ramp; s += 4) {
      const end = Math.min(s + 4, u.s1 + u.ramp), mid = (s + end) / 2, p = at(mid), length = end - s + .12;
      const covered = mid >= u.s0 && mid <= u.s1;
      const top = covered ? -u.depth + u.clearance : .35, height = Math.max(.35, top - p.y);
      for (const side of [-1, 1]) {
        box(mid, side * (ROAD_W / 2 + .9), p.y + height / 2, .7, height, length, wall, true);
        box(mid, side * (ROAD_W / 2 + .48), p.y + .23, .35, .46, length, curb);
        box(mid, side * (ROAD_W / 2 - .22), p.y + .105, .24, .035, length, drain);
        if (!covered) {
          // Paired horizontal rails sit above the surface road, not on the sunken floor.
          for (const h of [.4, .85]) box(mid, side * (ROAD_W / 2 + .9), top + h, .09, .09, length, metal);
          for (const along of [-.9, .9]) box(mid + along, side * (ROAD_W / 2 + .9), top + .4, .09, .86, .09, metal);
        }
      }
      // Low concrete median with a blue band and diamond safety fence.
      box(mid, 0, p.y + .22, .82, .28, length, curb);
      box(mid, 0, p.y + .43, .5, .42, length, wall);
      box(mid, 0, p.y + .62, .55, .1, length, blue);
      box(mid, 0, p.y + 1.2, .07, .07, length, metal);
      box(mid, 0, p.y + .92, .07, .62, .07, metal);
      const mesh = new THREE.PlaneGeometry(length, .5);
      // Plane width follows the road; the alpha-tested texture leaves real gaps.
      mesh.rotateY(Math.PI / 2); mesh.translate(0, p.y + .91, 0);
      const points = mesh.getAttribute('position');
      for (let i = 0; i < points.count; i++) points.setY(i, points.getY(i) + at(mid + points.getZ(i)).y - p.y);
      mesh.computeVertexNormals();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.dx, p.dz));
      mesh.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1)));
      const uv = mesh.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length / .14, uv.getY(i) * .5 / .14);
      add(mesh, fence);
    }
    for (let s = u.s0; s < u.s1; s += 4) {
      const end = Math.min(s + 4, u.s1), mid = (s + end) / 2;
      box(mid, 0, -u.depth + u.clearance + .4, ROAD_W + 3, .8, end - s + .15, ceiling, true);
    }
    for (const [s, dir] of [[u.s0, 1], [u.s1, -1]]) {
      const top = -u.depth + u.clearance, roadY = at(s).y;
      box(s, 0, top + .45, ROAD_W + 4, 1, .8, curb, true);
      for (const side of [-1, 1]) {
        box(s, side * (ROAD_W / 2 + 1), roadY + u.clearance / 2, 1.1, u.clearance, 1.5, curb, true);
        box(s - dir * .8, side * (ROAD_W / 2 + .4), roadY + 1.4, .58, 1.2, .08, stripe);
        // Three dark diagonal slashes in each yellow portal marker.
        for (const h of [-.35, 0, .35]) {
          const geo = new THREE.BoxGeometry(.65, .13, .1); geo.rotateZ(side * -.55);
          const p = at(s - dir * .86), angle = Math.atan2(p.dx, p.dz);
          geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x - p.dz * side * (ROAD_W / 2 + .4), roadY + 1.4 + h, p.z + p.dx * side * (ROAD_W / 2 + .4)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle), new THREE.Vector3(1, 1, 1))); add(geo, ceiling);
        }
      }
      const p = at(s), geometry = new THREE.PlaneGeometry(3.2, .8), uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (index + 1 - uv.getY(i)) / 16);
      geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x - p.dz * dir * 4.7, top + 1.4, p.z + p.dx * dir * 4.7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.dx, p.dz) + (dir > 0 ? Math.PI : 0)), new THREE.Vector3(1, 1, 1))); add(geometry, signs);
    }
    for (let s = u.s0 + 7; s < u.s1; s += 12) for (const side of [-1, 1]) {
      box(s, side * (ROAD_W / 2 - .6), -u.depth + u.clearance - .25, .28, .12, 2.1, light);
    }
  });
  // Detail remains in ten material batches for both the main camera and mirrors.
  for (const [material, batch] of batches) {
    const merged = mergeGeometries(batch.geometries)!; batch.geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, material); mesh.name = `underpass-${material.name}`;
    mesh.castShadow = material !== light && material !== signs; mesh.receiveShadow = true;
    scene.add(mesh); if (batch.blocks) occluders.push(mesh);
  }
  return occluders;
}
