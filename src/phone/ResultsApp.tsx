import { Back } from './Phone';

// 수치 출처: Nunchi-ML_AI notebooks/experiments/glare_pilot (영상 단위 5겹 교차검증, 시범 라벨 130장)
const IMP: [string, number][] = [['밝은 빛 덩어리', 20], ['해의 좌우 위치', 18], ['도로 선명도', 12], ['희뿌연 정도', 10], ['전체 밝기', 8]];

export function ResultsApp() {
  return (
    <div className="pv">
      <Back />
      <h3>분석 결과</h3>
      <div className="small">모델 ② 눈부심 정도 · GLARE 130장 <b>시범</b> 검증 (영상 단위 5겹 교차검증)</div>
      <div className="kv">
        <div>밝기 규칙<b>0.33</b><span className="small">macro F1</span></div>
        <div style={{ borderColor: 'var(--orange)' }}>우리 모델<b style={{ color: 'var(--red)' }}>0.57</b><span className="small">macro F1</span></div>
      </div>
      <div className="widget">심한 눈부심을 잡아낸 비율 <b>52%</b> <span className="small">(밝기 규칙 7%)</span></div>
      <div className="small" style={{ fontWeight: 700, color: 'var(--ink)' }}>무엇을 보고 판단했나</div>
      <div className="imp">
        {IMP.map(([k, v]) => <div key={k} className="r"><span>{k}</span><i style={{ width: `${v / 20 * 100}%` }} /><span>{v}%</span></div>)}
      </div>
      <div className="small">시범 라벨 1인 · 미국 영상 기준이라 팀 라벨로 다시 확인 예정. 모델 ① 결과는 준비 중이에요.</div>
    </div>
  );
}
