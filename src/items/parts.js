// Part pools per slot. Each part: stat mods, an optional name prefix, a minimum rarity tier,
// and visual params consumed by WeaponModel.js. Add parts here to grow the loot pool.
export const PARTS = {
  // ---- melee ----
  blade: [
    { id: 'blade_std',      name: 'Standard Blade', weight: 10, visual: { length: 1.1, width: 0.12, style: 'std' } },
    { id: 'blade_long',     name: 'Longblade',      prefix: 'Reaching',   weight: 6, mods: { mul: { range: 1.2, attackSpeed: 0.92 } }, visual: { length: 1.45, width: 0.11, style: 'long' } },
    { id: 'blade_broad',    name: 'Broadblade',     prefix: 'Sweeping',  weight: 6, mods: { mul: { damage: 1.15, arc: 1.1, attackSpeed: 0.9 } }, visual: { length: 1.15, width: 0.2, style: 'broad' } },
    { id: 'blade_serrated', name: 'Serrated Edge',  prefix: 'Jagged', weight: 4, minTier: 1, mods: { add: { critChance: 0.07 } }, visual: { length: 1.05, width: 0.14, style: 'serrated' } },
    { id: 'blade_runed',    name: 'Runed Blade',    prefix: 'Runed',  weight: 2, minTier: 2, mods: { mul: { elementPotency: 1.25 }, add: { elementChance: 0.2 } }, visual: { length: 1.2, width: 0.15, style: 'leaf', glow: true } },
  ],
  hilt: [
    { id: 'hilt_wrapped', name: 'Standard Hilt', weight: 10, visual: { guard: 0.34, style: 'bar' } },
    { id: 'hilt_quick',   name: 'Quick Hilt',   prefix: 'Swift',  weight: 5, mods: { mul: { attackSpeed: 1.1 } }, visual: { guard: 0.2, style: 'disc' } },
    { id: 'hilt_heavy',   name: 'Heavy Hilt',   prefix: 'Brutal', weight: 5, mods: { mul: { damage: 1.1, knockback: 1.3, attackSpeed: 0.95 } }, visual: { guard: 0.46, style: 'heavy' } },
  ],
  pommel: [
    { id: 'pommel_plain', name: 'Plain Pommel',    weight: 10, visual: { style: 'ball' } },
    { id: 'pommel_bal',   name: 'Balanced Pommel', prefix: 'Keen', weight: 5, mods: { add: { critMult: 0.2 } }, visual: { style: 'disc' } },
    { id: 'pommel_gem',   name: 'Gem Pommel',      prefix: 'Gilded', weight: 3, minTier: 2, mods: { add: { elementChance: 0.1, critChance: 0.03 } }, visual: { style: 'gem' } },
  ],
  head: [
    { id: 'head_bearded',  name: 'Bearded Head',  weight: 10, visual: { size: 1, style: 'bearded' } },
    { id: 'head_crescent', name: 'Crescent Head', prefix: 'Sweeping',   weight: 6, mods: { mul: { arc: 1.2 } }, visual: { size: 1.15, style: 'crescent' } },
    { id: 'head_spiked',   name: 'Spiked Head',   prefix: 'Spiked', weight: 5, mods: { mul: { damage: 1.08 } }, visual: { size: 1, style: 'bearded', spike: true } },
  ],
  haft: [
    { id: 'haft_ash',  name: 'Alloy Haft',  weight: 10, visual: { length: 1.1 } },
    { id: 'haft_long', name: 'Long Haft', prefix: 'Reaching', weight: 5, mods: { mul: { range: 1.15, attackSpeed: 0.95 } }, visual: { length: 1.4 } },
    { id: 'haft_iron', name: 'Steel Haft', prefix: 'Ironbound', weight: 5, mods: { mul: { knockback: 1.3 } }, visual: { length: 1.1, metal: true } },
  ],

  tip: [
    { id: 'tip_std',    name: 'Spearhead',    weight: 10, visual: { size: 1 } },
    { id: 'tip_long',   name: 'Long Point',   prefix: 'Piercing', weight: 6, mods: { mul: { range: 1.12 } }, visual: { size: 1.2 } },
    { id: 'tip_barbed', name: 'Barbed Point', prefix: 'Barbed',   weight: 4, minTier: 1, mods: { add: { critChance: 0.07 } }, visual: { size: 1, barbs: true } },
    { id: 'tip_broad',  name: 'Broad Point',  prefix: 'Rending',  weight: 5, mods: { mul: { damage: 1.06, arc: 1.2 } }, visual: { size: 1.3 } },
  ],
  maul: [
    { id: 'maul_iron',  name: 'Iron Head',  weight: 10, visual: { size: 1 } },
    { id: 'maul_great', name: 'Great Head', prefix: 'Colossal',   weight: 5, mods: { mul: { damage: 1.18, attackSpeed: 0.9, knockback: 1.2 } }, visual: { size: 1.3 } },
    { id: 'maul_light', name: 'Light Head', prefix: 'Swift',      weight: 5, mods: { mul: { attackSpeed: 1.12, damage: 0.94 } }, visual: { size: 0.85 } },
    { id: 'maul_rune',  name: 'Runed Head', prefix: 'Thundering', weight: 3, minTier: 2, mods: { add: { elementChance: 0.2 } }, visual: { size: 1, glow: true } },
  ],

  // ---- ranged ----
  barrel: [
    { id: 'barrel_std',   name: 'Standard Barrel', weight: 10, visual: { length: 0.35 } },
    { id: 'barrel_short', name: 'Snub Barrel',  prefix: 'Snub',      weight: 6, mods: { mul: { fireRate: 1.1, spread: 1.2 } }, visual: { length: 0.18 } },
    { id: 'barrel_long',  name: 'Long Barrel',  prefix: 'Marksman',  weight: 6, mods: { mul: { damage: 1.08, spread: 0.7, projectileSpeed: 1.25 } }, visual: { length: 0.6 } },
    { id: 'barrel_heavy', name: 'Heavy Barrel', prefix: 'Heavy',     weight: 5, mods: { mul: { damage: 1.2, fireRate: 0.85 } }, visual: { length: 0.4, thick: true } },
    { id: 'barrel_twin',  name: 'Twin Barrel',  prefix: 'Double',    weight: 3, minTier: 2, mods: { mul: { pellets: 2, damage: 0.55 } }, visual: { length: 0.35, twin: true } },
  ],
  body: [
    { id: 'body_std',   name: 'Standard Body', weight: 10, visual: { mag: 1 } },
    { id: 'body_drum',  name: 'Drum Body',  prefix: 'Drum',  weight: 5, mods: { mul: { magSize: 1.5, reloadTime: 1.2 } }, visual: { mag: 1.6, drum: true } },
    { id: 'body_light', name: 'Light Body', prefix: 'Light', weight: 5, mods: { mul: { reloadTime: 0.8, magSize: 0.9 } }, visual: { mag: 0.8 } },
  ],
  grip: [
    { id: 'grip_std',   name: 'Standard Grip', weight: 10 },
    { id: 'grip_tac',   name: 'Tactical Grip', prefix: 'Steady',  weight: 5, mods: { mul: { spread: 0.8 } } },
    { id: 'grip_hair',  name: 'Hair Trigger',  prefix: 'Twitchy', weight: 5, mods: { mul: { fireRate: 1.1 } } },
  ],
  stock: [
    { id: 'stock_std',      name: 'Standard Stock', weight: 10, visual: { length: 0.35 } },
    { id: 'stock_padded',   name: 'Padded Stock',   prefix: 'Steady', weight: 5, mods: { mul: { spread: 0.75 } }, visual: { length: 0.42 } },
    { id: 'stock_skeleton', name: 'Skeleton Stock', prefix: 'Nimble', weight: 5, mods: { mul: { reloadTime: 0.85 } }, visual: { length: 0.28 } },
  ],
  sight: [
    { id: 'sight_iron',  name: 'Iron Sights', weight: 10 },
    { id: 'sight_scope', name: 'Scope',      prefix: 'Sniping', weight: 4, mods: { add: { critChance: 0.08 } }, visual: { scope: true } },
    { id: 'sight_holo',  name: 'Holo Sight', prefix: 'Holo',    weight: 5, mods: { mul: { spread: 0.85 } }, visual: { holo: true } },
  ],

  limbs: [
    { id: 'limbs_std',    name: 'Composite Limbs',   weight: 10, visual: { span: 1 } },
    { id: 'limbs_steel',  name: 'Steel Limbs',    prefix: 'Heavy',     weight: 5, mods: { mul: { damage: 1.15, reloadTime: 1.15 } }, visual: { span: 1.1, metal: true } },
    { id: 'limbs_light',  name: 'Light Limbs',    prefix: 'Quick',     weight: 5, mods: { mul: { reloadTime: 0.8, damage: 0.93 } }, visual: { span: 0.85 } },
    { id: 'limbs_repeat', name: 'Repeater Frame', prefix: 'Repeating', weight: 3, minTier: 2, mods: { mul: { magSize: 5, reloadTime: 1.6, damage: 0.65 } }, visual: { span: 0.9, repeater: true } },
  ],

  // ---- magic ----
  focus: [
    { id: 'focus_quartz', name: 'Quartz Focus', weight: 10, visual: { gem: 'octa' } },
    { id: 'focus_ruby',   name: 'Ruby Focus',   prefix: 'Vivid',     weight: 6, mods: { mul: { damage: 1.1 } }, visual: { gem: 'octa', tint: 0xff3b5c } },
    { id: 'focus_prism',  name: 'Prism Focus',  prefix: 'Prismatic', weight: 4, minTier: 1, mods: { add: { elementChance: 0.2 } }, visual: { gem: 'ico' } },
    { id: 'focus_void',   name: 'Void Focus',   prefix: 'Abyssal',   weight: 3, minTier: 2, mods: { mul: { radius: 1.3, damage: 1.05 } }, visual: { gem: 'dodeca', tint: 0x3a1a5c } },
  ],
  shaft: [
    { id: 'shaft_oak',    name: 'Alloy Rod',    weight: 10, visual: { color: 0x4a4f5c } },
    { id: 'shaft_silver', name: 'Silvered Rod', prefix: 'Gleaming', weight: 5, mods: { mul: { castRate: 1.1 } }, visual: { color: 0xd8dde6 } },
    { id: 'shaft_bone',   name: 'Ceramic Rod',   prefix: 'Grim',     weight: 5, mods: { add: { critChance: 0.06 } }, visual: { color: 0xe4e8ef } },
  ],
  charm: [
    { id: 'charm_none',  name: 'No Charm',   weight: 10 },
    { id: 'charm_mana',  name: 'Mana Charm', prefix: 'Thrifty', weight: 5, mods: { mul: { manaCost: 0.8 } }, visual: { charm: 0x58a8ff } },
    { id: 'charm_fury',  name: 'Fury Charm', prefix: 'Furious', weight: 5, mods: { mul: { damage: 1.08, manaCost: 1.1 } }, visual: { charm: 0xff4a3a } },
  ],
  binding: [
    { id: 'binding_leather', name: 'Polymer Casing', weight: 10, visual: { color: 0x2e3240 } },
    { id: 'binding_iron',    name: 'Steel Casing',    prefix: 'Bound', weight: 5, mods: { mul: { radius: 1.15 } }, visual: { color: 0x5a5f6a } },
  ],
  pages: [
    { id: 'pages_vellum',  name: 'Crystal Lattice',      weight: 10 },
    { id: 'pages_burnt',   name: 'Overclocked Lattice',       prefix: 'Scorched',   weight: 5, mods: { mul: { damage: 1.08 } } },
    { id: 'pages_whisper', name: 'Resonant Lattice',  prefix: 'Whispering', weight: 5, mods: { mul: { castRate: 1.1 } } },
  ],
};

