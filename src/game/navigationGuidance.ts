export interface NavigationZone {
  id: string; start: number; end: number; kind: 'glare' | 'exit' | 'unverified'; name: string; source: 'simulation' | 'model' | 'roadside' | 'example' | 'unknown';
}
export interface NavigationCue { id: string; text: string; spoken: string; meters: number; kind: NavigationZone['kind']; source: NavigationZone['source']; active: boolean }
/** Distances are along the driven route, including reverse-direction trips. */
export function navigationCue(s: number, direction: number, end: number, zones: NavigationZone[], leadMeters = 300): NavigationCue | null {
  const candidates = zones.map(z => {
    const ahead = (z.start - s) * direction, remaining = (z.end - s) * direction;
    if (remaining < -15 || ahead > leadMeters || (z.start - end) * direction > 0) return null;
    const active = ahead <= 0, meters = Math.max(0, Math.round(ahead / 10) * 10);
    const text = z.kind === 'unverified' ? '도로변 관측 미확인' : z.kind === 'exit' ? active ? '출구 밝기 변화 구간' : '밝기가 달라지는 출구'
      : active ? '전방 시야 주의 구간' : '전방 시야 주의';
    const spoken = z.kind === 'unverified' ? '앞 구간의 도로변 사진을 확인하지 못했습니다. 전방을 살펴주세요.' : z.kind === 'exit'
      ? active ? '출구 밝기 변화 구간입니다.' : `${meters}미터 앞, 지하차도 출구에서 밝기가 크게 달라집니다.`
      : active ? '전방을 알아보기 어려울 수 있는 구간입니다.' : `${meters}미터 앞, 전방 시야 주의 구간입니다.`;
    return { id: z.id, text, spoken, meters, kind: z.kind, source: z.source, active, distance: Math.max(0, ahead) };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  // The next exit takes precedence over sunlight alerts during a transition.
  const priority = (kind: NavigationZone['kind']) => kind === 'exit' ? 0 : kind === 'glare' ? 1 : 2;
  candidates.sort((a, b) => priority(a.kind) - priority(b.kind) || a.distance - b.distance);
  return candidates[0] ?? null;
}

export interface SpeechPort {
  cancel(): void; speak(text: string): void;
}
/** Queue at most the newest relevant instruction; never accumulate old distances. */
export function createVoiceGuide(port: SpeechPort | null) {
  const said = new Set<string>();
  let enabled = true, lastAt = -Infinity;
  return {
    available: port !== null,
    setEnabled(value: boolean) { if (enabled && !value) port?.cancel(); enabled = value; },
    reset() { port?.cancel(); said.clear(); lastAt = -Infinity; },
    stop() { port?.cancel(); },
    announce(id: string, text: string, now: number, immediate = false) {
      if (!enabled || !port || said.has(id) || (!immediate && now - lastAt < 6500)) return false;
      port.cancel(); port.speak(text); said.add(id); lastAt = now; return true;
    },
  };
}
