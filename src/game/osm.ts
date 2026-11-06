import * as THREE from 'three';
import raw from '../data/dalgu_osm.json';
import sincheon from '../data/sincheon_osm.json';
import { IS_SINCHEON } from './roadSelection';
import { at, rawToS } from './road';

/** OpenStreetMap에서 뽑은 달구벌대로 주변 시설물 (scripts/fetch_osm.py 로 만듦) */
export interface OsmPoint { x: number; z: number; s: number; off: number; name?: string; shelter?: string }
/** 사거리: 달구벌대로 가장자리에서 바깥으로 뻗는 옆길 팔들 (실제 좌표 [x, z] 목록) */
export interface OsmJunction {
  s: number; name: string; hw: string; lanes?: string; arms: [number, number][][];
  an?: string[];                                                               // 팔마다 길 이름
  to?: string[];                                                               // 팔마다 그쪽 700 m 앞 동네 (브이월드 주소 찾기)
}
export type OsmKind = 'signal' | 'crossing' | 'bus_stop' | 'subway' | 'lamp' | 'tree' | 'artwork';
export const OSM = (IS_SINCHEON ? sincheon : raw) as unknown as Record<OsmKind, OsmPoint[]> & { junction: OsmJunction[] };

/** 시설물 자리를 게임 도로 기준으로: 도로 거리 s · 중심선에서 왼(+)/오른(−) 거리 off */
export function placeOnRoad(p: { s: number; off?: number }) {
  const s = rawToS(p.s), r = at(s), off = p.off ?? 0;
  return { s, x: r.x - r.dz * off, z: r.z + r.dx * off, dx: r.dx, dz: r.dz };
}

/** 확인용 표시 기둥 (주소에 ?osm 을 붙였을 때만): 종류별 색 */
export function buildOsmMarkers(scene: THREE.Scene) {
  const colors: Record<string, number> = { signal: 0xff3b2f, crossing: 0xffffff, bus_stop: 0x2b7bff, subway: 0x00a650, tree: 0x6f8a45, artwork: 0xc040ff, junction: 0xffc400 };
  const geo = new THREE.CylinderGeometry(2.5, 2.5, 6, 12).translate(0, 3, 0);   // 위에서도 · 도로에서도 잘 보이게 굵은 원기둥
  for (const [k, c] of Object.entries(colors)) {
    const list = (k === 'junction' ? OSM.junction.map(j => ({ ...j, off: 0 })) : OSM[k as OsmKind]) as { s: number; off: number }[];
    if (!list.length) continue;
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), list.length);
    list.forEach((p, i) => { const q = placeOnRoad(p); inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(q.x, 0, q.z)); });
    scene.add(inst);
  }
}
