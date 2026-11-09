interface PlayerBody { s: number; laneX: number; targetX: number; laneV: number; v: number }
interface TrafficBody { s: number; x: number; len: number; kind: 'sedan' | 'suv' | 'bus'; v: number }

/** Arcade contact response: resolve penetration, without adding steering or propulsion. */
export function resolvePlayerContacts<T extends TrafficBody>(player: PlayerBody, cars: T[], direction: number, previous = new Set<T>()) {
  const contacts = new Set<T>();
  let impactSpeed = 0;
  for (const car of cars) {
    const longitudinal = (car.s - player.s) * direction, lateral = car.x - player.laneX;
    const halfLength = (car.len + 4.6) / 2;
    const halfWidth = ((car.kind === 'bus' ? 2.5 : car.kind === 'suv' ? 1.9 : 1.82) + 1.82) / 2;
    // Keep a resting/sliding contact until the bodies have actually separated.
    if (previous.has(car) && Math.abs(longitudinal) < halfLength + .15 && Math.abs(lateral) < halfWidth + .15) contacts.add(car);
    if (Math.abs(longitudinal) >= halfLength || Math.abs(lateral) >= halfWidth) continue;
    contacts.add(car);
    const sideDepth = halfWidth - Math.abs(lateral), frontDepth = halfLength - Math.abs(longitudinal);
    let closing = 0;
    if (sideDepth < frontDepth) {
      const side = lateral >= 0 ? 1 : -1;
      closing = Math.max(0, player.laneV * side);
      player.laneX -= side * (sideDepth + .02);
      // Stop motion into the other body. Preserve motion and steering away;
      // never kick the steering target a further 40 cm in the opposite direction.
      if (player.laneV * side > 0) player.laneV = 0;
      player.targetX = side > 0 ? Math.min(player.targetX, player.laneX) : Math.max(player.targetX, player.laneX);
    } else if (longitudinal >= 0) {
      closing = Math.max(0, player.v - car.v);
      player.s = car.s - direction * (halfLength + .02);
      player.v = Math.min(player.v, car.v);
    } else {
      closing = Math.max(0, car.v - player.v);
      // A rear impact must not teleport the player forward or change steering.
      car.s = player.s - direction * (halfLength + .02);
      car.v = Math.min(car.v, player.v);
    }
    if (!previous.has(car)) impactSpeed = Math.max(impactSpeed, closing);
  }
  return { contacts, impactSpeed };
}
