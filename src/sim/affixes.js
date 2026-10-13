// Elite affixes: what makes a named elite more than a bigger one of its kind. An elite rolls one,
// a champion two (one more each in regions of level 18 and up); the sim (EnemySim.js) runs them,
// the view (entities/Enemy.js) shows them: an aura in the first one's colour, a shield bubble,
// and their names under the elite's on its nameplate.
//   races   only these factions roll it
export const AFFIXES = {
  shielded: { name: 'Shielded', color: 0x7fd8ff, desc: 'A shield of half its health has to be broken first; it comes back after a lull.' },
  frenzied: { name: 'Frenzied', color: 0xff4a2a, desc: 'Below half health it moves, strikes and recovers faster.' },
  vampiric: { name: 'Vampiric', color: 0xe0304a, desc: 'Regenerates while it fights.' },
  volatile: { name: 'Volatile', color: 0xffa020, desc: 'Explodes a moment after it dies.' },
  blinking: { name: 'Blinking', color: 0xc46aff, desc: 'Teleports to whoever it\'s fighting.' },
  splitting: { name: 'Splitting', color: 0x9be22d, races: ['hive'], desc: 'Splits into two when it dies.' },
  overcharged: { name: 'Overcharged', color: 0x3ad8ff, races: ['synth'], desc: 'Shock pulses hit everything close to it.' },
  commander: { name: 'Commander', color: 0xffd23f, desc: 'Allies near it hit harder and take less.' },
};
export const AFFIX_IDS = Object.keys(AFFIXES);

// The numbers the sim and the view share.
export const SHIELD = { share: 0.5, lull: 6, refill: 2 };   // of max health; seconds unhurt; seconds to refill
export const RALLY = { radius: 12, damage: 1.2, taken: 0.85 };
export const VAMPIRIC_REGEN = 0.025;                       // of max health a second, in a fight
export const OVERCHARGE = { every: 3.5, radius: 4.5, warn: 0.5, damage: 0.5 }; // damage: of its first attack
export const VOLATILE = { radius: 3.5, damage: 1.6, fuse: 0.8 };                // damage: of its first attack

// `n` different affixes an elite of `race` can have.
export function rollAffixes(race, n, rand = Math.random) {
  const pool = AFFIX_IDS.filter((id) => !AFFIXES[id].races || AFFIXES[id].races.includes(race));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// How many affixes: elites one, champions two, one more each from region level 18.
export const affixCount = (level, champion) => (champion ? 2 : 1) + (level >= 18 ? 1 : 0);
