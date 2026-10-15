// Dev check: the act lands and the camps. Which act each region belongs to and the factions it
// may hold, that the world's settled places don't move when camps change, and — as they arrive —
// camp layouts, their placement and the reinforcement waves that hold them.
// Run: node tools/campcheck.mjs [--seed N] [--fingerprint]
import { WorldGen, ACTS } from '../src/world/Gen.js';

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

for (const seed of SEEDS) {
  console.log(`Seed ${seed}:`);
  const gen = new WorldGen(seed);
  check(fingerprint(gen) === FINGERPRINTS[seed], `the settled places are where they were (seed ${seed})`);
  actLands(gen);
}

console.log(failed ? `campcheck: ${failed} failed` : 'campcheck: all good');
process.exit(failed ? 1 : 0);
