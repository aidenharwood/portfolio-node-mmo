import { weightedPick } from '../core/rng.js';

// perks: regular perk count. Legendaries additionally get one legendary perk.
export const RARITIES = [
  { tier: 0, id: 'common',    name: 'Common',    color: 0xdedede, css: '#dedede', weight: 100, statMult: 1.0,  perks: 0, elementChance: 0.06 },
  { tier: 1, id: 'uncommon',  name: 'Uncommon',  color: 0x52d65a, css: '#52d65a', weight: 45,  statMult: 1.1,  perks: 0, elementChance: 0.2 },
  { tier: 2, id: 'rare',      name: 'Rare',      color: 0x3f9bff, css: '#3f9bff', weight: 16,  statMult: 1.22, perks: 1, elementChance: 0.4 },
  { tier: 3, id: 'epic',      name: 'Epic',      color: 0xb062ff, css: '#b062ff', weight: 5,   statMult: 1.36, perks: 2, elementChance: 0.65 },
  { tier: 4, id: 'legendary', name: 'Legendary', color: 0xff9420, css: '#ff9420', weight: 1.2, statMult: 1.55, perks: 1, elementChance: 0.85 },
];

export const RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, r]));

// luck skews weight toward higher tiers; minTier floors the result (e.g. boss chests).
export function rollRarity(rng, luck = 0, minTier = 0) {
  const pool = RARITIES.filter((r) => r.tier >= minTier);
  return weightedPick(rng, pool, (r) => r.weight * (1 + luck * r.tier));
}
