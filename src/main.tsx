import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCityData } from './game/city';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="startup" role="status">운전 시뮬레이터를 준비하고 있어요…</div>);
void loadCityData().then(() => import('./App')).then(({ default: App }) => {
  root.render(<StrictMode><App /></StrictMode>);
}).catch(() => {
  root.render(<div className="startup" role="alert">시뮬레이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.
    <button onClick={() => location.reload()}>다시 불러오기</button></div>);
});
