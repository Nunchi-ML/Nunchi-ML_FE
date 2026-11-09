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
export const REVIEW_FILE_LIMIT = 1024 * 1024;
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
export const MODEL_LABEL: Record<ModelName, string> = { model2: '태양광 눈부심', model3: '입구 밝기 대비' };
export const LEVEL_LABEL: Record<ModelName, readonly string[]> = { model2: ['정상', '눈부심', '심한 눈부심'], model3: ['하', '중', '상'] };
const REASONS: Record<string, string> = {
  model_missing: '결과 없음', photo_mismatch: '다른 사진', observation_mismatch: '관측 ID 불일치', segment_mismatch: '다른 구간',
  capture_time_mismatch: '촬영 시각 불일치', not_available_at_query: '조회 시점에 없는 관측', stale_photo: '유효시간이 지난 관측',
  position_mismatch: '위치 불일치', direction_mismatch: '진행 방향 불일치', unsupported_source: '안내에 사용할 수 없는 입력 출처',
  unsupported_status: '지원하지 않는 결과 상태', wrong_model_variant: '다른 모델 버전', wrong_target: '다른 예측 대상',
  wrong_model_variant_or_target: '다른 모델 또는 예측 대상', unsupported_zone: '터널 입구 범위 밖', invalid_component: '잘못된 결과 형식',
  future_state_unverified: '도착 시점의 상태는 미확인', past_eta: '이미 지난 도착 시각',
};
export const reasonLabel = (code: string) => REASONS[code] ?? '추가 확인이 필요한 결과';
export function guidanceSummary(r: GuidanceReport, photoMismatch = false) {
  if (photoMismatch) return { tone: 'unknown', title: '첨부한 사진이 다릅니다', detail: '이 사진의 통합 안내를 보류합니다.' };
  if (r.requested_state === 'unknown') return { tone: 'unknown', title: '통합 안내 미확인', detail: '확인되지 않은 원인을 정상으로 채우지 않습니다.' };
  if (r.completeness === 'partial') return { tone: 'attention', title: '확인된 경고 유지 · 일부 미확인', detail: '남아 있는 경고를 보존하고, 누락된 원인은 별도로 표시합니다.' };
  if (r.requested_state === 'attention') return { tone: 'attention', title: '같은 관측의 원인별 주의 안내', detail: '각 모델의 원래 등급을 함께 보존합니다.' };
  return { tone: 'complete', title: '보고서상 두 원인 모두 낮은 등급', detail: '이 관측의 결과이며, 이후 도착 시점이나 실제 안전을 보장하지 않습니다.' };
}
export async function photoFingerprint(file: Blob): Promise<string> {
  if (!file.size || file.size > REVIEW_FILE_LIMIT) throw new Error('사진은 1 MiB 이하 파일을 선택해 주세요.');
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
