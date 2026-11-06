/** Prepare route inputs for a later final-model batch. Never runs a pilot model. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { loadRoad } from '../tests/helpers/road.mjs';
const root = new URL('../', import.meta.url);
async function load(file, replace = {}) {
  let source = await readFile(new URL(file, root), 'utf8');
  for (const [a, b] of Object.entries(replace)) source = source.replace(a, b);
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const sincheon = await readFile(new URL('src/data/sincheon.json', root), 'utf8');
const { ROAD_MISSIONS, missionDate } = await load('src/game/missions.ts', { "import sincheon from '../data/sincheon.json';": `const sincheon = ${sincheon};` });
const { sunPos, simDate } = await load('src/game/sun.ts');
const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
const missionSource = (await readFile(new URL('src/game/missions.ts', root), 'utf8')).replace(/\r\n/g, '\n');
const missionSha256 = createHash('sha256').update(missionSource).digest('hex');
const cases = [], courses = [];
for (const road of ['dalgu', 'sincheon']) {
  const { road: r } = await loadRoad(road === 'sincheon');
  for (const m of ROAD_MISSIONS[road]) {
    const date = missionDate(m, year), sun = sunPos(simDate(date, m.m)), direction = Math.sign(m.b - m.a);
    const lo = Math.min(m.a, m.b), hi = Math.max(m.a, m.b), bounds = new Set([lo, hi]);
    for (let km = lo + .05; km < hi; km += .05) bounds.add(Number(km.toFixed(6)));
    const passages = r.UNDERPASSES.filter(u => r.sToKm(u.s0) > lo && r.sToKm(u.s1) < hi);
    const tunnelObservations = passages.map(u => ({ name: u.name, roofM: Number((u.s1 - u.s0).toFixed(3)),
      entryKm: r.sToKm(direction > 0 ? u.s0 : u.s1), exitKm: r.sToKm(direction > 0 ? u.s1 : u.s0),
      secondsAt40: Number(((u.s1 - u.s0) / 40 * 3.6).toFixed(1)),
      secondsAt60: Number(((u.s1 - u.s0) / 60 * 3.6).toFixed(1)),
      secondsAt80: Number(((u.s1 - u.s0) / 80 * 3.6).toFixed(1)) }));
    for (const u of passages) for (const portal of [u.s0, u.s1]) for (let d = -80; d <= 80; d += 10) {
      const km = r.sToKm(portal + d); if (km > lo && km < hi) bounds.add(Number(km.toFixed(6)));
    }
    const sorted = [...bounds].sort((a, b) => a - b);
    const segments = sorted.slice(0, -1).map((km0, i) => {
      const km1 = sorted[i + 1], km = (km0 + km1) / 2, p = r.at(r.kmToS(km));
      const heading = (Math.atan2(p.dx * direction, -p.dz * direction) * 180 / Math.PI + 360) % 360;
      return { id: `${m.id}-${i}`, km0, km1, km, heading,
        sunDifference: Math.abs(((sun.az - heading + 540) % 360) - 180),
        lat: 35.866 - p.z / 110940, lon: 128.59 + p.x / (111320 * Math.cos(35.866 * Math.PI / 180)) };
    });
    const frontFraction = segments.filter(s => s.sunDifference < 30).reduce((n, s) => n + s.km1 - s.km0, 0) / (hi - lo);
    const bankIncluded = road === 'dalgu' && r.BANK_KM > lo && r.BANK_KM < hi;
    // Geometric alignment is a coarse screen; audit:scene separately checks actual building/car occlusion.
    const passed = m.purpose === 'visibility' ? sun.alt > 0 && sun.alt < 15 && frontFraction >= .75 : sun.alt > 0 && passages.length > 0;
    if (!passed || (m.id === 'im-bank-sunset' && !bankIncluded)) throw new Error(`Course audit failed: ${m.id}`);
    courses.push({ id: m.id, title: m.t, road, date, minutes: m.m, distanceKm: Number((hi - lo).toFixed(3)),
      estimatedSecondsAt40Kmh: Math.round((hi - lo) / 40 * 3600), sunAltitude: sun.alt, sunAzimuth: sun.az,
      frontFraction, underpasses: passages.length, tunnelObservations, observationKmh: m.observeKmh ?? 0, defaultObservationKmh: 0, bankIncluded, passed });
    for (const weather of ['clear', 'cloud', 'over']) cases.push({ id: `${m.id}-${weather}`, missionId: m.id, road, date, minutes: m.m,
      weather, direction, source: 'selected-simulation-conditions', cloudOktasAssumed: { clear: 0, cloud: 5, over: 10 }[weather],
      sunAltitude: sun.alt, sunAzimuth: sun.az, referenceView: { camera: 'cockpit', lane: 1, flow: 0, observationSpeed: m.observeKmh ?? 0 }, tunnelObservations, segments });
  }
}
await writeFile(new URL('src/data/route_inputs.json', root), JSON.stringify({ format: 'nunchi-route-input-v1', year, missionSha256,
  predictionsReady: false, note: 'Prepared inputs only. Final-model inference is deferred. Weather is assumed, not observed. Reference observation speed is optional comparison metadata; gameplay defaults to free driving.', cases }));
await writeFile(new URL('src/data/course_audit.json', root), JSON.stringify({ year, missionSha256, courses }, null, 2));
console.log(JSON.stringify({ preparedCases: cases.length, finalPredictions: 0, courses }, null, 2));
