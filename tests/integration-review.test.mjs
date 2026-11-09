import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/game/integrationReview.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const M = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const examples = JSON.parse(await readFile(new URL('../src/data/integration_examples.json', import.meta.url), 'utf8'));
const fixture = id => structuredClone(examples.cases.find(c => c.id === id).report);

test('Python-exported cases keep their original per-cause grades and explicit synthetic evidence', () => {
  assert.equal(examples.evidence, 'synthetic_contract_not_model_accuracy');
  assert.match(examples.probe_sha256, /^[a-f0-9]{64}$/);
  for (const c of examples.cases) {
    const parsed = M.parseIntegrationReports(c.report)[0];
    assert.match(parsed.evidence, /synthetic/);
    assert.equal(parsed.report.components.model2.level, c.report.components.model2.level);
    assert.equal(parsed.report.components.model3.level, c.report.components.model3.level);
    assert.equal(parsed.report.requested_level, c.report.requested_level);
  }
  const matched = M.parseIntegrationReports(fixture('matched'))[0].report;
  assert.equal(matched.components.model2.level, 0);
  assert.equal(matched.components.model3.level, 2);
  assert.equal(M.guidanceSummary(matched).tone, 'attention');
});

test('a normal first model never clears a missing second model', () => {
  const r = M.parseIntegrationReports(fixture('missing'))[0].report;
  assert.equal(r.requested_state, 'unknown');
  assert.equal(r.components.model2.level, 0);
  assert.equal(r.components.model3.level, null);
  for (const key of ['requested_level', 'current_observation_level']) {
    const forged = fixture('missing'); forged[key] = 0;
    assert.throws(() => M.parseIntegrationReports(forged));
  }
});

test('known warnings survive partial data without claiming complete observations', () => {
  const r = M.parseIntegrationReports(fixture('warning-partial'))[0].report;
  assert.equal(r.current_level_is_lower_bound, true);
  assert.equal(r.requested_level, 2);
  assert.equal(r.components.model3.state, 'unknown');
  assert.match(M.guidanceSummary(r).title, /경고 유지/);
});

test('mismatched and expired observations, and future ETA, remain unknown', () => {
  for (const id of ['different-photo', 'stale', 'future']) {
    const r = M.parseIntegrationReports(fixture(id))[0].report;
    assert.equal(r.requested_state, 'unknown', id);
    assert.equal(M.guidanceSummary(r).tone, 'unknown', id);
  }
  const future = M.parseIntegrationReports(fixture('future'))[0].report;
  assert.equal(future.components.model3.level, 2);
  assert.equal(future.requested_level, null);
  assert.ok(future.reasons.includes('future_state_unverified'));
});

test('supports actual joint-runner envelopes, including rejected synthetic inputs', () => {
  const g = fixture('matched');
  const wrapped = { version: 'same-photo-joint-probe-v1', evidence: 'synthetic_contract', image_sha256: 'a'.repeat(64), guidance: g };
  const before = structuredClone(wrapped);
  const r = M.parseIntegrationReports(wrapped)[0];
  assert.equal(r.imageSha256, 'a'.repeat(64));
  assert.equal(r.evidence, 'synthetic_contract');
  assert.deepEqual(wrapped, before);
  assert.match(M.guidanceSummary(r.report, true).title, /사진/);
  assert.equal(M.guidanceSummary(r.report, true).tone, 'unknown');
});

test('rejects inconsistent or unsupported reports instead of rendering successful guidance', () => {
  const mutations = [
    g => { g.version = 'other'; }, g => { g.policy_validated = true; },
    g => { g.components.model3.level = true; }, g => { g.components.model3.level = 3; },
    g => { g.components.model3.state = 'unknown'; },
    g => { g.missing_components = ['model2', 'model2']; },
    g => { g.completeness = 'partial'; },
    g => { g.requested_state = 'observed_normal'; g.requested_level = 0; g.current_observation_level = 0; },
    g => { g.captured_at = '2026-11-06T08:00:00'; },
    g => { g.observation_id = ''; }, g => { g.components.model2.reasons = ['photo_mismatch']; },
  ];
  for (const mutate of mutations) { const g = fixture('matched'); mutate(g); assert.throws(() => M.parseIntegrationReports(g)); }
  for (const value of [null, [], [fixture('matched'), {}], { cases: [] }, Array(101).fill(fixture('matched'))]) assert.throws(() => M.parseIntegrationReports(value));
});

test('photo fingerprint checks exact bytes and bounds input size', async () => {
  assert.equal(await M.photoFingerprint(new Blob(['test'])), '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  await assert.rejects(() => M.photoFingerprint(new Blob([])));
  await assert.rejects(() => M.photoFingerprint(new Blob([new Uint8Array(M.REVIEW_FILE_LIMIT + 1)])));
});
