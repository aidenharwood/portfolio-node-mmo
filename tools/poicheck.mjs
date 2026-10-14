// Dev tool and check: builds one of every landmark kind, every village kit, every hamlet style,
// a town, a city's heart and each of its districts, Brightwater, every camp style and every
// faction's stronghold in the server's headless world (the same builders the client runs),
// reporting errors, build times, draw calls and collider counts — and checks the services each
// size of settlement must have (world/places.js) stand where they should.
// Run: node tools/poicheck.mjs [seed]
import { HeadlessWorld } from '../server/world.js';
import { LANDMARKS, SETTLEMENTS } from '../src/world/Gen.js';
import { HAMLETS, DISTRICTS, SIZES } from '../src/world/places.js';
import { storyPlaces, storyKeys } from '../src/world/story.js';
import { campUnits } from '../src/combat/races.js';
import { mulberry32 } from '../src/core/rng.js';

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
// Act II's places (story.js): new ones go on the end, so nothing set before them moves (seed
// 12345's places as they stood before Act II), and the act's camp has its named Psion.
for (const key of ['sporefield', 'psionnest']) if (!storyKeys().includes(key)) fail(`story:${key}`, 'not a story place');
if (seed === 12345) {
  const before = {
    foundry: [-395.1, -840.7], outpost: [-226.2, -749.1], vault: [-609.1, -849.3], beacon1: [130.6, -517.1], beacon2: [-224, -592.6],
    relicdig: [-137.6, -366.5], pilgrim: [-17.3, -235], broodpits: [-1454.9, -598.1],
  };
  const sp = storyPlaces(w.gen);
  for (const [k, [x, z]] of Object.entries(before)) if (Math.hypot(sp[k].x - x, sp[k].z - z) > 0.2) fail(`story:${k}`, 'moved when Act II\'s places were added');
  // Farcall's districts are built from the same draws as before its captain came.
  const farcall = w.gen.cities()[1];
  const seeds = w.gen.region(farcall.rx, farcall.rz).pois.filter((p) => p.type === 'district').map((d) => d.seed);
  if (seeds.join() !== '281701597,718489629,379357203,851193502') fail('city:farcall', `districts moved (${seeds.join()})`);
}
const nest = w.gen.region(storyPlaces(w.gen).psionnest?.rx, storyPlaces(w.gen).psionnest?.rz)?.pois.find((p) => p.story === 'psionnest');
const units = nest ? campUnits(nest, mulberry32(nest.seed ?? 1)) : [];
if (!units.some((u) => u.type === 'psion' && u.opts.boss)) fail('story:psionnest', 'no Psion leads the nest');
if (units.filter((u) => u.opts.boss).length !== 1) fail('story:psionnest', 'want exactly one boss');

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
