// Procedural armour: slot → rarity → manufacturer → parts → look → affixes → perks → stats → name.
// Deterministic per recipe, like weapons.
import { mulberry32, randomSeed, pick, weightedPick } from '../core/rng.js';
import { RARITY, rollRarity } from './rarity.js';
import { MANUFACTURERS, manufacturersFor } from './manufacturers.js';
import { PARTS } from './parts.js';
import { ARMOR_SLOTS, ARMOR_SLOT_IDS, ARMOR_PART_SLOTS, ARMOR_AFFIXES, ARMOR_PERKS, armorPerksFor } from './armorTypes.js';
import { ARMOR_FORMS } from '../models/ArmorForms.js';

let nextUid = 100000;
const LEVEL_GROWTH = 1.12;

function applyMods(stats, mods) {
  if (!mods) return;
  for (const [k, v] of Object.entries(mods.mul ?? {})) if (k in stats) stats[k] *= v;
  for (const [k, v] of Object.entries(mods.add ?? {})) stats[k] = (stats[k] ?? 0) + v;
}

export function generateArmor({ seed = randomSeed(), level = 1, slot, rarity, luck = 0, minTier = 0 } = {}) {
  const rng = mulberry32(seed);
  const rolledSlot = pick(rng, ARMOR_SLOT_IDS);
  const rolledRarity = rollRarity(rng, luck, minTier);
  const slotId = slot ?? rolledSlot;
  const def = ARMOR_SLOTS[slotId];
  const rar = rarity ? RARITY[rarity] : rolledRarity;
  const recipe = { kind: 'armor', seed, level, slot: slotId, rarity: rar.id };
  const mfrId = pick(rng, manufacturersFor('armor'));
  const mfr = MANUFACTURERS[mfrId];

  const parts = {};
  for (const ps of ARMOR_PART_SLOTS) {
    const pool = PARTS[ps].filter((p) => (p.minTier ?? 0) <= rar.tier);
    parts[ps] = weightedPick(rng, pool, (p) => p.weight * (1 + (p.minTier ?? 0) * rar.tier * 0.5));
  }
  const look = { [def.kind]: pick(rng, mfr.forms?.[def.kind] ?? Object.keys(ARMOR_FORMS[def.kind])) };

  const stats = { ...def.base };
  applyMods(stats, mfr.armorMods);
  for (const p of Object.values(parts)) applyMods(stats, p.mods);
  const scale = Math.pow(LEVEL_GROWTH, level - 1) * rar.statMult;
  stats.armor = Math.round(stats.armor * scale * (0.92 + rng() * 0.16));
  stats.hp = Math.round(stats.hp * scale);

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

  const formName = ARMOR_FORMS[def.kind][look[def.kind]].name;
  const prefixes = Object.values(parts).map((p) => p.prefix).filter(Boolean);
  const name = legendary ? legendary.title : `${prefixes.length ? pick(rng, prefixes) + ' ' : ''}${formName}`;

  return {
    uid: nextUid++,
    recipe,
    kind: 'armor',
    slot: slotId,
    seed, level,
    rarity: rar.id,
    manufacturer: mfrId,
    parts: Object.fromEntries(Object.entries(parts).map(([s, p]) => [s, p.id])),
    look,
    perks,
    stats,
    name,
    element: 'none',
  };
}
