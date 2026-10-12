// Enemy races: who lives in a camp and who roams the wilds, by race and level.
//   campUnits(campDef, rng) → [{ type, opts: { variant?, elite?, boss? } }]
//   roamPack(race, level, rng) → same
// Rosters grow with level: tougher mob types join, sub-types (variants) start to appear, and
// strongholds put a race boss on the throne with an honour guard.
import { ENEMY_TYPES } from './bestiary.js';

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Weighted roster entries: [type, weight, minLevel].
const CAMP = {
  goblin: [['cutter', 5, 1], ['shieldbasher', 2, 2], ['sapper', 2, 2], ['shaman', 1, 3], ['brute', 1, 4]],
  hollow: [['husk', 5, 1], ['bonearcher', 3, 1], ['wraith', 2, 3], ['revenant', 1.5, 4]],
  construct: [['sentry', 4, 1], ['stalker', 2, 2], ['bulwark', 1.2, 4]],
};
// Beasts keep different kinds of den: a wolf pack, a spider nest or a tusker run.
const DENS = [
  [['wolf', 5, 1], ['alpha', 1, 3]],
  [['spider', 5, 1]],
  [['tusker', 3, 1], ['wolf', 2, 2]],
];
const BOSS = { goblin: 'warlord', hollow: 'hollowking', construct: 'colossus', beast: 'ursa' };

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
  const table = def.race === 'beast' ? DENS[Math.floor(rng() * DENS.length)] : def.style === 'ogre' ? [['cutter', 3, 1], ['brute', 2, 1], ['sapper', 1, 2]] : CAMP[def.race] ?? CAMP.goblin;
  const out = [];
  if (def.stronghold) {
    out.push({ type: BOSS[def.race], opts: { boss: true } });
    const guard = def.race === 'beast' ? DENS[0] : CAMP[def.race];
    for (let i = 0; i < 6; i++) {
      const t = rollUnit(guard, level, rng);
      out.push({ type: t, opts: opts(t, level, rng) });
    }
    return out;
  }
  // Wolves and spiders come in bigger groups; ogre camps in smaller ones.
  const base = table === DENS[0] || table === DENS[1] ? 5 : def.style === 'ogre' ? 3 : 4;
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
  goblin: [['cutter', 4, 1], ['sapper', 1.5, 2], ['shieldbasher', 1.5, 3], ['brute', 1, 5]],
  hollow: [['husk', 4, 1], ['bonearcher', 2, 1], ['wraith', 1.5, 3]],
  construct: [['sentry', 4, 1], ['stalker', 1.5, 3]],
  beast: [['wolf', 4, 1], ['alpha', 0.6, 4], ['tusker', 1, 3], ['spider', 1.5, 2]],
};

export function roamPack(race, level, rng) {
  const table = ROAM[race] ?? ROAM.goblin;
  // Beasts roam as one kind (a wolf pack, a pair of tuskers); others as mixed bands.
  const lead = rollUnit(table, level, rng);
  const n = (lead === 'wolf' ? 3 : 2) + Math.floor(rng() * 2) + (level >= 5 ? 1 : 0);
  return Array.from({ length: n }, (_, i) => {
    const t = race === 'beast' ? (i === 0 && level >= 4 && lead === 'wolf' && rng() < 0.4 ? 'alpha' : lead) : i === 0 ? lead : rollUnit(table, level, rng);
    return { type: t, opts: opts(t, level, rng) };
  });
}

export const RACE_OF = Object.fromEntries(Object.entries(ENEMY_TYPES).map(([k, v]) => [k, v.race]));
