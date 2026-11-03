import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCityData } from './game/city';
import { warmUpBackend } from './phone/glareApi';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
// 화면/도시 데이터 로딩과 병렬 실행. 로컬 개발에서는 서버를 자동 호출하지 않는다.
if (import.meta.env.PROD) void warmUpBackend();
root.render(<div className="startup" role="status">운전 시뮬레이터를 준비하고 있어요…</div>);
void loadCityData().then(() => import('./App')).then(({ default: App }) => {
  root.render(<StrictMode><App /></StrictMode>);
}).catch(() => {
  root.render(<div className="startup" role="alert">시뮬레이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.
    <button onClick={() => location.reload()}>다시 불러오기</button></div>);
});
