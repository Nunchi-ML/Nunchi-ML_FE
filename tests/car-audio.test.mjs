import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/game/carAudio.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { engineRpm, createCarAudio, chime } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Engine rpm stays in a car-like range and drops at each gear change', () => {
  for (let kmh = 0; kmh <= 130; kmh += 1) {
    const rpm = engineRpm(kmh, 0);
    assert.ok(rpm >= 800 && rpm <= 3300, `${kmh} km/h → ${rpm}`);
  }
  assert.ok(engineRpm(19.9, 0) > engineRpm(20.1, 0), 'shifts up at 20 km/h');
  assert.ok(engineRpm(50, 1) > engineRpm(50, 0), 'throttle raises rpm');
});

test('Audio helpers are silent no-ops without a browser', () => {
  const audio = createCarAudio();
  audio.start(); audio.update(true, 60, 1); audio.stop();
  assert.equal(chime(), 0);
});

test('Disposing a driving sound stops every looping source and releases connections', () => {
  const sources = [], connections = [];
  const parameter = () => ({ value: 0, setTargetAtTime() {} });
  const node = () => {
    const n = { gain: parameter(), frequency: parameter(), Q: parameter(), threshold: parameter(), ratio: parameter(), knee: parameter(),
      connect(next) { return next; }, disconnect() { n.disconnected = true; }, start() {}, stop() { n.stopped = true; }, setPeriodicWave() {} };
    connections.push(n); return n;
  };
  class FakeContext {
    state = 'running'; currentTime = 0; sampleRate = 40; destination = {};
    createGain = node; createDynamicsCompressor = node; createBiquadFilter = node;
    createOscillator() { const n = node(); sources.push(n); return n; }
    createBufferSource() { const n = node(); sources.push(n); return n; }
    createPeriodicWave() { return {}; }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  }
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeContext };
  try {
    const audio = createCarAudio(); audio.start(); audio.update(true, 60, 1);
    assert.equal(sources.length, 4); audio.dispose(); audio.dispose();
    assert.ok(sources.every(s => s.stopped)); assert.ok(connections.every(n => n.disconnected));
    audio.start(); assert.equal(sources.length, 8, 'a fresh engine can build new sources'); audio.dispose();
    assert.ok(sources.every(s => s.stopped));
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
