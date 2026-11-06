import { createVoiceGuide, type SpeechPort } from './navigationGuidance';
import { chime } from './carAudio';

// 기기마다 있는 한국어 여성 목소리(부드럽게 들리는 쪽)를 먼저 고른다.
const SOFT_VOICES = /yuna|유나|sunhi|선희|heami|해미|seoyeon|서연|jimin|지민|female|여성|google 한국/i;

export function createKoreanVoiceGuide() {
  let pending = 0;
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const port: SpeechPort | null = synth && typeof SpeechSynthesisUtterance !== 'undefined' ? {
    cancel: () => { clearTimeout(pending); synth.cancel(); },
    speak(text) {
      const utterance = new SpeechSynthesisUtterance(text);
      // 조금 느리고 약간 높은 톤, 작은 볼륨: 경고 방송처럼 날카롭지 않게
      utterance.lang = 'ko-KR'; utterance.rate = .95; utterance.pitch = 1.08; utterance.volume = .75;
      const voices = synth.getVoices().filter(v => v.lang.toLowerCase().startsWith('ko'));
      const voice = voices.find(v => SOFT_VOICES.test(v.name)) ?? voices.find(v => v.localService) ?? voices[0];
      if (voice) utterance.voice = voice;
      // 딩-동 알림음 뒤에 말한다. The start button supplies the user gesture required by browser speech.
      clearTimeout(pending);
      pending = window.setTimeout(() => synth.speak(utterance), chime() * 1000);
    },
  } : null;
  return createVoiceGuide(port);
}
