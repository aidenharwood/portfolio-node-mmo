// Makers: who built a piece of gear. Each is one of the world's sources of kit — settlers, the
// Wardens' armoury, the mining guilds, scav workshops, Hive harvesters, synth salvagers and the
// precursors' relics — and gives everything it makes one identity: a line of weapon types, an
// armour set (items/sets.js), a palette with a signature energy colour (the glow through all of
// its gear), a stat bias, an element it leans to, the component forms its weapons are built from,
// and how its scopes look and its guns sound.
//   types     weapon types it makes
//   set       the armour set it makes (items/sets.js)
//   mods      weapon stat bias: { mul: {stat: factor}, add: {stat: amount} } — as parts and perks
//   scope     scope / sight style (items/WeaponModel.js, ui/ScopeView.js): military · junk ·
//             digital · crystal, or default
//   voice     the tint on its guns' and spells' sound (audio/Sfx.js)
export const MANUFACTURERS = {
  frontier: {
    name: 'Frontier Outfitters', set: 'pathfinder', classes: ['melee', 'ranged', 'armor'],
    types: ['rifle', 'crossbow', 'pistol', 'spear', 'dagger', 'axe'],
    blurb: 'Made out here, for out here. Fix it with a wrench.',
    forms: {
      receiver: ['boxy', 'block'], barrel: ['plain', 'shrouded'], gunGrip: ['wood', 'straight'], stock: ['solid', 'padded'], magazine: ['straight', 'tube'],
      limbs: ['recurve', 'compound'], blade: ['tanto', 'broad', 'straight'], guard: ['bar', 'heavy'], grip: ['wrapped', 'ridged'], pommel: ['ball', 'disc'],
      axeHead: ['bearded', 'wedge'], haft: ['wrapped', 'banded', 'straight'], spearHead: ['leaf', 'winged', 'pike'],
    },
    palette: { primary: 0x8a6a46, secondary: 0x4a3a2a, metal: 0xc8a050, energy: 0xffb347 },
    mods: { mul: { reloadTime: 0.9, spread: 0.9, attackSpeed: 1.05 }, add: { critChance: 0.03 } },
    scope: 'default', voice: 'plain',
  },
  warden: {
    name: 'Warden Arsenal', set: 'vanguard', classes: ['melee', 'ranged', 'armor'],
    types: ['rifle', 'sniper', 'launcher', 'pistol', 'smg', 'sword', 'greatsword'],
    blurb: 'Standard issue for the Wardens. One shot, one kill.',
    forms: {
      receiver: ['block', 'angular'], barrel: ['shrouded', 'vented', 'plain'], gunGrip: ['straight', 'raked'], stock: ['solid', 'padded', 'thumbhole'],
      magazine: ['straight', 'curved'], launcherTube: ['tube'], blade: ['straight', 'sabre', 'falchion'], guard: ['bar', 'winged', 'disc'],
      grip: ['wrapped', 'ridged'], pommel: ['disc', 'ball'],
    },
    palette: { primary: 0x3d5a8a, secondary: 0x26303e, metal: 0xd8dee8, energy: 0x6ae8ff },
    mods: { mul: { damage: 1.12, fireRate: 0.88, attackSpeed: 0.92, spread: 0.6 } },
    scope: 'military', voice: 'military',
  },
  ironhide: {
    name: 'Ironhide Heavy Industries', set: 'bastion', classes: ['melee', 'ranged', 'armor'],
    types: ['hammer', 'axe', 'greatsword', 'shotgun', 'launcher'],
    blurb: 'Mining-grade. Magma-cored. Built to outlast you.',
    forms: {
      hammerHead: ['block', 'flanged', 'warpick'], axeHead: ['cleaver', 'wedge', 'splitter'], haft: ['banded', 'straight'], blade: ['broad', 'cleaver', 'falchion'],
      guard: ['heavy', 'bar'], grip: ['ridged', 'wrapped'], pommel: ['ball', 'spike'], receiver: ['block', 'boxy'], barrel: ['vented', 'shrouded'],
      gunGrip: ['straight'], stock: ['solid'], magazine: ['tube', 'drum'], launcherTube: ['tube', 'drum'],
    },
    palette: { primary: 0x5e626c, secondary: 0xd98a2a, metal: 0xb8bec8, energy: 0xff8a2a },
    mods: { mul: { damage: 1.18, attackSpeed: 0.88, fireRate: 0.9, knockback: 1.4 } },
    scope: 'default', voice: 'heavy',
  },
  rustjaw: {
    name: 'Rustjaw Salvage', set: 'raider', classes: ['melee', 'ranged', 'armor'], elementAffinity: 'fire',
    types: ['smg', 'shotgun', 'launcher', 'pistol', 'axe', 'hammer'],
    blurb: 'Scav-built! Mostly doesn\'t explode!',
    forms: {
      receiver: ['boxy', 'rounded'], barrel: ['plain', 'flared'], gunGrip: ['wood', 'straight'], stock: ['wire', 'skeleton'], magazine: ['drum', 'straight', 'curved'],
      launcherTube: ['drum', 'quad'], axeHead: ['bearded', 'double', 'hook'], hammerHead: ['spiked', 'block'], haft: ['wrapped', 'spiked'], pommel: ['spike', 'skull'],
    },
    palette: { primary: 0x8a4a2a, secondary: 0x4e5040, metal: 0x9aa0aa, energy: 0xff6a2a },
    mods: { mul: { damage: 0.82, fireRate: 1.3, magSize: 1.7, spread: 1.35, reloadTime: 1.1, attackSpeed: 1.18 } },
    scope: 'junk', voice: 'junk',
  },
  hivecraft: {
    name: 'Hivecraft', set: 'chitin', classes: ['melee', 'ranged', 'magic', 'armor'], elementAffinity: 'corrosive',
    types: ['dagger', 'spear', 'crossbow', 'wand', 'orb', 'scepter'],
    blurb: 'Grown, not made. Feed it now and then.',
    forms: {
      blade: ['needle', 'tanto', 'flamberge'], guard: ['claw', 'winged'], grip: ['bone', 'ridged'], pommel: ['skull', 'spike'], haft: ['bone', 'twisted'],
      spearHead: ['hooked', 'trident', 'glaive'], limbs: ['recurve', 'heavy'], gunGrip: ['ergonomic', 'raked'], stock: ['thumbhole', 'skeleton'],
      shaft: ['bone', 'knotted'], head: ['antler', 'claw', 'branch'], orbShell: ['eye', 'shards'],
    },
    palette: { primary: 0x3a2c48, secondary: 0x5a4672, metal: 0xd8ccb8, energy: 0x9be22d },
    mods: { mul: { damage: 1.06, manaCost: 1.2, radius: 1.15 }, add: { critChance: 0.04 } },
    scope: 'default', voice: 'bio',
  },
  voltaic: {
    name: 'Voltaic Synthworks', set: 'arcframe', classes: ['ranged', 'magic', 'armor'], elementAffinity: 'shock',
    types: ['smg', 'rifle', 'pistol', 'sniper', 'scepter', 'orb', 'wand'],
    blurb: 'Salvaged synth cores, rewired. Do not lick.',
    forms: {
      receiver: ['rounded', 'skeletal'], barrel: ['coil'], gunGrip: ['ergonomic'], stock: ['thumbhole', 'skeleton'], magazine: ['cell'],
      shaft: ['segmented'], head: ['ring', 'orbcage'], orbShell: ['gyro', 'halo'],
    },
    palette: { primary: 0xe0e6ee, secondary: 0x2a2e36, metal: 0x9aa8b8, energy: 0x3ad8ff },
    mods: { mul: { projectileSpeed: 1.25 }, add: { elementChance: 0.2 } },
    scope: 'digital', voice: 'arc',
  },
  maker: {
    name: 'Maker Relics', set: 'ascendant', classes: ['melee', 'magic', 'armor'], elementAffinity: 'frost',
    types: ['staff', 'wand', 'tome', 'scepter', 'orb', 'sword', 'greatsword'],
    blurb: 'Precursor tech. Nobody knows how it works. It knows you.',
    forms: {
      shaft: ['straight', 'twisted'], head: ['spire', 'crescent', 'cluster', 'prongs', 'ring'], cover: ['gilded', 'plain', 'eye'], orbShell: ['halo', 'gyro', 'shards'],
      blade: ['leaf', 'needle', 'straight', 'tapered'], guard: ['swept', 'disc', 'winged'], grip: ['filigree', 'wrapped'], pommel: ['gem', 'ring', 'disc'],
    },
    palette: { primary: 0xe8e0cc, secondary: 0x2a3a5a, metal: 0xf0c75e, energy: 0x9fe8ff },
    mods: { mul: { manaCost: 0.8, castRate: 1.08 }, add: { elementChance: 0.1 } },
    scope: 'crystal', voice: 'psi',
  },
};

export const MAKER_IDS = Object.keys(MANUFACTURERS);
export const manufacturersFor = (cls) => MAKER_IDS.filter((id) => MANUFACTURERS[id].classes.includes(cls));
export const makersOfType = (type) => MAKER_IDS.filter((id) => MANUFACTURERS[id].types.includes(type));
