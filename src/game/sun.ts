/** 태양 위치 (NOAA 근사). 고도·방위는 도, 방위는 북 0° 시계 방향 */
export function sunPos(date: Date, lat = 35.87, lon = 128.6) {
  const jd = date.getTime() / 864e5 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180;
  const eps = (23.439 - 4e-7 * n) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const ha = ((gmst * 15 + lon) * Math.PI / 180) - ra, la = lat * Math.PI / 180;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { alt: alt * 180 / Math.PI, az: ((az * 180 / Math.PI) + 360) % 360 };
}

/** 장면 좌표(x 동, y 위, z 남)의 해 방향 단위 벡터 */
export function sunDir(alt: number, az: number): [number, number, number] {
  const a = alt * Math.PI / 180, z = az * Math.PI / 180;
  return [Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a)];
}

export const compass = (az: number) => ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(az / 45) % 8];

export const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

/** 'YYYY-MM-DD' + 한국시간 분 → Date */
export function simDate(date: string, minutes: number) {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0) + (minutes - 540) * 60000);
}
