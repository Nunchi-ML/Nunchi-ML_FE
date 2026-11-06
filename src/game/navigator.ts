import * as THREE from 'three';
import { drawNavigationDisplay, isCompactNavigation } from './navigationDisplay';
import { UNDERPASSES, kmToS, sToKm } from './road';
import type { SegmentAssessment } from './preTrip';
import { type NavigationZone } from './navigationGuidance';
import { adaptationScores, sceneLuminance } from './adaptation';
import { lookupRouteAnalysis, routeAnalysisWarnings } from './routeAnalysis';
import { ROAD_ID } from './roadSelection';

export function routeZones(startKm: number, endKm: number, sun: { alt: number; az: number }, weather: 'clear' | 'cloud' | 'over', assessments?: SegmentAssessment[], context?: { date: string; minutes: number }): NavigationZone[] {
  const dir = Math.sign(endKm - startKm), start = kmToS(startKm), end = kmToS(endKm), lo = Math.min(start, end), hi = Math.max(start, end);
  const zones: NavigationZone[] = [];
  if (context) for (const a of routeAnalysisWarnings(ROAD_ID, { ...context, weather, startKm, endKm })) {
    zones.push({ id: `model-${a.id}`, start: kmToS(dir > 0 ? a.km0 : a.km1), end: kmToS(dir > 0 ? a.km1 : a.km0), kind: 'glare', name: '저장된 사진 모델 판정', source: 'model', level: a.level });
  }
  if (assessments) {
    for (const a of assessments) {
      if (a.state === 'normal') continue;
      const source = a.state === 'unknown' ? 'unknown' : a.example ? 'example' : 'roadside';
      const kind = a.state === 'unknown' ? 'unverified' : 'glare';
      const id = a.state === 'unknown' ? 'unverified' : a.observation?.id ?? a.segment.id;
      const level = a.level === 1 || a.level === 2 ? a.level : undefined;
      const start = kmToS(dir > 0 ? a.segment.km0 : a.segment.km1), end = kmToS(dir > 0 ? a.segment.km1 : a.segment.km0), previous = zones[zones.length - 1];
      if (previous && previous.kind === kind && previous.level === level && previous.source === source && previous.id.startsWith(id) && Math.abs(previous.end - start) < 1) previous.end = end;
      else zones.push({ id: `${id}-${Math.round(start)}`, start, end, kind, source, level, name: a.state === 'unknown' ? '도로변 관측 미확인' : '도로변 사진 관측 주의 구간' });
    }
  }
  if (sun.alt <= 0) return zones;
  for (const u of UNDERPASSES) {
    const exit = dir > 0 ? u.s1 : u.s0;
    if (exit < lo || exit > hi) continue;
    const final = context ? lookupRouteAnalysis(ROAD_ID, { ...context, weather, startKm, endKm }, sToKm(exit))?.adaptation : undefined;
    const valid = !!(final?.method === 'ml-luminance' && final.modelVersion && [final.entry, final.exit].every(n => Number.isFinite(n) && n >= 0 && n <= 1));
    const scores = valid ? final : adaptationScores(sceneLuminance(sun.alt, weather));
    zones.push({ id: `exit-${u.osmWayIds.join('-')}`, start: exit, end: exit + dir * 150, name: u.name, kind: 'exit', source: valid ? 'model' : 'simulation',
      adaptation: { entryS: dir > 0 ? u.s0 : u.s1, entry: scores!.entry, exit: scores!.exit, source: valid ? 'model' : 'simulation' } });
  }
  return zones;
}

export function createNavigator() {
  const group = new THREE.Group(); group.name = 'dashboard-navigation';
  group.position.set(.36, -.28, -.87); group.scale.setScalar(.72);
  function panelShape(w: number, h: number, r: number) {
    const s = new THREE.Shape(), x = -w/2, y = -h/2;
    s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h); s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
  }
  const chassis = new THREE.Mesh(new THREE.ExtrudeGeometry(panelShape(.70,.315,.023),{depth:.023,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.005,bevelThickness:.004}),new THREE.MeshPhysicalMaterial({color:0x080c11,roughness:.32,metalness:.25,clearcoat:1}));
  chassis.position.z=-.023; group.add(chassis);
  const canvas=document.createElement('canvas'); canvas.width=2112; canvas.height=896;
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=16; texture.generateMipmaps=false; texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter;
  const geo=new THREE.ShapeGeometry(panelShape(.66,.28,.015));
  const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+.33)/.66,(pos.getY(i)+.14)/.28);
  const face=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,toneMapped:false})); face.position.z=.007; face.name='navigation-screen'; group.add(face);
  return { group, canvas, draw: (...args: Parameters<typeof drawNavigationDisplay> extends [HTMLCanvasElement, ...infer T] ? T : never) => {
    const compact = isCompactNavigation();
    const compactX = Math.min(.65, (innerWidth / 2 - 18) * .8 / (innerHeight * .866) - .2772);
    const normalX = Math.min(.65, (innerWidth / 2 - 18) * .87 / (innerHeight * .866) - .2376);
    group.position.set(compact ? compactX : normalX, compact ? -.21 : -.28, compact ? -.8 : -.87); group.scale.setScalar(compact ? .84 : .72);
    const cue=drawNavigationDisplay(canvas,...args);
    const attention=cue && cue.kind !== 'unverified' && (cue.level===2 || cue.active || cue.meters<=100);
    chassis.material.emissive.setHex(attention ? 0x922d2d : 0x000000);
    chassis.material.emissiveIntensity=attention ? .24 : 0;
    texture.needsUpdate=true;return cue;
  } };
}
