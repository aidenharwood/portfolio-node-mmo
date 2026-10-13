// Every enemy type: race (faction), model, rig, fighting style (behaviour), stats at level 1, and
// its attacks as data. Sub-types (variants) override a few fields and unlock from a minimum level.
// Enemy.js runs them all through one state machine; races.js decides who lives where.
//
// behaviour  melee · swarm · shield · duelist · brute · ranged · lobber · support · caster ·
//            flyer · charger · pack · ambusher · boss
// attack     kind: swing · combo · bash · bite · charge · pounce · arrow · volley · bolt · burst ·
//            fan · lob · stomp · nova · ward · heal · howl · summon
//            range (max start distance) / min, windup, active, recover, cooldown, weight,
//            damage, knockback, proj (how a shot looks: spine · acid · energy · psi · web),
//            plus kind-specific fields.
// look       (bipeds) stance: rest · staff · reach · gun — how the arms are held between attacks;
//            hunch (stoop), armSwing (walking), offPose ('cast': the off arm raised too);
//            muzzle { y, f, tip }: where shots leave — y × height up, f metres forward (the
//            sim's estimate), or tip metres out along the weapon (as the view draws it).
export const ENEMY_TYPES = {
  // ======================================================== The Scav clans: raiders in salvaged
  // armour. Blade swarms, riot shields, grenades and a tech holding it together, with
  // exo-suited juggernauts as the heavy muscle.
  cutter: {
    race: 'scav', name: 'Scav Cutter', model: 'scav:cutter', rig: 'biped', behavior: 'swarm', hunch: 0.12,
    hp: 48, radius: 0.44, height: 1.95, speed: 4.6, mass: 1, poise: 0, staggerTime: 0.4,
    xp: 10, gold: [2, 5], dropChance: 0.07, cooldown: [0.2, 0.8],
    attacks: [
      { id: 'slash', kind: 'swing', range: 1.8, windup: 0.4, active: 0.12, recover: 0.45, damage: 13, arc: 100, knockback: 5, lunge: 5 },
      { id: 'flurry', kind: 'combo', range: 1.8, hits: 2, windup: 0.32, active: 0.1, recover: 0.5, damage: 10, arc: 90, knockback: 3, lunge: 4, cooldown: 4, weight: 0.4 },
    ],
    variants: { ripper: { name: 'Scav Ripper', minLevel: 4, hpMul: 1.5, dmgMul: 1.3, scale: 1.06, model: 'scav:ripper', speedMul: 1.1 } },
  },
  breacher: {
    race: 'scav', name: 'Scav Breacher', model: 'scav:breacher', rig: 'biped', behavior: 'shield', hunch: 0.06,
    hp: 84, radius: 0.5, height: 1.95, speed: 3.2, mass: 1.6, poise: 25, staggerTime: 0.5,
    xp: 16, gold: [3, 7], dropChance: 0.1, cooldown: [0.4, 1.0], block: 0.65,
    attacks: [
      { id: 'maul', kind: 'swing', range: 1.9, windup: 0.55, active: 0.14, recover: 0.6, damage: 19, arc: 110, knockback: 7, lunge: 3 },
      { id: 'bash', kind: 'bash', range: 4.5, min: 2.2, windup: 0.6, active: 0.3, recover: 0.8, damage: 15, arc: 70, knockback: 13, lunge: 12, cooldown: 4 },
    ],
    variants: { ironclad: { name: 'Ironclad Breacher', minLevel: 5, hpMul: 1.6, dmgMul: 1.2, block: 0.8, model: 'scav:ironclad', scale: 1.08 } },
  },
  grenadier: {
    race: 'scav', name: 'Scav Grenadier', model: 'scav:grenadier', rig: 'biped', behavior: 'lobber', hunch: 0.08,
    hp: 38, radius: 0.44, height: 1.95, speed: 3.6, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 13, gold: [3, 6], dropChance: 0.09, cooldown: [0.6, 1.4], keepAway: 9,
    attacks: [{ id: 'grenade', kind: 'lob', range: 18, min: 5, windup: 0.7, active: 0.1, recover: 0.8, damage: 30, radius: 2.6, fuse: 0.9, knockback: 9, cooldown: 2.2 }],
    variants: { firebomber: { name: 'Scav Firebomber', minLevel: 4, element: 'fire', dmgMul: 1.15, model: 'scav:firebomber', radiusMul: 1.15 } },
  },
  tech: {
    race: 'scav', name: 'Scav Tech', model: 'scav:tech', rig: 'biped', behavior: 'support', stance: 'staff', hunch: 0.06,
    muzzle: { y: 0.85, f: 0.9, tip: 1.15 },
    hp: 46, radius: 0.44, height: 1.95, speed: 3.4, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 15, gold: [4, 8], dropChance: 0.12, cooldown: [0.5, 1.2], keepAway: 8,
    attacks: [
      { id: 'shield', kind: 'ward', range: 14, windup: 0.6, active: 0.1, recover: 0.6, duration: 6, reduce: 0.5, cooldown: 7, weight: 3 },
      { id: 'repair', kind: 'heal', range: 14, windup: 0.8, active: 0.1, recover: 0.6, amount: 0.25, radius: 8, cooldown: 9, weight: 2 },
      { id: 'zap', kind: 'bolt', proj: 'energy', range: 14, windup: 0.6, active: 0.1, recover: 0.6, damage: 11, speed: 26, count: 1, cooldown: 1.5 },
    ],
    variants: { arctech: { name: 'Scav Arc Tech', minLevel: 5, element: 'shock', dmgMul: 1.3, model: 'scav:arctech' } },
  },
  juggernaut: {
    race: 'scav', name: 'Scav Juggernaut', model: 'scav:juggernaut', rig: 'biped', behavior: 'brute', hunch: 0.1,
    hp: 192, radius: 0.8, height: 2.7, speed: 2.5, mass: 2.5, poise: 35, staggerTime: 0.8,
    xp: 35, gold: [8, 15], dropChance: 0.3, cooldown: [0.8, 1.6],
    attacks: [
      { id: 'smash', kind: 'swing', range: 2.7, windup: 0.95, active: 0.18, recover: 1.0, damage: 42, arc: 140, knockback: 14, lunge: 3, overhead: true },
      { id: 'quake', kind: 'stomp', range: 4, windup: 1.1, active: 0.1, recover: 1.0, damage: 34, radius: 4.5, knockback: 14, cooldown: 7, minLevel: 6 },
    ],
  },
  warlord: {
    race: 'scav', name: 'Scav Warlord', model: 'scav:warlord', rig: 'biped', behavior: 'boss', boss: true, scale: 1.3, hunch: 0.08,
    hp: 1320, radius: 1.05, height: 3.6, speed: 2.9, mass: 6, poise: 140, staggerTime: 1.0,
    xp: 250, gold: [80, 120], dropChance: 1, cooldown: [0.6, 1.2],
    attacks: [
      { id: 'smash', kind: 'swing', range: 3.6, windup: 0.85, active: 0.2, recover: 0.9, damage: 57, arc: 150, knockback: 16, lunge: 4, overhead: true },
      { id: 'stomp', kind: 'stomp', range: 5, windup: 1.2, active: 0.1, recover: 1.1, damage: 65, radius: 6, knockback: 18, cooldown: 6 },
      { id: 'rally', kind: 'summon', range: 30, windup: 1.0, active: 0.1, recover: 0.8, summon: 'cutter', count: 3, maxMinions: 4, cooldown: 18, hpBelow: 0.7 },
    ],
  },

  // ======================================================== The Hive: alien insectoids that came
  // down with the old ships and breed. Scythed drones close in, spitters behind them, psions
  // floating over it all, shielded praetorians, and the queen.
  drone: {
    race: 'hive', name: 'Hive Drone', model: 'hive:drone', rig: 'biped', behavior: 'melee',
    stance: 'reach', offPose: 'cast', hunch: 0.38, armSwing: 0.15,
    hp: 66, radius: 0.45, height: 1.8, speed: 2.7, mass: 1.2, poise: 10, staggerTime: 0.5,
    xp: 12, gold: [2, 5], dropChance: 0.08, cooldown: [0.3, 1.0],
    attacks: [{ id: 'scythe', kind: 'swing', range: 1.9, windup: 0.55, active: 0.14, recover: 0.6, damage: 15, arc: 110, knockback: 4, lunge: 6 }],
    variants: { bloater: { name: 'Hive Bloater', minLevel: 3, hpMul: 1.3, scale: 1.1, hunch: 0.26, model: 'hive:bloater', deathBurst: { radius: 2.8, damage: 27, element: 'corrosive' } } },
  },
  spitter: {
    race: 'hive', name: 'Hive Spitter', model: 'hive:spitter', rig: 'biped', behavior: 'ranged', stance: 'gun', hunch: 0.2,
    muzzle: { y: 0.72, f: 0.75, tip: 0.36 },
    hp: 41, radius: 0.44, height: 1.8, speed: 3.3, mass: 1, poise: 0, staggerTime: 0.45,
    xp: 12, gold: [3, 6], dropChance: 0.09, cooldown: [0.8, 1.6], keepAway: 8,
    attacks: [{ id: 'spit', kind: 'arrow', proj: 'acid', range: 20, windup: 0.95, active: 0.1, recover: 0.6, damage: 17, speed: 26, knockback: 4 }],
    variants: {
      lancer: {
        name: 'Hive Lancer', minLevel: 5, model: 'hive:lancer', muzzle: { y: 0.72, f: 1.0, tip: 0.58 },
        attack: { id: 'spit', proj: 'spine', windup: 1.3, damage: 30, speed: 46, range: 26, pierce: 1 },
      },
    },
  },
  psion: {
    race: 'hive', name: 'Hive Psion', model: 'hive:psion', rig: 'hover', behavior: 'caster', hover: 0.3,
    hp: 54, radius: 0.5, height: 2.0, speed: 3.6, mass: 0.8, poise: 0, staggerTime: 0.4,
    xp: 16, gold: [4, 8], dropChance: 0.12, cooldown: [0.6, 1.3], keepAway: 9, blink: { range: 4, distance: 8, cooldown: 4 },
    attacks: [{ id: 'psi', kind: 'bolt', proj: 'psi', range: 16, windup: 0.8, active: 0.1, recover: 0.7, damage: 13, speed: 11, count: 3, fan: 0.35, homing: 2.2, cooldown: 1.6 }],
    variants: { cryo: { name: 'Cryo Psion', minLevel: 4, element: 'frost', model: 'hive:cryo', dmgMul: 1.15 } },
  },
  praetorian: {
    race: 'hive', name: 'Hive Praetorian', model: 'hive:praetorian', rig: 'biped', behavior: 'duelist', hunch: 0.1,
    hp: 144, radius: 0.55, height: 2.15, speed: 3.3, mass: 1.8, poise: 40, staggerTime: 0.6,
    xp: 30, gold: [6, 12], dropChance: 0.22, cooldown: [0.4, 0.9], block: 0.7,
    attacks: [
      { id: 'cut', kind: 'combo', range: 2.2, hits: 2, windup: 0.5, active: 0.12, recover: 0.7, damage: 23, arc: 120, knockback: 6, lunge: 6 },
      { id: 'lunge', kind: 'bash', range: 5, min: 2.5, windup: 0.6, active: 0.25, recover: 0.8, damage: 27, arc: 50, knockback: 9, lunge: 14, cooldown: 5, stab: true },
    ],
    variants: { champion: { name: 'Praetorian Champion', minLevel: 7, hpMul: 1.5, dmgMul: 1.25, scale: 1.1, model: 'hive:champion', attack: { id: 'cut', hits: 3 } } },
  },
  queen: {
    race: 'hive', name: 'The Hive Queen', model: 'hive:queen', rig: 'biped', behavior: 'boss', boss: true, scale: 1.25, hunch: 0.06,
    hp: 1560, radius: 0.95, height: 3.2, speed: 3.0, mass: 5, poise: 130, staggerTime: 1.0, block: 0.4,
    xp: 270, gold: [90, 130], dropChance: 1, cooldown: [0.5, 1.0],
    attacks: [
      { id: 'reap', kind: 'combo', range: 3.4, hits: 3, windup: 0.7, active: 0.16, recover: 0.9, damage: 46, arc: 150, knockback: 10, lunge: 6 },
      { id: 'scream', kind: 'nova', range: 6, windup: 1.2, active: 0.1, recover: 1.0, damage: 49, radius: 7, knockback: 14, element: 'corrosive', cooldown: 8 },
      { id: 'psi', kind: 'bolt', proj: 'psi', range: 22, min: 6, windup: 0.9, active: 0.1, recover: 0.8, damage: 23, speed: 12, count: 5, fan: 0.6, homing: 2, cooldown: 6 },
      { id: 'brood', kind: 'summon', range: 30, windup: 1.2, active: 0.1, recover: 0.8, summon: 'drone', count: 3, maxMinions: 5, cooldown: 16, hpBelow: 0.75 },
    ],
  },

  // ======================================================== The Synths: war machines nobody
  // switched off. Sentries that strafe and shoot, stalkers that charge, bulwarks that shell
  // you from range, and the Colossus.
  sentry: {
    race: 'synth', name: 'Synth Sentry', model: 'synth:sentry', rig: 'hover', behavior: 'flyer', hover: 2.0,
    hp: 36, radius: 0.55, height: 1.0, speed: 5.5, mass: 0.6, poise: 0, staggerTime: 0.35,
    xp: 12, gold: [3, 7], dropChance: 0.1, cooldown: [0.5, 1.1], orbit: 11,
    attacks: [{ id: 'burst', kind: 'burst', proj: 'energy', range: 20, windup: 0.5, active: 0.45, recover: 0.6, damage: 10, speed: 40, count: 3, cooldown: 1.2 }],
    variants: { arc: { name: 'Arc Sentry', minLevel: 4, element: 'shock', model: 'synth:arc', dmgMul: 1.1 } },
  },
  stalker: {
    race: 'synth', name: 'Synth Stalker', model: 'synth:stalker', rig: 'biped', behavior: 'charger', hunch: 0.18,
    hp: 108, radius: 0.55, height: 2.05, speed: 4.2, mass: 2, poise: 30, staggerTime: 0.5,
    xp: 24, gold: [5, 10], dropChance: 0.18, cooldown: [0.5, 1.1],
    attacks: [
      { id: 'blade', kind: 'swing', range: 2.0, windup: 0.5, active: 0.12, recover: 0.6, damage: 21, arc: 120, knockback: 6, lunge: 6 },
      { id: 'charge', kind: 'charge', range: 18, min: 6, windup: 0.9, active: 1.0, recover: 1.4, damage: 34, speed: 17, knockback: 15, cooldown: 5 },
    ],
  },
  bulwark: {
    race: 'synth', name: 'Synth Bulwark', model: 'synth:bulwark', rig: 'biped', behavior: 'brute', muzzle: { y: 0.95, f: -0.3 },
    hp: 264, radius: 0.9, height: 2.8, speed: 1.9, mass: 3.5, poise: 60, staggerTime: 0.7,
    xp: 40, gold: [9, 16], dropChance: 0.32, cooldown: [0.8, 1.5],
    attacks: [
      { id: 'mortar', kind: 'lob', range: 26, min: 7, windup: 1.0, active: 0.1, recover: 1.0, damage: 38, radius: 3.2, fuse: 0.7, knockback: 12, cooldown: 3, element: 'shock' },
      { id: 'quake', kind: 'stomp', range: 4.2, windup: 1.0, active: 0.1, recover: 1.0, damage: 34, radius: 4.2, knockback: 14, cooldown: 4 },
    ],
    variants: { siege: { name: 'Siege Bulwark', minLevel: 6, hpMul: 1.4, dmgMul: 1.25, scale: 1.1, model: 'synth:siege' } },
  },
  colossus: {
    race: 'synth', name: 'The Colossus', model: 'synth:colossus', rig: 'biped', behavior: 'boss', boss: true, scale: 1.0, muzzle: { y: 0.95, f: -0.3 },
    hp: 1800, radius: 1.4, height: 4.6, speed: 2.4, mass: 8, poise: 160, staggerTime: 1.0,
    xp: 300, gold: [100, 150], dropChance: 1, cooldown: [0.6, 1.1],
    attacks: [
      { id: 'stomp', kind: 'stomp', range: 6, windup: 1.1, active: 0.1, recover: 1.0, damage: 57, radius: 6.5, knockback: 18, cooldown: 5 },
      { id: 'barrage', kind: 'lob', range: 30, min: 6, windup: 1.2, active: 0.1, recover: 1.0, damage: 42, radius: 3.4, fuse: 0.8, knockback: 12, count: 3, cooldown: 6, element: 'shock' },
      { id: 'fan', kind: 'fan', proj: 'energy', range: 24, windup: 0.9, active: 0.1, recover: 0.9, damage: 19, speed: 34, count: 7, fan: 1.0, cooldown: 4 },
      { id: 'deploy', kind: 'summon', range: 30, windup: 1.0, active: 0.1, recover: 0.8, summon: 'sentry', count: 2, maxMinions: 4, cooldown: 16, hpBelow: 0.8 },
    ],
  },

  // ======================================================== The Wild: this world's own animals,
  // hunting together.
  hound: {
    race: 'fauna', name: 'Razorhound', model: 'fauna:hound', rig: 'quad', behavior: 'pack',
    hp: 46, radius: 0.55, height: 1.1, speed: 6.6, mass: 1, poise: 0, staggerTime: 0.35,
    xp: 11, gold: [1, 4], dropChance: 0.06, cooldown: [0.4, 1.2],
    attacks: [{ id: 'bite', kind: 'bite', range: 2.4, windup: 0.28, active: 0.14, recover: 0.5, damage: 13, arc: 70, knockback: 4, lunge: 11 }],
    variants: { rimehound: { name: 'Rimehound', minLevel: 4, element: 'frost', model: 'fauna:rimehound', hpMul: 1.2 } },
  },
  alpha: {
    race: 'fauna', name: 'Alpha Razorhound', model: 'fauna:alpha', rig: 'quad', behavior: 'pack', scale: 1.25,
    hp: 114, radius: 0.7, height: 1.4, speed: 6.6, mass: 1.8, poise: 25, staggerTime: 0.5,
    xp: 28, gold: [4, 9], dropChance: 0.2, cooldown: [0.4, 1.0],
    attacks: [
      { id: 'bite', kind: 'bite', range: 2.7, windup: 0.3, active: 0.16, recover: 0.5, damage: 21, arc: 80, knockback: 7, lunge: 12 },
      { id: 'howl', kind: 'howl', range: 40, windup: 0.8, active: 0.2, recover: 0.6, duration: 8, radius: 16, cooldown: 14, weight: 3 },
    ],
  },
  crawler: {
    race: 'fauna', name: 'Crawler', model: 'fauna:crawler', rig: 'spider', behavior: 'ambusher',
    hp: 50, radius: 0.7, height: 0.9, speed: 5.2, mass: 1, poise: 0, staggerTime: 0.4,
    xp: 13, gold: [2, 5], dropChance: 0.08, cooldown: [0.5, 1.2], keepAway: 7,
    attacks: [
      { id: 'resin', kind: 'bolt', proj: 'web', range: 14, min: 4, windup: 0.6, active: 0.1, recover: 0.6, damage: 8, speed: 20, count: 1, status: 'frost', cooldown: 3 },
      { id: 'pounce', kind: 'pounce', range: 10, min: 4.5, windup: 0.5, active: 0.55, recover: 0.6, damage: 19, arc: 360, knockback: 8, cooldown: 4 },
      { id: 'sting', kind: 'bite', range: 1.9, windup: 0.35, active: 0.12, recover: 0.5, damage: 15, arc: 90, knockback: 3, lunge: 6, element: 'corrosive' },
    ],
    variants: { venom: { name: 'Venom Crawler', minLevel: 4, element: 'corrosive', model: 'fauna:venom', dmgMul: 1.2 } },
  },
  thunderhorn: {
    race: 'fauna', name: 'Thunderhorn', model: 'fauna:thunderhorn', rig: 'quad', behavior: 'charger',
    hp: 132, radius: 0.8, height: 1.35, speed: 4.0, mass: 2.4, poise: 30, staggerTime: 0.5,
    xp: 22, gold: [3, 8], dropChance: 0.15, cooldown: [0.6, 1.2],
    attacks: [
      { id: 'gore', kind: 'bite', range: 2.4, windup: 0.45, active: 0.14, recover: 0.6, damage: 19, arc: 80, knockback: 9, lunge: 7 },
      { id: 'charge', kind: 'charge', range: 18, min: 6, windup: 0.8, active: 1.1, recover: 1.2, damage: 30, speed: 15, knockback: 16, cooldown: 5 },
    ],
    variants: { ironhide: { name: 'Ironhide Thunderhorn', minLevel: 5, hpMul: 1.5, model: 'fauna:ironhide', poise: 60, scale: 1.12 } },
  },
  behemoth: {
    race: 'fauna', name: 'The Behemoth', model: 'fauna:behemoth', rig: 'quad', behavior: 'boss', boss: true, scale: 1.0,
    hp: 1500, radius: 1.3, height: 2.6, speed: 3.6, mass: 7, poise: 140, staggerTime: 1.0,
    xp: 260, gold: [80, 120], dropChance: 1, cooldown: [0.5, 1.0],
    attacks: [
      { id: 'maul', kind: 'combo', range: 3.2, hits: 2, windup: 0.6, active: 0.16, recover: 0.8, damage: 46, arc: 130, knockback: 10, lunge: 6 },
      { id: 'charge', kind: 'charge', range: 20, min: 7, windup: 0.9, active: 1.2, recover: 1.3, damage: 57, speed: 15, knockback: 20, cooldown: 7 },
      { id: 'rear', kind: 'stomp', range: 5, windup: 1.2, active: 0.1, recover: 1.1, damage: 61, radius: 5.5, knockback: 18, cooldown: 6, rear: true },
      { id: 'call', kind: 'summon', range: 30, windup: 1.0, active: 0.2, recover: 0.6, summon: 'hound', count: 3, maxMinions: 4, cooldown: 18, hpBelow: 0.7, howl: true },
    ],
  },
};

// Factions as they were called before the futuristic redesign (saved quests still name them).
export const OLD_RACE = { goblin: 'scav', hollow: 'hive', construct: 'synth', beast: 'fauna' };

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
