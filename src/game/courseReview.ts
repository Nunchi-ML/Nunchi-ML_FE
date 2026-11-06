import { kmToS, UNDERPASSES } from './road';

/** Physical 3D roof length, excluding open ramps. Times assume constant speed. */
export function coursePassages(startKm: number, endKm: number) {
  const lo = Math.min(kmToS(startKm), kmToS(endKm)), hi = Math.max(kmToS(startKm), kmToS(endKm));
  return UNDERPASSES.filter(u => u.s1 > lo && u.s0 < hi).map(u => ({
    name: u.name, roofM: u.s1 - u.s0, coveredM: Math.min(hi, u.s1) - Math.max(lo, u.s0),
    fullPassage: lo <= u.s0 && hi >= u.s1,
    secondsAt: (kmh: number) => (Math.min(hi, u.s1) - Math.max(lo, u.s0)) / (kmh / 3.6),
  }));
}
