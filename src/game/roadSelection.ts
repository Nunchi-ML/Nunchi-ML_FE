export type RoadId = 'dalgu' | 'sincheon';

// A route change reloads the scene and its cached spatial indexes together.
// This prevents old building/occlusion data surviving on the newly chosen road.
export const ROAD_ID: RoadId = typeof location !== 'undefined' && new URLSearchParams(location.search).get('road') === 'sincheon' ? 'sincheon' : 'dalgu';
export const IS_SINCHEON = ROAD_ID === 'sincheon';
export const ROAD_NAME = IS_SINCHEON ? '신천대로' : '달구벌대로';
export function chooseRoad(id: RoadId) {
  if (id === ROAD_ID) return;
  const url = new URL(location.href);
  url.searchParams.set('road', id);
  location.assign(url.href);
}
