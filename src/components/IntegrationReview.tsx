import { useEffect, useRef, useState } from 'react';
import examples from '../data/integration_examples.json';
import { guidanceSummary, LEVEL_LABEL, MODEL_LABEL, parseIntegrationReports, photoFingerprint, reasonLabel,
  REVIEW_FILE_LIMIT, type ModelName, type ReviewRecord } from '../game/integrationReview';
import { useGame } from '../store';
import './integrationReview.css';

const CASES = examples.cases.map(c => ({ ...c, record: parseIntegrationReports(c.report)[0] }));
const MODELS: ModelName[] = ['model2', 'model3'];
type PhotoState = 'none' | 'matches' | 'mismatch' | 'not-comparable';

export function IntegrationReview() {
  const screen = useGame(s => s.screen);
  const dialog = useRef<HTMLElement>(null), request = useRef(0);
  const [mode, setMode] = useState<'none' | 'example' | 'import'>('none');
  const [records, setRecords] = useState<ReviewRecord[]>([]), [index, setIndex] = useState(0);
  const [error, setError] = useState(''), [fileName, setFileName] = useState('');
  const [photo, setPhoto] = useState<PhotoState>('none'), [photoName, setPhotoName] = useState('');
  const [busy, setBusy] = useState(false);
  const record = records[index], report = record?.report;
  const summary = report ? guidanceSummary(report, photo === 'mismatch') : null;
  const close = () => useGame.setState({ integrationOpen: false });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); useGame.setState({ integrationOpen: false }); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, summary, [href]') ?? []).filter(el => el.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { request.current++; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  function resetPhoto() { setPhoto('none'); setPhotoName(''); }
  function chooseExample(i: number) {
    request.current++; setBusy(false); setMode('example'); setRecords([CASES[i].record]); setIndex(0);
    setError(''); setFileName(''); resetPhoto();
  }
  async function loadReport(file?: File) {
    if (!file) return;
    const token = ++request.current; setBusy(true); setError(''); setRecords([]); setMode('none'); resetPhoto();
    try {
      if (!file.size || file.size > REVIEW_FILE_LIMIT) throw new Error('보고서는 1 MiB 이하 JSON 파일을 선택해 주세요.');
      const parsed = parseIntegrationReports(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
      if (token !== request.current) return;
      setRecords(parsed); setIndex(0); setMode('import'); setFileName(file.name);
    } catch (e) {
      if (token === request.current) setError(e instanceof SyntaxError ? 'JSON 파일을 읽을 수 없습니다. 파일 내용을 확인해 주세요.' : e instanceof Error ? e.message : '파일을 확인해 주세요.');
    } finally { if (token === request.current) setBusy(false); }
  }
  async function checkPhoto(file?: File) {
    if (!file || !record) return;
    const token = ++request.current; setBusy(true); setError(''); resetPhoto();
    try {
      const hash = await photoFingerprint(file);
      if (token !== request.current) return;
      setPhotoName(file.name); setPhoto(record.imageSha256 ? hash === record.imageSha256 ? 'matches' : 'mismatch' : 'not-comparable');
    } catch (e) { if (token === request.current) setError(e instanceof Error ? e.message : '사진을 확인해 주세요.'); }
    finally { if (token === request.current) setBusy(false); }
  }
  const reasons = report ? Array.from(new Set([...report.reasons, ...MODELS.flatMap(k => report.components[k].reasons)])) : [];
  return <div className="integration-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="integration-review" role="dialog" aria-modal="true" aria-labelledby="integration-title" aria-describedby="integration-intro" ref={dialog}>
      <header className="integration-header"><div><small>눈치 드라이브</small><h2 id="integration-title">두 결과를 어떻게 연결할까요?</h2></div><button type="button" onClick={close} aria-label="통합 안내 확인 닫기">닫기 ×</button></header>
      <p id="integration-intro">사진 한 장을 두 모델이 각각 분석하고, 같은 관측의 결과인지 확인한 뒤 함께 안내하는 흐름입니다.</p>
      <ol className="integration-flow" aria-label="통합 안내 연결 과정">
        <li><b>사진 한 장</b><span>같은 사진·촬영 정보</span></li>
        <li><b>두 원인을 각각 판정</b><span>태양광 눈부심 / 입구 밝기 대비</span></li>
        <li><b>통합 로직으로 대조</b><span>사진·시각·구간 일치 확인</span></li>
        <li><b>함께 안내</b><span>누락·불일치는 미확인</span></li>
      </ol>
      <div className="integration-options" role="group" aria-label="검수 흐름 예시">
        {CASES.map((c, i) => <button type="button" key={c.id} aria-pressed={mode === 'example' && record?.caseId === c.id} onClick={() => chooseExample(i)}>{c.title}</button>)}
      </div>
      <div className="integration-import">
        <label>검수 보고서 불러오기<input type="file" accept=".json,application/json" aria-label="검수 보고서 JSON" onChange={e => { void loadReport(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <small>{busy ? '파일 확인 중…' : fileName || '기존 Python 검수 결과 JSON · 파일은 브라우저에서만 읽습니다'}</small>
      </div>
      {error && <p className="integration-error" role="alert">{error}</p>}
      {!report && !busy && <div className="integration-empty">위의 검수 흐름 예시를 선택하거나 보고서를 불러오세요.</div>}
      {record && report && summary && <>
        <p className="integration-provenance" role="status">{mode === 'example'
          ? '처리 흐름을 보여 주는 합성 예시입니다. 실제 사진의 모델 판정이나 성능 결과가 아닙니다.'
          : record.evidence.includes('synthetic') ? '불러온 보고서는 합성 입력 사례입니다. 실제 도로 관측으로 사용하지 않습니다.'
            : '불러온 보고서의 검수 결과입니다. 이 화면은 모델 실행 출처나 실제 도로의 정확도를 독립적으로 인증하지 않습니다.'}</p>
        <div className="integration-results" aria-label="원인별 원래 판정">
          {MODELS.map(k => { const c = report.components[k]; return <article key={k} className={`integration-component ${c.state === 'unknown' ? 'is-unknown' : ''}`}>
            <small>{MODEL_LABEL[k]}</small><strong>{c.level === null ? '미확인' : LEVEL_LABEL[k][c.level]}</strong>
            <span>{c.state === 'ready' ? '보고서상 관측 대조 완료' : c.reasons.map(reasonLabel).join(' · ')}</span>
            {c.level === null && c.original_level !== undefined && <p>원래 판정 {LEVEL_LABEL[k][c.original_level]} · 안내에 사용하지 않음</p>}
          </article>; })}
        </div>
        <section className={`integration-summary is-${summary.tone}`} aria-label="통합 검수 결과" aria-live="polite">
          <small>{mode === 'example' ? '연결 흐름 예시' : '불러온 관측의 안내 상태'}</small><h3>{summary.title}</h3><p>{summary.detail}</p>
          {reasons.length > 0 && <ul>{reasons.map(r => <li key={r}>{reasonLabel(r)}</li>)}</ul>}
        </section>
        {mode === 'import' && <div className="integration-photo-check">
          <label>같은 사진인지 확인<input type="file" accept="image/jpeg,.jpg,.jpeg" aria-label="검수에 사용한 사진" onChange={e => { void checkPhoto(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
          <span role="status">{photo === 'matches' ? '첨부 사진이 보고서의 사진 지문과 일치합니다.' : photo === 'mismatch' ? '첨부 사진이 보고서와 다릅니다. 이 사진의 통합 안내를 보류합니다.' : photo === 'not-comparable' ? '이 보고서에는 사진 지문이 없어 직접 대조할 수 없습니다.' : '사진을 선택하면 보고서에 기록된 사진 지문과 비교합니다.'}{photoName && ` (${photoName})`}</span>
        </div>}
        {records.length > 1 && <label className="integration-record-select">불러온 사례<select value={index} onChange={e => { request.current++; setBusy(false); setIndex(Number(e.target.value)); setError(''); resetPhoto(); }}>{records.map((r, i) => <option key={i} value={i}>{i + 1}. {r.caseId}</option>)}</select></label>}
        <details className="integration-details"><summary>관측·모델 정보</summary><dl>
          <dt>관측</dt><dd>{report.observation_id}</dd><dt>구간</dt><dd>{report.segment_id}</dd>
          <dt>촬영 시각</dt><dd>{report.captured_at}</dd><dt>요청 도착 시각</dt><dd>{report.eta}</dd>
          {MODELS.map(k => <div key={k}><dt>{MODEL_LABEL[k]}</dt><dd>{report.components[k].model_version ?? '결과 없음'}</dd></div>)}
        </dl></details>
      </>}
      <footer className="integration-footer">보고서 재생·확인 기능입니다. 현재 주행 구간의 실시간 공동 판정이나 경로 안내에 자동 적용하지 않습니다.{screen === 'driving' && ' 확인하는 동안 주행을 잠시 멈춥니다.'}</footer>
    </section>
  </div>;
}
