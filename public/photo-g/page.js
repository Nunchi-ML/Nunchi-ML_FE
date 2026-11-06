import { predictPhotoG, MAX_IMAGE_BYTES } from './client.js';

const $ = id => document.getElementById(id);
let active = null, previewUrl = null, generation = 0;

function reset(message = '입력이 바뀌었습니다. 다시 분석해 주세요.') {
  generation++;
  active?.abort();
  active = null;
  $('result').hidden = true;
  $('status').textContent = message;
  busy(false);
}
function busy(value) {
  $('submit').disabled = value;
  $('cancel').disabled = !value;
  $('form').setAttribute('aria-busy', String(value));
}
function revealStatus() {
  if (window.matchMedia('(max-width:700px)').matches) $('result-title').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
$('server').addEventListener('input', () => reset());
$('context').addEventListener('input', () => reset());
$('image').addEventListener('change', () => {
  reset();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('preview').hidden = true;
  $('preview').removeAttribute('src');
  const image = $('image').files?.[0];
  if (!image) return;
  if (image.type !== 'image/jpeg' || image.size < 1 || image.size > MAX_IMAGE_BYTES) {
    $('status').textContent = '1MiB 이하의 JPEG 원본을 선택해 주세요.';
    return;
  }
  previewUrl = URL.createObjectURL(image);
  $('preview').src = previewUrl;
  $('preview').hidden = false;
});
$('context-file').addEventListener('change', async () => {
  reset();
  $('context').value = '';
  const file = $('context-file').files?.[0], token = generation;
  if (!file) return;
  if (file.size > 8192) { $('status').textContent = '8KiB 이하의 촬영 정보 JSON 파일을 선택해 주세요.'; return; }
  try {
    const text = await file.text();
    if (token === generation) $('context').value = text.replace(/^\uFEFF/, '');
  } catch { if (token === generation) $('status').textContent = '촬영 정보 파일을 읽을 수 없습니다.'; }
});
$('cancel').addEventListener('click', () => reset('분석을 취소했습니다. 아직 판정하지 않았습니다.'));
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (active) return;
  reset('사진을 분석하고 있습니다.');
  const token = generation, controller = new AbortController();
  active = controller;
  busy(true);
  try {
    const { reading, requestMs } = await predictPhotoG($('image').files?.[0], $('context').value, $('server').value.trim(), { signal: controller.signal });
    if (token !== generation) return;
    $('grade').textContent = reading.label;
    $('captured').textContent = `촬영시각: ${reading.captured_at}`;
    for (const key of ['normal', 'glare', 'severe']) $(key).textContent = reading.scores[key].toFixed(4);
    $('processing').textContent = `${reading.processing_ms.toFixed(1)} ms`;
    $('roundtrip').textContent = `${requestMs.toFixed(1)} ms`;
    $('weather').textContent = `기상 관측: 촬영 ${Math.round(reading.weather_age_seconds / 60)}분 전 · 공개시각 ${reading.weather_availability_verified ? '확인됨' : '미확인'}`;
    $('result').hidden = false;
    $('status').textContent = `사진 분석 완료: ${reading.label}. 촬영 시점의 시제품 결과입니다.`;
    revealStatus();
  } catch (error) {
    if (token !== generation) return;
    $('result').hidden = true;
    $('status').textContent = error?.name === 'AbortError' ? '분석 시간이 초과되었거나 요청이 취소되었습니다. 다시 시도해 주세요.'
      : error instanceof TypeError ? '시제품 서버에 연결할 수 없습니다. 서버 실행과 주소를 확인해 주세요.' : error.message;
    revealStatus();
  } finally {
    if (token === generation) { active = null; busy(false); }
  }
});
window.addEventListener('pagehide', () => {
  generation++;
  active?.abort();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
});
