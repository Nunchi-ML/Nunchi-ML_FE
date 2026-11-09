/** Keep the photo model's output distinct from the simulated driving warning. */
export function cameraGuidance(level: 0 | 1 | 2 | null, source: 'real' | 'game', sceneLevel: number) {
  const mismatch = source === 'game' && level === 0 && sceneLevel > 0;
  return {
    mismatch,
    label: level === null ? '분석 전' : ['눈부심 낮음', '눈부심', '심한 눈부심'][level],
    detail: mismatch ? '사진은 낮게 판정됐지만, 현재 주행 화면의 강한 빛에 주의하세요.'
      : level === null ? '사진 분석 결과를 기다리고 있어요.'
      : level > 0 ? '속도를 줄이고, 앞차와의 간격을 넓히세요.'
      : '이 사진에서는 눈부심이 낮게 판정됐어요. 전방을 계속 살펴보세요.',
  };
}
