// Every enemy type: race, model, rig, fighting style (behaviour), stats at level 1, and its
// attacks as data. Sub-types (variants) override a few fields and unlock from a minimum level.
// Enemy.js runs them all through one state machine; races.js decides who lives where.
//
// behaviour  melee · swarm · shield · duelist · brute · ranged · lobber · support · caster ·
//            flyer · charger · pack · ambusher · boss
// attack     kind: swing · combo · bash · bite · charge · pounce · arrow · volley · bolt · burst ·
//            fan · lob · stomp · nova · ward · heal · howl · summon
//            range (max start distance) / min, windup, active, recover, cooldown, weight,
//            damage, knockback, plus kind-specific fields.
export const ENEMY_TYPES = {
  // ======================================================== Goblin warband: swarms, shields,
  // bombs and a shaman holding it together, with ogres as hired muscle.
  cutter: {
    race: 'goblin', name: 'Goblin Cutter', model: 'goblin:cutter', rig: 'biped', behavior: 'swarm',
    hp: 40, radius: 0.42, height: 1.4, speed: 4.6, mass: 1, poise: 0, staggerTime: 0.4,
    xp: 10, gold: [2, 5], dropChance: 0.07, cooldown: [0.2, 0.8],
    attacks: [
      { id: 'slash', kind: 'swing', range: 1.7, windup: 0.4, active: 0.12, recover: 0.45, damage: 7, arc: 100, knockback: 5, lunge: 5 },
      { id: 'flurry', kind: 'combo', range: 1.7, hits: 2, windup: 0.32, active: 0.1, recover: 0.5, damage: 5, arc: 90, knockback: 3, lunge: 4, cooldown: 4, weight: 0.4 },
    ],
    variants: { scrapper: { name: 'Goblin Scrapper', minLevel: 4, hpMul: 1.5, dmgMul: 1.3, scale: 1.08, model: 'goblin:scrapper', speedMul: 1.1 } },
  },
  shieldbasher: {
    race: 'goblin', name: 'Goblin Shieldbasher', model: 'goblin:shield', rig: 'biped', behavior: 'shield',
    hp: 70, radius: 0.5, height: 1.45, speed: 3.2, mass: 1.6, poise: 25, staggerTime: 0.5,
    xp: 16, gold: [3, 7], dropChance: 0.1, cooldown: [0.4, 1.0], block: 0.65,
    attacks: [
      { id: 'mace', kind: 'swing', range: 1.9, windup: 0.55, active: 0.14, recover: 0.6, damage: 10, arc: 110, knockback: 7, lunge: 3 },
      { id: 'bash', kind: 'bash', range: 4.5, min: 2.2, windup: 0.6, active: 0.3, recover: 0.8, damage: 8, arc: 70, knockback: 13, lunge: 12, cooldown: 4 },
    ],
    variants: { ironclad: { name: 'Goblin Ironclad', minLevel: 5, hpMul: 1.6, dmgMul: 1.2, block: 0.8, model: 'goblin:ironclad', scale: 1.1 } },
  },
  sapper: {
    race: 'goblin', name: 'Goblin Sapper', model: 'goblin:sapper', rig: 'biped', behavior: 'lobber',
    hp: 32, radius: 0.42, height: 1.4, speed: 3.6, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 13, gold: [3, 6], dropChance: 0.09, cooldown: [0.6, 1.4], keepAway: 9,
    attacks: [{ id: 'bomb', kind: 'lob', range: 18, min: 5, windup: 0.7, active: 0.1, recover: 0.8, damage: 16, radius: 2.6, fuse: 0.9, knockback: 9, cooldown: 2.2 }],
    variants: { firebomber: { name: 'Goblin Firebomber', minLevel: 4, element: 'fire', dmgMul: 1.15, model: 'goblin:firebomber', radiusMul: 1.15 } },
  },
  shaman: {
    race: 'goblin', name: 'Goblin Shaman', model: 'goblin:shaman', rig: 'biped', behavior: 'support',
    hp: 38, radius: 0.42, height: 1.45, speed: 3.4, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 15, gold: [4, 8], dropChance: 0.12, cooldown: [0.5, 1.2], keepAway: 8,
    attacks: [
      { id: 'ward', kind: 'ward', range: 14, windup: 0.6, active: 0.1, recover: 0.6, duration: 6, reduce: 0.5, cooldown: 7, weight: 3 },
      { id: 'mend', kind: 'heal', range: 14, windup: 0.8, active: 0.1, recover: 0.6, amount: 0.25, radius: 8, cooldown: 9, weight: 2 },
      { id: 'zap', kind: 'bolt', proj: 'energy', range: 14, windup: 0.6, active: 0.1, recover: 0.6, damage: 6, speed: 26, count: 1, cooldown: 1.5 },
    ],
    variants: { spark: { name: 'Spark Shaman', minLevel: 5, element: 'shock', dmgMul: 1.3, model: 'goblin:spark' } },
  },
  brute: {
    race: 'goblin', name: 'Ogre Bruiser', model: 'ogre', rig: 'biped', behavior: 'brute',
    hp: 160, radius: 0.8, height: 2.7, speed: 2.5, mass: 2.5, poise: 35, staggerTime: 0.8,
    xp: 35, gold: [8, 15], dropChance: 0.3, cooldown: [0.8, 1.6],
    attacks: [
      { id: 'smash', kind: 'swing', range: 2.7, windup: 0.95, active: 0.18, recover: 1.0, damage: 22, arc: 140, knockback: 14, lunge: 3, overhead: true },
      { id: 'quake', kind: 'stomp', range: 4, windup: 1.1, active: 0.1, recover: 1.0, damage: 18, radius: 4.5, knockback: 14, cooldown: 7, minLevel: 6 },
    ],
  },
  warlord: {
    race: 'goblin', name: 'Ogre Warlord', model: 'ogre:boss', rig: 'biped', behavior: 'boss', boss: true, scale: 1.3,
    hp: 1100, radius: 1.05, height: 3.6, speed: 2.9, mass: 6, poise: 140, staggerTime: 1.0,
    xp: 250, gold: [80, 120], dropChance: 1, cooldown: [0.6, 1.2],
    attacks: [
      { id: 'smash', kind: 'swing', range: 3.6, windup: 0.85, active: 0.2, recover: 0.9, damage: 30, arc: 150, knockback: 16, lunge: 4, overhead: true },
      { id: 'stomp', kind: 'stomp', range: 5, windup: 1.2, active: 0.1, recover: 1.1, damage: 34, radius: 6, knockback: 18, cooldown: 6 },
      { id: 'rally', kind: 'summon', range: 30, windup: 1.0, active: 0.1, recover: 0.8, summon: 'cutter', count: 3, maxMinions: 4, cooldown: 18, hpBelow: 0.7 },
    ],
  },

  // ======================================================== The Hollow: the void-touched dead.
  // Shamblers that close in, archers behind them, floating wraiths, armoured revenants.
  husk: {
    race: 'hollow', name: 'Hollow Husk', model: 'hollow:husk', rig: 'biped', behavior: 'melee',
    hp: 55, radius: 0.45, height: 1.8, speed: 2.7, mass: 1.2, poise: 10, staggerTime: 0.5,
    xp: 12, gold: [2, 5], dropChance: 0.08, cooldown: [0.3, 1.0],
    attacks: [{ id: 'claw', kind: 'swing', range: 1.8, windup: 0.55, active: 0.14, recover: 0.6, damage: 8, arc: 110, knockback: 4, lunge: 6 }],
    variants: { bloated: { name: 'Bloated Husk', minLevel: 3, hpMul: 1.3, scale: 1.15, model: 'hollow:bloated', deathBurst: { radius: 2.8, damage: 14, element: 'corrosive' } } },
  },
  bonearcher: {
    race: 'hollow', name: 'Bone Archer', model: 'hollow:archer', rig: 'biped', behavior: 'ranged',
    hp: 34, radius: 0.42, height: 1.8, speed: 3.3, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 12, gold: [3, 6], dropChance: 0.09, cooldown: [0.8, 1.6], keepAway: 8, bow: true,
    attacks: [{ id: 'shot', kind: 'arrow', range: 20, windup: 0.95, active: 0.1, recover: 0.6, damage: 9, speed: 30, knockback: 4 }],
    variants: { marksman: { name: 'Bone Marksman', minLevel: 5, model: 'hollow:marksman', attack: { id: 'shot', windup: 1.3, damage: 16, speed: 46, range: 26, pierce: 1 } } },
  },
  wraith: {
    race: 'hollow', name: 'Wraith', model: 'hollow:wraith', rig: 'hover', behavior: 'caster', hover: 0.3,
    hp: 45, radius: 0.5, height: 2.0, speed: 3.6, mass: 0.8, poise: 0, staggerTime: 0.4,
    xp: 16, gold: [4, 8], dropChance: 0.12, cooldown: [0.6, 1.3], keepAway: 9, blink: { range: 4, distance: 8, cooldown: 4 },
    attacks: [{ id: 'void', kind: 'bolt', proj: 'void', range: 16, windup: 0.8, active: 0.1, recover: 0.7, damage: 7, speed: 11, count: 3, fan: 0.35, homing: 2.2, cooldown: 1.6 }],
    variants: { shade: { name: 'Frost Shade', minLevel: 4, element: 'frost', model: 'hollow:shade', dmgMul: 1.15 } },
  },
  revenant: {
    race: 'hollow', name: 'Revenant', model: 'hollow:revenant', rig: 'biped', behavior: 'duelist',
    hp: 120, radius: 0.55, height: 2.0, speed: 3.3, mass: 1.8, poise: 40, staggerTime: 0.6,
    xp: 30, gold: [6, 12], dropChance: 0.22, cooldown: [0.4, 0.9], block: 0.7,
    attacks: [
      { id: 'cut', kind: 'combo', range: 2.1, hits: 2, windup: 0.5, active: 0.12, recover: 0.7, damage: 12, arc: 120, knockback: 6, lunge: 6 },
      { id: 'lunge', kind: 'bash', range: 5, min: 2.5, windup: 0.6, active: 0.25, recover: 0.8, damage: 14, arc: 50, knockback: 9, lunge: 14, cooldown: 5, stab: true },
    ],
    variants: { captain: { name: 'Revenant Captain', minLevel: 7, hpMul: 1.5, dmgMul: 1.25, scale: 1.12, model: 'hollow:captain', attack: { id: 'cut', hits: 3 } } },
  },
  hollowking: {
    race: 'hollow', name: 'The Hollow King', model: 'hollow:king', rig: 'biped', behavior: 'boss', boss: true, scale: 1.25,
    hp: 1300, radius: 0.95, height: 3.2, speed: 3.0, mass: 5, poise: 130, staggerTime: 1.0, block: 0.4,
    xp: 270, gold: [90, 130], dropChance: 1, cooldown: [0.5, 1.0],
    attacks: [
      { id: 'reap', kind: 'combo', range: 3.2, hits: 3, windup: 0.7, active: 0.16, recover: 0.9, damage: 24, arc: 150, knockback: 10, lunge: 6 },
      { id: 'nova', kind: 'nova', range: 6, windup: 1.2, active: 0.1, recover: 1.0, damage: 26, radius: 7, knockback: 14, element: 'corrosive', cooldown: 8 },
      { id: 'void', kind: 'bolt', proj: 'void', range: 22, min: 6, windup: 0.9, active: 0.1, recover: 0.8, damage: 12, speed: 12, count: 5, fan: 0.6, homing: 2, cooldown: 6 },
      { id: 'raise', kind: 'summon', range: 30, windup: 1.2, active: 0.1, recover: 0.8, summon: 'husk', count: 3, maxMinions: 5, cooldown: 16, hpBelow: 0.75 },
    ],
  },

  // ======================================================== Arcane constructs: rogue machines.
  // Drones that strafe and shoot, striders that charge, bulwarks that shell you from range.
  sentry: {
    race: 'construct', name: 'Sentry Drone', model: 'construct:sentry', rig: 'hover', behavior: 'flyer', hover: 2.0,
    hp: 30, radius: 0.55, height: 1.0, speed: 5.5, mass: 0.6, poise: 0, staggerTime: 0.35,
    xp: 12, gold: [3, 7], dropChance: 0.1, cooldown: [0.5, 1.1], orbit: 11,
    attacks: [{ id: 'burst', kind: 'burst', proj: 'energy', range: 20, windup: 0.5, active: 0.45, recover: 0.6, damage: 5, speed: 40, count: 3, cooldown: 1.2 }],
    variants: { arc: { name: 'Arc Sentry', minLevel: 4, element: 'shock', model: 'construct:arcsentry', dmgMul: 1.1 } },
  },
  stalker: {
    race: 'construct', name: 'Strider', model: 'construct:stalker', rig: 'biped', behavior: 'charger',
    hp: 90, radius: 0.55, height: 2.0, speed: 4.2, mass: 2, poise: 30, staggerTime: 0.5,
    xp: 24, gold: [5, 10], dropChance: 0.18, cooldown: [0.5, 1.1],
    attacks: [
      { id: 'blade', kind: 'swing', range: 2.0, windup: 0.5, active: 0.12, recover: 0.6, damage: 11, arc: 120, knockback: 6, lunge: 6 },
      { id: 'charge', kind: 'charge', range: 18, min: 6, windup: 0.9, active: 1.0, recover: 1.4, damage: 18, speed: 17, knockback: 15, cooldown: 5 },
    ],
  },
  bulwark: {
    race: 'construct', name: 'Bulwark', model: 'construct:bulwark', rig: 'biped', behavior: 'brute', hunchless: true,
    hp: 220, radius: 0.9, height: 2.8, speed: 1.9, mass: 3.5, poise: 60, staggerTime: 0.7,
    xp: 40, gold: [9, 16], dropChance: 0.32, cooldown: [0.8, 1.5],
    attacks: [
      { id: 'mortar', kind: 'lob', range: 26, min: 7, windup: 1.0, active: 0.1, recover: 1.0, damage: 20, radius: 3.2, fuse: 0.7, knockback: 12, cooldown: 3, element: 'shock' },
      { id: 'quake', kind: 'stomp', range: 4.2, windup: 1.0, active: 0.1, recover: 1.0, damage: 18, radius: 4.2, knockback: 14, cooldown: 4 },
    ],
    variants: { siege: { name: 'Siege Bulwark', minLevel: 6, hpMul: 1.4, dmgMul: 1.25, scale: 1.1, model: 'construct:siege' } },
  },
  colossus: {
    race: 'construct', name: 'The Colossus', model: 'construct:colossus', rig: 'biped', behavior: 'boss', boss: true, scale: 1.0,
    hp: 1500, radius: 1.4, height: 4.6, speed: 2.4, mass: 8, poise: 160, staggerTime: 1.0,
    xp: 300, gold: [100, 150], dropChance: 1, cooldown: [0.6, 1.1],
    attacks: [
      { id: 'stomp', kind: 'stomp', range: 6, windup: 1.1, active: 0.1, recover: 1.0, damage: 30, radius: 6.5, knockback: 18, cooldown: 5 },
      { id: 'barrage', kind: 'lob', range: 30, min: 6, windup: 1.2, active: 0.1, recover: 1.0, damage: 22, radius: 3.4, fuse: 0.8, knockback: 12, count: 3, cooldown: 6, element: 'shock' },
      { id: 'fan', kind: 'fan', proj: 'energy', range: 24, windup: 0.9, active: 0.1, recover: 0.9, damage: 10, speed: 34, count: 7, fan: 1.0, cooldown: 4 },
      { id: 'deploy', kind: 'summon', range: 30, windup: 1.0, active: 0.1, recover: 0.8, summon: 'sentry', count: 2, maxMinions: 4, cooldown: 16, hpBelow: 0.8 },
    ],
  },

  // ======================================================== The Wild: beasts that hunt together.
  wolf: {
    race: 'beast', name: 'Dire Wolf', model: 'beast:wolf', rig: 'quad', behavior: 'pack',
    hp: 38, radius: 0.55, height: 1.1, speed: 6.6, mass: 1, poise: 0, staggerTime: 0.35,
    xp: 11, gold: [1, 4], dropChance: 0.06, cooldown: [0.4, 1.2],
    attacks: [{ id: 'bite', kind: 'bite', range: 2.4, windup: 0.28, active: 0.14, recover: 0.5, damage: 7, arc: 70, knockback: 4, lunge: 11 }],
    variants: { frostfang: { name: 'Frostfang', minLevel: 4, element: 'frost', model: 'beast:frostwolf', hpMul: 1.2 } },
  },
  alpha: {
    race: 'beast', name: 'Alpha Wolf', model: 'beast:alpha', rig: 'quad', behavior: 'pack', scale: 1.25,
    hp: 95, radius: 0.7, height: 1.4, speed: 6.6, mass: 1.8, poise: 25, staggerTime: 0.5,
    xp: 28, gold: [4, 9], dropChance: 0.2, cooldown: [0.4, 1.0],
    attacks: [
      { id: 'bite', kind: 'bite', range: 2.7, windup: 0.3, active: 0.16, recover: 0.5, damage: 11, arc: 80, knockback: 7, lunge: 12 },
      { id: 'howl', kind: 'howl', range: 40, windup: 0.8, active: 0.2, recover: 0.6, duration: 8, radius: 16, cooldown: 14, weight: 3 },
    ],
  },
  spider: {
    race: 'beast', name: 'Thicket Spider', model: 'beast:spider', rig: 'spider', behavior: 'ambusher',
    hp: 42, radius: 0.7, height: 0.9, speed: 5.2, mass: 1, poise: 0, staggerTime: 0.4,
    xp: 13, gold: [2, 5], dropChance: 0.08, cooldown: [0.5, 1.2], keepAway: 7,
    attacks: [
      { id: 'web', kind: 'bolt', proj: 'web', range: 14, min: 4, windup: 0.6, active: 0.1, recover: 0.6, damage: 4, speed: 20, count: 1, status: 'frost', cooldown: 3 },
      { id: 'pounce', kind: 'pounce', range: 10, min: 4.5, windup: 0.5, active: 0.55, recover: 0.6, damage: 10, arc: 360, knockback: 8, cooldown: 4 },
      { id: 'bite', kind: 'bite', range: 1.9, windup: 0.35, active: 0.12, recover: 0.5, damage: 8, arc: 90, knockback: 3, lunge: 6, element: 'corrosive' },
    ],
    variants: { venom: { name: 'Venom Spider', minLevel: 4, element: 'corrosive', model: 'beast:venom', dmgMul: 1.2 } },
  },
  tusker: {
    race: 'beast', name: 'Tusker', model: 'beast:tusker', rig: 'quad', behavior: 'charger',
    hp: 110, radius: 0.8, height: 1.3, speed: 4.0, mass: 2.4, poise: 30, staggerTime: 0.5,
    xp: 22, gold: [3, 8], dropChance: 0.15, cooldown: [0.6, 1.2],
    attacks: [
      { id: 'gore', kind: 'bite', range: 2.4, windup: 0.45, active: 0.14, recover: 0.6, damage: 10, arc: 80, knockback: 9, lunge: 7 },
      { id: 'charge', kind: 'charge', range: 18, min: 6, windup: 0.8, active: 1.1, recover: 1.2, damage: 16, speed: 15, knockback: 16, cooldown: 5 },
    ],
    variants: { ironhide: { name: 'Ironhide Tusker', minLevel: 5, hpMul: 1.5, model: 'beast:ironhide', poise: 60, scale: 1.12 } },
  },
  ursa: {
    race: 'beast', name: 'Elder Ursa', model: 'beast:ursa', rig: 'quad', behavior: 'boss', boss: true, scale: 1.0,
    hp: 1250, radius: 1.3, height: 2.6, speed: 3.6, mass: 7, poise: 140, staggerTime: 1.0,
    xp: 260, gold: [80, 120], dropChance: 1, cooldown: [0.5, 1.0],
    attacks: [
      { id: 'maul', kind: 'combo', range: 3.2, hits: 2, windup: 0.6, active: 0.16, recover: 0.8, damage: 24, arc: 130, knockback: 10, lunge: 6 },
      { id: 'charge', kind: 'charge', range: 20, min: 7, windup: 0.9, active: 1.2, recover: 1.3, damage: 30, speed: 15, knockback: 20, cooldown: 7 },
      { id: 'rear', kind: 'stomp', range: 5, windup: 1.2, active: 0.1, recover: 1.1, damage: 32, radius: 5.5, knockback: 18, cooldown: 6, rear: true },
      { id: 'call', kind: 'summon', range: 30, windup: 1.0, active: 0.2, recover: 0.6, summon: 'wolf', count: 3, maxMinions: 4, cooldown: 18, hpBelow: 0.7, howl: true },
    ],
  },
};

// Resolves a type + optional variant into one definition.
export function resolveType(typeName, variant = null) {
  const base = ENEMY_TYPES[typeName];
  const v = variant ? base.variants?.[variant] : null;
  if (!v) return { ...base, variant: null };
  const attacks = base.attacks.map((a) => (v.attack && v.attack.id === a.id ? { ...a, ...v.attack } : { ...a }));
  return {
    ...base, ...v, attacks, variant,
    hp: base.hp * (v.hpMul ?? 1),
    speed: base.speed * (v.speedMul ?? 1),
    scale: (base.scale ?? 1) * (v.scale ?? 1),
    dmgMul: v.dmgMul ?? 1,
    radiusMul: v.radiusMul ?? 1,
    xp: Math.round(base.xp * (v.hpMul ?? 1) * (v.dmgMul ?? 1)),
  };
}
