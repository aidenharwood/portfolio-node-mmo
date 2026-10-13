// Armour sets. Every armour piece belongs to one: its maker's (items/manufacturers.js). A set
// fixes the piece's look (the forms in models/ArmorForms.js, in the maker's colours) and its
// name, so pieces of a set match and a full set reads as one outfit; wearing two and four pieces
// of a set grants its bonuses (rpg/Stats.js), on top of each piece's own rolled stats.
//   weight    light · medium · heavy: scales a piece's armour and health
//   pieces    per slot: the name and the form(s) it's built from (one picked per piece)
//   bonuses   [{ n: pieces needed, stats, perks, name, text }] — stats as armour stats
//             (items/armorTypes.js); perks are armour perks the Player checks, weapon perks
//             (items/perks.js) whose hooks then run on all your damage, or set perks.
// Gear is themed by where it's found: each faction's own kit turns up on its dead, a cache's on
// what kind of place it sits in (THEMES); THEME_CHANCE of drops follow the theme.
import { MANUFACTURERS, MAKER_IDS } from './manufacturers.js';

export const WEIGHTS = {
  light: { armor: 0.75, hp: 0.9 },
  medium: { armor: 1, hp: 1 },
  heavy: { armor: 1.4, hp: 1.15 },
};

export const GEAR_SETS = {
  pathfinder: {
    name: 'Pathfinder', maker: 'frontier', weight: 'light',
    blurb: 'Trail gear for the long walk between waystones.',
    pieces: {
      head: { name: 'Hat', forms: ['ranger'] },
      chest: { name: 'Rig', forms: ['vest'] },
      hands: { name: 'Gloves', forms: ['gloves'] },
      legs: { name: 'Boots', forms: ['trail'] },
      back: { name: 'Poncho', forms: ['cloak'] },
    },
    bonuses: [
      { n: 2, stats: { moveSpeed: 0.06, staminaRegen: 0.25 } },
      { n: 4, name: 'Trailblazer', perks: ['fleet', 'bloodrush'], text: 'Dashes go further and cost less stamina; kills restore 15 stamina and mana.' },
    ],
  },
  vanguard: {
    name: 'Vanguard', maker: 'warden', weight: 'medium',
    blurb: 'The Wardens hold the line so the settlers can hold the land.',
    pieces: {
      head: { name: 'Helm', forms: ['helm'] },
      chest: { name: 'Cuirass', forms: ['cuirass'] },
      hands: { name: 'Gauntlets', forms: ['gauntlets'] },
      legs: { name: 'Greaves', forms: ['greaves'] },
      back: { name: 'Mantle', forms: ['half'] },
    },
    bonuses: [
      { n: 2, stats: { rangedDamage: 0.12 } },
      { n: 4, name: 'Hold the Line', perks: ['warded'], stats: { armorPct: 0.15 }, text: 'The first hit every 8 seconds is halved.' },
    ],
  },
  bastion: {
    name: 'Bastion', maker: 'ironhide', weight: 'heavy',
    blurb: 'Mining exo-plate, reinforced for the kind of rock that fights back.',
    pieces: {
      head: { name: 'Helm', forms: ['hardhat'] },
      chest: { name: 'Plate', forms: ['brigandine'] },
      hands: { name: 'Fists', forms: ['powerfist'] },
      legs: { name: 'Stompers', forms: ['sabatons'] },
      back: { name: 'Power Pack', forms: ['pack'] },
    },
    bonuses: [
      { n: 2, stats: { meleeDamage: 0.15 } },
      { n: 4, name: 'Immovable', perks: ['steadfast', 'thorns'], text: 'Immune to knockback; melee attackers take 30% of the damage they deal.' },
    ],
  },
  raider: {
    name: 'Raider', maker: 'rustjaw', weight: 'light',
    blurb: 'Scav armour, scavenged back. It still smells of smoke.',
    pieces: {
      head: { name: 'Mask', forms: ['raider'] },
      chest: { name: 'Plates', forms: ['scrap'] },
      hands: { name: 'Grips', forms: ['wraps'] },
      legs: { name: 'Wraps', forms: ['wraps'] },
      back: { name: 'Shroud', forms: ['tattered'] },
    },
    bonuses: [
      { n: 2, stats: { resistFire: 0.2, fireDamage: 0.15 } },
      { n: 4, name: 'Scorched Earth', perks: ['volatile'], text: 'Kills detonate for 40% of the killing blow.' },
    ],
  },
  chitin: {
    name: 'Chitin', maker: 'hivecraft', weight: 'medium',
    blurb: 'Hive carapace, cut and cured. It remembers being alive.',
    pieces: {
      head: { name: 'Crest', forms: ['carapace'] },
      chest: { name: 'Carapace', forms: ['chitin'] },
      hands: { name: 'Talons', forms: ['claws'] },
      legs: { name: 'Greaves', forms: ['chitin'] },
      back: { name: 'Elytra', forms: ['wings'] },
    },
    bonuses: [
      { n: 2, stats: { resistCorrosive: 0.2, corrosiveDamage: 0.15 } },
      { n: 4, name: 'Brood Hunger', perks: ['vampiric'], text: 'Heal 4% of all the damage you deal.' },
    ],
  },
  arcframe: {
    name: 'Arcframe', maker: 'voltaic', weight: 'medium',
    blurb: 'A synth chassis, gutted and refitted to wear.',
    pieces: {
      head: { name: 'Faceplate', forms: ['synth'] },
      chest: { name: 'Core', forms: ['mantle'] },
      hands: { name: 'Emitters', forms: ['bracers'] },
      legs: { name: 'Boots', forms: ['boots'] },
      back: { name: 'Cape', forms: ['tech'] },
    },
    bonuses: [
      { n: 2, stats: { resistShock: 0.2, shockDamage: 0.15 } },
      { n: 4, name: 'Overload', perks: ['overload'], text: 'Critical hits arc lightning to two nearby foes.' },
    ],
  },
  ascendant: {
    name: 'Ascendant', maker: 'maker', weight: 'light',
    blurb: 'Vestments from the precursors\' vaults. They hum when you think hard.',
    pieces: {
      head: { name: 'Crown', forms: ['wizard', 'circlet'] },
      chest: { name: 'Vestment', forms: ['robe'] },
      hands: { name: 'Sigils', forms: ['sigil'] },
      legs: { name: 'Striders', forms: ['glide'] },
      back: { name: 'Halo', forms: ['halo'] },
    },
    bonuses: [
      { n: 2, stats: { magicDamage: 0.12, manaRegen: 0.25 } },
      { n: 4, name: 'Resonance', perks: ['secondWind'], stats: { manaDiscount: 0.25 }, text: 'Falling below 30% health heals 30% (once a minute).' },
    ],
  },
  // ---------------------------------------------------------------- raid sets (gameplay phase 7)
  // Only from a raid's chests (world/raids.js `set`), always legendary; never rolled anywhere else.
  // `palette`: its own colours over its maker's.
  broodbane: {
    name: 'Broodbane', maker: 'hivecraft', weight: 'heavy', raid: 'broodmother',
    blurb: 'Cut from the Brood Mother\'s own guard, gilded where the chitin cracked. The nests go quiet when it walks by.',
    palette: { primary: 0x2a1832, secondary: 0x6a2a52, metal: 0xe8c070, energy: 0xff5ad8 },
    pieces: {
      head: { name: 'Crown', forms: ['carapace'] },
      chest: { name: 'Carapace', forms: ['chitin'] },
      hands: { name: 'Talons', forms: ['claws'] },
      legs: { name: 'Greaves', forms: ['chitin'] },
      back: { name: 'Wings', forms: ['wings'] },
    },
    bonuses: [
      { n: 2, stats: { resistCorrosive: 0.25, corrosiveDamage: 0.2, armorPct: 0.08 } },
      { n: 4, name: 'Queen\'s Guard', perks: ['warded', 'vampiric'], stats: { armorPct: 0.1 }, text: 'The first hit every 8 seconds is halved, and you heal 4% of all the damage you deal.' },
    ],
  },
};

