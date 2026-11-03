interface TrafficCar { lane: number; s: number; len: number; v: number }

/** 같은 차로는 앞차부터 정리해 차체 길이와 최소 간격을 보장한다. 양방향 이정 지원. */
export function separateTraffic(cars: TrafficCar[], direction: number, gap = 2) {
  const lanes = new Map<number, TrafficCar[]>();
  for (const car of cars) {
    const lane = lanes.get(car.lane) ?? []; lane.push(car); lanes.set(car.lane, lane);
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => (b.s - a.s) * direction);
    for (let i = 1; i < lane.length; i++) {
      const front = lane[i - 1], rear = lane[i];
      const limit = front.s * direction - (front.len + rear.len) / 2 - gap;
      if (rear.s * direction > limit) { rear.s = limit * direction; rear.v = Math.min(rear.v, front.v); }
    }
  }
}
