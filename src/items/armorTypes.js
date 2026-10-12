// Armour slots, rolled affixes and armour perks.
// Armour stats: armor (damage reduction), hp, attribute bonuses, moveSpeed, critBonus,
// manaRegen, staminaRegen, resistFire/Shock/Frost/Corrosive.

export const ARMOR_SLOTS = {
  head:  { label: 'Helm',   kind: 'armorHead',  base: { armor: 5, hp: 6 } },
  chest: { label: 'Chest',  kind: 'armorChest', base: { armor: 11, hp: 14 } },
  hands: { label: 'Gloves', kind: 'armorHands', base: { armor: 4, hp: 3 } },
  legs:  { label: 'Boots',  kind: 'armorLegs',  base: { armor: 5, hp: 5 } },
  back:  { label: 'Back',   kind: 'armorBack',  base: { armor: 3, hp: 4 } },
};
export const ARMOR_SLOT_IDS = Object.keys(ARMOR_SLOTS);
export const ARMOR_PART_SLOTS = ['material', 'lining', 'trim'];

// Extra rolled bonuses; count = rarity tier. `roll(level, rng)` returns the amount.
export const ARMOR_AFFIXES = {
  might:        { label: 'Might',         roll: (l, r) => 1 + Math.floor(l / 4 + r() * 2) },
  finesse:      { label: 'Finesse',       roll: (l, r) => 1 + Math.floor(l / 4 + r() * 2) },
  arcana:       { label: 'Arcana',        roll: (l, r) => 1 + Math.floor(l / 4 + r() * 2) },
  vitality:     { label: 'Vitality',      roll: (l, r) => 1 + Math.floor(l / 4 + r() * 2) },
  hp:           { label: 'Max Health',    roll: (l, r) => Math.round(6 * Math.pow(l, 0.8) * (0.8 + r() * 0.4)) },
  moveSpeed:    { label: 'Move Speed',    pct: true, roll: (l, r) => 0.03 + r() * 0.03 },
  critBonus:    { label: 'Crit Chance',   pct: true, roll: (l, r) => 0.015 + r() * 0.02 },
  manaRegen:    { label: 'Mana Regen',    pct: true, roll: (l, r) => 0.12 + r() * 0.12 },
  staminaRegen: { label: 'Stamina Regen', pct: true, roll: (l, r) => 0.12 + r() * 0.12 },
  resistFire:      { label: 'Fire Resist',      pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistShock:     { label: 'Shock Resist',     pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistFrost:     { label: 'Frost Resist',     pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
  resistCorrosive: { label: 'Corrosive Resist', pct: true, roll: (l, r) => 0.1 + r() * 0.1 },
};

// Armour perks are read by the Player (see entities/Player.js: gear perks).
export const ARMOR_PERKS = {
  thorns:     { name: 'Thorns',      desc: 'Melee attackers take 30% of the damage they deal.' },
  secondWind: { name: 'Second Wind', desc: 'Dropping below 30% health heals 30% (once per minute).' },
  fleet:      { name: 'Fleetfoot',   desc: 'Dodges travel 25% further and cost less stamina.' },
  warded:     { name: 'Warded',      desc: 'The first hit every 8 seconds is halved.' },
  // legendary
  juggernaut: { legendary: true, title: 'Ironjaw\'s Mantle', name: 'Juggernaut', desc: 'Immune to knockback. +15% armour.' },
  phoenix:    { legendary: true, title: 'Ashen Crown', name: 'Phoenix', desc: 'Once per rest, a killing blow leaves you at 50% health instead.' },
};

export const armorPerksFor = (legendary) => Object.keys(ARMOR_PERKS).filter((id) => !!ARMOR_PERKS[id].legendary === legendary);

export const STAT_LABEL = {
  armor: 'Armour', ...Object.fromEntries(Object.entries(ARMOR_AFFIXES).map(([k, v]) => [k, v.label])),
};
export const PCT_STATS = new Set(Object.entries(ARMOR_AFFIXES).filter(([, v]) => v.pct).map(([k]) => k));
