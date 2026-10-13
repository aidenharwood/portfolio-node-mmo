// Armour slots, rolled affixes and armour perks.
// Armour stats: armor (damage reduction), hp, melee/ranged/magicDamage, healthPct, moveSpeed,
// critBonus, manaRegen, staminaRegen, resistFire/Shock/Frost/Corrosive — and, from set bonuses
// (items/sets.js), armorPct, fire/shock/frost/corrosiveDamage and manaDiscount.
import { GROWTH, scale } from '../rpg/balance.js';

export const ARMOR_SLOTS = {
  head:  { label: 'Helm',   kind: 'armorHead',  base: { armor: 5, hp: 6 } },
  chest: { label: 'Chest',  kind: 'armorChest', base: { armor: 11, hp: 14 } },
  hands: { label: 'Gloves', kind: 'armorHands', base: { armor: 4, hp: 3 } },
  legs:  { label: 'Boots',  kind: 'armorLegs',  base: { armor: 5, hp: 5 } },
  back:  { label: 'Back',   kind: 'armorBack',  base: { armor: 3, hp: 4 } },
};
export const ARMOR_SLOT_IDS = Object.keys(ARMOR_SLOTS);
export const ARMOR_PART_SLOTS = ['lining', 'trim']; // what a piece is made of comes from its set

// Extra rolled bonuses; count = rarity tier. `roll(level, rng)` returns the amount (one draw
// each, in this order, so a recipe always regenerates the same: the first four were attribute
// points before talents replaced attributes).
export const ARMOR_AFFIXES = {
  meleeDamage:  { label: 'Melee Damage',  pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  rangedDamage: { label: 'Ranged Damage', pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  magicDamage:  { label: 'Magic Damage',  pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  healthPct:    { label: 'Max Health',    pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  hp:           { label: 'Max Health',    roll: (l, r) => Math.round(8 * scale(GROWTH.health, l) * (0.8 + r() * 0.4)) },
  moveSpeed:    { label: 'Move Speed',    pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  critBonus:    { label: 'Crit Chance',   pct: true, roll: (l, r) => 0.015 + r() * 0.02 },
  manaRegen:    { label: 'Mana Regen',    pct: true, roll: (l, r) => 0.12 + r() * 0.12 },
  staminaRegen: { label: 'Stamina Regen', pct: true, roll: (l, r) => 0.12 + r() * 0.12 },
  resistFire:      { label: 'Fire Resist',      pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistShock:     { label: 'Shock Resist',     pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistFrost:     { label: 'Frost Resist',     pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistCorrosive: { label: 'Corrosive Resist', pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
};

// Armour perks are read by the Player (see entities/Player.js: gear perks). `set` perks come
// only from set bonuses, never rolled onto a piece.
export const ARMOR_PERKS = {
  thorns:     { name: 'Thorns',      desc: 'Melee attackers take 30% of the damage they deal.' },
  secondWind: { name: 'Second Wind', desc: 'Dropping below 30% health heals 30% (once per minute).' },
  fleet:      { name: 'Fleetfoot',   desc: 'Dashes travel 25% further and cost less stamina.' },
  warded:     { name: 'Warded',      desc: 'The first hit every 8 seconds is halved.' },
  steadfast:  { set: true, name: 'Steadfast', desc: 'Immune to knockback.' },
  // legendary
  juggernaut: { legendary: true, title: 'Ironjaw\'s Mantle', name: 'Juggernaut', desc: 'Immune to knockback. +15% armour.' },
  phoenix:    { legendary: true, title: 'Ashen Crown', name: 'Phoenix', desc: 'Once per rest, a killing blow leaves you at 50% health instead.' },
};

export const armorPerksFor = (legendary) => Object.keys(ARMOR_PERKS).filter((id) => !ARMOR_PERKS[id].set && !!ARMOR_PERKS[id].legendary === legendary);

// Stats only set bonuses give (all percentages).
const SET_STATS = {
  armorPct: 'Armour',
  fireDamage: 'Fire Damage', shockDamage: 'Shock Damage', frostDamage: 'Frost Damage', corrosiveDamage: 'Corrosive Damage',
  manaDiscount: 'Spell Mana Cost',
};

export const STAT_LABEL = {
  armor: 'Armour', ...Object.fromEntries(Object.entries(ARMOR_AFFIXES).map(([k, v]) => [k, v.label])), ...SET_STATS,
};
export const PCT_STATS = new Set([...Object.entries(ARMOR_AFFIXES).filter(([, v]) => v.pct).map(([k]) => k), ...Object.keys(SET_STATS)]);
