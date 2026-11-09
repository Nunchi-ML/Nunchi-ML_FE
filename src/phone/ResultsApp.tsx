import { Back } from './Phone';
export function ResultsApp() {
  return <div className="pv"><Back /><h3>안내 도움말</h3>
    <p className="phone-lead">빛이 바뀌는 순간을 미리 살펴보세요.</p>
    <div className="phone-help-item"><small>출발 전</small><b>앞 구간을 미리 확인해요</b><p>경로 안내에서 주의할 구간과 정보가 없는 곳을 살펴보세요.</p></div>
    <div className="phone-help-item"><small>주행 중</small><b>지금 보이는 눈부심을 확인해요</b><p>전방 사진 앱에서 현재 사진의 눈부심을 분석할 수 있어요.</p></div>
    <div className="phone-help-item"><small>출발 전에</small><b>안내를 미리 살펴보세요</b><p>시작 화면의 ‘안내 미리보기’에서 눈부심과 터널 안내 예시를 확인할 수 있어요.</p></div>
    <details className="phone-fold"><summary>체험 범위 알아보기</summary><p>실제 도로변 카메라·교통·대안 경로는 아직 연결되지 않았어요. 가상 예시는 표시를 확인해 주세요.</p><p>사진 분석은 찍은 순간의 눈부심을 봅니다. 앞 구간의 상태나 사고 가능성을 뜻하지 않아요.</p><p>터널의 어두워짐과 회복은 시뮬레이터 연출이며 실제 사람의 회복 시간을 측정한 값은 아니에요.</p></details>
  </div>;
}
