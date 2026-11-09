import { useEffect, useState } from 'react';
import { getRoutePreview, metersLabel } from '../game/routePreview';
import { UNKNOWN_LABELS } from '../game/preTrip';
import { routeAnalysisSummary } from '../game/routeAnalysis';
import { ROAD_ID } from '../game/roadSelection';
import { MISSIONS, missionDate, useGame } from '../store';

const clock = (s: string) => Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '미확인';
export function PreTripPanel({ inPhone = false }: { inPhone?: boolean }) {
  const settings = useGame(s => s.settings), set = useGame(s => s.set);
  const preview = getRoutePreview(settings), p = preview.primary;
  const [selected, choose] = useState(0);
  useEffect(() => { const index = p.segments.findIndex(s => !!s.observation); choose(index >= 0 ? index : 0); }, [settings.observationMode, settings.exampleCondition, settings.startKm, settings.endKm]);
  const row = p.segments[Math.min(selected, p.segments.length - 1)];
  const observation = row?.observation;
  const example = settings.observationMode === 'example';
  const model = routeAnalysisSummary(ROAD_ID, settings);
  if (inPhone) return <section className="phone-route" aria-label="출발 전 경로 안내">
    <div className="phone-route-summary"><small>선택한 코스</small><div className="phone-route-distance"><b>{metersLabel(p.route.distanceM)}</b><span>약 {Math.max(1, Math.ceil(p.route.durationSec / 60))}분</span></div>
      <div className="phone-route-observation"><b>{p.observedM ? `주의 구간 ${metersLabel(p.cautionM)}` : '앞 구간 정보 미확인'}</b><span>{example ? '가상 관측 예시' : '도로변 사진 기준'} · 미확인 {metersLabel(p.unknownM)}</span></div>
      {model && <div className="phone-route-observation"><b>{model.severeM ? `심한 눈부심 ${metersLabel(model.severeM)}` : model.glareM ? `눈부심 ${metersLabel(model.glareM)}` : '눈부심 낮음'}</b><span>저장된 시뮬레이터 사진 판정</span></div>}
      <p>{p.observedM ? '주의 구간에 들어가기 전 속도를 줄이세요.' : '확인되지 않은 구간은 전방을 살피며 주행하세요.'}</p><span className="phone-caption">시간은 체험 속도 기준이며 실제 교통 정보는 연결되지 않았어요.</span>
    </div>
    <details className="phone-fold"><summary>구간별 자세히 보기</summary>
      <div className="pretrip-timeline" aria-label="전 경로 구간 상태">{p.segments.map((s, i) => <button key={s.segment.id} className={`pretrip-segment ${s.state}${selected === i ? ' selected' : ''}`} aria-label={`${s.segment.km0.toFixed(2)}킬로미터 ${s.state === 'unknown' ? '미확인' : s.state === 'caution' ? '주의' : '눈부심 관측 없음'}`} onClick={() => choose(i)} />)}</div>
      {row && <p><b>{row.state === 'unknown' ? UNKNOWN_LABELS[row.reason!] : row.level === 2 ? '눈부심 강함' : row.state === 'caution' ? '눈부심 주의' : '이 사진에서는 눈부심 관측 없음'}</b><br/>{row.segment.km0.toFixed(2)} → {row.segment.km1.toFixed(2)} km · 도착 예상 {clock(row.segment.eta)}</p>}
      {observation && <img style={{width:'100%',borderRadius:9}} src={observation.photo.url} alt={example ? '가상 도로변 관측 예시' : '선택 구간의 도로변 관측 사진'} />}
      <p>사진을 찍은 때와 도착할 때의 상태가 다를 수 있어요.</p>
    </details>
    <details className="phone-fold"><summary>안내 예시 살펴보기</summary><div className="phone-route-modes" role="group" aria-label="관측 입력 선택"><button aria-pressed={!example} onClick={()=>set({observationMode:'connected'})}>현재 연결 상태</button><button aria-pressed={example} onClick={()=>set({observationMode:'example'})}>가상 관측 예시</button></div>
      {example && <><p>실제 도로 정보가 아닌 안내 흐름 체험이에요.</p><div className="phone-route-modes" role="group" aria-label="예시 관측 조건">{([['attention','주의 구간'],['stale','오래된 사진'],['direction','반대 방향'],['missing','정보 없음']] as const).map(([v,t])=><button key={v} aria-pressed={settings.exampleCondition===v} onClick={()=>set({exampleCondition:v})}>{t}</button>)}</div></>}
    </details>
  </section>;
  return <section className={`pretrip${inPhone ? ' in-phone' : ''}`} aria-label="출발 전 경로 안내">
    <div className="pretrip-heading"><div><small>눈부심 노출 비교 · 사전 인지</small><h3>출발 전 경로 안내</h3></div><span className={`pretrip-mode${example ? ' example' : ''}`}>{example ? '가상 관측 예시' : '입력 연결 상태'}</span></div>
    <p className="pretrip-purpose">도로변 사진과 사진을 찍은 때의 태양·방향·날씨를 함께 살펴 앞 구간을 안내해요.</p>
    <div className="pretrip-metrics">
      <div><small>기본 코스</small><b>{metersLabel(p.route.distanceM)}</b><span>약 {Math.max(1, Math.ceil(p.route.durationSec / 60))}분 · 체험 속도 기준</span></div>
      <div><small>{example ? '주의 예시 구간' : '주의 관측 구간'}</small><b>{p.observedM ? metersLabel(p.cautionM) : '미확인'}</b><span>미확인 {metersLabel(p.unknownM)}</span></div>
    </div>
    {model && <div className="pretrip-model" aria-label="선정 모델 경로 판정">
      <small>선정 모델 판정 · 운전석 화면 {model.points}곳(100 m 간격)</small>
      <b>{model.severeM ? `심한 눈부심 ${metersLabel(model.severeM)}` : '심한 눈부심 없음'}{model.glareM ? ` · 눈부심 ${metersLabel(model.glareM)}` : ''} · 정상 {metersLabel(model.normalM)}</b>
      <div className="pretrip-model-bar">{model.levels.map((l, i) => <i key={i} className={`lv${l}`} />)}</div>
      <span>사진 + 해 위치·날씨로 판정한 결과예요. 시뮬레이터 화면 기준이며, 실제 도로변 사진 판정은 아래 구간 안내에 따로 표시해요.</span>
    </div>}
    <p className="pretrip-status">{preview.candidates.length < 2 ? '교통·대안 경로 미연결 · 기본 코스와 구간 안내로 체험해요.' : preview.selection.reason === 'exposure' ? '허용한 추가시간·거리 안에서 주의 관측 구간이 적은 후보가 있어요.' : '비교 조건을 충족하는 대안이 없어 기본 코스의 사전 안내를 유지해요.'}</p>
    <div className="pretrip-input-toggle" role="group" aria-label="관측 입력 선택">
      <button aria-pressed={!example} onClick={() => set({ observationMode: 'connected' })}>실제 입력 상태</button>
      <button aria-pressed={example} onClick={() => set({ observationMode: 'example' })}>안내 예시 체험</button>
    </div>
    {example && <div className="pretrip-example-note">사진·판정은 기능 설명을 위한 가상 관측입니다. 최종 모델 결과가 아니에요.
      <div className="pretrip-input-toggle" role="group" aria-label="예시 관측 조건">
        {([['attention', '주의 관측'], ['stale', '오래된 사진'], ['direction', '반대 방향'], ['missing', '카메라 없음']] as const).map(([v, text]) => <button key={v} aria-pressed={settings.exampleCondition === v} onClick={() => set({ exampleCondition: v })}>{text}</button>)}
      </div>
      {!p.observedM && <button className="pretrip-example-reset" onClick={() => { const i = Math.max(0, MISSIONS.findIndex(m => m.photoExample)), m = MISSIONS[i]; set({ startKm: m.a, endKm: m.b, date: missionDate(m, 2026), minutes: m.m, weather: 'clear', flow: 0, mission: i, observationSpeed: 0, exampleCondition: 'attention' }); }}>사진 예시가 있는 추천 코스로 보기</button>}
    </div>}
    <details className="pretrip-details"><summary>시간·거리·소통 상태 비교</summary>
      <div className="pretrip-candidates">{preview.candidates.map(c => <div key={c.route.id}>
        <b>{c.route.name}</b><span>약 {Math.max(1,Math.ceil(c.route.durationSec/60))}분 · {metersLabel(c.route.distanceM)}</span>
        <span>소통 {({smooth:'원활',slow:'서행',congested:'혼잡',unknown:'미확인'})[c.route.traffic]} · {c.route.timeSource === 'simulation' ? `체험 속도 ${c.route.assumedKmh ?? 50} km/h 가정` : '저장된 교통 정보 기준'}</span>
        <span>주의 관측 {c.observedM ? metersLabel(c.cautionM) : '미확인'} · 미확인 {metersLabel(c.unknownM)}</span>
        <span>{c.route.closure === 'closed' ? '통제 확인 · 선택 제외' : c.route.closure === 'unknown' ? '도로 통제·교차로 조건 미확인' : '제공된 통행 조건 확인'}</span>
      </div>)}</div>
      <p className="pretrip-qualification">교통 정보는 체험용 가정이에요. 미확인 구간이 있으면 대안 경로를 추천하지 않아요.</p>
    </details>
    <details className="pretrip-details" open={example || undefined}><summary>구간 사진·방향·유효시간 확인</summary>
      <div className="pretrip-timeline" aria-label="전 경로 구간 상태">{p.segments.map((s, i) => <button key={s.segment.id} className={`pretrip-segment ${s.state}${selected === i ? ' selected' : ''}`} aria-label={`${Math.min(s.segment.km0,s.segment.km1).toFixed(2)}킬로미터 ${s.state === 'unknown' ? '미확인' : s.state === 'caution' ? '주의' : '눈부심 관측 없음'}`} onClick={() => choose(i)} />)}</div>
      <div className="pretrip-legend"><span>● 주의 관측</span><span>● 눈부심 관측 없음</span><span>▧ 미확인</span></div>
      {row && <div className="pretrip-observation">
        <b>{row.state === 'unknown' ? UNKNOWN_LABELS[row.reason!] : row.state === 'caution' ? `${example ? '예시 · ' : ''}${row.level === 2 ? '눈부심 강함' : '눈부심 주의'}` : '이 사진에서는 눈부심 관측 없음'}</b>
        <span>{row.segment.km0.toFixed(2)} → {row.segment.km1.toFixed(2)} km · 도착 예상 {clock(row.segment.eta)}</span>
        {observation ? <><img src={observation.photo.url} alt={example ? '시뮬레이터에서 만든 도로변 관측 예시' : '선택 구간의 도로변 관측 사진'} /><div className="pretrip-photo-meta">
          <span>관측 {clock(observation.photo.capturedAt)} · 유효 {clock(observation.photo.validUntil)}까지</span>
          <span>촬영 {Math.round(observation.camera.headingDeg)}° · 진행 {Math.round(row.segment.headingDeg)}° · 화각 {Math.round(observation.camera.horizontalFovDeg)}°</span>
          <span>사진 시점 태양 높이 {Math.round(observation.context.sunAltitude)}° · 날씨 {({ clear: '맑음', cloud: '구름', over: '흐림' } as Record<string,string>)[observation.context.weather] ?? '미확인'}</span>
          <span>{example ? '시뮬레이터 가상 사진 · 수동 구성한 결합 입력 예시' : '도로변 사진 + 사진 시점의 태양·날씨 결합 판정'}</span>
        </div></> : <div className="pretrip-photo-empty">이 구간의 도로변 사진이 아직 없어 ‘미확인’으로 표시해요.</div>}
      </div>}
      <p className="pretrip-qualification">사진은 찍은 시각의 상태라 도착할 때와 다를 수 있어요. 방향·유효시간이 맞지 않으면 ‘미확인’으로 표시해요.</p>
    </details>
    <details className="pretrip-details"><summary>경로·안내 선호 설정</summary>
      <label>경로 선택 선호<select aria-label="경로 선택 선호" value={settings.preference} onChange={e => set({ preference: e.target.value as typeof settings.preference })}><option value="arrival">빠른 도착 우선</option><option value="exposure">눈부심 노출 회피 선호</option></select></label>
      <label>허용 추가시간<select aria-label="허용 추가시간" value={settings.extraMinutes} onChange={e => set({ extraMinutes: +e.target.value })}>{[0,3,5,10,15].map(n => <option key={n} value={n}>{n}분</option>)}</select></label>
      <label>허용 추가거리<select aria-label="허용 추가거리" value={settings.extraKm} onChange={e => set({ extraKm: +e.target.value })}>{[0,1,2,5].map(n => <option key={n} value={n}>{n} km</option>)}</select></label>
      <label>체감 민감도<select aria-label="체감 민감도" value={settings.sensitivity} onChange={e => set({ sensitivity: e.target.value as typeof settings.sensitivity })}><option value="standard">보통 · 기본 사전 안내</option><option value="sensitive">민감 · 조금 더 일찍 안내</option></select></label>
      <label className="pretrip-check"><input type="checkbox" checked={settings.guidance} onChange={e => set({ guidance: e.target.checked })} />지도 시야 안내</label>
      <label className="pretrip-check"><input type="checkbox" checked={settings.voice} onChange={e => set({ voice: e.target.checked })} />짧은 음성 안내</label>
      <p className="pretrip-qualification">체감 민감도는 안내를 얼마나 일찍 할지에만 쓰여요. 판정 등급은 바꾸지 않아요.</p>
    </details>
    <p className="pretrip-qualification">도로 전광판도 같은 내용을 미리 보여 줘요(가상 배치한 체험). 노출 감소·사고 예방 효과는 아직 검증하지 않았어요.</p>
  </section>;
}
