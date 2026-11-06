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

export interface AdaptationState { logL: number; initialized: boolean; coveredSeconds: number; wasCovered: boolean; darkestLogL: number; exitAge: number; exitStrength: number }
export const newAdaptation = (): AdaptationState => ({ logL: 0, initialized: false, coveredSeconds: 0, wasCovered: false, darkestLogL: 10, exitAge: 10, exitStrength: 0 });
export function resetAdaptation(state: AdaptationState) { Object.assign(state, newAdaptation()); }

/** Assumed scene illumination from sun altitude/weather, not measured ASOS data. */
export function sceneLuminance(altitude: number, weather: 'clear' | 'cloud' | 'over') {
  const daylight = Math.max(0, Math.sin(altitude * Math.PI / 180));
  return .15 + 6000 * daylight * ({ clear: 1, cloud: .5, over: .22 }[weather]);
}

export function stepAdaptation(state: AdaptationState, targetLuminance: number, dt: number, active = true, scene?: { covered: boolean; outsideLuminance: number }) {
  const elapsed = clamp(dt, 0, .1);
  const target = Math.log10(Math.max(.05, targetLuminance));
  if (!state.initialized || !active) {
    Object.assign(state, newAdaptation(), { logL: target, initialized: true });
  }
  if (active && scene) {
    if (scene.covered) {
      if (!state.wasCovered) { state.coveredSeconds = 0; state.darkestLogL = state.logL; }
      state.coveredSeconds += elapsed; state.darkestLogL = Math.min(state.darkestLogL, target);
    } else if (state.wasCovered) {
      const ratio = scene.outsideLuminance / Math.max(.05, 10 ** state.darkestLogL);
      // Short urban underpasses still produce a visible authored transition.
      // Scale by actual covered time and scene contrast, not full dark adaptation.
      const history = 1 - Math.exp(-state.coveredSeconds / 1.8);
      state.exitStrength = state.coveredSeconds >= .75 && scene.outsideLuminance >= 150 && ratio >= 4 ? clamp(Math.log10(ratio) / 1.7 * history, 0, .95) : 0;
      state.exitAge = 0; state.coveredSeconds = 0;
    }
    state.wasCovered = scene.covered;
  }
  // An authored, short exit accent makes the transition perceptible without hazing normal driving.
  const exitPulse = active && !scene?.covered ? state.exitStrength * Math.exp(-Math.max(0, state.exitAge - .22) / .85) : 0;
  state.exitAge += active ? elapsed : 0;
  const mismatch = target - state.logL;
  // Visual timing is authored for the simulator. No physiological time claim.
  const tau = mismatch > 0 ? 1.35 : 3.8;
  const white = clamp(mismatch / 2.5), dark = clamp(-mismatch / 2.5);
  state.logL += mismatch * (1 - Math.exp(-clamp(dt, 0, .1) / tau));
  return {
    white, dark, exitPulse, burden: Math.max(white, dark, exitPulse),
    pupil: clamp(1 - (state.logL + 1) / 5.5, .12, .95),
    exposure: clamp(10 ** ((target - state.logL) * .14), .65, 1.65),
  };
}
