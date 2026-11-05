import contextUrl from '../data/navigation_context.json?url';
import { ROAD_ID } from './roadSelection';
interface MapWay { p: [number, number][]; name: string; rank?: number }
interface Context { roads: MapWay[]; parks: MapWay[] }
let context: Context = { roads: [], parks: [] };
export async function loadNavigationMap() {
  const response = await fetch(contextUrl);
  if (!response.ok) throw new Error('내비게이션 지도를 불러오지 못했어요.');
  const data = await response.json(); context = data[ROAD_ID];
}
export function nearbyMapWays(x: number, z: number) {
  const near = (way: MapWay) => way.p.some(([px, pz]) => Math.abs(px - x) < 650 && Math.abs(pz - z) < 650);
  return { roads: context.roads.filter(near), parks: context.parks.filter(near) };
}
