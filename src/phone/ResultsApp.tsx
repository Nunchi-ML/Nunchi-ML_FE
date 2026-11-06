import { Back } from './Phone';
export function ResultsApp() {
  return <div className="pv"><Back /><h3>기능 연결 상태</h3>
    <div className="widget"><b>출발 전 · 전 경로 사전 안내</b><p>도로변 사진과 관측 당시의 태양·방향·날씨를 결합한 결과를 경로·예상 도착시각에 맞춰 안내하는 흐름입니다.</p><p>실제 도로변 사진·교통·대안 경로와 최종 모델은 아직 미연결입니다. 안내 예시는 시뮬레이터 가상 사진과 수동 구성한 입력으로 구분합니다.</p></div>
    <div className="widget"><b>주행 중 · 현재 전방 사진</b><p>기존 사진 1장 시범 API를 유지합니다. 현재 사진의 0·1·2 눈부심 등급이며, 사진+태양·날씨 결합 후보는 별도 검증 대상입니다. 현재 사진이 정상이어도 앞 구간의 경고를 일괄 해제하지 않습니다.</p></div>
    <div className="widget"><b>지하차도 · 밝기 전환 체험</b><p>밝기 이력에 따른 번짐·대비 저하·회복과 동공 반응 도식을 표현합니다. 실제 생리측정·의료효과·사고확률 예측이 아닙니다.</p></div>
    <div className="small">과거 사진 분류 성적을 미래 경로·실시간 지연·실제 운전자 시야·사고 감소 성능으로 표시하지 않습니다. 기존 사고 연구는 별도 보존하며 차·사람 객체검출은 추가하지 않았습니다. 현재 대상은 태양광이며 야간 전조등 번짐은 범위 밖입니다.</div>
    <a href="https://nunchi-glare-api.onrender.com/docs" target="_blank" rel="noreferrer">기존 사진 1장 시범 API 문서</a>
  </div>;
}
