/** 실제 카메라 모드에서 쓰는 휴대폰 GPS·나침반. 사진·위치는 저장하지 않는다. */
import { rearCameraDirection, trueHeading } from './glareApi';

export interface SensorState {
  latitude?: number; longitude?: number; accuracyM?: number; gpsAt?: number;
  headingDeg?: number; pitchDeg?: number; headingAt?: number; error?: string;
}
export const sensor: SensorState = {};
let watchId: number | null = null, listening = false;

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
  if (e.beta == null || e.gamma == null) return;
  const pitch = rearCameraDirection(0, e.beta, e.gamma).pitch;
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    // iOS: 자북 기준 방위를 바로 준다.
    sensor.headingDeg = trueHeading(e.webkitCompassHeading);
  } else if (e.absolute && e.alpha != null) {
    sensor.headingDeg = trueHeading(rearCameraDirection(e.alpha, e.beta, e.gamma).heading);
  } else return;
  sensor.pitchDeg = pitch; sensor.headingAt = Date.now();
}

/** 버튼 클릭 안에서 불러야 한다(iOS는 사용자 동작이 있어야 방향 권한을 묻는다). */
export async function startPhoneSensors() {
  sensor.error = undefined;
  const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  try {
    if (DOE?.requestPermission && (await DOE.requestPermission()) !== 'granted') sensor.error = '방향 센서 권한이 없어요';
  } catch { sensor.error = '방향 센서 권한을 받지 못했어요'; }
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    window.addEventListener('deviceorientation', onOrientation as EventListener);
    listening = true;
  }
  if (watchId == null && typeof navigator !== 'undefined' && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(p => {
      sensor.latitude = p.coords.latitude; sensor.longitude = p.coords.longitude; sensor.accuracyM = p.coords.accuracy; sensor.gpsAt = Date.now();
    }, () => { sensor.error = '위치 권한이 없거나 GPS를 받지 못했어요'; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
}
export function stopPhoneSensors() {
  if (listening) {
    window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
    window.removeEventListener('deviceorientation', onOrientation as EventListener);
    listening = false;
  }
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
}

/** 선정 모델에 쓸 수 있는 상태인지. 아니면 이유를 돌려준다. */
export function sensorReadiness(now = Date.now(), s: SensorState = sensor):
  { ok: true; latitude: number; longitude: number; headingDeg: number } | { ok: false; reason: string } {
  if (s.latitude == null || s.longitude == null || s.gpsAt == null || now - s.gpsAt > 30000) return { ok: false, reason: s.error ?? '위치(GPS)를 아직 받지 못했어요' };
  if (s.headingDeg == null || s.headingAt == null || now - s.headingAt > 5000) return { ok: false, reason: '방향(나침반)을 받지 못했어요' };
  if (Math.abs(s.pitchDeg ?? 90) > 30) return { ok: false, reason: '휴대폰을 도로 쪽으로 수평에 가깝게 세워 주세요' };
  return { ok: true, latitude: s.latitude, longitude: s.longitude, headingDeg: s.headingDeg };
}
