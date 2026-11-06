import { useGame } from '../store';
import { coursePassages } from '../game/courseReview';

export function CourseObservation() {
  const st = useGame(s => s.settings), set = useGame(s => s.set);
  const sections = coursePassages(st.startKm, st.endKm);
  return <section className="course-observation" aria-label="지하차도 관찰 조건">
    <b>지붕 아래 머무는 시간을 비교해요</b>
    <p>램프를 제외한 지붕 길이와 일정 속도로 지날 때의 예상 시간입니다.</p>
    {sections.length ? <div className="course-passages">{sections.map((u, i) => <div key={i}>
      <strong>{u.name} · 약 {Math.round(u.coveredM)} m{!u.fullPassage && ' · 일부 구간'}</strong>
      <span>40 km/h {u.secondsAt(40).toFixed(1)}초 · 60 km/h {u.secondsAt(60).toFixed(1)}초 · 80 km/h {u.secondsAt(80).toFixed(1)}초</span>
    </div>)}</div> : <p>지붕 구간을 지나는 코스를 선택해 주세요.</p>}
    <label>관찰 속도 상한<select aria-label="관찰 속도 상한" value={st.observationSpeed} onChange={e => set({ observationSpeed: +e.target.value as typeof st.observationSpeed })}>
      <option value={0}>자유 주행 · 기본</option><option value={40}>40 km/h · 천천히 관찰</option><option value={60}>60 km/h</option><option value={80}>80 km/h</option>
    </select></label>
    <p>가속·제동은 직접 조작해요. 길이·속도에 따른 밝기 전환 연출을 비교하며, 실제 순응 완료나 모델 정확도를 측정하는 것은 아닙니다.</p>
  </section>;
}
