// Procedural armour: slot → rarity → set → look → fittings → affixes → perks → stats → name.
// Every piece belongs to a set (items/sets.js), which fixes its maker, its look and its name, so
// pieces of a set match; rarity, fittings, affixes and perks make each one its own. Deterministic
// per recipe, like weapons — the recipe records the set it rolled, so a themed drop (`theme`,
// maker ids it leans to) regenerates as itself.
import { mulberry32, randomSeed, pick, weightedPick } from '../core/rng.js';
import { RARITY, rollRarity } from './rarity.js';
import { PARTS } from './parts.js';
import { ARMOR_SLOTS, ARMOR_SLOT_IDS, ARMOR_PART_SLOTS, ARMOR_AFFIXES, ARMOR_PERKS, armorPerksFor } from './armorTypes.js';
import { GEAR_SETS, WEIGHTS, pickMaker, setOfMaker } from './sets.js';
import { GROWTH, scale } from '../rpg/balance.js';

let nextUid = 100000;
// (A raid's own sets never roll on their own: only its chests give them.)
const SET_MAKERS = Object.values(GEAR_SETS).filter((s) => !s.raid).map((s) => s.maker);

function applyMods(stats, mods) {
  if (!mods) return;
  for (const [k, v] of Object.entries(mods.mul ?? {})) if (k in stats) stats[k] *= v;
  for (const [k, v] of Object.entries(mods.add ?? {})) stats[k] = (stats[k] ?? 0) + v;
}

// The trail gear every new character starts in: common Pathfinder, head to back (the back piece is
// the outpost cape older characters were given on its own).
export function starterArmor() {
  return Object.fromEntries(ARMOR_SLOT_IDS.map((slot, i) => [slot, generateArmor({ seed: slot === 'back' ? 7711 : 7720 + i, level: 1, slot, rarity: 'common', set: 'pathfinder' })]));
}

export function generateArmor({ seed = randomSeed(), level = 1, slot, rarity, set, luck = 0, minTier = 0, theme = null } = {}) {
  const rng = mulberry32(seed);
  // Always consume the same draws, so a recipe with its slot, rarity and set resolved regenerates
  // identically.
  const rolledSlot = pick(rng, ARMOR_SLOT_IDS);
  const rolledRarity = rollRarity(rng, luck, minTier);
  const rolledSet = setOfMaker(pickMaker(rng, SET_MAKERS, theme));
  const slotId = slot ?? rolledSlot;
  const def = ARMOR_SLOTS[slotId];
  const rar = rarity ? RARITY[rarity] : rolledRarity;
  const setId = GEAR_SETS[set] ? set : rolledSet;
  const S = GEAR_SETS[setId];
  const recipe = { kind: 'armor', seed, level, slot: slotId, rarity: rar.id, set: setId };
  const piece = S.pieces[slotId];
  const look = { [def.kind]: pick(rng, piece.forms) };

  const parts = {};
  for (const ps of ARMOR_PART_SLOTS) {
    const pool = PARTS[ps].filter((p) => (p.minTier ?? 0) <= rar.tier);
    parts[ps] = weightedPick(rng, pool, (p) => p.weight * (1 + (p.minTier ?? 0) * rar.tier * 0.5));
  }

  const W = WEIGHTS[S.weight];
  const stats = { armor: def.base.armor * W.armor, hp: def.base.hp * W.hp };
  for (const p of Object.values(parts)) applyMods(stats, p.mods);
  // Armour grows at the rate it's measured against (rpg/balance.js), health with player health.
  stats.armor = Math.round(stats.armor * scale(GROWTH.armor, level) * rar.statMult * (0.92 + rng() * 0.16));
  stats.hp = Math.round(stats.hp * scale(GROWTH.health, level) * rar.statMult);

  // Affixes: one per rarity tier, no repeats.
  const affixPool = Object.keys(ARMOR_AFFIXES);
  for (let i = 0; i < rar.tier && affixPool.length; i++) {
    const id = affixPool.splice(Math.floor(rng() * affixPool.length), 1)[0];
    stats[id] = (stats[id] ?? 0) + ARMOR_AFFIXES[id].roll(level, rng);
  }

  const perks = [];
  if (rar.tier >= 2 && rng() < 0.5 + rar.tier * 0.1) perks.push(pick(rng, armorPerksFor(false)));
  if (rar.id === 'legendary') perks.push(pick(rng, armorPerksFor(true)));
  const legendary = perks.map((id) => ARMOR_PERKS[id]).find((p) => p.legendary);
  if (legendary && legendary.name === 'Juggernaut') stats.armor = Math.round(stats.armor * 1.15);

  // A set piece is named for its set ("Pathfinder Boots"); a legendary one has a name of its own.
  const name = legendary ? legendary.title : `${S.name} ${piece.name}`;

  return {
    uid: nextUid++,
    recipe,
    kind: 'armor',
    slot: slotId,
    seed, level,
    rarity: rar.id,
    set: setId,
    manufacturer: S.maker,
    parts: Object.fromEntries(Object.entries(parts).map(([s, p]) => [s, p.id])),
    look,
    perks,
    stats,
    name,
    element: 'none',
  };
}
