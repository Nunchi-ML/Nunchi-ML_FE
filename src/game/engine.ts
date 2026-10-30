import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { BANK_KM, D, TOTAL, at, kmToS, laneOffset, nearestStation, riskAt, sToKm, stationLabel, type Dir } from './road';
import { compass, hm, simDate, sunDir, sunPos } from './sun';
import { createWorld, makeRand } from './world';
import type { Vehicle } from './vehicles';
import { createCockpit } from './cockpit';
import { drawMinimap, drawSpeedo } from './gauges';
import { isTouch, useGame } from '../store';

/** 매 프레임 직접 고치는 화면 요소 (React 재렌더 없이) */
export interface Els { wash?: HTMLElement; glare?: HTMLElement; shade?: HTMLElement; cockpit?: HTMLElement; speedo?: HTMLCanvasElement; minimap?: HTMLCanvasElement }

const SUN_DIST = 6000;

export function createEngine(canvas: HTMLCanvasElement) {
  const els: Els = {};
  const rand = makeRand(11);
  const G = useGame;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 9000);
  const W = createWorld();
  // 운전석은 차에 붙어 있고(rig), 카메라는 그 안에서 고개만 돌린다
  const CP = createCockpit(), rig = new THREE.Group(); rig.add(CP.group); W.scene.add(rig);

  // 백미러: 뒤쪽을 작은 화면에 그려 거울면에 붙임 (좌우 반전)
  const mirrorRT = new THREE.WebGLRenderTarget(256, 80);
  mirrorRT.texture.wrapS = THREE.RepeatWrapping; mirrorRT.texture.repeat.x = -1; mirrorRT.texture.offset.x = 1;
  const mirrorCam = new THREE.PerspectiveCamera(30, 320 / 96, 0.3, 1500);
  mirrorCam.position.set(0.36, 0.27, -0.6); mirrorCam.rotation.y = Math.PI; rig.add(mirrorCam);
  CP.mirrorFaceMat.map = mirrorRT.texture; CP.mirrorFaceMat.needsUpdate = true;
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
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(W.scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.35, 0.9);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  /* ---------- 주행 상태 ---------- */
  const S = {
    running: false, s: kmToS(G.getState().settings.startKm), dir: 1, v: 0,
    lane: 1, laneX: laneOffset(1), laneV: 0, targetX: laneOffset(1), steerTouch: 0,   // 가로 위치: 목표 · 현재 · 옆으로 움직이는 속도
    throttle: 0, brake: 0, score: 100, glareTime: 0, glareMax: 0, t0: 0,
    cam: 'cockpit' as 'cockpit' | 'chase', lastStation: '', glareLv: 0 as 0 | 1 | 2, I: 0,
    segFrom: '', segT0: 0, segS0: 0, segGlare: 0,                       // 지금 달리는 역 사이 구간 기록
    minutes: G.getState().settings.minutes,
  };
  const keys: Record<string, boolean> = {};

  let baseFov = 60;
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; baseFov = w / h < 1.2 ? 74 : 60; camera.fov = baseFov; camera.updateProjectionMatrix();
  }
  function applyGfx() {
    const hi = G.getState().settings.gfx === 'high';
    renderer.shadowMap.enabled = hi; W.buildings.forEach(b => b.castShadow = hi);
    renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 1.75 : 1)); resize();
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
    S.dir = st.endKm >= st.startKm ? 1 : -1;
    S.s = kmToS(st.startKm); S.v = 0; S.lane = 1; S.laneX = S.targetX = laneOffset(1); S.laneV = 0; S.steerTouch = 0;
    S.score = 100; S.glareTime = 0; S.glareMax = 0; S.t0 = performance.now(); S.lastStation = ''; S.minutes = st.minutes;
    S.segFrom = nearestStation(st.startKm).name; S.segT0 = S.t0; S.segS0 = S.s; S.segGlare = 0;
    W.traffic.forEach((t, i) => { t.lane = i % 4; t.x = laneOffset(t.lane); t.s = S.s + S.dir * (40 + i * 70 + rand() * 40); t.want = t.v = t.kind === 'bus' ? 10 : 11 + rand() * 6; });
    S.running = true;
    const a = nearestStation(st.startKm).name, b = nearestStation(st.endKm).name;
    const ticks = D.stations.filter(x => (x.km - st.startKm) * S.dir > 0 && (st.endKm - x.km) * S.dir > 0).map(x => Math.abs(x.km - st.startKm) / Math.abs(st.endKm - st.startKm));
    G.setState({ screen: 'driving', phoneOpen: false, result: null, hud: { ...G.getState().hud, from: a, to: b, ticks, score: 100, warn: false } });
    banner('출발', `${a} → ${b}`, `${hm(S.minutes)} · ${compass(routeHead())}쪽으로`);
  }
  function endRun() {
    S.running = false;
    const end = nearestStation(G.getState().settings.endKm).name;
    G.setState({ screen: 'result', phoneOpen: false, result: {
      title: `${stationLabel(end)}${end === '대구은행' ? ' · iM뱅크 본점' : ''} 도착`, score: Math.round(S.score),
      sec: (performance.now() - S.t0) / 1000, glareSec: S.glareTime, glareMax: S.glareMax } });
  }
  function toMenu() { S.running = false; G.setState({ screen: 'menu', phoneOpen: false }); }
  const changeLane = (d: number) => { S.targetX = laneOffset(Math.max(0, Math.min(3, Math.round((S.targetX - 1.75) / 3.3) + d))); };
  // 스마트 유리는 기본 꺼짐: 먼저 눈부심을 그대로 겪고, G로 켜서 비교
  const toggleGlass = () => {
    const on = !G.getState().settings.glass; G.getState().set({ glass: on });
    if (S.running) banner(on ? '🕶️ 스마트 유리 켜짐' : '스마트 유리 꺼짐', on ? '해가 들어오는 부분만 어둡게' : '맨눈으로 보는 눈부심', on ? '켜고 끈 차이를 비교해 보세요' : '해를 정면으로 받으면 앞이 이렇게 안 보여요');
  };
  const toggleSport = () => {
    const sport = G.getState().settings.mode !== 'sport';
    G.getState().set({ mode: sport ? 'sport' : 'normal' });
    if (S.running) banner(sport ? '🏎️ 스포츠 모드' : '🚗 일반 모드', sport ? '지붕이 열려요' : '지붕을 닫아요', sport ? '가속 · 최고 속도가 올라가요' : '편안한 주행으로');
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
  let crashT = 0, shake = 0;
  let lastSport = false, fpsN = 0, fpsT = 0, fpsV = 0;
  const view = { x: 0, z: 0, init: false };                              // 카메라가 바라보는 수평 방향 (완충)
  const fwd = new THREE.Vector3(), sv = new THREE.Vector3(), tmp = new THREE.Vector3(), horizon = new THREE.Color();
  const wxK = { clear: 1, cloud: 0.55, over: 0.15 } as const;

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    fpsN++; fpsT += (now - last) / 1000; if (fpsT >= 1) { fpsV = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    last = now;
    const gs = G.getState(), st = gs.settings;
    const running = S.running && !gs.phoneOpen;
    if (!S.running) S.minutes = st.minutes;
    if (!S.running) view.init = false;

    if (running) {
      const thr = keys.KeyW || keys.ArrowUp ? 1 : S.throttle, brk = keys.KeyS || keys.ArrowDown || keys.Space ? 1 : S.brake;
      // 스포츠 모드: 빨리 시연할 수 있게 가속 · 최고 속도 · 제동을 높임
      const sport = st.mode === 'sport', acc = sport ? 8 : 3.2, vmax = sport ? 61 : 30.5, brkA = sport ? 14 : 9;
      S.v += (thr * acc - brk * brkA - 0.25 - S.v * (sport ? 0.006 : 0.012)) * dt; S.v = Math.max(0, Math.min(vmax, S.v));
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
      if (steerIn && S.v > 0.5) S.targetX = Math.max(laneOffset(0) - 1.3, Math.min(laneOffset(3) + 1.3, S.targetX + steerIn * (2.6 + Math.min(4.6, S.v * 0.28)) * dt));
      S.lane = Math.max(0, Math.min(3, Math.round((S.laneX - 1.75) / 3.3)));
      S.laneV += (k * (S.targetX - S.laneX) - c * S.laneV) * dt;
      S.laneX += S.laneV * dt;
      // 충돌: 다른 차와 겹치면 밀려나고 속도가 줄며 안전 점수 감점
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
          banner('💥 충돌', '다른 차와 부딪혔어요', '안전 점수 −10 · 해를 정면으로 받으면 앞차가 잘 안 보여요');
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
        t.s += S.dir * t.v * dt; t.x += (laneOffset(t.lane) - t.x) * Math.min(1, dt * 1.5);
        if ((t.s - S.s) * S.dir < -60) {                                   // 뒤로 멀어진 차는 앞쪽 빈자리로
          for (let k = 0; k < 8; k++) {
            const lane = (rand() * 4) | 0, s = S.s + S.dir * (450 + rand() * 600);
            if (k === 7 || freeAt(lane, s, t)) { t.lane = lane; t.s = s; t.x = laneOffset(lane); t.v = t.want; break; }
          }
        }
      });
    }

    // 위치 · 시점
    const p = at(S.s), hx = p.dx * S.dir, hz = p.dz * S.dir, rx = -hz, rz = hx;
    const cx = p.x + rx * S.laneX, cz = p.z + rz * S.laneX;
    const look = at(S.s + S.dir * 30);
    // 차선을 옮길 때 차가 그쪽으로 살짝 고개를 트는 느낌
    const yaw = Math.atan2(S.laneV, Math.max(4, S.v)) * 0.9;
    const tx = look.x + rx * S.laneX + rx * Math.tan(yaw) * 30 - cx, tz = look.z + rz * S.laneX + rz * Math.tan(yaw) * 30 - cz;
    const tl = Math.hypot(tx, tz) || 1;
    if (!view.init) { view.x = tx / tl; view.z = tz / tl; view.init = true; }
    const vk = Math.min(1, dt * 3);                                        // 굽은 길에서도 시선이 서서히 따라감
    view.x += (tx / tl - view.x) * vk; view.z += (tz / tl - view.z) * vk;
    const vl = Math.hypot(view.x, view.z) || 1;
    const lx = cx + view.x / vl * 30, lz = cz + view.z / vl * 30;
    // 길이 휘는 만큼 운전대도 돌아감 (앞 25 m 사이 방향 변화)
    const ah = at(S.s + S.dir * 25), bend = Math.atan2(hx * ah.dz * S.dir - hz * ah.dx * S.dir, hx * ah.dx * S.dir + hz * ah.dz * S.dir);
    if (!look_.drag && (S.cam === 'chase' || look_.recenter || !S.running)) {          // 정면으로 천천히 돌아옴
      const f = Math.max(0, 1 - dt * 3.5); look_.yaw *= f; look_.pitch *= f;
      if (Math.abs(look_.yaw) + Math.abs(look_.pitch) < 0.01) look_.recenter = false;
    }
    if (S.cam === 'cockpit' || !S.running) {
      const bob = S.running ? Math.sin(now * 0.017) * 0.004 * Math.min(1, S.v / 12) : 0;   // 노면 진동
      camera.position.set(cx - rx * 0.37, S.running ? 1.18 + bob : 2, cz - rz * 0.37); camera.lookAt(lx, 1.08, lz);
      camera.rotateZ(-S.laneV * 0.012);                                     // 아주 약한 기울어짐
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
      camera.position.set(cx - bx * 9, 4 + look_.pitch * -8, cz - bz * 9); camera.lookAt(cx + hx * 2, 1.2, cz + hz * 2); W.me.m.visible = true;
    }
    W.me.m.position.set(cx, 0, cz); W.me.m.rotation.set(0, Math.atan2(hx, hz) - yaw, S.laneV * 0.01);   // 오른쪽(-x 쪽 회전)으로 옮기면 차 머리도 오른쪽
    rig.visible = S.running && S.cam === 'cockpit';
    const sportNow = st.mode === 'sport';
    if (sportNow !== lastSport) { lastSport = sportNow; CP.setOpen(sportNow, !S.running); }
    CP.update(dt);
    {                                                                     // 3인칭 차 지붕도 같은 진행도로 접힘
      W.softTop.set(CP.progress);
    }
    const fovT = baseFov + (sportNow && S.running ? Math.min(12, S.v * 0.22) : 0);   // 빠를수록 시야가 넓어지는 속도감
    if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    CP.steer(Math.max(-1.2, Math.min(1.2, -S.laneV * 0.12 - bend * 6)));   // 오른쪽으로 옮기거나 휠 때 운전대는 시계 방향
    camera.updateMatrixWorld(); rig.updateMatrixWorld();
    const braking = keys.KeyS || keys.ArrowDown || S.brake > 0;
    W.me.brakeMat.emissiveIntensity = braking ? 3 : 0.5;
    W.traffic.forEach(t => {
      const q = at(t.s), qx = -q.dz * S.dir, qz = q.dx * S.dir;
      t.m.position.set(q.x + qx * t.x, 0, q.z + qz * t.x); t.m.rotation.y = Math.atan2(q.dx * S.dir, q.dz * S.dir);
    });

    // 해 · 날씨
    const sp = sunPos(simDate(st.date, S.minutes)); sv.set(...sunDir(sp.alt, sp.az));
    const u = W.sky.material.uniforms;
    u.sunPosition.value.copy(sv);
    const wx = wxK[st.weather];
    u.turbidity.value = st.weather === 'over' ? 18 : st.weather === 'cloud' ? 10 : 6;
    W.sun.position.set(cx + sv.x * 400, Math.max(5, sv.y * 400), cz + sv.z * 400); W.sun.target.position.set(cx, 0, cz);
    const dayK = Math.max(0, Math.min(1, (sp.alt + 4) / 14));
    // 그늘·흐린 날에도 너무 어둡지 않게 하늘빛(반사광)을 넉넉히
    W.sun.intensity = 3.2 * dayK * wx; W.hemi.intensity = 0.9 + 0.9 * dayK + (1 - wx) * 0.5;
    W.sunDisc.visible = sp.alt > -1 && st.weather !== 'over';
    W.sunDisc.position.copy(camera.position).addScaledVector(sv, SUN_DIST);
    const lowSun = Math.max(0, Math.min(1, (20 - sp.alt) / 20)) * dayK;
    horizon.setHSL(0.07 + 0.04 * (1 - lowSun), 0.5 + 0.3 * lowSun, 0.22 + 0.28 * dayK);
    (W.scene.fog as THREE.Fog).color.copy(horizon);
    W.sun.color.setHSL(0.09, 0.4 + 0.55 * lowSun, 0.62);
    W.hemi.color.setHSL(0.08, 0.5 * lowSun, 0.75); W.hemi.groundColor.setHSL(0.06, 0.45, 0.22);
    renderer.toneMappingExposure = 0.55 + 0.33 * dayK;
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
    if (occT <= 0 && I > 0.02) { occT = 0.2; ray.set(camera.position, sv); ray.far = 3000; occluded = ray.intersectObjects(W.occluders, true).length > 0; }
    if (occluded) I *= 0.12;
    S.I += (I - S.I) * Math.min(1, dt * 4);                                // 갑자기 번쩍이지 않게
    const Is = S.I;
    S.glareLv = Is > 0.5 ? 2 : Is > 0.22 ? 1 : 0;
    const sunMat = W.sunDisc.material as THREE.MeshBasicMaterial;
    sunMat.color.setRGB(1, 0.95, 0.8).multiplyScalar(occluded ? 0.7 : 1.4 + 2.4 * Math.min(1, Is * 1.6));
    const shadeOn = S.running && st.glass && S.glareLv >= 1 && onScreen && !blocked && S.cam === 'cockpit';
    const eff = shadeOn ? Is * 0.35 : Is;
    if (els.wash) els.wash.style.opacity = (eff * 0.32).toFixed(3);
    if (els.glare) els.glare.style.background = onScreen
      ? `radial-gradient(circle at ${sxp}px ${syp}px, rgba(255,250,232,${(eff * 0.75).toFixed(2)}) 0, rgba(255,236,190,${(eff * 0.42).toFixed(2)}) 5vh, rgba(255,214,150,${(eff * 0.16).toFixed(2)}) 18vh, rgba(255,210,140,0) 42vh)`
      : 'none';
    if (els.shade) { els.shade.style.opacity = shadeOn ? '1' : '0'; els.shade.style.left = sxp + 'px'; els.shade.style.top = syp + 'px'; }
    bloom.strength = (st.gfx === 'high' ? 0.32 : 0.24) + eff * 0.55;

    // HUD
    const kmh = S.v * 3.6;
    if (S.running) {
      const kmNow = sToKm(S.s), dirK: Dir = S.dir > 0 ? 'E' : 'W';
      if (running && S.glareLv >= 1) S.segGlare += dt;
      if (running && S.glareLv === 2) { S.glareTime += dt; S.glareMax = Math.max(S.glareMax, kmh); if (kmh > 60) S.score = Math.max(0, S.score - dt * 4); }
      const near = nearestStation(kmNow);
      if (Math.abs(near.km - kmNow) < 0.15 && S.lastStation !== near.name) {
        S.lastStation = near.name; const r2 = riskAt(near.km, dirK);
        if (near.name !== S.segFrom) {                                     // 역 사이 구간을 다 지나면 요약
          const sec = (now - S.segT0) / 1000, avg = Math.abs(S.s - S.segS0) / Math.max(1, sec) * 3.6;
          banner(`✅ ${S.segFrom} → ${near.name} 구간 통과`, S.segGlare >= 1 ? `눈부심 ${Math.round(S.segGlare)}초` : '눈부심 없음',
            `평균 ${Math.round(avg)} km/h · 다음 구간 체험 예시 ${r2.ratio.toFixed(1)}배${near.name === '대구은행' ? ' · 🏦 iM뱅크 본점 앞' : ''}`);
          S.segFrom = near.name; S.segT0 = now; S.segS0 = S.s; S.segGlare = 0;
        } else if (near.name === '대구은행') banner('🏦 iM뱅크 본점 구간', `대구은행역 · 체험 예시 ${r2.ratio.toFixed(1)}배`, S.glareLv ? '해가 정면 — 속도를 줄이세요' : '본점 앞을 지나는 중');
        else banner(`${near.name}역 구간`, `체험 예시 ${r2.ratio.toFixed(1)}배`, '구간 위험은 체험용 예시값이에요');
      }
      if (els.speedo) drawSpeedo(els.speedo, kmh, kmh > 60 && S.glareLv === 2, st.mode === 'sport' ? 240 : 140);
      mmT -= dt; if (els.minimap && mmT <= 0) { mmT = 0.05; drawMinimap(els.minimap, { x: cx, z: cz }, Math.atan2(hx, -hz), S.s, S.dir, st.startKm, st.endKm); }
      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.1;
        const glassText = !st.glass ? '꺼짐' : shadeOn ? `${sxp < innerWidth / 2 ? '왼쪽' : '오른쪽'} ${syp < innerHeight * 0.35 ? '위' : '가운데'} 부분 차광 중` : '대기';
        G.setState({ hud: { ...gs.hud, riskRatio: riskAt(kmNow, dirK).ratio, glareLv: S.glareLv, glassText, score: Math.round(S.score), kmh,
          prog: Math.max(0, Math.min(1, (kmNow - st.startKm) / (st.endKm - st.startKm))), remainKm: Math.abs(st.endKm - kmNow),
          station: near.name, warn: running && S.glareLv === 2 && kmh > 60, fps: fpsV },
          settings: { ...st, minutes: S.minutes } });
      }
    } else if (gs.screen === 'menu') {
      S.s = (S.s + dt * 6) % TOTAL || kmToS(st.startKm);                    // 시작 화면 배경: 천천히 앞으로
    }
    if (rig.visible && (mirFrame = (mirFrame + 1) % 3) === 0) {          // 백미러는 세 프레임에 한 번
      CP.mirrorFaces.forEach(f => f.userData.v = f.visible); CP.mirrorFaces.forEach(f => f.visible = false);
      const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(mirrorRT); renderer.render(W.scene, mirrorCam); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = au; CP.mirrorFaces.forEach(f => f.visible = f.userData.v);
    }
    composer.render();
  }

  applyGfx();
  const unsubGfx = G.subscribe((s, prev) => { if (s.settings.gfx !== prev.settings.gfx) applyGfx(); });
  raf = requestAnimationFrame(loop);

  const api = {
    S, els, startRun, toMenu, changeLane, toggleSport, toggleGlass, setSteer: (v: number) => { S.steerTouch = v; }, routeDir, routeHead, canvas: renderer.domElement,
    setPedal: (kind: 'throttle' | 'brake', v: number) => { S[kind] = v; },
    toggleCam: () => { S.cam = S.cam === 'cockpit' ? 'chase' : 'cockpit'; },
    bankKm: BANK_KM, store: G, cockpit: CP, rig, world: W, renderer,
    dispose: () => {
      cancelAnimationFrame(raf); unsubGfx();
      removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', releaseAll); document.removeEventListener('visibilitychange', onVis);
      removeEventListener('resize', resize);
      canvas.removeEventListener('dblclick', onDbl); canvas.removeEventListener('pointerdown', onPDown); canvas.removeEventListener('pointermove', onPMove);
      canvas.removeEventListener('pointerup', onPUp); canvas.removeEventListener('pointercancel', onPUp);
      W.dispose(); composer.dispose(); mirrorRT.dispose(); envRT?.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
  (window as unknown as { __nunchi: unknown }).__nunchi = api;            // 시험용
  return api;
}

export type Engine = ReturnType<typeof createEngine>;
let current: Engine | null = null;
export const setEngine = (e: Engine | null) => { current = e; };
export const getEngine = () => current;
