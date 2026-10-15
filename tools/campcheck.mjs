// Dev check: the act lands and the camps. Which act each region belongs to and the factions it
// may hold, that the world's settled places don't move when camps change, and — as they arrive —
// camp layouts, their placement and the reinforcement waves that hold them.
// Run: node tools/campcheck.mjs [--seed N] [--fingerprint]
import { WorldGen, ACTS } from '../src/world/Gen.js';
import { TIERS, campLayout } from '../src/world/campLayout.js';

const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
const SEEDS = arg('--seed') ? [Number(arg('--seed'))] : [12345, 1, 777, 4242, 90210];
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  if (!ok || process.argv.includes('-v')) console.log(`  ${ok ? '✓' : '✗'} ${what}`);
};
const ringOf = (rx, rz) => Math.max(Math.abs(rx), Math.abs(rz));
const regionsTo = (gen, rings) => {
  const out = [];
  for (let rx = -rings; rx <= rings; rx++) for (let rz = -rings; rz <= rings; rz++) out.push(gen.region(rx, rz));
  return out;
};

// ---------------------------------------------------------------- stability
// Every point of interest but the camps (and the frontier posts that come with the act lands), as
// a hash: what must stay where it was for a seed when camps change.
function fingerprint(gen) {
  let h = 0x811c9dc5;
  for (const r of regionsTo(gen, 6)) {
    for (const p of r.pois) {
      if (p.type === 'camp' || p.type === 'frontier') continue;
      const s = `${p.id}@${p.x.toFixed(2)},${p.z.toFixed(2)};`;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    }
  }
  return h.toString(16);
}
const FINGERPRINTS = { 12345: 'ec3970ea', 1: '232b5288', 777: 'ab4ccd3', 4242: 'c3c27fb2', 90210: '7f0c740' };

if (process.argv.includes('--fingerprint')) {
  for (const seed of SEEDS) console.log(`  ${seed}: '${fingerprint(new WorldGen(seed))}',`);
  process.exit(0);
}

// ---------------------------------------------------------------- act lands
function actLands(gen) {
  const all = regionsTo(gen, 18);
  check(gen.region(0, 0).act === 1, 'Brightwater is in Act I');
  for (const c of gen.cities()) check(gen.region(c.rx, c.rz).act === c.act, `${c.name}'s region is in Act ${c.act}`);
  let bad = 0;
  let early = 0;
  let far = 0;
  for (const r of all) {
    if (!(r.act >= 1 && r.act <= 4)) bad++;
    if ((r.race === 'hive' && r.act < 2) || (r.race === 'synth' && r.act < 3)) early++;
    // A region's act is read off its site's distance, bent by at most ACT_WARP: so a region inside
    // a border's ring sits no further than that beyond it, and one outside no nearer than that short
    // of it. (The edge between two cells lies about half a cell further on.)
    if (ringOf(r.rx, r.rz) > 1 && !gen.cities().some((c) => c.rx === r.rx && c.rz === r.rz)) {
      const d = Math.hypot(r.x, r.z);
      const inner = r.act > 1 ? ACTS[r.act - 2].to : 0;
      if (d > ACTS[r.act - 1].to + 150 + 1 || d < inner - 150 - 1) far++;
    }
  }
  check(bad === 0, `every region has an act (${bad} without)`);
  check(early === 0, `no Hive before Act II and no Synths before Act III (${early} regions)`);
  check(far === 0, `every region is within 150 m of its act's ring (${far} strays)`);
}

// ---------------------------------------------------------------- layouts
const STYLES = { scav: 'scav', salvage: 'scav', nest: 'hive', relay: 'synth', den: 'fauna' };
function layouts() {
  console.log('Layouts:');
  const defs = [];
  for (let s = 1; s <= 20; s++) {
    for (const [style, race] of Object.entries(STYLES)) {
      for (const tier of Object.keys(TIERS)) defs.push({ id: `t:${style}:${tier}:${s}`, x: 0, z: 0, radius: TIERS[tier].R, race, style, tier, level: 10, seed: s });
    }
    for (const race of Object.values(STYLES)) defs.push({ id: `t:fort:${race}:${s}`, x: 0, z: 0, radius: TIERS.base.R, race, style: 'fort', tier: 'base', stronghold: true, level: 10, seed: s });
  }
  const bad = {};
  const fail = (what, def) => { (bad[what] ??= []).push(def.id); };
  for (const def of defs) {
    const T = TIERS[def.tier];
    const L = campLayout(def);
    // (Spawner ids carry the camp's id, which is changed here to get past the memo.)
    const plain = (x) => JSON.stringify({ ...x, spawners: x.spawners.map(({ id, ...sp }) => sp) });
    if (plain(L) !== plain(campLayout({ ...def, id: `${def.id}b` }))) fail('deterministic', def);
    if (L.tier !== def.tier || L.R !== T.R) fail('tier and radius', def);
    if (!L.pieces.every((p) => Math.hypot(p.x, p.z) + (p.r ?? 0) <= T.R + 2)) fail('pieces inside R + 2', def);
    if (L.posts.length < T.garrison[1]) fail('enough posts', def);
    if (L.spawners.length < T.spawners[0] || L.spawners.length > T.spawners[1]) fail('spawner count', def);
    if (!L.spawners.every((sp, i) => sp.id === `${def.id}:sp${i}` && sp.kind)) fail('spawner ids', def);
    const solid = L.pieces.filter((p) => p.r > 0);
    if (!L.posts.every((q) => solid.every((p) => Math.hypot(q.x - p.x, q.z - p.z) >= p.r + 0.6))) fail('posts clear of pieces', def);
    if (!L.posts.every((q, i) => L.posts.every((o, j) => i === j || Math.hypot(q.x - o.x, q.z - o.z) >= 1.2))) fail('posts 1.2 m apart', def);
    if (def.tier === 'outpost' ? L.gates.length : !L.gates.length) fail('gates by tier', def);
    if (!!L.throne !== !!def.stronghold) fail('a throne only in a stronghold', def);
    const wet = campLayout({ ...def, id: `${def.id}w` }, (wx) => wx > 5);
    if (![...wet.posts, ...wet.spawners, ...wet.pieces].every((q) => q.x <= 5)) fail('nothing stands in the water', def);
    if (!wet.spawners.length) fail('a spawner even with water', def);
  }
  for (const what of ['deterministic', 'tier and radius', 'pieces inside R + 2', 'enough posts', 'spawner count', 'spawner ids', 'posts clear of pieces', 'posts 1.2 m apart', 'gates by tier', 'a throne only in a stronghold', 'nothing stands in the water', 'a spawner even with water']) {
    check(!bad[what], `${what} (${defs.length} layouts${bad[what] ? `; e.g. ${bad[what].slice(0, 3).join(', ')} of ${bad[what].length}` : ''})`);
  }
}
layouts();

for (const seed of SEEDS) {
  console.log(`Seed ${seed}:`);
  const gen = new WorldGen(seed);
  check(fingerprint(gen) === FINGERPRINTS[seed], `the settled places are where they were (seed ${seed})`);
  actLands(gen);
}

console.log(failed ? `campcheck: ${failed} failed` : 'campcheck: all good');
process.exit(failed ? 1 : 0);
