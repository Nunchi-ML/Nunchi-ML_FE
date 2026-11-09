/** Read-only consumer of Python guidance-contract-probe-v1 results.
 * Never recompute model grades or mark these imported observations as live.
 */
export type Grade = 0 | 1 | 2;
export type ModelName = 'model2' | 'model3';
export interface ReviewComponent {
  state: 'ready' | 'unknown'; level: Grade | null; original_level?: Grade;
  reasons: string[]; model_version: string | null;
}
export interface GuidanceReport {
  version: 'guidance-contract-probe-v1'; status: 'prototype';
  observation_id: string; segment_id: string; captured_at: string; eta: string;
  completeness: 'complete' | 'partial' | 'unknown';
  requested_state: 'unknown' | 'attention' | 'observed_normal'; requested_level: Grade | null;
  current_observation_level: Grade | null; current_level_is_lower_bound: boolean;
  reasons: string[]; missing_components: ModelName[];
  components: Record<ModelName, ReviewComponent>;
}
export interface ReviewRecord { report: GuidanceReport; evidence: string; imageSha256: string | null; caseId: string }
const MODELS = ['model2', 'model3'] as const;
const HASH = /^[a-f0-9]{64}$/;
const invalid = () => new Error('지원하는 통합 검수 보고서 형식이 아닙니다. 원본 결과 JSON을 확인해 주세요.');
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid();
  return v as Record<string, unknown>;
};
const str = (v: unknown): string => { if (typeof v !== 'string' || !v.trim() || v.length > 512) throw invalid(); return v; };
const list = (v: unknown): string[] => { if (!Array.isArray(v) || v.length > 40) throw invalid(); return v.map(str); };
const grade = (v: unknown): Grade | null => { if (v === null || v === 0 || v === 1 || v === 2) return v; throw invalid(); };
const time = (v: unknown): string => {
  const s = str(v); if (!/(Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) throw invalid(); return s;
};
function component(value: unknown): ReviewComponent {
  const c = obj(value), reasons = list(c.reasons), level = grade(c.level);
  if (c.state !== 'ready' && c.state !== 'unknown') throw invalid();
  if (c.state === 'ready' ? level === null || reasons.length > 0 : level !== null || !reasons.length) throw invalid();
  const original = c.original_level === undefined ? undefined : grade(c.original_level);
  if (original === null) throw invalid();
  return { state: c.state, level, original_level: original, reasons,
    model_version: c.model_version === null ? null : str(c.model_version) };
}
function parseOne(value: unknown): ReviewRecord {
  const outer = obj(value), g = obj(outer.guidance ?? outer);
  if (g.version !== 'guidance-contract-probe-v1' || g.status !== 'prototype' || g.policy_validated !== false) throw invalid();
  if (g.requested_state !== 'unknown' && g.requested_state !== 'attention' && g.requested_state !== 'observed_normal') throw invalid();
  const components = { model2: component(obj(g.components).model2), model3: component(obj(g.components).model3) };
  const missing = MODELS.filter(k => components[k].state !== 'ready');
  const reportedMissing = list(g.missing_components);
  if (reportedMissing.length !== missing.length || new Set(reportedMissing).size !== reportedMissing.length || missing.some(k => !reportedMissing.includes(k))) throw invalid();
  const completeness = missing.length === 0 ? 'complete' : missing.length === 1 ? 'partial' : 'unknown';
  if (g.completeness !== completeness) throw invalid();
  const requested = grade(g.requested_level), current = grade(g.current_observation_level), reasons = list(g.reasons);
  if (typeof g.current_level_is_lower_bound !== 'boolean') throw invalid();
  // A partial observation must never clear a missing component as normal.
  if (missing.length && (current === 0 || requested === 0)) throw invalid();
  const available = MODELS.flatMap(k => components[k].level === null ? [] : [components[k].level!]);
  if (current !== null && !available.includes(current)) throw invalid();
  if (g.current_level_is_lower_bound !== (missing.length > 0 && current !== null)) throw invalid();
  if (g.requested_state === 'unknown' ? requested !== null : requested === null || requested !== current || reasons.length > 0) throw invalid();
  if (g.requested_state === 'observed_normal' && (requested !== 0 || missing.length > 0 || available.some(n => n !== 0))) throw invalid();
  if (g.requested_state === 'attention' && requested === 0) throw invalid();
  const imageHash = outer.image_sha256;
  if (imageHash !== undefined && (typeof imageHash !== 'string' || !HASH.test(imageHash))) throw invalid();
  const report: GuidanceReport = {
    version: 'guidance-contract-probe-v1', status: 'prototype',
    observation_id: str(g.observation_id), segment_id: str(g.segment_id), captured_at: time(g.captured_at), eta: time(g.eta),
    completeness, requested_state: g.requested_state, requested_level: requested,
    current_observation_level: current, current_level_is_lower_bound: g.current_level_is_lower_bound,
    reasons, missing_components: missing, components,
  };
  return { report, evidence: typeof outer.evidence === 'string' ? str(outer.evidence) : 'unverified_import',
    imageSha256: typeof imageHash === 'string' ? imageHash : null,
    caseId: typeof outer.case_id === 'string' ? str(outer.case_id) : report.observation_id };
}
export function parseIntegrationReports(value: unknown): ReviewRecord[] {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length || rows.length > 100) throw invalid();
  return rows.map(parseOne);
}
/** Driver-facing copy from the preserved, usable per-cause results. */
export function driverGuidance(r: GuidanceReport) {
  const usable = r.reasons.length === 0 && !(r.requested_state === 'unknown' && r.completeness === 'complete');
  const glare = usable ? r.components.model2.level : null;
  const transition = usable ? r.components.model3.level : null;
  const unknownNote = glare === null || transition === null ? '확인되지 않은 빛 상태는 계속 확인이 필요해요.' : '';
  const common = { glare, transition, unknownNote };
  if (glare !== null && glare > 0 && transition !== null && transition > 0)
    return { ...common, tone: 'attention', title: '눈부심과 터널의 밝기 변화에 주의하세요', action: '터널 진입 전 속도를 줄이고, 앞차와의 간격을 넓히세요.' };
  if (transition !== null && transition > 0)
    return { ...common, tone: 'attention', title: '터널에 들어가면\n앞이 어두워질 수 있어요', action: '진입 전 속도를 줄이고, 앞차와의 간격을 넓히세요.' };
  if (glare !== null && glare > 0)
    return { ...common, tone: 'attention', title: '강한 햇빛으로\n앞이 잘 안 보일 수 있어요', action: '속도를 줄이고, 앞차와의 간격을 넓히세요.' };
  if (unknownNote)
    return { ...common, tone: 'unknown', title: '앞 구간의 빛 정보를\n아직 확인하지 못했어요', action: '전방을 살피고, 앞차와의 간격을 유지하세요.' };
  return { ...common, tone: 'complete', title: '큰 빛 변화는 확인되지 않았어요', action: '앞 구간을 살피며 주행하세요.' };
}
