import * as THREE from 'three';
import { at, kmToS, ROAD_W, UNDERPASSES } from './road';
import { navigationCue, type NavigationZone } from './navigationGuidance';

export function roadsideMessage(s: number, dir: number, end: number, zones: NavigationZone[]) {
  const photo = navigationCue(s, dir, end, zones.filter(z => z.kind !== 'exit'), 700);
  const exit = navigationCue(s, dir, end, zones.filter(z => z.kind === 'exit'), 700);
  const caution = photo?.kind === 'glare';
  return {
    state: caution ? 'caution' : photo?.kind === 'unverified' ? 'unknown' : 'information',
    title: caution ? '전방 눈부심 주의' : photo?.kind === 'unverified' ? '도로변 관측 미확인' : '도로변 관측 안내',
    body: caution ? '관측 구간 앞 · 미리 감속' : '전방 주시 · 차간거리 유지',
    transition: exit ? '전방 지하차도 · 출구 밝기 변화' : '사진은 관측 당시의 상태입니다',
    source: photo?.source === 'example' ? '가상 관측 예시 · 도착 시 달라질 수 있음' : caution ? '도로변 사진 + 태양·날씨 · 도착 시 달라질 수 있음' : '사진·방향·유효시간 확인 필요',
  };
}

/** Virtual placements for experiencing sign guidance; not surveyed installations. */
export function roadsidePlacements(start: number, end: number) {
  const dir = Math.sign(end - start) || 1, distance = Math.abs(end - start);
  if (distance < 100) return [];
  const candidates = [start + dir * Math.min(70, distance / 3), ...UNDERPASSES.map(u => (dir > 0 ? u.s0 : u.s1) - dir * (u.ramp + 80))];
  return candidates.filter(s => (s - start) * dir >= 30 && (end - s) * dir >= 30 && !UNDERPASSES.some(u => s >= u.s0 - u.ramp && s <= u.s1 + u.ramp))
    .sort((a, b) => (a - b) * dir).filter((s, i, all) => i === 0 || Math.abs(s - all[i - 1]) > 100);
}

export function createRoadsideSigns(scene: THREE.Scene) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5151, roughness: .65, metalness: .6 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x18201f, roughness: .8 });
  const width = Math.min(ROAD_W * .65, 12.5), height = width / 3, poleX = ROAD_W / 2 + 1.1;
  const slots = Array.from({ length: 2 }, () => {
    const group = new THREE.Group(); group.name = 'roadside-message-sign'; scene.add(group);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width + .35, height + .35, .4), frame); panel.position.y = 6.2 + height / 2; group.add(panel);
    for (const x of [-poleX, poleX]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.16, .23, 6.2 + height, 8), metal); post.position.set(x, (6.2 + height) / 2, -.3); group.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(.9, .35, .9), metal); foot.position.set(x, .17, -.3); group.add(foot);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(poleX * 2 + .5, .25, .35), metal); beam.position.set(0, 6.2 + height, -.3); group.add(beam);
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 682;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); face.position.set(0, 6.2 + height / 2, .211); group.add(face);
    return { group, canvas, texture, s: 0, message: null as ReturnType<typeof roadsideMessage> | null, key: '' };
  });
  let routeKey = '', placements: number[] = [];
  return {
    slots,
    update(s: number, dir: number, startKm: number, endKm: number, zones: NavigationZone[], running: boolean) {
      const start = kmToS(startKm), end = kmToS(endKm), key = `${start}|${end}|${dir}`;
      if (key !== routeKey) { routeKey = key; placements = roadsidePlacements(start, end); }
      const ahead = placements.filter(p => (p - s) * dir > -45 && (p - s) * dir < 1400);
      slots.forEach((slot, i) => {
        const position = ahead[i]; slot.group.visible = running && position != null;
        if (!slot.group.visible) return;
        slot.s = position; const p = at(position); slot.group.position.set(p.x, p.y, p.z); slot.group.rotation.y = Math.atan2(-p.dx * dir, -p.dz * dir);
        const message = roadsideMessage(position, dir, end, zones), next = JSON.stringify(message); slot.message = message;
        if (next === slot.key) return; slot.key = next;
        const g = slot.canvas.getContext('2d')!, W = slot.canvas.width;
        g.fillStyle = '#090e0c'; g.fillRect(0, 0, W, 682);
        g.fillStyle = '#17241e'; g.fillRect(16, 16, W - 32, 78);
        g.textAlign = 'center'; g.font = '500 42px "Noto Sans KR",sans-serif'; g.fillStyle = '#b7c9b4'; g.fillText('도로 전광판 · 연동 체험', W / 2, 70);
        g.fillStyle = message.state === 'caution' ? '#ffbd49' : message.state === 'unknown' ? '#e1decf' : '#bce1ad';
        g.font = 'bold 142px "Noto Sans KR",sans-serif'; g.fillText(message.title, W / 2, 262, W - 130);
        g.font = 'bold 103px "Noto Sans KR",sans-serif'; g.fillStyle = '#ffe1a0'; g.fillText(message.body, W / 2, 405, W - 130);
        g.font = '600 77px "Noto Sans KR",sans-serif'; g.fillStyle = '#e3e8d7'; g.fillText(message.transition, W / 2, 525, W - 130);
        g.strokeStyle = '#43553b'; g.lineWidth = 3; g.beginPath(); g.moveTo(70, 563); g.lineTo(W - 70, 563); g.stroke();
        g.font = '500 43px "Noto Sans KR",sans-serif'; g.fillStyle = '#a1b09a'; g.fillText(message.source, W / 2, 635, W - 130);
        slot.texture.needsUpdate = true;
      });
    },
    dispose() { slots.forEach(s => s.texture.dispose()); },
  };
}