export const SET_IDS = Object.keys(GEAR_SETS);
export const SET_PIECES = 5;
export const setOfMaker = (maker) => MANUFACTURERS[maker]?.set ?? null;

// Who drops whose kit: each faction's own on its dead; caches by the place they sit in.
export const THEMES = {
  scav: ['rustjaw', 'ironhide'],
  hive: ['hivecraft'],
  synth: ['voltaic', 'warden'],
  fauna: ['frontier'],
  relic: ['maker'],             // landmarks and precursor ruins
  tower: ['warden', 'voltaic'], // sensor masts
  mesa: ['frontier', 'ironhide'],
  warden: ['warden'],           // Warden Maren's rewards
  sage: ['maker'],              // Old Ysolde's
};
export const THEME_CHANCE = 0.55;

// A maker from `candidates`, leaning to `theme` (maker ids). Always draws twice from rng, so a
// recipe regenerates the same whatever it was themed by.
export function pickMaker(rng, candidates = MAKER_IDS, theme = null) {
  const a = rng();
  const b = rng();
  const themed = theme ? candidates.filter((m) => theme.includes(m)) : [];
  const pool = themed.length && a < THEME_CHANCE ? themed : candidates;
  return pool[Math.floor(b * pool.length)];
}

// The theme of a cache: what it sits in, else the faction whose land it's in.
export function cacheTheme(poi, race) {
  if (poi?.landmark || poi?.ruin) return THEMES.relic;
  if (poi?.on) return THEMES.tower;
  if (poi?.onMesa) return THEMES.mesa;
  return THEMES[race] ?? null;
}

// The bonuses a set grants with `count` pieces worn, each marked active or not.
export function setBonuses(setId, count = 0) {
  const S = GEAR_SETS[setId];
  return S ? S.bonuses.map((b) => ({ ...b, active: count >= b.n })) : [];
}
