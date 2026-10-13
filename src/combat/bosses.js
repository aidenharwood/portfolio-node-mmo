// Raid bosses (gameplay phase 7): the enemy types that live only in raids, and the scripts that
// run their fights — written as data, like the bestiary, and played by sim/BossScript.js.
//
// The types are bestiary entries (combat/bestiary.js merges them in): a boss's own attacks are
// chosen by the usual AI (sim/EnemySim.js), phase by phase; attacks with `cooldown: Infinity` are
// never chosen on their own — they're the poses a script casts its mechanics from (kind 'cast',
// which does nothing by itself) or an attack it aims for you (a 'charge' down a marked line).
//
// A script:
//   name · health (its share of the raid's boss health: sim/BossScript.js raidHealth) ·
//   enrage (seconds into the fight: three times the damage, mechanics half again as often)
//   phases  [{ at (health fraction it starts at, 1 for the first), name, say, attacks (the type's
//           attacks it may use), use (mechanics on their timers), now (mechanics fired as it
//           starts), faster (mechanic rate) }]
//   mechanics { id: { kind, ... } }:
//     aoe     a shape marked on the floor that lands after `warn` seconds (combat/shapes.js):
//             shape { sh, r, r0, arc, w } · at: boss | foe | random | each | farthest | arena |
//             center (where; random/each/arena take `count`) · aim: foe | random | farthest |
//             spin (which way a cone, line or cross points) · follow (it follows the player it's
//             on until it lands) · repeat { n, gap, grow, turn } · soak { need, fail } (it needs
//             `need` players in it, sharing the hit, or everyone takes `fail` ×) · leave { life,
//             dps } (a pool where it landed) · cast (the boss's attack it casts it from)
//     charge  the boss's `attack` (a charge) down a marked line at `aim`
//     hazard  pools that come and stay a while: shape · at · count · life · dps · warn
//     adds    `units` [{ type, variant, n, elite }] come in at: edges | around | points (fractions
//             of the arena); `immune` (the boss can't be hurt while they live), `hatch` { after,
//             into } (left alone that long, each bursts into `into`)
//     shield  a shield of `share` of its health; not broken in `time` seconds, `fail` lands
//     links   lines between the encounter's bosses: marked, then a seam that burns `life` seconds
//     move    to: center | back (of the arena), blinking there
//     heal    `share` of its health back
//   Counts and needs are numbers, or 'per2' / 'per3' / 'per4' (one per that many players, at
//   least one) or 'all'. Damage (`dmg`, a fail's, a pool's `dps`) is × the boss's first attack.
//   Any mechanic may `say` something (on everyone's screen) and have a `name` (the HUD's).

