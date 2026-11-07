import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { BANK_KM, D, TOTAL, ROAD_W, LANE_COUNT, LANE_WIDTH, at, kmToS, laneOffset, locationLabel, nearestStation, riskAt, sToKm, stationLabel, type Dir } from './road';
import { compass, hm, simDate, sunDir, sunPos } from './sun';
import { createWorld, makeRand } from './world';
import type { Vehicle } from './vehicles';
import { createCockpit } from './cockpit';
import { createLcdVisor } from './lcdVisor';
import { newDrivingFeel, updateDrivingFeel, stepDriveSpeed } from './drivingFeel';
import { createKoreanVoiceGuide } from './voice';
import { createCarAudio } from './carAudio';
import { getRoutePreview } from './routePreview';
import { warningLeadMeters, type SegmentAssessment } from './preTrip';
import { routeZones } from './navigator';
import type { NavigationZone } from './navigationGuidance';
import { drawMinimap, drawSpeedo } from './gauges';
import { isTouch, useGame, type PassageRecord } from '../store';
import { separateTraffic } from './trafficSpacing';
import { lookupRouteAnalysis } from './routeAnalysis';
import { ROAD_ID, IS_SINCHEON } from './roadSelection';
import { underpassAt } from './underpasses';
import { adaptationScores, newAdaptation, resetAdaptation, sceneLuminance, stepAdaptation } from './adaptation';
import { createLightGlare } from './lightGlare';
import { MODEL3_CLOUD, MODEL3_COLOR, createModel3Scene, model3AlertText, model3Beep, requestModel3, type Model3Presets } from './model3';
import model3Presets from '../data/model3_presets.json';

/** 매 프레임 직접 고치는 화면 요소 (React 재렌더 없이) */
export interface Els { wash?: HTMLElement; glare?: HTMLElement; shade?: HTMLElement; adaptationVeil?: HTMLElement; model3Veil?: HTMLElement; cockpit?: HTMLElement; speedo?: HTMLCanvasElement; minimap?: HTMLCanvasElement; phone?: HTMLElement; phoneDim?: HTMLElement }

const SUN_DIST = 6000;

