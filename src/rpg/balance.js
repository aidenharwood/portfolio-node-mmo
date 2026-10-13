// The power curve in one place: how gear, attributes and health grow with level, and how enemies
// grow to match, so a fight against enemies of your own level stays about as hard at level 30 as
// at level 1. Against an on-level enemy, with rare gear and points in your class attribute:
//   trash      dies in 3–4 hits, kills you in 12–16
//   elites     10–15 hits, kill you in 5–7
//   a boss     60–90 seconds alone
// Lower-level enemies fall further behind every level; higher-level ones pull ahead fast (and
// shrug off some of your damage: levelGapMult). tools/powercurve.mjs measures all of this with the
// game's own generators and fails if a level drifts out of its band.
export const GROWTH = {
  weapon: 1.16,      // weapon damage, per level
  armor: 1.12,       // armour on gear, per level — and what armour is measured against (armorReduction)
  health: 1.13,      // player health (base and on gear), per level
  enemyHealth: 1.172, // a little faster than weapons: talents make up the difference
  enemyDamage: 1.135, // a touch faster than player health: talents add toughness
};
export const scale = (growth, level) => Math.pow(growth, Math.max(0, level - 1));

// Enemies of the first few levels are gentler: they come up to full strength by level 5 (while
// you find your feet and your first gear), then grow at a steady rate. The bestiary's numbers are
// level 1's.
export function enemyScale(growth, level) {
  return (Math.min(1, 0.6 + 0.1 * (level - 1)) / 0.6) * scale(growth, level);
}

// Named elites: over three times the health, and more than twice the bite. A champion (leading the
// bigger camps) is an elite and then some.
export const ELITE = { health: 3.4, damage: 2.3 };
export const CHAMPION = { health: 1.8, damage: 1.15 };

// Attribute points give less the more there are: the first five past the base count in full,
// later ones less and less (eight points count as about 6.6, twenty as 11.5, sixty as 22).
export function effective(points) {
  return points <= 5 ? Math.max(0, points) : 5 * Math.pow(points / 5, 0.6);
}

// The share of a hit armour stops, measured against the attacker's level: on-level gear stops the
// same share at every level (light ~35%, medium ~45%, heavy ~53% when rare), gear of a lower
// level less, and nothing makes you untouchable.
export const ARMOR_K = 40;
export function armorReduction(armor, attackerLevel) {
  if (!(armor > 0)) return 0;
  return Math.min(0.85, armor / (armor + ARMOR_K * scale(GROWTH.armor, attackerLevel)));
}

// Difficulty tiers: tougher enemies for better rewards. In instances (dungeons and raids, in later
// phases) a tier makes the enemies themselves tougher and adds affixes to their elites; in the
// shared open world it's each player's own Threat setting, which changes how hard enemies hit
// *you* and how much of *your* damage they shrug off — and what your kills are worth to you.
//   health, damage   ×   ·   affixes  more on elites (instances)   ·   luck  + loot luck
//   floor            the lowest rarity tier a drop can be   ·   xp  ×
export const TIERS = [
  { id: 'normal', name: 'Normal', health: 1, damage: 1, affixes: 0, luck: 0, floor: 0, xp: 1 },
  { id: 'veteran', name: 'Veteran', health: 1.6, damage: 1.45, affixes: 1, luck: 1, floor: 1, xp: 1.25 },
  { id: 'elite', name: 'Elite', health: 2.5, damage: 1.85, affixes: 2, luck: 2, floor: 2, xp: 1.5 },
];
export const tierOf = (i) => TIERS[i] ?? TIERS[0];

// Damage you deal to an enemy far above your level: −8% per level from 3 levels up, at most −40%.
export function levelGapMult(attackerLevel, targetLevel) {
  const gap = targetLevel - attackerLevel;
  return gap >= 3 ? 1 - Math.min(0.4, 0.08 * (gap - 2)) : 1;
}

// Experience for a kill by the level gap: more for enemies above you, less below, and a tenth for
// anything 5 or more levels under you (which also drops nothing better than its own level).
export function xpGapMult(playerLevel, enemyLevel) {
  const diff = enemyLevel - playerLevel;
  if (diff <= -5) return 0.1;
  return Math.max(0.1, Math.min(1.5, 1 + diff * 0.15));
}
export const TRIVIAL_GAP = 5;
