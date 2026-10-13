// Abilities: what talents unlock (rpg/talents.js), four to a tree. Three slots — X, G and T, or
// three buttons over the action cluster on touch — each ability with its own cooldown. The
// player's screen plays them (entities/AbilityKit.js); the server checks each use (unlocked,
// slotted, off cooldown) and every other screen sees it (net/Remotes.js).
// Damage scales with `abilityPower`: about an on-level rare weapon's hit, with the tree's class
// damage — not the weapon in hand, so a Gunslinger's grenade hits as hard with a sword drawn.
//   cooldown, duration  seconds · numbers: whatever the ability uses · upgrades: by talent key
import { GROWTH, scale } from '../rpg/balance.js';
import { RARITY } from '../items/rarity.js';

export const ABILITIES = {
  // ======================================================== Vanguard
  slam: {
    tree: 'vanguard', name: 'Seismic Slam', cooldown: 10, short: 'Slam',
    desc: 'Strike the ground: a blast round you that knocks enemies off their feet.',
    radius: 5, damage: 2.2, knockback: 14,
    upgrades: { aftershock: 'Reaches 30% further; survivors are slowed.' },
  },
  bulwark: {
    tree: 'vanguard', name: 'Bulwark', cooldown: 16, duration: 4, short: 'Bulwark',
    desc: 'A wall of energy in front of you for 4 s: it stops shots and blunts blows from the front.',
    melee: 0.3,
    upgrades: { mirror: 'Lasts 6 s; shots it stops fly back at whoever fired them.' },
  },
  leap: {
    tree: 'vanguard', name: 'Leap Strike', cooldown: 9, short: 'Leap',
    desc: 'Leap to where you aim (up to 14 m) and land in a blast.',
    range: 14, radius: 3.6, damage: 1.8, knockback: 12, flight: 0.6,
    upgrades: { meteor: 'Lands half as hard again; 3 s shorter cooldown.' },
  },
  rally: {
    tree: 'vanguard', name: 'Rally Cry', cooldown: 30, duration: 8, short: 'Rally',
    desc: 'Heals you and your party near you for a fifth of their health; you all hit 20% harder for 8 s.',
    radius: 15, heal: 0.2, damage: 0.2,
    upgrades: { warcry: 'Lasts 12 s and clears burning, chill and corrosion.' },
  },
  // ======================================================== Gunslinger
  frag: {
    tree: 'gunslinger', name: 'Frag Grenade', cooldown: 8, short: 'Frag',
    desc: 'A grenade that bursts where it lands.',
    speed: 20, radius: 4, damage: 2.4, knockback: 10, fuse: 1.4,
    upgrades: { cluster: 'Scatters three bomblets as it bursts.' },
  },
  grapple: {
    tree: 'gunslinger', name: 'Grapple Line', cooldown: 7, short: 'Grapple',
    desc: 'Fire a line at anything solid up to 26 m away and be pulled to it.',
    range: 26, speed: 34,
    upgrades: { zipline: 'Reaches 36 m and gives your air dash back.' },
  },
  decoy: {
    tree: 'gunslinger', name: 'Holo-Decoy', cooldown: 18, duration: 6, short: 'Decoy',
    desc: 'Throw a hologram of yourself: enemies near it go for it instead of you for 6 s.',
    range: 12, radius: 4, damage: 2,
    upgrades: { boom: 'Blows up when it ends.' },
  },
  overclock: {
    tree: 'gunslinger', name: 'Overclock', cooldown: 20, duration: 6, short: 'Overclock',
    desc: 'For 6 s you fire, reload, swing and cast half as fast again.',
    rate: 1.5,
    upgrades: { afterburner: 'You also run a quarter faster.' },
  },
  // ======================================================== Technomancer
  drone: {
    tree: 'technomancer', name: 'Sentry Drone', cooldown: 24, duration: 15, short: 'Drone',
    desc: 'Deploy a turret beside you for 15 s that shoots the nearest enemy.',
    range: 24, every: 0.5, damage: 0.45,
    upgrades: { twin: 'Deploys two turrets.' },
  },
  stasis: {
    tree: 'technomancer', name: 'Stasis Field', cooldown: 14, duration: 5, short: 'Stasis',
    desc: 'A field where you aim (up to 22 m) that slows enemies in it to a crawl for 5 s.',
    range: 22, radius: 5, damage: 0.3,
    upgrades: { deepfreeze: 'Lasts 7 s, and its cold bites.' },
  },
  barrier: {
    tree: 'technomancer', name: 'Arc Barrier', cooldown: 22, duration: 6, short: 'Barrier',
    desc: 'A dome round you for 6 s that stops enemy shots.',
    radius: 5, damage: 0.25,
    upgrades: { shockdome: 'Shocks every enemy inside it.' },
  },
  pulse: {
    tree: 'technomancer', name: 'Restoration Pulse', cooldown: 28, duration: 6, short: 'Pulse',
    desc: 'Heals you and your party near you for a third of their health over 6 s.',
    radius: 12, heal: 0.33,
    upgrades: { mass: 'Heals half as much again.' },
  },
};
export const ABILITY_IDS = Object.keys(ABILITIES);
const TREE_CLASS = { vanguard: 'melee', gunslinger: 'ranged', technomancer: 'magic' };
export const abilityClass = (id) => TREE_CLASS[ABILITIES[id]?.tree] ?? 'melee';

// The cooldown with any upgrade that shortens it.
export function cooldownOf(id, upgrades) {
  const a = ABILITIES[id];
  if (!a) return Infinity;
  return a.cooldown - (id === 'leap' && upgrades?.has('meteor') ? 3 : 0);
}

// One "hit" of ability damage for `stats`: an on-level rare weapon's, with the class's damage.
const BASE = 15;
export function abilityPower(stats, id) {
  return BASE * scale(GROWTH.weapon, stats.level) * RARITY.rare.statMult * stats.damageMult(abilityClass(id));
}
