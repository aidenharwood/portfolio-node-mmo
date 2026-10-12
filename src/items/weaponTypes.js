// Weapon archetypes. `base` is the level-1 Common stat block before manufacturer/part/perk mods.
// `slots` lists which part pools (items/parts.js) the generator rolls for this type.
export const WEAPON_CLASSES = ['melee', 'ranged', 'magic'];

const MELEE_BASE = { critChance: 0.05, critMult: 1.5, elementChance: 0, elementPotency: 1, range: 1, arc: 1, knockback: 1, attackSpeed: 1 };
const RANGED_BASE = { critChance: 0.06, critMult: 1.6, elementChance: 0, elementPotency: 1, knockback: 1, pellets: 1 };
const MAGIC_BASE = { critChance: 0.05, critMult: 1.5, elementChance: 0, elementPotency: 1, knockback: 2, radius: 0 };

export const WEAPON_TYPES = {
  sword:   { components: ['grip', 'guard', 'blade', 'pommel'], cls: 'melee', label: 'Sword',  combo: 'sword',  slots: ['blade', 'hilt', 'pommel'],
             base: { ...MELEE_BASE, damage: 14 } },
  axe:     { components: ['haft', 'axeHead', 'pommel'], cls: 'melee', label: 'Axe',    combo: 'axe',    slots: ['head', 'haft', 'pommel'],
             base: { ...MELEE_BASE, damage: 20, attackSpeed: 0.85, range: 1.05, arc: 1.1, knockback: 1.5 } },
  dagger:  { components: ['grip', 'guard', 'blade', 'pommel'], cls: 'melee', label: 'Dagger', combo: 'dagger', slots: ['blade', 'hilt', 'pommel'],
             base: { ...MELEE_BASE, damage: 9, attackSpeed: 1.3, critChance: 0.12, critMult: 1.8, range: 0.9, knockback: 0.6 } },

  greatsword: { components: ['grip', 'guard', 'blade', 'pommel'], cls: 'melee', label: 'Greatsword', combo: 'greatsword', scale: 1.45, slots: ['blade', 'hilt', 'pommel'],
             base: { ...MELEE_BASE, damage: 24, attackSpeed: 0.78, range: 1.2, arc: 1.15, knockback: 1.6 } },
  spear:   { components: ['haft', 'spearHead', 'pommel'], cls: 'melee', label: 'Spear', combo: 'spear', slots: ['tip', 'haft', 'pommel'],
             base: { ...MELEE_BASE, damage: 15, attackSpeed: 1.05, range: 1.0, arc: 1.0, knockback: 1.1 } },
  hammer:  { components: ['haft', 'hammerHead', 'pommel'], cls: 'melee', label: 'Hammer', combo: 'hammer', slots: ['maul', 'haft', 'pommel'],
             base: { ...MELEE_BASE, damage: 27, attackSpeed: 0.74, range: 1.0, arc: 1.0, knockback: 2.2 } },

  pistol:  { components: ['receiver', 'barrel', 'gunGrip', 'magazine'], cls: 'ranged', label: 'Pistol',  auto: false, slots: ['barrel', 'body', 'grip', 'sight'],
             base: { ...RANGED_BASE, damage: 12, fireRate: 4, magSize: 12, reloadTime: 1.1, spread: 0.012, projectileSpeed: 360, knockback: 1.5 } },
  rifle:   { components: ['receiver', 'barrel', 'gunGrip', 'magazine', 'stock'], cls: 'ranged', label: 'Rifle',   auto: true,  slots: ['barrel', 'body', 'stock', 'sight'],
             base: { ...RANGED_BASE, damage: 8, fireRate: 9, magSize: 30, reloadTime: 1.6, spread: 0.016, projectileSpeed: 640 } },
  shotgun: { components: ['receiver', 'barrel', 'gunGrip', 'magazine', 'stock'], cls: 'ranged', label: 'Shotgun', auto: false, slots: ['barrel', 'body', 'stock'],
             base: { ...RANGED_BASE, damage: 6, fireRate: 1.4, magSize: 6, reloadTime: 1.8, spread: 0.07, projectileSpeed: 400, pellets: 7, knockback: 3 } },

  smg:     { components: ['receiver', 'barrel', 'gunGrip', 'magazine'], cls: 'ranged', label: 'SMG', auto: true, slots: ['barrel', 'body', 'grip', 'sight'],
             base: { ...RANGED_BASE, damage: 6, fireRate: 13, magSize: 36, reloadTime: 1.3, spread: 0.024, projectileSpeed: 420 } },
  sniper:  { components: ['receiver', 'barrel', 'gunGrip', 'magazine', 'stock'], cls: 'ranged', label: 'Sniper', auto: false, adsFov: 20, slots: ['barrel', 'body', 'stock', 'sight'],
             base: { ...RANGED_BASE, damage: 46, fireRate: 0.9, magSize: 5, reloadTime: 2.2, spread: 0.002, projectileSpeed: 920, critMult: 2.3, knockback: 4, pierce: 2 } },
  launcher: { components: ['launcherTube', 'gunGrip'], cls: 'ranged', label: 'Launcher', auto: false, projectile: 'rocket', slots: ['barrel', 'body', 'sight'],
             base: { ...RANGED_BASE, damage: 52, fireRate: 0.8, magSize: 3, reloadTime: 2.4, spread: 0.005, projectileSpeed: 28, aoe: 3.5, knockback: 10 } },
  crossbow: { components: ['limbs', 'gunGrip', 'stock'], cls: 'ranged', label: 'Crossbow', auto: false, projectile: 'quarrel', gravity: 9.8, slots: ['limbs', 'body', 'stock', 'sight'],
             base: { ...RANGED_BASE, damage: 30, fireRate: 1.6, magSize: 1, reloadTime: 0.75, spread: 0.003, projectileSpeed: 110, pierce: 1, critMult: 1.9, knockback: 3 } },

  wand:    { components: ['shaft', 'head'], cls: 'magic', label: 'Wand',  spell: 'bolt', slots: ['focus', 'shaft', 'charm'],
             base: { ...MAGIC_BASE, damage: 13, castRate: 3, manaCost: 8, projectileSpeed: 26, elementChance: 0.1 } },
  staff:   { components: ['shaft', 'head'], cls: 'magic', label: 'Staff', spell: 'orb',  slots: ['focus', 'shaft', 'charm'],
             base: { ...MAGIC_BASE, damage: 26, castRate: 1.1, manaCost: 22, projectileSpeed: 14, radius: 3, knockback: 7 } },
  // Codex: rune strikes at the reticle (charged: a cascade of runes down the aim line).
  tome:    { components: ['cover'], cls: 'magic', label: 'Codex',  spell: 'nova', slots: ['binding', 'pages', 'charm'],
             base: { ...MAGIC_BASE, damage: 30, castRate: 1.25, manaCost: 18, projectileSpeed: 0, radius: 3.6, knockback: 8 } },
  scepter: { components: ['shaft', 'head'], cls: 'magic', label: 'Scepter', spell: 'seeker', slots: ['focus', 'shaft', 'charm'],
             base: { ...MAGIC_BASE, damage: 9, castRate: 1.5, manaCost: 15, projectileSpeed: 17, missiles: 3 } },
  orb:     { components: ['orbShell'], cls: 'magic', label: 'Orb', spell: 'chain', slots: ['focus', 'charm'],
             base: { ...MAGIC_BASE, damage: 15, castRate: 2.2, manaCost: 10, projectileSpeed: 0, chains: 3, chainRange: 26, elementChance: 0.1 } },
};

export const typesForClass = (cls) => Object.keys(WEAPON_TYPES).filter((t) => !cls || WEAPON_TYPES[t].cls === cls);
