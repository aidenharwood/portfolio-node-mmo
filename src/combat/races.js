// Enemy races (factions): who lives in a camp and who roams the wilds, by race and level.
//   campUnits(campDef, rng) → [{ type, opts: { variant?, elite?, champion?, boss? } }]
//   roamPack(race, level, rng) · roamHorde(race, level, rng) · strongholdWave(def, rng) → same
// Rosters grow with level: tougher mob types join, sub-types (variants) start to appear, camps
// grow into hordes led by named elites and champions (HORDE), and strongholds put a race boss on
// the throne with an honour guard and reinforcements to call.
import { ENEMY_TYPES } from './bestiary.js';

// Camp size by level: [from level, size [min, max], elites [min, max], chance of a champion].
const HORDE = [
  [18, [10, 16], [2, 3], 1],
  [10, [8, 12], [1, 2], 0.3],
  [5, [6, 9], [0, 1], 0],
  [1, [4, 6], [0, 0], 0],
];
const bandOf = (level) => HORDE.find(([min]) => level >= min);
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Weighted roster entries: [type, weight, minLevel].
const CAMP = {
  scav: [['cutter', 5, 1], ['breacher', 2, 2], ['grenadier', 2, 2], ['tech', 1, 3], ['juggernaut', 1, 4]],
  hive: [['drone', 5, 1], ['spitter', 3, 1], ['psion', 2, 3], ['praetorian', 1.5, 4]],
  synth: [['sentry', 4, 1], ['stalker', 2, 2], ['bulwark', 1.2, 4]],
};
// The wild keeps different kinds of den: a razorhound pack, a crawler nest or a thunderhorn run.
const DENS = [
  [['hound', 5, 1], ['alpha', 1, 3]],
  [['crawler', 5, 1]],
  [['thunderhorn', 3, 1], ['hound', 2, 2]],
];
const BOSS = { scav: 'warlord', hive: 'queen', synth: 'colossus', fauna: 'behemoth' };

function rollUnit(table, level, rng) {
  const open = table.filter(([, , min]) => level >= min);
  let total = 0;
  for (const [, w] of open) total += w;
  let r = rng() * total;
  for (const [type, w] of open) {
    r -= w;
    if (r <= 0) return type;
  }
  return open[0][0];
}

// A sub-type when the level allows it (about a third of the time).
function opts(type, level, rng, extra = {}) {
  const vs = Object.entries(ENEMY_TYPES[type].variants ?? {}).filter(([, v]) => level >= v.minLevel);
  if (vs.length && rng() < 0.35) return { ...extra, variant: pick(rng, vs)[0] };
  return extra;
}

const SALVAGE = [['cutter', 3, 1], ['juggernaut', 2, 1], ['grenadier', 1, 2]];
const guardsOf = (race) => (race === 'fauna' ? DENS[0] : CAMP[race] ?? CAMP.scav);

// `n` units off a roster, the first `elites` of them named elites (the very first a champion if
// `champion`).
function band(table, level, rng, n, elites, champion) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = rollUnit(table, level, rng);
    const lead = i === 0 && champion ? { elite: true, champion: true } : i < elites + (champion ? 1 : 0) ? { elite: true } : {};
    out.push({ type: t, opts: opts(t, level, rng, lead) });
  }
  return out;
}

export function campUnits(def, rng) {
  const level = def.level;
  // A stronghold: the boss, an honour guard of 10–14 (with elites from level 10), and more to
  // call when the alarm goes up (strongholdWave).
  if (def.stronghold) {
    const n = 10 + Math.floor(rng() * 5);
    const elites = level >= 18 ? 2 : level >= 10 ? 1 : 0;
    return [{ type: BOSS[def.race], opts: { boss: true } }, ...band(guardsOf(def.race), level, rng, n, elites, false)];
  }
  const table = def.race === 'fauna' ? DENS[Math.floor(rng() * DENS.length)] : def.style === 'salvage' ? SALVAGE : CAMP[def.race] ?? CAMP.scav;
  const [, size, eliteRange, championChance] = bandOf(level);
  // Hounds and crawlers come in bigger groups; juggernaut yards in smaller ones.
  const extra = table === DENS[0] || table === DENS[1] ? 1 : def.style === 'salvage' ? -2 : 0;
  const n = Math.max(3, between(rng, size) + extra);
  const champion = rng() < championChance;
  const elites = Math.min(n - 1, between(rng, eliteRange));
  return band(table, level, rng, n, elites, champion);
}

// Reinforcements for a stronghold under attack: a squad from its guard roster.
export function strongholdWave(def, rng) {
  const n = 4 + Math.floor(rng() * 3) + (def.level >= 10 ? 1 : 0);
  return band(guardsOf(def.race), def.level, rng, n, def.level >= 14 ? 1 : 0, false);
}

const ROAM = {
  scav: [['cutter', 4, 1], ['grenadier', 1.5, 2], ['breacher', 1.5, 3], ['juggernaut', 1, 5]],
  hive: [['drone', 4, 1], ['spitter', 2, 1], ['psion', 1.5, 3]],
  synth: [['sentry', 4, 1], ['stalker', 1.5, 3]],
  fauna: [['hound', 4, 1], ['alpha', 0.6, 4], ['thunderhorn', 1, 3], ['crawler', 1.5, 2]],
};

export function roamPack(race, level, rng) {
  const table = ROAM[race] ?? ROAM.scav;
  // The wild roams as one kind (a hound pack, a pair of thunderhorns); the rest as mixed bands.
  const lead = rollUnit(table, level, rng);
  const n = (lead === 'hound' ? 3 : 2) + Math.floor(rng() * 2) + (level >= 5 ? 1 : 0);
  return Array.from({ length: n }, (_, i) => {
    const t = race === 'fauna' ? (i === 0 && level >= 4 && lead === 'hound' && rng() < 0.4 ? 'alpha' : lead) : i === 0 ? lead : rollUnit(table, level, rng);
    return { type: t, opts: opts(t, level, rng) };
  });
}

// A warband on the move (regions of level 10 and up): 10–20 of a race's own, led by elites —
// and a champion further out.
export function roamHorde(race, level, rng) {
  const table = race === 'fauna' ? ROAM.fauna : CAMP[race] ?? CAMP.scav;
  const n = 10 + Math.floor(rng() * 11);
  return band(table, level, rng, n, level >= 18 ? 2 : 1, level >= 16);
}

export const RACE_OF = Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.race]));

// A dungeon room's residents (world/DungeonGen.js): `n` off the race's camp roster (the wild's
// roaming kinds), the first `elites` of them named elites.
export function roomUnits(race, level, rng, n, elites = 0) {
  return band(race === 'fauna' ? ROAM.fauna : CAMP[race] ?? CAMP.scav, level, rng, n, elites, false);
}
