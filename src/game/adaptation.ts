/** Model ③ draft score ported from AI/src/nunchi_ml/tunnel/adaptation.py.
 * L20 is estimated scene luminance, never an uncalibrated screenshot pixel value.
 * Temporal response below is an illustrative simulation, not a fitted human model.
 */
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export function adaptationScores(outsideLuminance: number) {
  const L = Number.isFinite(outsideLuminance) ? Math.max(0, outsideLuminance) : 0;
  const dimming = clamp(Math.ceil(L / 4000 * 4) / 4, .25, 1);
  const score = (ratio: number) => clamp(Math.log10(Math.max(1, ratio)) / 2);
  return { entry: score(L / (280 * dimming)), exit: score(L / 45) };
}

export interface AdaptationState { logL: number; initialized: boolean }
export const newAdaptation = (): AdaptationState => ({ logL: 0, initialized: false });
export function resetAdaptation(state: AdaptationState) { state.initialized = false; }

/** Assumed scene illumination from sun altitude/weather, not measured ASOS data. */
export function sceneLuminance(altitude: number, weather: 'clear' | 'cloud' | 'over') {
  const daylight = Math.max(0, Math.sin(altitude * Math.PI / 180));
  return .15 + 6000 * daylight * ({ clear: 1, cloud: .5, over: .22 }[weather]);
}

export function stepAdaptation(state: AdaptationState, targetLuminance: number, dt: number, active = true) {
  const target = Math.log10(Math.max(.05, targetLuminance));
  if (!state.initialized || !active) { state.logL = target; state.initialized = true; }
  const mismatch = target - state.logL;
  // Visual timing is authored for the simulator. No physiological time claim.
  const tau = mismatch > 0 ? 1.35 : 3.8;
  const white = clamp(mismatch / 2.5), dark = clamp(-mismatch / 2.5);
  state.logL += mismatch * (1 - Math.exp(-clamp(dt, 0, .1) / tau));
  return {
    white, dark, burden: Math.max(white, dark),
    pupil: clamp(1 - (state.logL + 1) / 5.5, .12, .95),
    exposure: clamp(10 ** ((target - state.logL) * .14), .65, 1.65),
  };
}