export const RAID_TYPES = {
  // ======================================================== The Brood Mother (Act II's raid)
  broodwarden: {
    race: 'hive', name: 'The Brood Warden', model: 'hive:champion', rig: 'biped', behavior: 'boss', boss: true, raid: true, scale: 2.0, hunch: 0.1,
    hp: 1500, radius: 1.3, height: 4.3, speed: 3.0, mass: 9, poise: 600, staggerTime: 0.8, block: 0.5,
    xp: 420, gold: [150, 220], dropChance: 1, cooldown: [0.6, 1.1],
    attacks: [
      { id: 'cleave', kind: 'combo', range: 4.4, hits: 2, windup: 0.75, active: 0.18, recover: 0.9, damage: 48, arc: 140, knockback: 10, lunge: 5 },
      { id: 'impale', kind: 'bash', range: 9, min: 4, windup: 0.8, active: 0.3, recover: 1.0, damage: 52, arc: 40, knockback: 14, lunge: 18, cooldown: 7, stab: true },
      { id: 'quake', kind: 'stomp', range: 5.5, windup: 1.1, active: 0.1, recover: 1.0, damage: 44, radius: 6, knockback: 14, cooldown: 9 },
      { id: 'sweep', kind: 'cast', range: 90, windup: 1.8, active: 0.1, recover: 0.8, cooldown: Infinity },
      { id: 'spit', kind: 'cast', range: 90, windup: 1.2, active: 0.1, recover: 0.6, cooldown: Infinity },
      { id: 'rush', kind: 'charge', range: 90, windup: 1.4, active: 1.3, recover: 1.4, damage: 62, speed: 20, knockback: 18, cooldown: Infinity },
    ],
  },
  choir: {
    race: 'hive', name: 'Psion of the Choir', model: 'hive:psion', rig: 'hover', behavior: 'caster', boss: true, raid: true, scale: 1.8, hover: 0.8,
    hp: 640, radius: 0.9, height: 3.6, speed: 3.2, mass: 5, poise: 600, staggerTime: 0.6, keepAway: 9,
    blink: { range: 5, distance: 9, cooldown: 10 },
    xp: 220, gold: [60, 90], dropChance: 1, cooldown: [0.8, 1.4],
    attacks: [
      { id: 'psi', kind: 'bolt', proj: 'psi', range: 26, windup: 0.9, active: 0.1, recover: 0.7, damage: 24, speed: 12, count: 3, fan: 0.4, homing: 2.2, cooldown: 2.6 },
      { id: 'chant', kind: 'cast', range: 90, windup: 1.6, active: 0.1, recover: 0.6, cooldown: Infinity },
    ],
    variants: {
      sorrow: { name: 'Vael, the Sorrow', minLevel: 1, model: 'hive:cryo', element: 'frost' },
      rage: { name: 'Kzhar, the Rage', minLevel: 1, dmgMul: 1.1 },
      sleep: { name: 'Ixa, the Lullaby', minLevel: 1 },
    },
  },
  broodmother: {
    race: 'hive', name: 'The Brood Mother', model: 'hive:queen', rig: 'biped', behavior: 'boss', boss: true, raid: true, scale: 2.2, hunch: 0.06,
    hp: 1700, radius: 1.7, height: 5.6, speed: 2.8, mass: 12, poise: 800, staggerTime: 0.8, block: 0.3,
    xp: 640, gold: [220, 320], dropChance: 1, cooldown: [0.6, 1.1],
    attacks: [
      { id: 'reap', kind: 'combo', range: 5, hits: 3, windup: 0.8, active: 0.18, recover: 1.0, damage: 50, arc: 150, knockback: 12, lunge: 6 },
      { id: 'scream', kind: 'nova', range: 8, windup: 1.4, active: 0.1, recover: 1.0, damage: 56, radius: 9, knockback: 16, element: 'corrosive', cooldown: 11 },
      { id: 'psi', kind: 'bolt', proj: 'psi', range: 30, min: 8, windup: 1.0, active: 0.1, recover: 0.8, damage: 26, speed: 12, count: 7, fan: 0.9, homing: 1.8, cooldown: 7 },
      { id: 'clutch', kind: 'cast', range: 90, windup: 1.5, active: 0.1, recover: 0.8, cooldown: Infinity },
      { id: 'devour', kind: 'charge', range: 90, windup: 1.6, active: 1.3, recover: 1.6, damage: 70, speed: 22, knockback: 20, cooldown: Infinity },
      { id: 'rain', kind: 'cast', range: 90, windup: 2.0, active: 0.1, recover: 0.8, cooldown: Infinity },
    ],
  },
  // What the Brood Mother brings with her: clutches of eggs that hatch if they're left, and the
  // hearts that feed her shield.
  eggsac: {
    race: 'hive', name: 'Brood Clutch', model: 'hive:eggsac', rig: 'hover', behavior: 'support', raid: true, hover: 0,
    hp: 230, radius: 0.9, height: 1.5, speed: 0, mass: 60, poise: 99999, staggerTime: 0.1,
    xp: 6, gold: [0, 1], dropChance: 0, cooldown: [1, 2], attacks: [],
  },
  broodheart: {
    race: 'hive', name: 'Brood Heart', model: 'hive:broodheart', rig: 'hover', behavior: 'support', raid: true, hover: 0,
    hp: 820, radius: 1.2, height: 2.8, speed: 0, mass: 60, poise: 99999, staggerTime: 0.1,
    xp: 20, gold: [0, 1], dropChance: 0, cooldown: [2, 3],
    attacks: [{ id: 'pulse', kind: 'nova', range: 6, windup: 1.3, active: 0.1, recover: 2.6, damage: 18, radius: 5, knockback: 9, element: 'corrosive', cooldown: 6 }],
  },
};

