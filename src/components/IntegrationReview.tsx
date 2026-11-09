import { useEffect, useRef, useState } from 'react';
import examples from '../data/integration_examples.json';
import { driverGuidance, parseIntegrationReports } from '../game/integrationReview';
import { useGame } from '../store';
import './integrationReview.css';

const SCENARIOS = [
  { id: 'matched', label: '터널 진입', context: '곧 터널에 들어가요', explanation: '햇빛 눈부심이 적어도 터널 안팎의 밝기 차이가 크면, 진입 전에 속도를 줄이도록 안내해요.' },
  { id: 'glare-only', label: '햇빛이 강한 길', context: '햇빛이 강한 구간이에요', explanation: '터널의 밝기 차이가 작아도 햇빛 때문에 앞이 잘 안 보일 수 있으면, 눈부심 주의를 안내해요.' },
  { id: 'both', label: '두 원인 모두 주의', context: '햇빛이 강한 터널 진입로예요', explanation: '눈부심과 터널의 밝기 변화가 함께 나타나면, 두 원인을 한 번에 알려드려요.' },
  { id: 'missing', label: '정보가 부족한 길', context: '앞 구간 정보를 확인 중이에요', explanation: '눈부심이 적다는 정보만으로 전체 구간을 괜찮다고 안내하지 않아요. 확인되지 않은 밝기 변화는 따로 알려드려요.' },
].map(s => ({ ...s, report: parseIntegrationReports(examples.cases.find(c => c.id === s.id)!.report)[0].report }));

export function IntegrationReview() {
  const screen = useGame(s => s.screen);
  const dialog = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const scenario = SCENARIOS[selected], guidance = driverGuidance(scenario.report);
  const close = () => useGame.setState({ integrationOpen: false });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); useGame.setState({ integrationOpen: false }); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  return <div className="integration-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="integration-review" role="dialog" aria-modal="true" aria-labelledby="integration-title" aria-describedby="integration-intro" ref={dialog}>
      <header className="integration-header"><div><small>눈치 드라이브 · 통합 안내 체험</small><h2 id="integration-title">빛이 바뀌는 길, 미리 알려드려요</h2></div><button type="button" onClick={close} aria-label="통합 안내 체험 닫기">닫기 ×</button></header>
      <p id="integration-intro">눈부심과 터널의 밝기 변화를 함께 살펴, 앞 구간에서 어떻게 대비할지 안내해요.</p>
      <div className="integration-options" role="group" aria-label="주행 상황 선택">
        {SCENARIOS.map((s, i) => <button type="button" key={s.id} aria-pressed={selected === i} onClick={() => setSelected(i)}>{s.label}</button>)}
      </div>
      <section className={`integration-drive is-${guidance.tone}`} aria-label="운전자에게 표시되는 통합 안내" aria-live="polite" aria-atomic="true">
        <div className="integration-drive-top"><b>NUNCHI <em>DRIVE</em></b><span>안내 예시</span></div>
        <p className="integration-context">{scenario.context}</p>
        <div className="integration-causes" aria-label="앞 구간의 빛 상태">
          <div><span>햇빛 눈부심</span><strong className={guidance.glare === null ? 'unverified' : guidance.glare > 0 ? 'caution' : ''}>{guidance.glare === null ? '확인 중' : ['적음', '주의', '강함'][guidance.glare]}</strong></div>
          <div><span>터널 밝기 변화</span><strong className={guidance.transition === null ? 'unverified' : guidance.transition > 0 ? 'caution' : ''}>{guidance.transition === null ? '확인 중' : ['작음', '주의', '큼'][guidance.transition]}</strong></div>
        </div>
        <div className="integration-driver-message"><small>앞 구간 안내</small><h3>{guidance.title}</h3><p>{guidance.action}</p></div>
        {guidance.unknownNote && <p className="integration-unknown-note">{guidance.unknownNote}</p>}
      </section>
      <p className="integration-explanation">{scenario.explanation}</p>
      <div className="integration-bottom"><span>두 가지 빛 상태를 함께 살펴<br /><b>운전자에게 필요한 안내로 전해요.</b></span><button type="button" onClick={close}>{screen === 'driving' ? '주행 계속하기' : '코스 선택으로 돌아가기'} <span aria-hidden="true">→</span></button></div>
      <footer className="integration-footer">안내 흐름을 보여주는 가상 상황입니다. 실제 도로의 현재 상태를 나타내지 않습니다.{screen === 'driving' && ' 체험하는 동안 주행은 잠시 멈춥니다.'}</footer>
    </section>
  </div>;
}
