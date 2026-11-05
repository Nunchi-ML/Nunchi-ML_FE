const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const newDrivingFeel = () => ({ throttle: 0, brake: 0, pitch: 0, roll: 0, previousSpeed: 0 });
export type DrivingFeel = ReturnType<typeof newDrivingFeel>;
export function updateDrivingFeel(state: DrivingFeel, throttle: number, brake: number, speed: number, lateralSpeed: number, dt: number, running: boolean) {
  dt = clamp(dt, 0, .05);
  const blend = (rate: number) => 1 - Math.exp(-dt * rate);
  const acceleration = dt > 0 && running ? clamp((speed - state.previousSpeed) / dt, -12, 8) : 0;
  state.previousSpeed = speed;
  state.throttle += ((running && brake < .05 ? clamp(throttle, 0, 1) : 0) - state.throttle) * blend(7);
  state.brake += ((running ? clamp(brake, 0, 1) : 0) - state.brake) * blend(14);
  state.pitch += ((running ? acceleration * .0018 : 0) - state.pitch) * blend(4);
  state.roll += ((running ? clamp(-lateralSpeed * .006, -.025, .025) : 0) - state.roll) * blend(5);
  return state;
}
