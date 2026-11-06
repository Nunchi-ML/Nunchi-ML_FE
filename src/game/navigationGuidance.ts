export interface NavigationZone {
  id: string; start: number; end: number; kind: 'glare' | 'exit' | 'unverified'; name: string; source: 'simulation' | 'model' | 'roadside' | 'example' | 'unknown';
  level?: 1 | 2;
  adaptation?: { entryS: number; entry: number; exit: number; source: 'simulation' | 'model' };
}
export interface NavigationCue { id: string; text: string; spoken: string; meters: number; kind: NavigationZone['kind']; source: NavigationZone['source']; active: boolean; level?: 1 | 2 }
/** Distances are along the driven route, including reverse-direction trips. */
export function navigationCue(s: number, direction: number, end: number, zones: NavigationZone[], leadMeters = 300): NavigationCue | null {
  const candidates = zones.map(z => {
    const ahead = (z.start - s) * direction, remaining = (z.end - s) * direction;
    if (remaining < -15 || ahead > leadMeters || (z.start - end) * direction > 0) return null;
    const active = ahead <= 0, meters = Math.max(0, Math.round(ahead / 10) * 10);
    const text = z.kind === 'unverified' ? '도로변 관측 미확인' : z.kind === 'exit' ? active ? '출구 밝기 변화 구간' : '밝기가 달라지는 출구'
      : z.level === 2 ? '눈부심 강함' : '눈부심 주의';
    const spoken = z.kind === 'unverified' ? '앞 구간은 아직 확인 전이에요. 앞을 잘 살펴 주세요.' : z.kind === 'exit'
      ? active ? '출구라 밝기가 달라져요.' : `${meters}미터 앞 지하차도 출구에서 밝기가 많이 달라져요.`
      : `${active ? '지금' : `${meters}미터 앞`} ${z.level === 2 ? '햇빛 눈부심이 강해요. 속도를 조금 줄이고 앞차와 거리를 넉넉히 두세요.' : '햇빛 눈부심이 있어요. 앞을 잘 봐 주세요.'}`;
    return { id: z.id, text, spoken, meters, kind: z.kind, source: z.source, active, level: z.level, distance: Math.max(0, ahead) };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  // Immediate known warnings precede future ones and missing observations.
  const priority = (c: typeof candidates[number]) => c.kind === 'unverified' ? 4 : c.active ? c.kind === 'exit' ? 0 : 1 : 2;
  candidates.sort((a, b) => priority(a) - priority(b) || (a.active && b.active ? (b.level ?? 0) - (a.level ?? 0) : 0) || a.distance - b.distance);
  return candidates[0] ?? null;
}

export interface SpeechPort {
  cancel(): void; speak(text: string): void;
}
/** Queue at most the newest relevant instruction; never accumulate old distances. */
/** 같은 종류(예: 눈부심) 안내는 이 시간 안에 다시 말하지 않는다. 더 심해질 때만 예외. */
export const TOPIC_QUIET_MS = 30000;
export function createVoiceGuide(port: SpeechPort | null) {
  const said = new Set<string>(), topics = new Map<string, { at: number; rank: number }>();
  let enabled = true, lastAt = -Infinity;
  return {
    available: port !== null,
    setEnabled(value: boolean) { if (enabled && !value) port?.cancel(); enabled = value; },
    reset() { port?.cancel(); said.clear(); topics.clear(); lastAt = -Infinity; },
    stop() { port?.cancel(); },
    announce(id: string, text: string, now: number, immediate = false, topic?: { name: string; rank: number }) {
      if (!enabled || !port || said.has(id) || (!immediate && now - lastAt < 6500)) return false;
      // 눈부심 구간이 이어지는 동안 같은 말을 되풀이하지 않는다(100 m 판정 칸마다 말하던 문제).
      const prev = topic && topics.get(topic.name);
      if (topic && prev && now - prev.at < TOPIC_QUIET_MS && topic.rank <= prev.rank) { said.add(id); return false; }
      port.cancel(); port.speak(text); said.add(id); lastAt = now;
      if (topic) topics.set(topic.name, { at: now, rank: topic.rank });
      return true;
    },
  };
}
