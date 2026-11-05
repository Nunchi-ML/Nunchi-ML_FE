import { createVoiceGuide, type SpeechPort } from './navigationGuidance';

export function createKoreanVoiceGuide() {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const port: SpeechPort | null = synth && typeof SpeechSynthesisUtterance !== 'undefined' ? {
    cancel: () => synth.cancel(),
    speak(text) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR'; utterance.rate = 1; utterance.volume = .85;
      const voices = synth.getVoices().filter(v => v.lang.toLowerCase().startsWith('ko'));
      const voice = voices.find(v => v.localService) ?? voices[0];
      if (voice) utterance.voice = voice;
      // The start button supplies the user gesture required by browser speech.
      synth.speak(utterance);
    },
  } : null;
  return createVoiceGuide(port);
}
