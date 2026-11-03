import { useEffect, useState } from 'react';

// 작은 가로 화면은 마우스로 열어도 터치 배치를 확인하고 조작할 수 있다.
const QUERY = '(any-pointer: coarse), (max-width: 900px) and (orientation: landscape)';
export function useTouchControls() {
  const [enabled, setEnabled] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches);
  useEffect(() => {
    const media = matchMedia(QUERY);
    const update = () => setEnabled(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return enabled;
}