// ---- armour ---- (what a piece is made of comes from its set; these are what it's fitted with)
Object.assign(PARTS, {
  lining: [
    { id: 'lin_plain',   name: 'Standard Liner',   weight: 10 },
    { id: 'lin_padded',  name: 'Impact Padding',   weight: 6, mods: { mul: { hp: 1.35 } } },
    { id: 'lin_silk',    name: 'Nanoweave Liner',  weight: 5, mods: { add: { moveSpeed: 0.025 } } },
    { id: 'lin_quilted', name: 'Cooling Liner',    weight: 5, mods: { add: { staminaRegen: 0.2 } } },
    { id: 'lin_ench',    name: 'Psi-mesh Liner',   weight: 3, minTier: 1, mods: { add: { manaRegen: 0.2 } } },
  ],
  trim: [
    { id: 'trim_none',   name: 'Standard Fittings', weight: 10 },
    { id: 'trim_studs',  name: 'Riveted Plates',    weight: 6, mods: { mul: { armor: 1.15 } }, visual: { studs: true } },
    { id: 'trim_gilded', name: 'Gilded Fittings',   weight: 4, minTier: 1, mods: { add: { critBonus: 0.02 } }, visual: { gilded: true } },
    { id: 'trim_runic',  name: 'Ward Lattice',      weight: 3, minTier: 2, mods: { add: { resistFire: 0.08, resistShock: 0.08, resistFrost: 0.08, resistCorrosive: 0.08 } }, visual: { runes: true } },
  ],
});

export const PART_INDEX = Object.fromEntries(
  Object.entries(PARTS).flatMap(([slot, list]) => list.map((p) => [p.id, { ...p, slot }])),
);
