// Dev tool and check: builds one of every landmark kind, every village kit, every hamlet style,
// a town, a city's heart and each of its districts, Brightwater, every camp style and every
// faction's stronghold in the server's headless world (the same builders the client runs),
// reporting errors, build times, draw calls and collider counts — and checks the services each
// size of settlement must have (world/places.js) stand where they should.
// Run: node tools/poicheck.mjs [seed]
import { HeadlessWorld } from '../server/world.js';
import { LANDMARKS, SETTLEMENTS } from '../src/world/Gen.js';
import { HAMLETS, DISTRICTS, SIZES } from '../src/world/places.js';
import { storyPlaces } from '../src/world/story.js';

const seed = Number(process.argv[2] ?? 12345);
const w = new HeadlessWorld(seed);
const CAMPS = ['scav', 'salvage', 'nest', 'relay', 'den', 'fort:scav', 'fort:hive', 'fort:synth', 'fort:fauna'];
const want = new Map([
  ['hub:', null],
  ['hubtown:', null],
  ...Object.keys(LANDMARKS).map((k) => [`landmark:${k}`, null]),
  ...Object.keys(SETTLEMENTS).map((k) => [`settlement:${k}`, null]),
  ...Object.keys(HAMLETS).map((k) => [`hamlet:${k}`, null]),
  ['town:', null],
  ['city:', null],
  ['citywall:', null],
  ...DISTRICTS.map((k) => [`district:${k}`, null]),
  ...CAMPS.map((k) => [`camp:${k}`, null]),
]);
const keyOf = (p) => (p.type === 'camp' ? `camp:${p.stronghold ? `fort:${p.race}` : p.style}` : `${p.type}:${p.kind ?? ''}`);
for (let ring = 0; ring < 24 && [...want.values()].some((v) => !v); ring++) {
  for (let rx = -ring; rx <= ring; rx++) {
    for (let rz = -ring; rz <= ring; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
      for (const p of w.gen.region(rx, rz).pois) {
        const k = keyOf(p);
        if (want.has(k) && !want.get(k)) want.set(k, p);
      }
    }
  }
}
// What each size of place must offer (roles of its folk), and its folk's count.
const NEEDS = {
  hamlet: { roles: ['giver'], folk: [2, 3] },
  settlement: { roles: ['trader', 'board'], folk: [4, 6] },
  town: { roles: ['innkeeper', 'smith', 'warden', 'board'], stock: ['weapons', 'armor'], folk: [8, 12] },
  hub: { roles: ['smith', 'board'], stock: ['weapons', 'armor'], folk: [4, 9] },
};
let failed = 0;
const fail = (k, msg) => { failed++; console.log(`${k.padEnd(22)} FAILED: ${msg}`); };
for (const [k, p] of want) {
  if (!p) { console.log(`${k.padEnd(22)} not found`); continue; }
  const before = w.colliders.size;
  const t0 = performance.now();
  try {
    w.loadPoi(p);
  } catch (e) {
    fail(k, e.stack.split('\n').slice(0, 3).join(' | '));
    continue;
  }
  const o = w.pois.get(p.id);
  let meshes = 0;
  o.group.traverse?.((m) => { if (m.isMesh) meshes++; });
  console.log(`${k.padEnd(22)} ${(performance.now() - t0).toFixed(1).padStart(6)} ms  ${String(o.colliders.length).padStart(4)} colliders  ${p.name ?? ''}`);
  // Services and folk.
  const need = NEEDS[p.type];
  if (need) {
    const roles = new Set(p.npcs.map((n) => n.role));
    for (const r of need.roles) if (!roles.has(r)) fail(k, `no ${r}`);
    for (const s of need.stock ?? []) if (!p.npcs.some((n) => n.role === 'trader' && n.stock === s)) fail(k, `no ${s} trader`);
    const folk = p.npcs.filter((n) => !['board', 'gate', 'warroom', 'object'].includes(n.role)).length;
    if (folk < need.folk[0] || folk > need.folk[1]) fail(k, `${folk} folk (want ${need.folk.join('–')})`);
  }
}
// The story's places (world/story.js): each built, with the objects and folk quests need.
for (const S of Object.values(storyPlaces(w.gen))) {
  const p = w.gen.region(S.rx, S.rz).pois.find((q) => q.story === S.key);
  const k = `story:${S.key}`;
  if (!p) { fail(k, 'not in its region'); continue; }
  want.set(k, p);
  const t0 = performance.now();
  try {
    w.loadPoi(p);
  } catch (e) {
    fail(k, e.stack.split('\n').slice(0, 3).join(' | '));
    continue;
  }
  const o = w.pois.get(p.id);
  console.log(`${k.padEnd(22)} ${(performance.now() - t0).toFixed(1).padStart(6)} ms  ${String(o.colliders.length).padStart(4)} colliders  ${p.name} (${Math.round(Math.hypot(p.x, p.z))} m out, level ${p.level})`);
}
// Folk stand on open ground: not inside anything solid that was built (by their own place, or a
// part of it streamed in on its own — a city's walls, Brightwater's ring).
for (const [k, p] of want) {
  for (const n of p?.npcs ?? []) {
    if (['board', 'gate', 'warroom', 'object'].includes(n.role)) continue;
    const y = w.groundHeight(n.x, n.z) + 0.9;
    if (w.blocks({ x: n.x, z: n.z, y })) fail(k, `${n.id} (${n.role}) stands inside a solid collider`);
  }
}
// A city: its heart and four districts, with the services a story hub needs.
const city = want.get('city:');
if (city) {
  const region = w.gen.region(...city.id.split(':')[1].split(',').map(Number));
  const districts = region.pois.filter((p) => p.type === 'district');
  const roles = new Set([...city.npcs, ...districts.flatMap((d) => d.npcs)].map((n) => n.role));
  for (const r of ['warden', 'innkeeper', 'board', 'warroom', 'smith', 'gate', 'trader']) if (!roles.has(r)) fail('city:', `no ${r}`);
  const folk = [...city.npcs, ...districts.flatMap((d) => d.npcs)].filter((n) => !['board', 'gate', 'warroom'].includes(n.role)).length;
  if (folk < 15 || folk > 25) fail('city:', `${folk} folk (want 15–25)`);
  if (districts.length !== DISTRICTS.length) fail('city:', `${districts.length} districts`);
  for (const d of districts) if (Math.hypot(d.x - city.x, d.z - city.z) + d.r > city.wall - 2) fail('city:', `${d.kind} district outside the walls`);
  console.log(`city: ${city.name} — ${districts.length} districts, ${folk} folk, walls at ${city.wall} m (≥ ${SIZES.city.r} m heart)`);
}
console.log(failed ? `${failed} problem(s)` : 'poicheck: ok');
process.exit(failed ? 1 : 0);
