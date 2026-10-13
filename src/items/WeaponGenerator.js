// Procedural weapon generation: type → rarity → maker → parts → element → perks → stats → name.
// Fully deterministic for a given (seed, options), so weapons can be saved as just their recipe.
// The maker is one of those whose line includes the type (items/manufacturers.js), leaning to the
// drop's `theme` (maker ids, items/sets.js); the recipe records it.
import { mulberry32, randomSeed, pick, weightedPick } from '../core/rng.js';
import { WEAPON_TYPES, typesForClass } from './weaponTypes.js';
import { RARITY, rollRarity } from './rarity.js';
import { MANUFACTURERS, makersOfType } from './manufacturers.js';
import { pickMaker } from './sets.js';
import { PARTS } from './parts.js';
import { ELEMENTS, ELEMENT_IDS } from './elements.js';
import { PERKS, perksFor } from './perks.js';
import { formIds } from './forms.js';
import { weaponName } from './names.js';
import { GROWTH, scale } from '../rpg/balance.js';

let nextUid = 1;

function applyMods(stats, mods) {
  if (!mods) return;
  for (const [k, v] of Object.entries(mods.mul ?? {})) if (k in stats) stats[k] *= v;
  for (const [k, v] of Object.entries(mods.add ?? {})) stats[k] = (stats[k] ?? 0) + v;
}

export function generateWeapon({ seed = randomSeed(), level = 1, cls, type, rarity, maker, luck = 0, minTier = 0, theme = null } = {}) {
  const rng = mulberry32(seed);
  // Always consume the same draws so a recipe with resolved type/rarity regenerates identically.
  const rolledType = pick(rng, typesForClass(cls));
  const rolledRarity = rollRarity(rng, luck, minTier);
  const typeId = type ?? rolledType;
  const def = WEAPON_TYPES[typeId];
  const rar = rarity ? RARITY[rarity] : rolledRarity;
  const makers = makersOfType(typeId);
  const rolledMaker = pickMaker(rng, makers, theme);
  const mfrId = makers.includes(maker) ? maker : rolledMaker;
  const mfr = MANUFACTURERS[mfrId];
  const recipe = { kind: 'weapon', seed, level, type: typeId, rarity: rar.id, maker: mfrId };

  // Parts: higher rarity unlocks gated parts and leans toward them.
  const parts = {};
  for (const slot of def.slots) {
    const pool = PARTS[slot].filter((p) => (p.minTier ?? 0) <= rar.tier);
    parts[slot] = weightedPick(rng, pool, (p) => p.weight * (1 + (p.minTier ?? 0) * rar.tier * 0.5));
  }

  // Look: each visual component takes one of the manufacturer's forms for that kind.
  const look = {};
  for (const kind of def.components) look[kind] = pick(rng, mfr.forms?.[kind] ?? formIds(kind));

  // Perks
  const perkIds = [];
  const regular = perksFor(def.cls, false);
  for (let i = 0; i < rar.perks && regular.length; i++) {
    perkIds.push(regular.splice(Math.floor(rng() * regular.length), 1)[0]);
  }
  if (rar.id === 'legendary') perkIds.push(pick(rng, perksFor(def.cls, true)));
  const perks = perkIds.map((id) => PERKS[id]);

  // Element
  let element = 'none';
  const forced = perks.find((p) => p.forceElement);
  if (forced) element = forced.forceElement;
  else if (rng() < rar.elementChance + (mfr.elementAffinity ? 0.15 : 0)) {
    element = mfr.elementAffinity && rng() < 0.6 ? mfr.elementAffinity : pick(rng, ELEMENT_IDS);
  }

  // Stats
  const stats = { ...def.base };
  applyMods(stats, mfr.mods);
  for (const p of Object.values(parts)) applyMods(stats, p.mods);
  for (const p of perks) applyMods(stats, p.mods);
  stats.damage *= scale(GROWTH.weapon, level) * rar.statMult * (0.92 + rng() * 0.16);
  stats.elementChance = element === 'none' ? 0 : Math.min(1, 0.18 + stats.elementChance);
  stats.critChance = Math.min(0.75, stats.critChance);
  if ('magSize' in stats) stats.magSize = Math.max(1, Math.round(stats.magSize));
  if ('pellets' in stats) stats.pellets = Math.max(1, Math.round(stats.pellets));

  // Name: the frame's model line + one word from the fitted parts or element; legendaries get a
  // name of their own (items/names.js).
  const legendary = perkIds.find((id) => PERKS[id].legendary) ?? null;
  const name = weaponName({ seed, type: typeId, look, parts, element, legendary });

  return {
    uid: nextUid++,
    recipe,
    kind: 'weapon',
    seed, level,
    type: typeId,
    cls: def.cls,
    rarity: rar.id,
    manufacturer: mfrId,
    parts: Object.fromEntries(Object.entries(parts).map(([slot, p]) => [slot, p.id])),
    look,
    element,
    perks: perkIds,
    stats,
    name,
    ammo: stats.magSize ?? 0,
  };
}

const TIER_VALUE = [1, 2.2, 5, 11, 30];

// Base gold value. Traders buy at this, sell at 3x; scrapping in the field gives half.
export function weaponValue(w) {
  return Math.round(5 * (1 + w.level * 0.7) * TIER_VALUE[RARITY[w.rarity].tier]);
}

// Rebuild a weapon from its saved recipe.
export const weaponFromRecipe = (recipe) => generateWeapon(recipe);
