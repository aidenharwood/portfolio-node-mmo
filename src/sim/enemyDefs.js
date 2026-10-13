// Enemy definitions as both the simulation (src/sim/EnemySim.js) and the client's view
// (entities/Enemy.js) need them: the resolved type (variant, elite and summon modifiers applied),
// its attacks at a level, and the attack-kind groups the AI and the animation switch on.
import { ENEMY_TYPES, resolveType } from '../combat/bestiary.js';
import { GROWTH, ELITE, CHAMPION, enemyScale } from '../rpg/balance.js';
import { RALLY } from './affixes.js';

export { ENEMY_TYPES };

export const MELEE_KINDS = new Set(['swing', 'combo', 'bash', 'bite', 'charge', 'pounce', 'stomp', 'nova']);
export const CLOSE_KINDS = new Set(['swing', 'combo', 'bite']);
export const RANGED_KINDS = new Set(['arrow', 'volley', 'bolt', 'burst', 'fan', 'lob']);
export const KITERS = new Set(['ranged', 'lobber', 'support', 'caster', 'ambusher']);
export const SUPPORT_KINDS = new Set(['ward', 'heal', 'howl', 'summon']);

// Named elites, by race.
const NAMES = {
  scav: [['Skarn', 'Rook', 'Vex', 'Morra', 'Dutch', 'Krev', 'Jinx', 'Hask', 'Brakka'], ['the Quick', 'the Cruel', 'Ironjaw', 'Two-Guns', 'Ashmaw', 'Scrapjaw']],
  hive: [['Xith', 'Vrael', 'Ssekh', 'Ixa', 'Kzhar', 'Thrae', 'Uulk'], ['Broodmother', 'the Many', 'of the Deep Nest', 'Hollowsong', 'the Ninefold', 'the Unseen']],
  synth: [['Warden', 'Sentinel', 'Arbiter', 'Custodian', 'Engine', 'Vigil'], ['Mk. IV', 'K-7', 'Prime', 'Omega', 'of the Deep Forge', 'Unbound']],
  fauna: [['Greymane', 'Old Scar', 'Thornback', 'Ashpelt', 'Rimefang', 'Blackmaw'], ['the Elder', 'the Hungry', 'of the Hollows', 'the Untamed', 'Mankiller']],
};
export function eliteName(race, rand = Math.random) {
  const [a, b] = NAMES[race] ?? NAMES.scav;
  return `${a[Math.floor(rand() * a.length)]} ${b[Math.floor(rand() * b.length)]}`;
}

// The full definition for one enemy: elites are named, tougher, bigger and drop better loot, and
// champions more so; summoned minions are worth little and drop nothing (no farming a boss's adds).
export function enemyType(typeName, variant = null, elite = null, summoned = false, champion = false) {
  let type = resolveType(typeName, variant);
  if (elite) {
    const c = champion ? CHAMPION : { health: 1, damage: 1 };
    const big = champion ? 1.1 : 1;
    type = {
      ...type, hp: type.hp * ELITE.health * c.health, xp: type.xp * (champion ? 6 : 3), dropChance: 1, eliteMinTier: champion ? 3 : 2,
      scale: (type.scale ?? 1) * 1.25 * big, radius: type.radius * 1.2 * big, height: type.height * 1.25 * big,
      poise: Math.max(type.poise, champion ? 70 : 40), dmgMul: (type.dmgMul ?? 1) * ELITE.damage * c.damage, champion: !!champion,
    };
  }
  if (summoned) type = { ...type, xp: type.xp * 0.25, dropChance: 0, gold: [0, 1] };
  return type;
}

export const enemyMaxHp = (type, level) => Math.round(type.hp * enemyScale(GROWTH.enemyHealth, level));
export const enemyDamage = (damage, level) => Math.round(damage * enemyScale(GROWTH.enemyDamage, level));
export const enemyRadius = (type) => type.radius * (type.scale && !type.boss ? Math.min(type.scale, 1.3) : 1);

// Attacks at a level (damage scaled, element and staging filled in).
export function enemyAttacks(type, level) {
  return type.attacks.map((a) => ({
    ...a,
    damage: enemyDamage((a.damage ?? 0) * (type.dmgMul ?? 1), level),
    radius: a.radius ? a.radius * (type.radiusMul ?? 1) : a.radius,
    element: a.element ?? type.element ?? 'none',
    poise: 999,
    shake: a.shake ?? (type.mass >= 2 ? 0.5 : 0.3),
    hitstop: a.hitstop ?? (type.mass >= 2 ? 0.12 : 0.07),
  }));
}

// An attack as it lands: frenzied enemies hit a quarter harder, rallied ones (a Commander near)
// harder too.
export function liveAttack(a, frenzied, rallied = false) {
  if (!a || (!frenzied && !rallied)) return a;
  return { ...a, damage: Math.round(a.damage * (frenzied ? 1.25 : 1) * (rallied ? RALLY.damage : 1)) };
}

// Does a sweep (arc `arc` degrees, `range` metres) from an enemy at `pos` facing `facing` reach a
// body at `t` (position, radius, height)? Shared by the sim's AI and the view's hit detection.
export function sweepReaches(pos, facing, height, arc, range, t) {
  const dx = t.position.x - pos.x;
  const dz = t.position.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist - t.radius > range) return false;
  if (t.position.y > pos.y + height * 0.9 || t.position.y + t.height < pos.y - 0.4) return false;
  if (arc >= 360 || dist < 0.001) return true;
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / dist)));
  return ang <= (arc * Math.PI) / 360 + Math.atan2(t.radius, dist);
}

// State and flag codes for the network (and anything else that wants them compact).
export const STATES = ['spawn', 'idle', 'chase', 'windup', 'attack', 'recover', 'stagger', 'return', 'dead'];
export const STATE_CODE = Object.fromEntries(STATES.map((s, i) => [s, i]));
export const FLAG = { engaged: 1, hidden: 2, guarding: 4, ward: 8, frenzy: 16, burn: 32, chill: 64, corrode: 128, shocked: 256, alive: 512, rallied: 1024 };
