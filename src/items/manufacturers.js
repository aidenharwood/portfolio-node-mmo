// Manufacturers give each item an identity: stat bias, palette, signature energy colour (the glow
// that runs through all their gear), element affinity, preferred component forms and flavour text.
// mods: { mul: {stat: factor}, add: {stat: amount} } — same format as parts and perks.
export const MANUFACTURERS = {
  ironhide: {
    name: 'Ironhide Forgeworks', classes: ['melee', 'armor'], blurb: 'Dwarf-forged. Magma-cored. Built to outlast you.',
    forms: { armorHead: ['helm', 'greathelm', 'horned'], armorChest: ['cuirass', 'brigandine'], armorHands: ['gauntlets'], armorLegs: ['greaves', 'sabatons'], spearHead: ['pike', 'winged'], hammerHead: ['block', 'flanged', 'warpick'], blade: ['broad', 'cleaver', 'falchion'], guard: ['heavy', 'bar'], grip: ['wrapped', 'ridged'], pommel: ['ball', 'spike'], axeHead: ['cleaver', 'wedge', 'splitter', 'bearded'], haft: ['banded', 'spiked', 'straight'] },
    palette: { primary: 0x5a5e6a, secondary: 0xb08a3e, metal: 0xc0c6d0, energy: 0xff8a2a },
    armorMods: { add: { armor: 0.0 }, mul: { armor: 1.2 } },
    mods: { mul: { damage: 1.18, attackSpeed: 0.88, knockback: 1.4 } },
  },
  vesper: {
    name: 'Vesper Lightworks', classes: ['melee', 'armor'], blurb: 'Elegance at the speed of light.',
    forms: { armorHead: ['circlet', 'hood'], armorChest: ['vest', 'mantle'], armorHands: ['gloves'], armorLegs: ['boots'], spearHead: ['leaf', 'glaive'], hammerHead: ['round', 'spiked'], blade: ['needle', 'tapered', 'sabre'], guard: ['swept', 'disc'], grip: ['filigree', 'wrapped'], pommel: ['ring', 'gem', 'disc'], axeHead: ['crescent', 'hook'], haft: ['straight', 'twisted'] },
    palette: { primary: 0xe8eef6, secondary: 0x2a2f4a, metal: 0xd8e2f0, energy: 0x6ae8ff },
    armorMods: { add: { critBonus: 0.015, moveSpeed: 0.02 } },
    mods: { mul: { damage: 0.92, attackSpeed: 1.15 }, add: { critChance: 0.08, critMult: 0.25 } },
  },
  emberfall: {
    name: 'Emberfall Kilnworks', classes: ['melee', 'magic', 'armor'], elementAffinity: 'fire', blurb: 'Everything burns eventually. We just help.',
    forms: { armorHead: ['horned', 'hood'], armorChest: ['brigandine', 'mantle'], armorHands: ['claws', 'bracers'], armorLegs: ['greaves'], spearHead: ['glaive', 'hooked', 'trident'], hammerHead: ['spiked', 'flanged'], orbShell: ['eye', 'shards'], blade: ['flamberge', 'leaf', 'tanto'], guard: ['winged', 'claw'], grip: ['ridged', 'bone'], pommel: ['gem', 'spike', 'skull'], axeHead: ['crescent', 'halberd', 'double'], haft: ['twisted', 'wrapped'], shaft: ['knotted', 'twisted'], head: ['cluster', 'claw', 'prongs'], cover: ['skull', 'gilded'] },
    palette: { primary: 0x3a1e18, secondary: 0x8a3b1e, metal: 0xffc27a, energy: 0xff5a1a },
    armorMods: { add: { resistFire: 0.15 } },
    mods: { mul: { elementPotency: 1.3 }, add: { elementChance: 0.15 } },
  },
  kessler: {
    name: 'Kessler Arcworks', classes: ['ranged'], blurb: 'Military-grade sorcery. One shot, one kill.',
    forms: { launcherTube: ['tube'], limbs: ['compound', 'heavy'], receiver: ['block', 'angular'], barrel: ['shrouded', 'vented', 'plain'], gunGrip: ['straight', 'raked'], stock: ['solid', 'padded'], magazine: ['straight', 'curved'] },
    palette: { primary: 0x3a4250, secondary: 0x1e2228, metal: 0xa8b0b8, energy: 0x7aff9a },
    mods: { mul: { damage: 1.22, fireRate: 0.8, magSize: 0.75, spread: 0.5 } },
  },
  rattlecap: {
    name: 'Rattlecap Tinkers', classes: ['ranged'], blurb: 'Goblin-built! Mostly doesn\'t explode!',
    forms: { launcherTube: ['drum', 'quad'], limbs: ['recurve', 'heavy'], receiver: ['boxy', 'rounded'], barrel: ['plain', 'flared'], gunGrip: ['wood', 'straight'], stock: ['wire', 'skeleton'], magazine: ['drum', 'straight', 'curved'] },
    palette: { primary: 0xd9a227, secondary: 0x4a3a2a, metal: 0x8a8a8a, energy: 0x9aff3a },
    mods: { mul: { damage: 0.8, fireRate: 1.35, magSize: 1.8, spread: 1.4, reloadTime: 1.15 } },
  },
  voltaic: {
    name: 'Voltaic Works', classes: ['ranged', 'magic'], elementAffinity: 'shock', blurb: 'Patent pending. Do not lick.',
    forms: { launcherTube: ['quad', 'tube'], limbs: ['compound'], orbShell: ['gyro', 'halo'], receiver: ['rounded', 'skeletal'], barrel: ['coil'], gunGrip: ['ergonomic'], stock: ['thumbhole', 'skeleton'], magazine: ['cell'], shaft: ['segmented'], head: ['ring', 'orbcage'], cover: ['eye', 'plain'] },
    palette: { primary: 0xe8e8f0, secondary: 0x2c5f9e, metal: 0x58cfff, energy: 0x58cfff },
    mods: { mul: { projectileSpeed: 1.25 }, add: { elementChance: 0.2 } },
  },
  aether: {
    name: 'Aether Guild', classes: ['magic', 'armor'], blurb: 'Certified arcane since the third age.',
    forms: { armorHead: ['wizard', 'circlet'], armorChest: ['robe', 'mantle'], armorHands: ['bracers', 'wraps'], armorLegs: ['wraps', 'boots'], orbShell: ['halo', 'gyro', 'shards'], shaft: ['straight', 'segmented'], head: ['ring', 'prongs', 'crescent', 'cluster'], cover: ['gilded', 'plain'] },
    palette: { primary: 0x5b3fa8, secondary: 0xe8d9a8, metal: 0xd6c3ff, energy: 0xd6a8ff },
    armorMods: { add: { manaRegen: 0.15 } },
    mods: { mul: { manaCost: 0.8, castRate: 1.15 } },
  },
  hollow: {
    name: 'Hollow Choir', classes: ['magic', 'armor'], elementAffinity: 'corrosive', blurb: 'Void-tuned. They sing so you don\'t have to.',
    forms: { armorHead: ['hood', 'horned'], armorChest: ['robe', 'vest'], armorHands: ['claws', 'wraps'], armorLegs: ['wraps', 'boots'], orbShell: ['eye', 'shards'], shaft: ['bone', 'knotted'], head: ['antler', 'branch', 'claw', 'orbcage'], cover: ['skull', 'studded'] },
    palette: { primary: 0x1e1a24, secondary: 0x4a3a5a, metal: 0xc6b8d8, energy: 0xb84aff },
    armorMods: { add: { resistCorrosive: 0.15 }, mul: { hp: 1.1 } },
    mods: { mul: { damage: 1.25, manaCost: 1.3, radius: 1.25 } },
  },
  rime: {
    name: 'Rimeworks', classes: ['melee', 'ranged', 'magic', 'armor'], elementAffinity: 'frost', blurb: 'Cryo-forged crystal. Keep cool. Keep killing.',
    forms: { armorHead: ['helm', 'circlet'], armorChest: ['cuirass', 'mantle'], armorHands: ['gauntlets', 'bracers'], armorLegs: ['sabatons', 'boots'], spearHead: ['leaf', 'trident'], hammerHead: ['round', 'block'], launcherTube: ['tube'], limbs: ['recurve', 'compound'], orbShell: ['shards', 'halo'], blade: ['straight', 'leaf', 'needle'], guard: ['winged', 'disc'], grip: ['wrapped', 'filigree'], pommel: ['gem', 'disc'], axeHead: ['double', 'crescent', 'halberd'], haft: ['straight', 'banded'], receiver: ['rounded', 'angular'], barrel: ['vented', 'coil'], gunGrip: ['raked', 'ergonomic'], stock: ['thumbhole', 'solid'], magazine: ['cell', 'straight'], shaft: ['segmented', 'straight'], head: ['cluster', 'spire', 'crescent'], cover: ['gilded', 'eye'] },
    palette: { primary: 0xcfe9f5, secondary: 0x355c7d, metal: 0xe8fbff, energy: 0xa8f0ff },
    armorMods: { add: { resistFrost: 0.15 } },
    mods: { add: { elementChance: 0.15 } },
  },
};

export const manufacturersFor = (cls) => Object.keys(MANUFACTURERS).filter((id) => MANUFACTURERS[id].classes.includes(cls));
