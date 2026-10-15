// Dev check: the act lands and the camps. Which act each region belongs to and the factions it
// may hold, that the world's settled places don't move when camps change, and — as they arrive —
// camp layouts, their placement and the reinforcement waves that hold them.
// Run: node tools/campcheck.mjs [--seed N] [--fingerprint]
import { WorldGen, ACTS } from '../src/world/Gen.js';
import { TIERS, campLayout } from '../src/world/campLayout.js';
import { PIECE_BUILDERS } from '../src/world/build/campKit.js';

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

// ---------------------------------------------------------------- placement
function placement(gen) {
  const regions = regionsTo(gen, 12);
  const cityAt = new Set(gen.cities().map((c) => `${c.rx},${c.rz}`));
  const camps = [];
  // Each region places what its act and level call for, as far as the land has room: never more,
  // rarely nothing (water and mountains aside), and bases in about the share planned.
  const rows = { early: { n: 0, zero: 0, big: 0 }, act1: { n: 0, zero: 0, big: 0 }, later: { n: 0, zero: 0, big: 0, camps: 0 } };
  let over = 0;
  let noTier = 0;
  let hubBad = 0;
  let earlyForts = 0;
  for (const r of regions) {
    const mine = r.pois.filter((p) => p.type === 'camp' && !p.story);
    for (const c of mine) { camps.push({ c, r }); if (!c.tier) noTier++; }
    if (r.hub) { if (mine.length > 1 || mine.some((c) => c.tier !== 'outpost')) hubBad++; continue; }
    if (cityAt.has(`${r.rx},${r.rz}`)) { if (mine.length) over++; continue; }
    const n = (t) => mine.filter((c) => c.tier === t).length;
    const [o, k, b] = [n('outpost'), n('camp'), n('base')];
    const kind = r.act === 1 && r.level < 5 ? 'early' : r.act === 1 ? 'act1' : 'later';
    const most = { early: [2, 1, 0], act1: [2, 1, 1], later: [2, 2, 1] }[kind];
    if (o > most[0] || k > most[1] || b > most[2]) over++;
    const row = rows[kind];
    row.n++;
    if (!mine.length) row.zero++;
    else if (b) row.big++;
    if (row.camps !== undefined) row.camps += mine.length;
    if (mine.some((c) => c.stronghold && r.level < 10)) earlyForts++;
  }
  const share = (row, k) => (row.n - row.zero ? row[k] / (row.n - row.zero) : 0);
  check(noTier === 0, `every camp has a tier (${noTier} without)`);
  check(hubBad === 0, 'Brightwater has its outpost, or none (as before)');
  check(over === 0, `no region places more than its tier table allows (${over} over)`);
  const firstLands = rows.early.zero + rows.act1.zero;
  check(firstLands <= Math.ceil((rows.early.n + rows.act1.n) * 0.1), `Act I regions with no camp: ${firstLands} of ${rows.early.n + rows.act1.n}`);
  check(rows.later.zero <= rows.later.n * 0.15, `later regions with no camp: ${rows.later.zero} of ${rows.later.n}`);
  check(share(rows.act1, 'big') <= 0.35, `bases in Act I from level 5: ${rows.act1.big} of ${rows.act1.n - rows.act1.zero}`);
  check(share(rows.later, 'big') >= 0.2 && share(rows.later, 'big') <= 0.45, `bases and strongholds in later acts: ${rows.later.big} of ${rows.later.n - rows.later.zero}`);
  check(share(rows.later, 'camps') >= 2.5, `camps per later region with room: ${share(rows.later, 'camps').toFixed(2)}`);
  check(earlyForts === 0, `no stronghold below level 10 (${earlyForts})`);

  // Apart from each other, off the roads (but their own) and off the towns, cities and story places.
  let close = 0;
  for (let i = 0; i < camps.length; i++) {
    for (let j = i + 1; j < camps.length; j++) {
      const a = camps[i].c;
      const b = camps[j].c;
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + 20) close++;
    }
  }
  check(close === 0, `no two camps within 20 m of each other (${close} pairs)`);
  let onRoad = 0;
  let inTown = 0;
  let thin = 0;
  for (const { c, r } of camps) {
    // (Story camps stand where world/story.js puts them.)
    for (let dx = -1; dx <= 1 && !c.story && !r.hub; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const path of gen.region(r.rx + dx, r.rz + dz).roads) {
          const [ex, ez] = path[path.length - 1];
          // Its own way in (which water may cut short just outside it).
          if (Math.hypot(ex - c.x, ez - c.z) < c.radius + 12) continue;
          if (path.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < c.radius + 3)) { onRoad++; dx = dz = 2; break; }
        }
      }
    }
    if (gen.bigNear(r.rx, r.rz).some((t) => Math.hypot(t.x - c.x, t.z - c.z) < t.r + c.radius)) inTown++;
    if (campLayout(c, gen.campProbe).posts.length < TIERS[c.tier].garrison[0]) thin++;
  }
  check(onRoad === 0, `no road runs through a camp but its own (${onRoad} of ${camps.length})`);
  check(inTown === 0, `no camp on a town, city or story place (${inTown})`);
  check(thin === 0, `water and cliffs leave every camp room for its garrison (${thin} short)`);
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
  const kinds = new Set(defs.flatMap((def) => { const L = campLayout(def); return [...L.pieces.map((p) => p.kind), ...L.spawners.map((sp) => sp.kind)]; }));
  const missing = [...kinds].filter((k) => !PIECE_BUILDERS[k]);
  check(!missing.length, `every piece a layout lays out has a builder (${kinds.size} kinds${missing.length ? `; missing ${missing.join(', ')}` : ''})`);
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
  placement(gen);
}

console.log(failed ? `campcheck: ${failed} failed` : 'campcheck: all good');
process.exit(failed ? 1 : 0);