export const BOSS_SCRIPTS = {
  // The first door down: the Queen's own guard, grown huge. A guard that turns blows from the
  // front, a sweep that clears everything before it, acid spat at whoever's spread out, and a
  // rush at the furthest — and twice it calls the brood out of the walls.
  warden: {
    name: 'The Brood Warden', health: 1, enrage: 420,
    phases: [
      { at: 1, name: 'The Gate', attacks: ['cleave', 'impale', 'quake'], use: ['sweep', 'spit'] },
      { at: 0.7, name: 'The Brood Answers', say: 'The Warden shrieks — the walls split and the brood pours out!', now: ['brood'], attacks: ['cleave', 'impale', 'quake'], use: ['sweep', 'spit', 'rush'] },
      { at: 0.35, name: 'Last Guard', say: 'The Warden\'s carapace hardens — break it before it bursts!', now: ['brood', 'harden'], attacks: ['cleave', 'impale', 'quake'], use: ['sweep', 'spit', 'rush'], faster: 1.25 },
    ],
    mechanics: {
      sweep: { kind: 'aoe', name: 'Carapace Sweep', every: [12, 16], first: 7, cast: 'sweep', shape: { sh: 'cone', r: 17, arc: 120 }, at: 'boss', aim: 'foe', warn: 1.8, dmg: 1.7, kb: 16, el: 'corrosive' },
      spit: { kind: 'aoe', name: 'Acid Spit', every: [10, 13], first: 4, cast: 'spit', shape: { sh: 'circle', r: 3.6 }, at: 'random', count: 'per4', warn: 1.6, dmg: 1.1, kb: 6, el: 'corrosive', leave: { life: 20, dps: 0.22 } },
      rush: { kind: 'charge', name: 'Brood Rush', every: [17, 21], first: 3, attack: 'rush', aim: 'farthest', w: 4 },
      brood: { kind: 'adds', name: 'The Brood', units: [{ type: 'drone', variant: 'bloater', n: 'per3' }, { type: 'spitter', n: 'per4' }, { type: 'drone', n: 'per4' }], at: 'edges' },
      harden: {
        kind: 'shield', name: 'Hardened Carapace', share: 0.12, time: 14,
        fail: { kind: 'aoe', name: 'Chitin Burst', shape: { sh: 'circle', r: 90 }, at: 'center', warn: 0.6, dmg: 2.4, kb: 18, el: 'corrosive', say: 'The carapace bursts!' },
      },
    },
  },

  // Three psions that sing as one: each throws its own song at you, and every so often they
  // resonate — seams of psychic force strung between them. Kill one and the others sing louder.
  sorrow: {
    name: 'Vael, the Sorrow', health: 0.4, enrage: 450,
    phases: [{ at: 1, name: 'Dirge', attacks: ['psi'], use: ['dirge', 'resonance'] }],
    mechanics: {
      // Stand close to Vael, or well clear: the dirge rolls out in a ring.
      dirge: { kind: 'aoe', name: 'Dirge', every: [13, 17], first: 6, cast: 'chant', shape: { sh: 'ring', r: 15, r0: 5 }, at: 'boss', warn: 2.2, dmg: 1.6, kb: 8, el: 'frost' },
      resonance: { kind: 'links', name: 'Resonance', every: [24, 28], first: 15, warn: 2, w: 2.4, dmg: 1.2, life: 8, dps: 0.35, el: 'shock', say: 'The Choir resonates — mind the seams between them!' },
    },
  },
  rage: {
    name: 'Kzhar, the Rage', health: 0.4, enrage: 450,
    phases: [{ at: 1, name: 'Shriek', attacks: ['psi'], use: ['shriek'] }],
    mechanics: {
      // Beams at three of you at once: step out of the line.
      shriek: { kind: 'aoe', name: 'Shriek', every: [9, 12], first: 4, cast: 'chant', shape: { sh: 'line', r: 30, w: 3 }, at: 'boss', aim: 'random', count: 'per4', warn: 1.5, dmg: 1.4, kb: 10, el: 'shock' },
    },
  },
  sleep: {
    name: 'Ixa, the Lullaby', health: 0.4, enrage: 450,
    phases: [{ at: 1, name: 'Lullaby', attacks: ['psi'], use: ['lullaby'] }],
    mechanics: {
      // A circle that needs a share of the raid in it: too few and it puts everyone down.
      lullaby: {
        kind: 'aoe', name: 'Lullaby', every: [18, 22], first: 10, cast: 'chant', shape: { sh: 'circle', r: 4.5 }, at: 'random', count: 1, follow: true, warn: 4,
        dmg: 2.4, soak: { need: 'per3', fail: 1.6 }, kb: 4, el: 'frost', say: 'Ixa sings a lullaby — stand together in it!',
      },
    },
  },

  // The heart of the Brood Pits. She lays clutches that hatch if they're ignored; at seven tenths
  // she draws a shield over herself from three Brood Hearts and the nest bursts round you until
  // they're torn out; below four tenths she rains spores and goes for whoever runs.
  mother: {
    name: 'The Brood Mother', health: 1.25, enrage: 540,
    phases: [
      { at: 1, name: 'The Nest', attacks: ['reap', 'scream', 'psi'], use: ['clutch', 'spit'] },
      {
        at: 0.7, name: 'Brood Shield', say: 'The Brood Mother draws the nest\'s strength — tear out the Brood Hearts!', now: ['retreat', 'hearts'],
        attacks: ['psi'], use: ['cataclysm', 'spit'],
      },
      { at: 0.4, name: 'Frenzy', say: 'The Brood Mother frenzies!', attacks: ['reap', 'scream', 'psi'], use: ['clutch', 'rain', 'devour', 'gravid'], faster: 1.3 },
    ],
    mechanics: {
      clutch: { kind: 'adds', name: 'Egg Clutch', every: [20, 24], first: 8, cast: 'clutch', units: [{ type: 'eggsac', n: 'per4' }], at: 'arena', hatch: { after: 14, into: [{ type: 'drone', n: 2 }, { type: 'spitter', n: 1 }] }, say: 'She lays a clutch — burst the eggs before they hatch!' },
      spit: { kind: 'aoe', name: 'Acid Rain', every: [9, 12], first: 5, shape: { sh: 'circle', r: 3.4 }, at: 'random', count: 'per3', warn: 1.6, dmg: 1, kb: 6, el: 'corrosive', leave: { life: 16, dps: 0.2 } },
      retreat: { kind: 'move', to: 'back' },
      hearts: { kind: 'adds', name: 'Brood Hearts', units: [{ type: 'broodheart', n: 3 }], at: 'points', points: [[0.18, 0.25], [0.82, 0.25], [0.5, 0.88]], immune: true, say: null },
      cataclysm: { kind: 'aoe', name: 'Nest Cataclysm', every: [14, 14], first: 12, when: 'immune', shape: { sh: 'circle', r: 90 }, at: 'center', warn: 3, dmg: 1.3, kb: 10, el: 'corrosive', say: 'The nest convulses!' },
      rain: { kind: 'aoe', name: 'Spore Rain', every: [11, 14], first: 4, cast: 'rain', shape: { sh: 'circle', r: 3 }, at: 'arena', count: 10, warn: 1.8, dmg: 1.2, kb: 6, el: 'corrosive', repeat: { n: 2, gap: 1.4 } },
      devour: { kind: 'charge', name: 'Devour', every: [15, 18], first: 6, attack: 'devour', aim: 'farthest', w: 5 },
      gravid: {
        kind: 'aoe', name: 'Gravid Burst', every: [26, 30], first: 14, shape: { sh: 'circle', r: 5 }, at: 'random', count: 1, follow: true, warn: 5,
        dmg: 3, soak: { need: 'per3', fail: 2 }, kb: 6, el: 'corrosive', say: 'A gravid sac swells over someone — share the burst!',
      },
    },
  },
};

// How much tougher a raid boss is for `n` players (designed for a full raid of 12): × the type's
// health at its level. A solo boss of the open world falls in 60–90 seconds to one player; a raid
// boss lasts about four times that to a full raid (n × 4), a little over twice that to one.
export function raidHealth(n) {
  const k = Math.max(1, n);
  return k * (2.2 + 1.8 * Math.min(1, (k - 1) / 11));
}

// 'per4' and the rest, for `n` players.
export function amount(v, n) {
  if (typeof v === 'number') return Math.max(0, Math.round(v));
  if (v === 'all') return Math.max(1, n);
  const m = /^per(\d+)$/.exec(v ?? '');
  return m ? Math.max(1, Math.ceil(n / Number(m[1]))) : 1;
}
