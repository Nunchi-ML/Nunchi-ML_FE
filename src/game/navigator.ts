import * as THREE from 'three';
import { drawNavigationDisplay, isCompactNavigation } from './navigationDisplay';
import { UNDERPASSES, at, kmToS } from './road';
import { IS_SINCHEON } from './roadSelection';
import { type NavigationZone } from './navigationGuidance';

export function routeZones(startKm: number, endKm: number, sun: { alt: number; az: number }, weather: string): NavigationZone[] {
  const dir = Math.sign(endKm - startKm), start = kmToS(startKm), end = kmToS(endKm), lo = Math.min(start, end), hi = Math.max(start, end);
  const zones: NavigationZone[] = [];
  if (sun.alt <= 0) return zones;
  for (const u of UNDERPASSES) {
    const exit = dir > 0 ? u.s1 : u.s0;
    if (exit < lo || exit > hi) continue;
    zones.push({ id: `exit-${u.osmWayIds.join('-')}`, start: exit, end: exit + dir * 150, name: u.name, kind: 'exit', source: 'simulation' });
  }
  if (!IS_SINCHEON && sun.alt < 25 && weather !== 'over') {
    let previous: NavigationZone | null = null;
    for (let s = start; (end - s) * dir > 0; s += dir * 25) {
      const p = at(s), head = (Math.atan2(p.dx * dir, -p.dz * dir) * 180 / Math.PI + 360) % 360;
      const diff = Math.abs(((sun.az - head + 540) % 360) - 180);
      if (diff < 30) {
        if (!previous) { previous = { id: `sun-${Math.round(s)}`, start: s, end: s + dir * 25, kind: 'glare', name: '햇빛 영향 구간', source: 'simulation' }; zones.push(previous); }
        else previous.end = s + dir * 25;
      } else previous = null;
    }
  }
  return zones;
}

export function createNavigator() {
  const group = new THREE.Group(); group.name = 'dashboard-navigation';
  group.position.set(.36, -.28, -.87); group.rotation.x = -.1; group.scale.setScalar(.72);
  function panelShape(w: number, h: number, r: number) {
    const s = new THREE.Shape(), x = -w/2, y = -h/2;
    s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h); s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
  }
  const chassis = new THREE.Mesh(new THREE.ExtrudeGeometry(panelShape(1.16,.315,.023),{depth:.023,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.005,bevelThickness:.004}),new THREE.MeshPhysicalMaterial({color:0x080c11,roughness:.32,metalness:.25,clearcoat:1}));
  chassis.position.z=-.023; group.add(chassis);
  const canvas=document.createElement('canvas'); canvas.width=1792; canvas.height=448;
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=8;
  const geo=new THREE.ShapeGeometry(panelShape(1.12,.28,.015));
  const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+.56)/1.12,(pos.getY(i)+.14)/.28);
  const face=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:texture,toneMapped:false})); face.position.z=.007; face.name='navigation-screen'; group.add(face);
  const lowerTrim=new THREE.Mesh(new THREE.BoxGeometry(1.12,.012,.024),new THREE.MeshStandardMaterial({color:0x697e8a,metalness:.7,roughness:.35})); lowerTrim.position.set(0,-.166,-.008); group.add(lowerTrim);
  return { group, canvas, draw: (...args: Parameters<typeof drawNavigationDisplay> extends [HTMLCanvasElement, ...infer T] ? T : never) => {
    const compact = isCompactNavigation();
    const compactX = Math.min(.46, (innerWidth / 2 - 18) * .8 / (innerHeight * .866) - .4704);
    group.position.set(compact ? compactX : .36, compact ? -.21 : -.28, compact ? -.8 : -.87); group.scale.setScalar(compact ? .84 : .72);
    const cue=drawNavigationDisplay(canvas,...args);
    const attention=cue && (cue.active || cue.meters<=100);
    chassis.material.emissive.setHex(attention ? 0x922d2d : 0x000000);
    chassis.material.emissiveIntensity=attention ? .24 : 0;
    texture.needsUpdate=true;return cue;
  } };
}
