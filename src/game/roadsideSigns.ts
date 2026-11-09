import * as THREE from 'three';
import { at, kmToS, ROAD_W, UNDERPASSES } from './road';
import { navigationCue, type NavigationZone } from './navigationGuidance';
import type { SegmentAssessment } from './preTrip';

export type SignGrade = '하' | '중' | '상';
const GRADE_COLOR: Record<SignGrade, string> = { 하: '#3BA55C', 중: '#F2C230', 상: '#F2522E' };

export function roadsideMessage(s: number, dir: number, end: number, zones: NavigationZone[], observations: SegmentAssessment[] = [], grade: SignGrade = '상') {
  const photo = navigationCue(s, dir, end, zones.filter(z => z.kind !== 'exit'), 700);
  const exit = navigationCue(s, dir, end, zones.filter(z => z.kind === 'exit'), 700);
  const caution = photo?.kind === 'glare';
  const normal = !caution ? observations.filter(a => a.state === 'normal' && a.level === 0)
    .map(a => ({ assessment: a, start: kmToS(a.segment.km0), end: kmToS(a.segment.km1) }))
    .filter(a => (a.end - s) * dir >= 0 && (a.start - s) * dir <= 700 && (a.start - end) * dir <= 0)
    .sort((a, b) => Math.max(0, (a.start - s) * dir) - Math.max(0, (b.start - s) * dir))[0] : undefined;
  const photoZone = photo && zones.find(z => z.id === photo.id);
  const transition = exit && zones.find(z => z.id === exit.id)?.adaptation;
  const burden = (score: number) => score >= .65 ? '큼' : score >= .35 ? '보통' : '작음';
  const distance = (target: number) => `전방 ${Math.max(10, Math.round((target - s) * dir / 10) * 10)} m`;
  const portal = transition && (transition.entryS - s) * dir > 0 ? transition.entryS : exit ? zones.find(z => z.id === exit.id)!.start : s;
  const photoSource = photo?.source === 'model' ? '시뮬레이션 사진 모델 판정 · 실제 도로 관측 아님' : (normal ? normal.assessment.example : photo?.source === 'example') ? '가상 사진 판정 예시' : caution || normal ? '전방 카메라 사진 + 태양·날씨 판정' : '전방 카메라 사진 미확인';
  const underpassAhead = UNDERPASSES.some(u => {
    const entry = dir > 0 ? u.s0 : u.s1;
    const d = (entry - s) * dir;
    return d >= -20 && d <= 260;
  }) || Boolean(exit);
  return {
    state: caution ? 'caution' : normal ? 'observed' : photo?.kind === 'unverified' ? 'unknown' : 'information',
    title: caution ? `${photo.active ? '현재 구간' : `전방 ${photo.meters} m`} · ${photoZone?.level === 2 ? '눈부심 강함' : '눈부심 주의'}` : normal ? `${(normal.start - s) * dir > 0 ? distance(normal.start) : '현재 관측 구간'} · 눈부심 관측 없음` : photo?.kind === 'unverified' ? '전방 눈부심 · 관측 미확인' : '도로변 관측 안내',
    body: exit ? `${distance(portal)} ${transition && portal === transition.entryS ? '지하차도' : '출구'} · 미리 감속` : caution ? '관측 구간 앞 · 미리 감속' : '전방 주시 · 차간거리 유지',
    transition: transition ? `${transition.exit >= transition.entry ? '출구' : '진입'} 밝기 전환 부담 ${burden(Math.max(transition.entry, transition.exit))}` : exit ? '전방 지하차도 · 출구 밝기 변화' : '관측 당시 상태 · 도착 시 달라질 수 있음',
    source: `${photoSource}${transition ? ` · ${transition.source === 'model' ? '밝기 전환 모델 예상' : '밝기 전환 체험값'}` : ' · 도착 시 달라질 수 있음'}`,
    underpassAhead,
    grade,
  };
}

/** Virtual placements for experiencing sign guidance; not surveyed installations. */
export function roadsidePlacements(start: number, end: number) {
  const dir = Math.sign(end - start) || 1, distance = Math.abs(end - start);
  if (distance < 100) return [];
  const candidates = [start + dir * Math.min(70, distance / 3), ...UNDERPASSES.map(u => (dir > 0 ? u.s0 : u.s1) - dir * (u.ramp + 72))];
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
    update(s: number, dir: number, startKm: number, endKm: number, zones: NavigationZone[], running: boolean, observations: SegmentAssessment[] = [], grade: SignGrade = '상') {
      const start = kmToS(startKm), end = kmToS(endKm), key = `${start}|${end}|${dir}`;
      if (key !== routeKey) { routeKey = key; placements = roadsidePlacements(start, end); }
      const ahead = placements.filter(p => (p - s) * dir > -45 && (p - s) * dir < 1400);
      slots.forEach((slot, i) => {
        const position = ahead[i]; slot.group.visible = running && position != null;
        if (!slot.group.visible) return;
        slot.s = position; const p = at(position); slot.group.position.set(p.x, p.y, p.z); slot.group.rotation.y = Math.atan2(-p.dx * dir, -p.dz * dir);
        const message = roadsideMessage(position, dir, end, zones, observations, grade), next = JSON.stringify(message); slot.message = message;
        if (next === slot.key) return; slot.key = next;
        const g = slot.canvas.getContext('2d')!, W = slot.canvas.width;
        g.fillStyle = '#090e0c'; g.fillRect(0, 0, W, 682);
        g.strokeStyle = '#26342e'; g.lineWidth = 8; g.strokeRect(18, 18, W - 36, 646);
        g.textAlign = 'center';
        if (message.underpassAhead) {
          g.font = '600 46px "Noto Sans KR",sans-serif';
          g.fillStyle = '#9fb0a8';
          g.fillText('모델 ③', W / 2, 105);
          g.font = '800 154px "Noto Sans KR",sans-serif';
          g.fillStyle = GRADE_COLOR[message.grade];
          g.fillText(`지하차도 입구 순응 위험 ${message.grade}`, W / 2, 330, W - 120);
          g.font = '700 132px "Noto Sans KR",sans-serif';
          g.fillStyle = '#ffffff';
          g.fillText('속도를 줄이세요', W / 2, 535, W - 120);
        } else {
          const line1 = message.state === 'caution' ? '전방 태양광 눈부심 위험' : '전방 시야 양호';
          const line2 = message.state === 'caution' ? '속도를 줄이세요' : '안전 속도를 유지하세요';
          g.font = '800 150px "Noto Sans KR",sans-serif';
          g.fillStyle = message.state === 'caution' ? '#F2522E' : '#3BA55C';
          g.fillText(line1, W / 2, 305, W - 120);
          g.font = '700 128px "Noto Sans KR",sans-serif';
          g.fillStyle = '#ffffff';
          g.fillText(line2, W / 2, 510, W - 120);
        }
        slot.texture.needsUpdate = true;
      });
    },
    dispose() { slots.forEach(s => s.texture.dispose()); },
  };
}
