import { Back } from './Phone';

export function ResultsApp() {
  return (
    <div className="pv">
      <Back />
      <h3>분석 결과</h3>
      <div className="small">모델 ② · GLARE 초기 라벨 130장 <b>시범</b> 검증 (영상 단위 5겹 교차검증)</div>
      <div className="kv">
        <div>초기 라벨 기준<b>0.57</b><span className="small">macro F1</span></div>
        <div>많이 눈부심<b>52%</b><span className="small">재현율</span></div>
      </div>
      <div className="small">초기 AI 보조 라벨로 재현한 점수이며 사람 합의 라벨의 최종 성능이 아니에요. 한국 도로·처음 보는 카메라·시뮬레이터에 같은 성능을 보장하지 않아요.</div>
      <div className="widget"><b>모델 연결 상태</b><p>① 구간 위험: 체험용 예시. 고속도로 모델 결과는 아직 이 경로에 연결되지 않았어요.</p><p>② 눈부심: 카메라 앱에서 시범 API 분석. 운전 화면의 눈부심은 태양·가림 조건을 이용한 시뮬레이션 계산이에요.</p><p>③ 터널 순응: 화면 연동 준비 중이에요.</p></div>
      <a href="https://nunchi-glare-api.onrender.com/docs" target="_blank" rel="noreferrer">시범 API 문서</a>
    </div>
  );
}
