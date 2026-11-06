const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const newDrivingFeel = () => ({ throttle: 0, brake: 0, pitch: 0, roll: 0, previousSpeed: 0 });
export type DrivingFeel = ReturnType<typeof newDrivingFeel>;
export function updateDrivingFeel(state: DrivingFeel, throttle: number, brake: number, speed: number, lateralSpeed: number, dt: number, running: boolean) {
  dt = clamp(dt, 0, .1);
  const blend = (rate: number) => 1 - Math.exp(-dt * rate);
  const acceleration = dt > 0 && running ? clamp((speed - state.previousSpeed) / dt, -12, 8) : 0;
  state.previousSpeed = speed;
  state.throttle += ((running && brake < .05 ? clamp(throttle, 0, 1) : 0) - state.throttle) * blend(7);
  state.brake += ((running ? clamp(brake, 0, 1) : 0) - state.brake) * blend(14);
  state.pitch += ((running ? acceleration * .0018 : 0) - state.pitch) * blend(4);
  state.roll += ((running ? clamp(-lateralSpeed * .006, -.025, .025) : 0) - state.roll) * blend(5);
  return state;
}

/** Simulator response, with following-distance limits applied separately by the engine. */
export function stepDriveSpeed(speed: number, throttle: number, brake: number, dt: number, mode: 'normal' | 'sport', observationKmh = 0) {
  const sport=mode==='sport',acc=sport?8:5.4,vmax=sport?61:36.1,brakeA=sport?14:11;
  const change=clamp(throttle,0,1)*acc*(1-.32*Math.pow(Math.max(0,speed)/vmax,1.5))-clamp(brake,0,1)*brakeA-.25-speed*(sport?.006:.009);
  const elapsed = clamp(dt, 0, .1), proposed = clamp(speed + change * elapsed, 0, vmax);
  const cap = observationKmh > 0 ? Math.min(vmax, observationKmh / 3.6) : vmax;
  return speed > cap ? Math.min(proposed, Math.max(cap, speed - 3.5 * elapsed)) : Math.min(proposed, cap);
}
