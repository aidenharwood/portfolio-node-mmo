// Enemy races (factions): who lives in a camp and who roams the wilds, by race and level.
//   campUnits(campDef, rng) → [{ type, opts: { variant?, elite?, boss? } }]
//   roamPack(race, level, rng) → same
// Rosters grow with level: tougher mob types join, sub-types (variants) start to appear, and
// strongholds put a race boss on the throne with an honour guard.
import { ENEMY_TYPES } from './bestiary.js';

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

export function campUnits(def, rng) {
  const level = def.level;
  const table = def.race === 'fauna' ? DENS[Math.floor(rng() * DENS.length)] : def.style === 'salvage' ? [['cutter', 3, 1], ['juggernaut', 2, 1], ['grenadier', 1, 2]] : CAMP[def.race] ?? CAMP.scav;
  const out = [];
  if (def.stronghold) {
    out.push({ type: BOSS[def.race], opts: { boss: true } });
    const guard = def.race === 'fauna' ? DENS[0] : CAMP[def.race];
    for (let i = 0; i < 6; i++) {
      const t = rollUnit(guard, level, rng);
      out.push({ type: t, opts: opts(t, level, rng) });
    }
    return out;
  }
  // Hounds and crawlers come in bigger groups; juggernaut yards in smaller ones.
  const base = table === DENS[0] || table === DENS[1] ? 5 : def.style === 'salvage' ? 3 : 4;
  const n = base + Math.floor(rng() * 3) + Math.min(2, Math.floor(level / 4));
  for (let i = 0; i < n; i++) {
    const t = rollUnit(table, level, rng);
    out.push({ type: t, opts: opts(t, level, rng) });
  }
  // A named elite leads some camps further out.
  if (level >= 4 && rng() < 0.3) out[0].opts = { ...out[0].opts, elite: true };
  return out;
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

export const RACE_OF = Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.race]));
