import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// 브라우저 전용 모듈의 순수 계약/요청 로직을 추가 테스트 의존성 없이 실행한다.
const source = await readFile(new URL('../src/phone/glareApi.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { frameSize, parseGlareReading, predictGlare, MAX_IMAGE_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const reading = { model_version: 'model2-pilot-v1', status: 'pilot', level: 2, label: '심한 눈부심',
  scores: { normal: .1, glare: .2, severe: .7 }, brightest: { x: 0, y: 1 } };

test('전체 프레임 비율, 최대 1280, 작은 원본 확대 금지', () => {
  assert.deepEqual(frameSize(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(frameSize(1080, 1920), { width: 720, height: 1280 });
  assert.deepEqual(frameSize(640, 480), { width: 640, height: 480 });
  for (const value of [0, -1, NaN, Infinity]) assert.equal(frameSize(value, 480), null);
});
test('유효한 시범 응답과 좌표 경계 허용', () => assert.deepEqual(parseGlareReading(reading), reading));
test('결측/이상 응답을 정상 판정으로 바꾸지 않음', () => {
  for (const bad of [null, {}, { ...reading, level: 3 }, { ...reading, status: 'ready' },
    { ...reading, scores: { normal: NaN, glare: .2, severe: .8 } },
    { ...reading, scores: { normal: .9, glare: .9, severe: .9 } },
    { ...reading, brightest: { x: 1.01, y: .5 } }]) assert.throws(() => parseGlareReading(bad));
});
test('multipart 계약: JPEG 파일과 camera/game, abort signal 전달', async () => {
  const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  const controller = new AbortController();
  for (const source of ['camera', 'game']) {
    const result = await predictGlare(image, source, controller.signal, async (url, init) => {
      assert.ok(url.endsWith('/predict/glare')); assert.equal(init.method, 'POST');
      assert.equal(init.signal, controller.signal); assert.equal(init.body.get('source'), source);
      assert.equal(init.body.get('image').type, 'image/jpeg');
      return new Response(JSON.stringify(reading), { status: 200 });
    });
    assert.equal(result.level, 2);
  }
});
test('용량 초과, 빈 이미지, JPEG 이외 형식은 전송하지 않음', async () => {
  let calls = 0;
  for (const image of [new Blob([], { type: 'image/jpeg' }), new Blob(['png'], { type: 'image/png' }), new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/jpeg' })]) {
    await assert.rejects(predictGlare(image, 'game', new AbortController().signal, async () => { calls++; }));
  }
  assert.equal(calls, 0);
});
test('서버 오류, 네트워크 오류, 취소는 실패로 유지', async () => {
  const image = new Blob(['jpeg'], { type: 'image/jpeg' });
  for (const status of [413, 500, 503]) await assert.rejects(predictGlare(image, 'game', new AbortController().signal, async () => new Response('', { status })));
  await assert.rejects(predictGlare(image, 'game', new AbortController().signal, async () => { throw new TypeError('network'); }));
  await assert.rejects(predictGlare(image, 'game', new AbortController().signal, async () => { throw new DOMException('aborted', 'AbortError'); }));
});