export function createEngine(canvas: HTMLCanvasElement) {
  const els: Els = {};
  const rand = makeRand(11);
  const G = useGame;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 9000);
  const W = createWorld();
  // 운전석은 차에 붙어 있고(rig), 카메라는 그 안에서 고개만 돌린다
  const CP = createCockpit(), rig = new THREE.Group(); rig.add(CP.group); W.scene.add(rig);
  // LCD 차광판: 운전석에 붙어 있고, 해가 눈에 들어오는 육각형 칸만 어두워진다
  const visor = createLcdVisor(); rig.add(visor.group);
  const sunLocal = new THREE.Vector3(), eyeLocal = new THREE.Vector3(), rigInv = new THREE.Quaternion();
  let visorDark = 0;

  // 백미러: 뒤쪽을 작은 화면에 그려 거울면에 붙임 (좌우 반전)
  const mirrorRT = new THREE.WebGLRenderTarget(256, 80);
  mirrorRT.texture.wrapS = THREE.RepeatWrapping; mirrorRT.texture.repeat.x = -1; mirrorRT.texture.offset.x = 1;
  const mirrorCam = new THREE.PerspectiveCamera(30, 320 / 96, 0.3, 1500);
  mirrorCam.position.set(0.36, 0.22, -0.6); mirrorCam.rotation.y = Math.PI; rig.add(mirrorCam);
  CP.mirrorFaceMat.map = mirrorRT.texture; CP.mirrorFaceMat.needsUpdate = true;
  // 사이드미러: 거울 자리에서 뒤쪽 바깥을 비스듬히 봄 (왼쪽 · 오른쪽)
  const sideMirrors = ([[-1.06, -0.19, -0.98, Math.PI - 0.22], [1.8, -0.19, -0.98, Math.PI + 0.22]] as const).map(([x, y, z, ry], i) => {
    const rt = new THREE.WebGLRenderTarget(160, 96);
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1;
    const cam = new THREE.PerspectiveCamera(32, 0.17 / 0.1, 0.3, 1200); cam.position.set(x, y, z); cam.rotation.y = ry; rig.add(cam);
    CP.sideMirrorMats[i].map = rt.texture; CP.sideMirrorMats[i].needsUpdate = true;
    return { rt, cam };
  });
  let mirFrame = 0;

  // 하늘빛 반사(환경광): 그늘진 면 · 차 뒷면도 하늘색을 받아 너무 어둡지 않게. 해가 꽤 움직였을 때만 다시 계산
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null, envKey = '';
  function updateEnv(alt: number, az: number, weather: string) {
    const key = `${Math.round(alt / 2)}|${Math.round(az / 5)}|${weather}`;
    if (key === envKey) return; envKey = key;
    const a = W.sky.material.uniforms, b = envSky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) b[k].value = a[k].value;
    b.sunPosition.value.copy(a.sunPosition.value);
    envRT?.dispose(); envRT = pmrem.fromScene(envScene, 0.04); W.scene.environment = envRT.texture;
  }
  // Bloom needs values above 1. An unsigned-byte MSAA buffer clipped the sun
  // before bloom, leaving only the old white overlay visible.
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const sampleCounts: number[] = hdr && renderer.capabilities.isWebGL2
    ? Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array)
    : [renderer.capabilities.maxSamples];
  const samples = Math.max(0, ...sampleCounts.filter(n => n <= (isTouch ? 2 : 4)));
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(W.scene, camera));
  // Bloom belongs to bright light sources, not the whole daylight street.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.06, 0.12, 1.6);
  const lightGlare = createLightGlare();
  lightGlare.maskBloom(bloom.materialHighPassFilter); lightGlare.maskBloom(bloom.blendMaterial);
  composer.addPass(bloom); composer.addPass(lightGlare.pass); composer.addPass(new OutputPass());
  // 휴대폰 GPU는 HDR 화면의 MSAA를 못 하는 경우가 많아(samples 0) 건물·차선 경계가 계단처럼 보였다 → SMAA로 경계를 다듬는다.
  const smaa = samples < 2 ? new SMAAPass(1, 1) : null;
  if (smaa) composer.addPass(smaa);

  /* ---------- 주행 상태 ---------- */
  const S = {
    referenceFrame: false, running: false, s: kmToS(G.getState().settings.startKm), dir: 1, v: 0,
    lane: 1, laneX: laneOffset(1), laneV: 0, targetX: laneOffset(1), steerTouch: 0,   // 가로 위치: 목표 · 현재 · 옆으로 움직이는 속도
    throttle: 0, brake: 0, score: 100, glareTime: 0, glareMax: 0, t0: 0,
    cam: 'cockpit' as 'cockpit' | 'chase', lastStation: '', glareLv: 0 as 0 | 1 | 2, I: 0,
    segFrom: '', segT0: 0, segS0: 0, segGlare: 0,                       // 지금 달리는 역 사이 구간 기록
    minutes: G.getState().settings.minutes,
  };
  let glareDiagnostics = { intensity: 0, effectiveIntensity: 0, visorTransmission: 1, visorProgress: 0, visorDark: 0, angle: 0, sunAltitude: 0, blockedByCar: false, blockedByWorld: false, onScreen: false };
  const adaptation = newAdaptation();
  // 모델 ③: 지하차도 입구 205m 전에 지금 화면을 찍어 판정 → 155m 전 알림 → 입구에서 화면 어두워짐 → 3초 회복
  const model3Canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  function captureFrame(): Promise<Blob | null> {
    const src = renderer.domElement;
    if (!model3Canvas || !src.width || !src.height) return Promise.resolve(null);
    const k = Math.min(1, 1280 / Math.max(src.width, src.height));
    model3Canvas.width = Math.round(src.width * k); model3Canvas.height = Math.round(src.height * k);
    model3Canvas.getContext('2d')?.drawImage(src, 0, 0, model3Canvas.width, model3Canvas.height);
    return new Promise(resolve => model3Canvas.toBlob(resolve, 'image/jpeg', .9));
  }
  const model3 = createModel3Scene(async () => {
    const st = G.getState().settings, image = await captureFrame();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    try {
      return await requestModel3(image, {
        date: st.date, minutes: S.minutes, cloud: MODEL3_CLOUD[st.weather] ?? 0, sunAlt: sunPos(simDate(st.date, S.minutes)).alt, speedKmh: S.v * 3.6 || 60,
        lat: 35.866 - camera.position.z / 110940, lon: 128.59 + camera.position.x / (111320 * Math.cos(35.866 * Math.PI / 180)),
      }, model3Presets as Model3Presets, controller.signal);
    } finally { clearTimeout(timer); }
  });
  let model3View = model3.update(null, 0, false);
  let exitGlare = 0;
  const passageRecords: PassageRecord[] = [];
  let currentPassage: PassageRecord | null = null;
  let observerReference: { s: number; direction: number } | null = null;
  let drivingFeel = newDrivingFeel(), visualSteer = 0;
  const voice = createKoreanVoiceGuide(), carAudio = createCarAudio();
  let navigationZones: NavigationZone[] = [], navigationKey = '', navT = 0;
  let roadsideObservations: SegmentAssessment[] = [];
  let navCue: ReturnType<typeof CP.navigation.draw> = null;
  const keys: Record<string, boolean> = {};

  let baseFov = 60;
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; baseFov = w / h < 1.2 ? 74 : 60; camera.fov = baseFov; camera.updateProjectionMatrix();
  }
  let autoScale = 1, slowSec = 0;
  function applyGfx() {
    const hi = G.getState().settings.gfx === 'high';
    renderer.shadowMap.enabled = hi; W.buildings.forEach(b => b.castShadow = hi);
    // 후처리(눈부심 번짐) 화면도 같은 해상도로 그린다. 예전엔 처음 값(1배)에 머물러 휴대폰에서 흐릿했다.
    const pr = Math.min(devicePixelRatio, 2) * autoScale;
    renderer.setPixelRatio(pr); composer.setPixelRatio(pr); resize();
    G.setState({ render: { pixelRatio: Math.round(pr * 100) / 100, deviceRatio: devicePixelRatio, smoothing: smaa ? 'SMAA' : samples ? `MSAA ${samples}x` : '없음' } });
  }
  // 느린 기기: 주행 중 초당 프레임이 아주 낮을 때만 해상도를 조금 낮춘다(최소 85%).
  // 예전 기준(28fps 미만 3초, 최소 70%)은 대부분의 휴대폰에서 바로 걸려 화질 개선이 사라졌다.
  function adaptResolution(fps: number) {
    slowSec = fps < 20 ? slowSec + 1 : 0;
    if (slowSec >= 5 && autoScale > .85) { autoScale = .85; slowSec = 0; applyGfx(); }
  }

  const routeDir = (): Dir => G.getState().settings.endKm >= G.getState().settings.startKm ? 'E' : 'W';
  function routeHead() {
    const st = G.getState().settings, a = at(kmToS(st.startKm)), b = at(kmToS(st.endKm));
    return (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI + 360) % 360;
  }

  let bannerId = 0;
  const banner = (k: string, v: string, s: string) => G.setState({ banner: { k, v, s, id: ++bannerId } });

  function startRun() {
    const st = G.getState().settings;
    if (!Number.isFinite(st.startKm) || !Number.isFinite(st.endKm) || Math.abs(st.endKm - st.startKm) < 0.1) return;
    // Close a mobile input's keyboard/focus before changing to the driving view.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    resize();
    voice.reset(); voice.setEnabled(st.voice && st.guidance);
    voice.announce('navigation-start', '안내를 시작할게요.', performance.now(), true);
    carAudio.start();
    navigationKey = ''; navT = 0; drivingFeel = newDrivingFeel(); visualSteer = 0;
    S.referenceFrame = false; observerReference = null;
    resetAdaptation(adaptation); model3.reset();
    exitGlare = 0;
    passageRecords.length = 0; currentPassage = null;
    S.dir = st.endKm >= st.startKm ? 1 : -1;
    S.s = kmToS(st.startKm); S.v = 0; S.lane = 1; S.laneX = S.targetX = laneOffset(1); S.laneV = 0; S.steerTouch = 0;
    S.score = 100; S.glareTime = 0; S.glareMax = 0; S.t0 = performance.now(); S.lastStation = ''; S.minutes = st.minutes;
    S.segFrom = nearestStation(st.startKm).name; S.segT0 = S.t0; S.segS0 = S.s; S.segGlare = 0;
    W.traffic.forEach((t, i) => { t.lane = i % LANE_COUNT; t.x = laneOffset(t.lane); t.s = S.s + S.dir * (40 + i * 70 + rand() * 40); t.want = t.v = t.kind === 'bus' ? 10 : 11 + rand() * 6; });
    S.running = true;
    const a = locationLabel(st.startKm), b = locationLabel(st.endKm);
    const ticks = D.stations.filter(x => (x.km - st.startKm) * S.dir > 0 && (st.endKm - x.km) * S.dir > 0).map(x => Math.abs(x.km - st.startKm) / Math.abs(st.endKm - st.startKm));
    G.setState({ screen: 'driving', phoneOpen: false, result: null, hud: { ...G.getState().hud, from: a, to: b, ticks, score: 100, warn: false } });
    banner('출발', `${a} → ${b}`, `${hm(S.minutes)} · ${compass(routeHead())}쪽으로`);
  }
  function endRun() {
    voice.announce('navigation-arrival', '목적지에 도착했어요. 안내를 마칠게요.', performance.now(), true);
    S.running = false;
    const end = nearestStation(G.getState().settings.endKm).name;
    G.setState({ screen: 'result', phoneOpen: false, result: {
      title: `${stationLabel(end)}${end === '대구은행' ? ' · iM뱅크 본점' : ''} 도착`, score: Math.round(S.score),
      sec: (performance.now() - S.t0) / 1000, glareSec: S.glareTime, glareMax: S.glareMax,
      passages: [...passageRecords, ...(currentPassage ? [{ ...currentPassage, completed: false }] : [])] } });
  }
  function toMenu() { voice.stop(); S.running = false; G.setState({ screen: 'menu', phoneOpen: false }); }
  const changeLane = (d: number) => { S.targetX = laneOffset(Math.max(0, Math.min(LANE_COUNT - 1, Math.round((S.targetX - laneOffset(0)) / LANE_WIDTH) + d))); };
  // LCD 차광판은 기본 꺼짐: 먼저 눈부심을 그대로 겪고, G로 켜서 비교
  const toggleGlass = () => {
    const on = !G.getState().settings.glass; G.getState().set({ glass: on });
    if (S.running) banner(on ? '🕶️ LCD 차광판 내림' : 'LCD 차광판 올림', on ? '해가 눈에 들어오는 칸만 어둡게' : '맨눈으로 보는 눈부심', on ? '나머지 칸은 투명해서 신호등·앞차가 보여요' : '해를 정면으로 받으면 앞이 이렇게 안 보여요');
  };
  const toggleSport = () => {
    const sport = G.getState().settings.mode !== 'sport';
    G.getState().set({ mode: sport ? 'sport' : 'normal' });
    if (S.running) banner(sport ? '🏎️ 스포츠 모드' : '🚗 일반 모드', sport ? '지붕이 열려요' : '지붕을 닫아요', G.getState().settings.observationSpeed ? `관찰 상한 ${G.getState().settings.observationSpeed} km/h 유지 · 설정에서 해제` : sport ? '가속 · 최고 속도가 올라가요' : '편안한 주행으로');
  };

  /* ---------- 입력 ---------- */
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (!S.running) return;
    if (e.code === 'KeyP') G.setState(s => ({ phoneOpen: !s.phoneOpen, app: 'home' }));
    if (G.getState().phoneOpen) return;
    if (e.code === 'KeyM') toggleSport();
    if (e.code === 'KeyG') toggleGlass();
    if (e.code === 'KeyC') S.cam = S.cam === 'cockpit' ? 'chase' : 'cockpit';
    if (e.code === 'KeyV') look_.recenter = true;
    if (e.code === 'Escape') toMenu();
  };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  // 운전자 고개 돌리기: 화면을 끌면 그 방향을 계속 봄 (좌우 100° · 위 25° · 아래 35°), V 또는 더블클릭으로 정면
  // 3인칭에서는 차 주위를 돌며 보고, 손을 떼면 뒤로 돌아옴
  const look_ = { yaw: 0, pitch: 0, drag: false, px: 0, py: 0, id: -1, recenter: false };
  const onPDown = (e: PointerEvent) => {
    if (!S.running || G.getState().phoneOpen) return;
    look_.drag = true; look_.px = e.clientX; look_.py = e.clientY; look_.id = e.pointerId; canvas.setPointerCapture(e.pointerId);
  };
  const onPMove = (e: PointerEvent) => {
    if (!look_.drag || e.pointerId !== look_.id) return;
    const k = 1.6 / innerWidth;
    look_.yaw = Math.max(-1.75, Math.min(1.75, look_.yaw - (e.clientX - look_.px) * k * 1.4));
    look_.pitch = Math.max(-0.6, Math.min(0.44, look_.pitch - (e.clientY - look_.py) * k));
    look_.recenter = false;
    look_.px = e.clientX; look_.py = e.clientY;
  };
  const onPUp = (e: PointerEvent) => { if (e.pointerId === look_.id) { look_.drag = false; look_.id = -1; } };
  const onDbl = () => { look_.recenter = true; };
  canvas.style.touchAction = 'none'; canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('pointerdown', onPDown); canvas.addEventListener('pointermove', onPMove);
  canvas.addEventListener('pointerup', onPUp); canvas.addEventListener('pointercancel', onPUp);
  const releaseAll = () => { for (const k in keys) keys[k] = false; S.throttle = 0; S.brake = 0; S.steerTouch = 0; };   // 창 이탈 시 눌린 키 해제
  const onVis = () => { if (document.hidden) releaseAll(); };
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);
  addEventListener('blur', releaseAll); document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', resize);

  /* ---------- 메인 루프 ---------- */
  let last = performance.now(), mmT = 0, hudT = 0, occT = 0, occluded = false, raf = 0;
  const ray = new THREE.Raycaster();
  let crashT = 0, shake = 0, phoneT = 0;
  let lastSport = false, fpsN = 0, fpsT = 0, fpsV = 0;
  const view = { x: 0, z: 0, init: false };                              // 카메라가 바라보는 수평 방향 (완충)
  const fwd = new THREE.Vector3(), sv = new THREE.Vector3(), tmp = new THREE.Vector3(), horizon = new THREE.Color();
  const wxK = { clear: 1, cloud: 0.55, over: 0.15 } as const;

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    fpsN++; fpsT += (now - last) / 1000; if (fpsT >= 1) { fpsV = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; if (S.running && !G.getState().phoneOpen) adaptResolution(fpsV); }
    last = now;
    const gs = G.getState(), st = gs.settings;
    const running = S.running && !gs.phoneOpen && !S.referenceFrame;
    voice.setEnabled(st.voice && st.guidance && !gs.phoneOpen && gs.screen !== 'menu' && !S.referenceFrame);
    if (!S.running) S.minutes = st.minutes;
    if (!S.running || S.referenceFrame) view.init = false;

    const rawThrottle = keys.KeyW || keys.ArrowUp ? 1 : S.throttle;
    const rawBrake = keys.KeyS || keys.ArrowDown || keys.Space ? 1 : S.brake;
    updateDrivingFeel(drivingFeel, rawThrottle, rawBrake, S.v, S.laneV, dt, running);
    if (running) {
      const thr = drivingFeel.throttle, brk = drivingFeel.brake;
      S.v = stepDriveSpeed(S.v, thr, brk, dt, st.mode, st.observationSpeed);
      // 앞차에 가까워지면 미리 부드럽게 감속 (갑자기 속도가 꺾이지 않게)
      let cap = Infinity;
      W.traffic.forEach(t => {
        if (Math.abs(t.x - S.laneX) >= 2.4) return;
        const gap = (t.s - S.s) * S.dir - t.len / 2 - 2.3;
        if (gap > -1 && gap < 35) cap = Math.min(cap, gap < 2 ? t.v * 0.9 : t.v + Math.max(0, gap - 6) * 0.45);
      });
      if (S.v > cap) S.v = Math.max(cap, S.v - 7 * dt);
      S.s += S.dir * S.v * dt;
      // 차선 변경: 스프링처럼 부드럽게 (임계 감쇠) — 빠를수록 조금 더 빨리 옮겨 감
      const k = 6 + Math.min(1, S.v / 15) * 5, c = 2 * Math.sqrt(k);
      // 핸들: A/D(←/→)를 누르는 동안 옆으로 계속 움직임 → 차선 안 어디든 맞출 수 있음
      const steerIn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + S.steerTouch;
      if (steerIn && S.v > 0.5) S.targetX = Math.max(laneOffset(0) - 1.3, Math.min(laneOffset(LANE_COUNT - 1) + 1.3, S.targetX + steerIn * (2.6 + Math.min(4.6, S.v * 0.28)) * dt));
      S.lane = Math.max(0, Math.min(LANE_COUNT - 1, Math.round((S.laneX - laneOffset(0)) / LANE_WIDTH)));
      S.laneV += (k * (S.targetX - S.laneX) - c * S.laneV) * dt;
      S.laneX += S.laneV * dt;
      // 충돌: 다른 차와 겹치면 밀려나고 속도가 줄며 게임 내부 점수 조정
      crashT -= dt;
      for (const t of W.traffic) {
        const lon = (t.s - S.s) * S.dir, lat = t.x - S.laneX;
        const hl = (t.len + 4.6) / 2, hw = ((t.kind === 'bus' ? 2.5 : t.kind === 'suv' ? 1.9 : 1.82) + 1.82) / 2;
        if (Math.abs(lon) >= hl || Math.abs(lat) >= hw) continue;
        const pushLat = hw - Math.abs(lat), pushLon = hl - Math.abs(lon);
        if (pushLat < pushLon) {                                            // 옆에서 부딪힘 → 옆으로 튕겨 나감
          const sg = lat > 0 ? -1 : 1; S.laneX += sg * pushLat; S.targetX = S.laneX + sg * 0.4; S.laneV = sg * 1.5; S.v *= 0.85;
        } else if (lon > 0) {                                               // 앞차 뒤를 받음
          S.s -= S.dir * pushLon; S.v = Math.min(S.v, t.v * 0.5);
        } else {                                                            // 뒤차가 받음
          S.s += S.dir * pushLon; t.v *= 0.5;
        }
        if (crashT <= 0) {
          crashT = 2; shake = 0.45; S.score = Math.max(0, S.score - 10);
          banner('💥 충돌', '다른 차와 부딪혔어요', S.glareLv >= 1
            ? '눈부심이 있으면 앞차와 거리를 더 두세요'
            : '속도를 줄이고 앞차와 거리를 두세요');
        }
      }
      S.minutes += dt * st.flow / 60;
      if ((st.endKm - sToKm(S.s)) * S.dir <= 0) endRun();
      // 다른 차: 같은 차선 앞차(내 차 포함)와 거리를 두고 따라가며, 서로 겹치지 않게
      const freeAt = (lane: number, s: number, self: Vehicle) => W.traffic.every(o => o === self || o.lane !== lane || Math.abs(o.s - s) > 30);
      W.traffic.forEach(t => {
        let cap = t.want;
        const follow = (os: number, ov: number, olen: number) => {
          const gap = (os - t.s) * S.dir - (olen + t.len) / 2;
          if (gap > -2 && gap < 40) cap = Math.min(cap, gap < 3 ? Math.min(ov, t.v) * 0.8 : ov + Math.max(0, gap - 7) * 0.35);
        };
        W.traffic.forEach(o => { if (o !== t && Math.abs(o.x - t.x) < 2.6) follow(o.s, o.v, o.len); });
        if (Math.abs(S.laneX - t.x) < 2.6) follow(S.s, S.v, 4.6);
        t.v += Math.max(-8 * dt, Math.min(2 * dt, cap - t.v)); t.v = Math.max(0, t.v);
        t.s += S.dir * t.v * dt; t.x = laneOffset(t.lane);
        if ((t.s - S.s) * S.dir < -60) {                                   // 뒤로 멀어진 차는 앞쪽 빈자리로
          for (let k = 0; k < 8; k++) {
            const lane = (rand() * LANE_COUNT) | 0, s = S.s + S.dir * (450 + rand() * 600);
            if (k === 7 || freeAt(lane, s, t)) { t.lane = lane; t.s = s; t.x = laneOffset(lane); t.v = t.want; break; }
          }
        }
      });
    }

    if (running) separateTraffic(W.traffic, S.dir);

    // 위치 · 시점
    const p = at(S.s), hx = p.dx * S.dir, hz = p.dz * S.dir, rx = -hz, rz = hx;
    const cx = p.x + rx * S.laneX, cz = p.z + rz * S.laneX;
    const lookDistance = 25 + Math.min(25, S.v * .8);
    const look = at(S.s + S.dir * lookDistance);
    // 차선을 옮길 때 차가 그쪽으로 살짝 고개를 트는 느낌
    const yaw = Math.atan2(S.laneV, Math.max(4, S.v)) * 0.9;
    const tx = look.x + rx * S.laneX + rx * Math.tan(yaw) * lookDistance - cx, tz = look.z + rz * S.laneX + rz * Math.tan(yaw) * lookDistance - cz;
    const tl = Math.hypot(tx, tz) || 1;
    if (!view.init) { view.x = tx / tl; view.z = tz / tl; view.init = true; }
    const vk = Math.min(1, dt * 3);                                        // 굽은 길에서도 시선이 서서히 따라감
    view.x += (tx / tl - view.x) * vk; view.z += (tz / tl - view.z) * vk;
    const vl = Math.hypot(view.x, view.z) || 1;
    const lx = cx + view.x / vl * lookDistance, lz = cz + view.z / vl * lookDistance;
    // 길이 휘는 만큼 운전대도 돌아감 (앞 25 m 사이 방향 변화)
    const ah = at(S.s + S.dir * 25), bend = Math.atan2(hx * ah.dz * S.dir - hz * ah.dx * S.dir, hx * ah.dx * S.dir + hz * ah.dz * S.dir);
    if (!look_.drag && (S.cam === 'chase' || look_.recenter || !S.running)) {          // 정면으로 천천히 돌아옴
      const f = Math.max(0, 1 - dt * 3.5); look_.yaw *= f; look_.pitch *= f;
      if (Math.abs(look_.yaw) + Math.abs(look_.pitch) < 0.01) look_.recenter = false;
    }
    if (S.cam === 'cockpit' || !S.running) {
      const bob = S.running ? (Math.sin(S.s * .85) * .0013 + Math.sin(S.s * 2.1) * .0006) * Math.min(1, S.v / 12) : 0;   // 노면 진동
      camera.position.set(cx - rx * 0.37, p.y + (S.running ? 1.18 + bob : 2), cz - rz * 0.37); camera.lookAt(lx, look.y + 1.08, lz);
      camera.rotateX(drivingFeel.pitch); camera.rotateZ(drivingFeel.roll);                                     // 아주 약한 기울어짐
      if (shake > 0) { shake -= dt; const a = shake * 0.12; camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; }   // 충돌 흔들림
      rig.position.copy(camera.position); rig.quaternion.copy(camera.quaternion);
      if (S.running) {                                                      // 목을 축으로 고개를 돌림 (눈은 목보다 앞 · 위)
        camera.translateY(-0.1); camera.translateZ(0.09);
        camera.rotateY(look_.yaw); camera.rotateX(look_.pitch);
        camera.translateZ(-0.09); camera.translateY(0.1);
      }
      W.me.m.visible = false;
    } else {
      const oy = look_.yaw * 2.2, ch = Math.cos(oy), shh = Math.sin(oy);       // 차 주위를 돌며 보기
      const bx = hx * ch - rx * shh, bz = hz * ch - rz * shh;
      camera.position.set(cx - bx * 9, at(S.s - S.dir * 9).y + 3.1 + look_.pitch * -8, cz - bz * 9); camera.lookAt(cx + hx * 2, p.y + 1.2, cz + hz * 2); W.me.m.visible = true;
    }
    W.me.m.position.set(cx, p.y, cz); W.me.m.rotation.set(-Math.atan2(look.y - p.y, lookDistance), Math.atan2(hx, hz) - yaw, S.laneV * 0.01);   // 오른쪽(-x 쪽 회전)으로 옮기면 차 머리도 오른쪽
    rig.visible = S.running && S.cam === 'cockpit';
    const sportNow = st.mode === 'sport';
    if (sportNow !== lastSport) { lastSport = sportNow; CP.setOpen(sportNow, !S.running); }
    CP.update(dt);
    {                                                                     // 3인칭 차 지붕도 같은 진행도로 접힘
      W.softTop.set(CP.progress);
    }
    const fovT = baseFov + (S.running ? Math.min(sportNow ? 12 : 7, S.v * (sportNow ? .22 : .17)) : 0);   // 빠를수록 시야가 넓어지는 속도감
    if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    visualSteer += (Math.max(-1.2, Math.min(1.2, -S.laneV * .15 - bend * 6)) - visualSteer) * (1 - Math.exp(-dt * 9));
    CP.steer(visualSteer);   // 오른쪽으로 옮기거나 휠 때 운전대는 시계 방향
    if (observerReference) {
      const q = at(observerReference.s), dir = observerReference.direction;
      const ahead = at(observerReference.s + dir * 65), rightX = -q.dz * dir, rightZ = q.dx * dir;
      camera.fov = 48; camera.updateProjectionMatrix();
      camera.position.set(q.x + rightX * (ROAD_W / 2 + 2), q.y + 4.2, q.z + rightZ * (ROAD_W / 2 + 2));
      camera.lookAt(ahead.x + rightX * 3.5, ahead.y + 1.1, ahead.z + rightZ * 3.5);
      rig.visible = false; W.me.m.visible = false;
    }
    camera.updateMatrixWorld(); rig.updateMatrixWorld();
    const braking = keys.KeyS || keys.ArrowDown || S.brake > 0;
    W.me.brakeMat.emissiveIntensity = braking ? 3 : 0.5;
    if (running) {
      W.me.wheels.forEach(w => { w.rotation.x = (w.rotation.x + S.v * dt / W.me.wheelRadius) % (Math.PI * 2); });
      W.traffic.forEach(t => t.wheels.forEach(w => { w.rotation.x = (w.rotation.x + t.v * dt / t.wheelRadius) % (Math.PI * 2); }));
    }
    W.traffic.forEach(t => {
      const q = at(t.s), qx = -q.dz * S.dir, qz = q.dx * S.dir;
      t.m.position.set(q.x + qx * t.x, q.y, q.z + qz * t.x); t.m.rotation.y = Math.atan2(q.dx * S.dir, q.dz * S.dir);
    });

    // 하늘 상자는 항상 카메라를 둘러싸야 종점에서도 검은 바깥 면이 보이지 않는다.
    W.sky.position.copy(camera.position);

    // 해 · 날씨
    const sp = sunPos(simDate(st.date, S.minutes)); sv.set(...sunDir(sp.alt, sp.az));
    const u = W.sky.material.uniforms;
    u.sunPosition.value.copy(sv);
    const wx = wxK[st.weather];
    const section = underpassAt(S.s, S.dir);
    W.tunnelLighting.update(S.s);
    const cached = S.referenceFrame ? null : lookupRouteAnalysis(ROAD_ID, { ...st, minutes: S.minutes }, sToKm(S.s));
    const outsideL = cached?.adaptation?.outsideLuminance ?? sceneLuminance(sp.alt, st.weather);
    const sceneL = section?.covered ? outsideL * section.sky + 9 * (1 - section.sky) : outsideL;
    const vision = stepAdaptation(adaptation, sceneL, running ? dt : 0, S.running && !S.referenceFrame, { covered: !!section?.covered, outsideLuminance: outsideL });
    model3View = model3.update(section, running ? dt : 0, S.running && !S.referenceFrame);
    if (model3View.beep && model3View.alert && st.guidance) model3Beep(model3View.alert.grade);
    // 모델 ③이 입구 연출을 맡은 지하차도에서는 기존 체험용 어두워짐·노출 변화를 겹치지 않는다 (3초 뒤 평소 밝기).
    const model3Owns = S.running && model3View.active;
    if (running) {
      if (section?.covered) {
        currentPassage ??= { name: section.name, roofM: section.s1 - section.s0, seconds: 0, completed: false };
        currentPassage.seconds += dt;
      } else if (currentPassage) {
        passageRecords.push({ ...currentPassage, completed: true }); currentPassage = null;
      }
    }
    const aScore = cached?.adaptation ?? adaptationScores(outsideL);
    const adapted = section && S.running ? { name: section.name,
      phase: section.phase === 'approach' ? '진입 전 · 밝기 전환 준비' : section.covered ? (vision.dark > .1 && !model3Owns ? '어두워진 시야에 적응 중' : '지하차도 내부') : vision.white > .08 ? '밝아진 시야에 적응 중' : '출구 통과 · 시야 회복',
      burden: model3Owns ? Math.max(vision.white, vision.exitPulse) : vision.burden, score: section.phase === 'approach' || (section.covered && vision.dark > .1 && !model3Owns) ? aScore.entry : aScore.exit, entryScore: aScore.entry, exitScore: aScore.exit, pupil: vision.pupil,
      distance: Math.max(0, section.phase === 'approach' ? section.toEntry : section.toExit), coveredSeconds: adaptation.coveredSeconds } : undefined;
    u.turbidity.value = st.weather === 'over' ? 14 : st.weather === 'cloud' ? 5.5 : 2.2;
    W.sun.position.set(cx + sv.x * 400, Math.max(5, sv.y * 400), cz + sv.z * 400); W.sun.target.position.set(cx, 0, cz);
    const dayK = Math.max(0, Math.min(1, (sp.alt + 4) / 14));
    // Preserve daylight contrast instead of lifting every shaded surface to grey.
    W.weather.update(camera.position, st.weather, dayK, sp.alt);
    W.sun.castShadow = st.gfx === 'high' && st.weather !== 'over';
    W.sun.intensity = (st.weather === 'over' ? .15 : 2.6 * wx) * dayK; W.hemi.intensity = .4 + .55 * dayK + (1 - wx) * .5;
    W.sunDisc.visible = sp.alt > -1 && st.weather !== 'over' && !section?.covered;
    W.sunDisc.position.copy(camera.position).addScaledVector(sv, SUN_DIST);
    const lowSun = Math.max(0, Math.min(1, (20 - sp.alt) / 20)) * dayK;
    if (st.weather === 'over') horizon.setHSL(.57,.08,.10+.64*dayK);
    else horizon.setHSL(0.07 + 0.04 * (1 - lowSun), 0.5 + 0.3 * lowSun, 0.22 + 0.28 * dayK);
    (W.scene.fog as THREE.Fog).color.copy(horizon);
    (W.scene.fog as THREE.Fog).near = st.weather === 'over' ? 650 : st.weather === 'cloud' ? 1300 : 1800;
    (W.scene.fog as THREE.Fog).far = st.weather === 'over' ? 3500 : st.weather === 'cloud' ? 6000 : 8000;
    W.sun.color.setHSL(0.09, 0.18 + 0.65 * lowSun, 0.84);
    W.hemi.color.setHSL(st.weather === 'over' ? .57 : .08, st.weather === 'over' ? .06 : .5 * lowSun, .75); W.hemi.groundColor.setHSL(0.06, 0.45, 0.22);
    renderer.toneMappingExposure = (.46 + .20 * dayK) * (S.running && !(model3Owns && vision.exposure < 1) ? vision.exposure : 1);
    updateEnv(sp.alt, sp.az, st.weather);
    W.lampHeads.emissiveIntensity = (1 - dayK) * 2.5;
    if (W.bankGlow) W.bankGlow.emissiveIntensity = 0.5 + (1 - dayK) * 2.5;   // 본점 왕관은 해 질 녘에 더 밝게

    // 눈부심 (기하 계산: 해 방향 · 시선 · 지붕/건물 가림)
    camera.getWorldDirection(fwd);
    const ang = fwd.angleTo(sv) * 180 / Math.PI;
    const low = Math.max(0, Math.min(1, (28 - sp.alt) / 22)) * (sp.alt > -1 ? 1 : 0);
    let I = low * Math.max(0, 1 - ang / 38) * wx;
    const proj = tmp.copy(sv).multiplyScalar(5000).add(camera.position).project(camera);
    const onScreen = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
    const sxp = (proj.x * 0.5 + 0.5) * innerWidth, syp = (-proj.y * 0.5 + 0.5) * innerHeight;
    // 지붕 · A필러 · 선바이저에 실제로 가리는지 (운전석 메시에 광선 쏘기)
    let blocked = false;
    if (rig.visible && I > 0.02) { ray.set(camera.position, sv); ray.far = 4; blocked = ray.intersectObjects(CP.blockers, false).length > 0; }
    if (blocked) I *= 0.15;
    occT -= dt;
    if (occT <= 0 && I > 0.02) { occT = 0.2; ray.set(camera.position, sv); ray.far = 3000;
      const visibleSigns = W.roadsideSigns.slots.filter(slot => slot.group.visible).map(slot => slot.group);
      occluded = ray.intersectObjects([...W.occluders, ...visibleSigns], true).length > 0;
    }
    if (section?.covered) I = 0;
    if (occluded) I *= 0.12;
    if (S.referenceFrame) S.I = I;
    else S.I += (I - S.I) * Math.min(1, dt * 4);                                // 갑자기 번쩍이지 않게
    const Is = S.I;
    const sunMat = W.sunDisc.material as THREE.MeshBasicMaterial;
    sunMat.color.setRGB(1, 0.95, 0.8).multiplyScalar(occluded ? 0.7 : 1.25 + 1.6 * Math.min(1, Is * 1.6));
    // 차광판: 해 방향을 운전석 기준으로 바꿔, 눈과 해를 잇는 선이 판의 어느 칸을 지나는지 계산
    rigInv.copy(rig.quaternion).invert(); sunLocal.copy(sv).applyQuaternion(rigInv);
    eyeLocal.copy(camera.position).sub(rig.position).applyQuaternion(rigInv);
    const visorOn = st.glass && S.cam === 'cockpit' && rig.visible && gs.screen === 'driving';
    const sunExposed = W.sunDisc.visible && !blocked && !occluded && !section?.covered;
    const vs = visor.update(visorOn, sunLocal, dt, { eye: eyeLocal, illuminated: rig.visible && sunExposed }); visorDark = vs.darkCount;
    // Match optical attenuation to the visible panel, including deployment/retraction.
    const shadeOn = S.running && rig.visible && vs.transmission < .99 && Is > .02;
    const eff = Is * vs.transmission;
    S.glareLv = eff > .5 ? 2 : eff > .22 ? 1 : 0;
    glareDiagnostics = { intensity: Is, effectiveIntensity: eff, visorTransmission: vs.transmission, visorProgress: vs.progress, visorDark, angle: ang, sunAltitude: sp.alt, blockedByCar: blocked, blockedByWorld: occluded, onScreen };
    if (els.wash) els.wash.style.opacity = '0';
    if (els.glare) els.glare.style.background = 'none';
    if (els.shade) els.shade.style.opacity = '0';                              // 예전 화면 원형 차광은 쓰지 않음
    const exitApproach = section?.covered ? THREE.MathUtils.smoothstep(1 - section.toExit / 30, 0, 1) : 0;
    const contrastHistory = Math.min(1, Math.max(0, Math.log10(Math.max(1, outsideL / Math.max(1, 10 ** adaptation.darkestLogL))) / 2));
    const portalGlare = section?.covered && outsideL >= 150 ? .7 * exitApproach * Math.min(1, adaptation.coveredSeconds / 2) * contrastHistory : 0;
    const exitTarget = S.running && !S.referenceFrame ? Math.max(vision.exitPulse, portalGlare, vision.white * .4) : 0;
    if (!S.running || S.referenceFrame) exitGlare = 0;
    else exitGlare += (exitTarget - exitGlare) * (1 - Math.exp(-(running ? dt : 0) / (exitTarget > exitGlare ? .07 : .16)));
    const exitLight = exitGlare;
    bloom.strength = (st.gfx === 'high' ? .06 : .04) + eff * .65 + exitLight * .9;
    bloom.threshold = 1.6 - exitLight * .8;
    const compactView = isTouch || (innerWidth <= 900 && innerWidth > innerHeight);
    const roadBottom = S.cam === 'cockpit' ? compactView ? .57 : .65 : 1;
    const directLight = sunExposed && onScreen ? Math.pow(eff, 1.25) : 0;
    lightGlare.update(sxp, syp, innerWidth, innerHeight, directLight, exitLight, roadBottom);

    // Temporal contrast loss recovers from illumination history, independent of the sun disk.
    const dark = S.running ? vision.dark : 0;
    if (els.adaptationVeil) {
      els.adaptationVeil.style.backgroundColor = '#080a10';
      els.adaptationVeil.style.opacity = String(model3Owns ? 0 : dark * .45);
    }
    if (els.model3Veil) els.model3Veil.style.opacity = String(S.running ? model3View.dark : 0);
    // Keep map text crisp; illustrative contrast loss belongs to the road view.
    if (els.adaptationVeil) {
      const cut = roadBottom * 100;
      els.adaptationVeil.style.clipPath = `inset(0 0 ${100 - cut}% 0)`;
      els.adaptationVeil.style.maskImage = `linear-gradient(to bottom,#000 0%,#000 ${cut - 10}%,transparent ${cut}%)`;
      els.adaptationVeil.style.backdropFilter = '';
    }
    canvas.style.filter = '';

    // The dashboard unit follows the same route and position as the vehicle.
    const kmh = S.v * 3.6;
    carAudio.update(running && st.carSound, kmh, rawThrottle);
    navT -= dt;
    if (navT <= 0) {
      navT = .1;
      const key = `${st.date}|${Math.floor(S.minutes)}|${st.weather}|${st.startKm}|${st.endKm}|${st.observationMode}|${st.exampleCondition}|${st.observationSpeed}`;
      if (key !== navigationKey) {
        navigationKey = key; roadsideObservations = getRoutePreview({ ...st, minutes: S.minutes }).primary.segments;
        navigationZones = routeZones(st.startKm, st.endKm, sp, st.weather, roadsideObservations, { date: st.date, minutes: S.minutes });
      }
      W.roadsideSigns.update(S.s, S.dir, st.startKm, st.endKm, navigationZones, S.running, roadsideObservations);
      // Present the current rendered view separately from cached model predictions.
      const currentGlare: NavigationZone[] = S.running && onScreen && !blocked && !occluded && !section?.covered && S.glareLv >= 1
        ? [{ id: `current-glare-${S.glareLv}`, start: S.s - S.dir * 2, end: S.s + S.dir * 30, kind: 'glare', name: '현재 3D 시야', source: 'simulation', level: S.glareLv as 1 | 2 }] : [];
      navCue = CP.navigation.draw(S.s, S.running ? S.dir : Math.sign(st.endKm - st.startKm), st.startKm, st.endKm, kmh, [...currentGlare, ...navigationZones], st.guidance, st.voice, voice.available, S.running, S.minutes, sp.alt < 0, warningLeadMeters(kmh, st.sensitivity));
      if (running && st.guidance && navCue && (navCue.active || navCue.meters <= warningLeadMeters(kmh, st.sensitivity))) {
        voice.announce(navCue.kind === 'unverified' ? 'unverified-route' : `${navCue.id}-${navCue.active ? 'active' : 'ahead'}`, navCue.spoken, now, false,
          navCue.kind === 'glare' ? { name: 'glare', rank: navCue.level ?? 1 } : undefined);
      }
    }

    // HUD
    if (S.running) {
      const kmNow = sToKm(S.s), dirK: Dir = S.dir > 0 ? 'E' : 'W';
      if (running && S.glareLv >= 1) S.segGlare += dt;
      if (running && S.glareLv >= 1) { S.glareTime += dt; S.glareMax = Math.max(S.glareMax, kmh); }
      if (running && S.glareLv === 2 && kmh > 60) S.score = Math.max(0, S.score - dt * 4);
      const near = nearestStation(kmNow);
      if (Math.abs(near.km - kmNow) < 0.15 && S.lastStation !== near.name) {
        S.lastStation = near.name;
        if (near.name !== S.segFrom) {                                     // 역 사이 구간을 다 지나면 요약
          const sec = (now - S.segT0) / 1000, avg = Math.abs(S.s - S.segS0) / Math.max(1, sec) * 3.6;
          banner(`✅ ${S.segFrom} → ${near.name} 구간 통과`, S.segGlare >= 1 ? `눈부심 ${Math.round(S.segGlare)}초` : '눈부심 없음',
            `평균 ${Math.round(avg)} km/h · 다음 구간 관측 상태를 확인하세요`);
          S.segFrom = near.name; S.segT0 = now; S.segS0 = S.s; S.segGlare = 0;
        } else if (near.name === '대구은행') banner('🏦 iM뱅크 본점 구간', '본점 앞을 지나는 중', S.glareLv ? '해가 정면 — 속도를 줄이세요' : '본점 앞을 지나는 중');
        else if (!IS_SINCHEON) banner(`${near.name}역 구간`, '경로를 따라 주행 중', '도로변 사진과 밝기 변화 안내를 확인하세요');
      }
      if (els.speedo) drawSpeedo(els.speedo, kmh, kmh > 60 && S.glareLv === 2, st.mode === 'sport' ? 240 : 140);
      mmT -= dt; if (els.minimap && mmT <= 0) { mmT = 0.05; drawMinimap(els.minimap, { x: cx, z: cz }, Math.atan2(hx, -hz), S.s, S.dir, st.startKm, st.endKm, navigationZones); }
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.1;
        const glassText = !st.glass ? '꺼짐' : !visorOn ? '운전석에서 작동' : vs.progress < .99 ? '펼치는 중' : shadeOn ? `${visorDark}칸 차광 중` : sunExposed ? '해가 판 범위 밖' : '대기 · 직사광 없음';
        G.setState({ hud: { ...gs.hud, riskRatio: riskAt(kmNow, dirK).ratio, glareLv: S.glareLv, glassText, adaptation: adapted, model3: model3View.alert || model3View.countdown ? { grade: (model3View.alert ?? model3.reading)!.grade, text: model3View.alert ? model3AlertText(model3View.alert.grade) : '', color: MODEL3_COLOR[(model3View.alert ?? model3.reading)!.grade], source: (model3View.alert ?? model3.reading)!.source, countdown: model3View.countdown } : undefined, navigation: { text: navCue?.text ?? '경로를 따라 주행하세요', meters: navCue?.meters ?? 0, source: navCue?.source ?? 'route', voiceAvailable: voice.available, inCab: S.cam === 'cockpit' }, analysis: cached ? { level: cached.sample.level, modelVersion: cached.modelVersion, aheadMeters: cached.ahead ? Math.round(Math.abs(cached.ahead.km - kmNow) * 1000) : null, aheadLevel: cached.ahead?.level ?? null } : undefined, score: Math.round(S.score), kmh,
          prog: Math.max(0, Math.min(1, (kmNow - st.startKm) / (st.endKm - st.startKm))), remainKm: Math.abs(st.endKm - kmNow),
          station: near.name, warn: running && S.glareLv === 2 && kmh > 60, fps: fpsV },
          settings: { ...st, minutes: S.minutes } });
      }
    } else if (gs.screen === 'menu') {
      S.s = (S.s + dt * 6) % TOTAL || kmToS(st.startKm);                    // 시작 화면 배경: 천천히 앞으로
    }
    // 폰: 오른손이 운전대에서 폰을 들어 눈앞으로 → 다 올라오면 화면 폰을 3D 폰 자리에 정확히 겹침
    const phoneGoal = gs.phoneOpen ? 1 : 0;
    phoneT = phoneGoal ? Math.min(1, phoneT + dt / 0.7) : Math.max(0, phoneT - dt / 0.6);
    if (gs.phoneOpen) look_.recenter = true;                                // 폰을 볼 때는 정면으로
    const inCab = S.running && S.cam === 'cockpit';
    const anim = inCab && CP.holdPhone(phoneT);
    if (!inCab) CP.holdPhone(0);
    if (els.phone) {
      const ps = els.phone.style;
      if (anim) {
        camera.updateMatrixWorld();
        const r = CP.phoneRect(camera, innerWidth, innerHeight);
        ps.left = `${r.cx}px`; ps.top = `${r.cy}px`; ps.setProperty('--k', String(r.hpx / 800));
        ps.opacity = gs.phoneOpen ? String(Math.max(0, Math.min(1, (phoneT - 0.82) / 0.18))) : '0';
      } else {                                                             // 3인칭 · 손 모델 준비 전: 화면 가운데에 크게
        ps.left = '50%'; ps.top = '50%';
        ps.setProperty('--k', String(Math.min((innerHeight * 0.92) / 800, (innerWidth * 0.92) / 390, 1.35)));
        ps.opacity = gs.phoneOpen ? '1' : '0';
      }
    }
    if (els.phoneDim) els.phoneDim.style.opacity = String(gs.phoneOpen ? anim ? Math.min(1, phoneT * 1.2) : 1 : 0);
    if (rig.visible) {                                                     // 거울 3개를 프레임마다 돌아가며 하나씩 (각각 세 프레임에 한 번)
      mirFrame = (mirFrame + 1) % 3;
      const [rt, cam] = mirFrame === 0 ? [mirrorRT, mirrorCam] : [sideMirrors[mirFrame - 1].rt, sideMirrors[mirFrame - 1].cam];
      CP.mirrorFaces.forEach(f => f.userData.v = f.visible); CP.mirrorFaces.forEach(f => f.visible = false);
      const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt); renderer.render(W.scene, cam); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = au; CP.mirrorFaces.forEach(f => f.visible = f.userData.v);
    }
    composer.render();
  }

  applyGfx();
  const unsubGfx = G.subscribe((s, prev) => { if (s.settings.gfx !== prev.settings.gfx) applyGfx(); });
  raf = requestAnimationFrame(loop);

  const api = {
    // Offline exporter only: fixed reference sensor view, with no movement or cached-input feedback.
    prepareReference: (km: number) => { observerReference = null; S.referenceFrame = true; S.s = kmToS(km); S.v = 0; S.cam = 'cockpit'; S.lane = 1; S.laneX = S.targetX = laneOffset(1); S.laneV = 0; look_.yaw = look_.pitch = 0; view.init = false; occT = 0; },
    prepareRoadsideReference: (km: number, direction: number) => {
      api.prepareReference(km); S.dir = Math.sign(direction) || 1; observerReference = { s: S.s, direction: S.dir };
    },
    inspectGlare: () => ({ ...glareDiagnostics }),
    inspectVisor: () => ({ eye: { x: eyeLocal.x, y: eyeLocal.y, z: eyeLocal.z }, sun: { x: sunLocal.x, y: sunLocal.y, z: sunLocal.z },
      progress: glareDiagnostics.visorProgress, transmission: glareDiagnostics.visorTransmission, darkCount: visorDark }),
    lightEffects: lightGlare,
    referenceMetadata: () => {
      camera.getWorldDirection(fwd);
      return { latitude: 35.866 - camera.position.z / 110940, longitude: 128.59 + camera.position.x / (111320 * Math.cos(35.866 * Math.PI / 180)), headingDeg: (Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI + 360) % 360, horizontalFovDeg: Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 360 / Math.PI };
    },
    S, adaptation, els, startRun, toMenu, changeLane, toggleSport, toggleGlass, setSteer: (v: number) => { S.steerTouch = v; }, routeDir, routeHead, canvas: renderer.domElement,
    setPedal: (kind: 'throttle' | 'brake', v: number) => { S[kind] = v; },
    toggleCam: () => { S.cam = S.cam === 'cockpit' ? 'chase' : 'cockpit'; },
    bankKm: BANK_KM, store: G, cockpit: CP, rig, world: W, renderer,
    dispose: () => {
      voice.stop(); carAudio.dispose(); cancelAnimationFrame(raf); unsubGfx();
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', releaseAll); document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', resize);
      canvas.removeEventListener('dblclick', onDbl); canvas.removeEventListener('pointerdown', onPDown); canvas.removeEventListener('pointermove', onPMove);
      canvas.removeEventListener('pointerup', onPUp); canvas.removeEventListener('pointercancel', onPUp);
      W.dispose(); visor.dispose(); lightGlare.pass.dispose(); composer.dispose(); mirrorRT.dispose(); sideMirrors.forEach(m => m.rt.dispose()); envRT?.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
  (window as unknown as { __nunchi: unknown }).__nunchi = api;            // 시험용
  return api;
}

export type Engine = ReturnType<typeof createEngine>;
let current: Engine | null = null;
export const setEngine = (e: Engine | null) => { current = e; };
export const getEngine = () => current;
