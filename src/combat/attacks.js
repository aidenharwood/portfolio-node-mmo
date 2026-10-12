// Melee move data. Timings are in seconds at attackSpeed 1; `damage` is a multiplier of weapon damage.
// swing: arm pivot Euler [x pitch, y yaw, z roll] (order YXZ) at strike start → end (enemies);
// path: the player's weapon-centric arc (anim/WeaponMotion.js PATHS).
const SLASH_R = { from: [0.15, -2.1, 0], to: [0.4, 1.4, 0], path: 'slashR' };
const SLASH_L = { from: [0.2, 1.5, Math.PI], to: [0.45, -1.9, Math.PI], path: 'slashL' };
const OVERHEAD = { from: [-2.3, -0.15, Math.PI / 2], to: [1.25, 0, Math.PI / 2], path: 'overhead' };
const STAB = { from: [0.35, -0.6, 0], to: [0.05, 0.05, 0], path: 'stab' };
const STAB_HIGH = { from: [0.1, -0.35, 0], to: [-0.02, 0.02, 0], path: 'stabHigh' };
const SWEEP_LOW = { from: [0.45, -2.0, 0], to: [0.55, 1.6, 0], path: 'sweepLow' };
const SPIN = { from: [0.25, -1.7, 0], to: [0.25, -1.7, 0], path: 'spin' };

export const MELEE_COMBOS = {
  sword: [
    { name: 'Slash',    duration: 0.46, windup: 0.11, active: 0.11, cancelAt: 0.24, damage: 1.0, range: 2.5, arc: 120, knockback: 4,  lunge: 6, hitstop: 0.05, shake: 0.08, poise: 10, swing: SLASH_R },
    { name: 'Backhand', duration: 0.46, windup: 0.1,  active: 0.11, cancelAt: 0.24, damage: 1.1, range: 2.5, arc: 120, knockback: 4,  lunge: 6, hitstop: 0.05, shake: 0.1,  poise: 10, swing: SLASH_L },
    { name: 'Cleave',   duration: 0.72, windup: 0.2,  active: 0.12, cancelAt: 0.5,  damage: 2.2, range: 2.9, arc: 70,  knockback: 11, lunge: 9, hitstop: 0.11, shake: 0.35, poise: 30, swing: OVERHEAD, vertical: true },
  ],
  axe: [
    { name: 'Hew',      duration: 0.62, windup: 0.2,  active: 0.13, cancelAt: 0.4,  damage: 1.0, range: 2.6, arc: 130, knockback: 6,  lunge: 5, hitstop: 0.08, shake: 0.18, poise: 20, swing: SLASH_R },
    { name: 'Splitter', duration: 0.85, windup: 0.28, active: 0.14, cancelAt: 0.6,  damage: 1.9, range: 2.9, arc: 70,  knockback: 12, lunge: 7, hitstop: 0.13, shake: 0.4,  poise: 40, swing: OVERHEAD, vertical: true },
  ],
  dagger: [
    { name: 'Jab',      duration: 0.3,  windup: 0.06, active: 0.08, cancelAt: 0.15, damage: 0.8, range: 2.0, arc: 70,  knockback: 2,  lunge: 7,  hitstop: 0.035, shake: 0.05, poise: 6,  swing: STAB },
    { name: 'Jab',      duration: 0.3,  windup: 0.06, active: 0.08, cancelAt: 0.15, damage: 0.8, range: 2.0, arc: 70,  knockback: 2,  lunge: 7,  hitstop: 0.035, shake: 0.05, poise: 6,  swing: STAB },
    { name: 'Flick',    duration: 0.34, windup: 0.07, active: 0.09, cancelAt: 0.18, damage: 0.9, range: 2.1, arc: 120, knockback: 3,  lunge: 6,  hitstop: 0.04, shake: 0.06, poise: 8,  swing: SLASH_L },
    { name: 'Gutter',   duration: 0.55, windup: 0.12, active: 0.1,  cancelAt: 0.38, damage: 1.8, range: 2.3, arc: 100, knockback: 8,  lunge: 11, hitstop: 0.09, shake: 0.25, poise: 25, swing: SLASH_R },
  ],
  greatsword: [
    { name: 'Cleave',    duration: 0.72, windup: 0.22, active: 0.14, cancelAt: 0.48, damage: 1.0, range: 3.0, arc: 160, knockback: 7,  lunge: 4, hitstop: 0.08, shake: 0.18, poise: 25, swing: SLASH_R },
    { name: 'Reverse',   duration: 0.7,  windup: 0.18, active: 0.14, cancelAt: 0.46, damage: 1.1, range: 3.0, arc: 160, knockback: 7,  lunge: 4, hitstop: 0.08, shake: 0.18, poise: 25, swing: SLASH_L },
    { name: 'Execution', duration: 1.0,  windup: 0.34, active: 0.14, cancelAt: 0.72, damage: 2.3, range: 3.3, arc: 70,  knockback: 13, lunge: 8, hitstop: 0.15, shake: 0.5,  poise: 50, swing: OVERHEAD, vertical: true, shockwave: { radius: 2.6, damage: 0.6 } },
  ],
  spear: [
    { name: 'Thrust', duration: 0.4,  windup: 0.1,  active: 0.1,  cancelAt: 0.22, damage: 1.0,  range: 3.4, arc: 36,  knockback: 4,  lunge: 7,  hitstop: 0.05, shake: 0.07, poise: 10, swing: STAB_HIGH },
    { name: 'Thrust', duration: 0.4,  windup: 0.1,  active: 0.1,  cancelAt: 0.22, damage: 1.05, range: 3.4, arc: 36,  knockback: 4,  lunge: 7,  hitstop: 0.05, shake: 0.07, poise: 10, swing: STAB_HIGH },
    { name: 'Sweep',  duration: 0.6,  windup: 0.15, active: 0.14, cancelAt: 0.4,  damage: 1.3,  range: 3.0, arc: 220, knockback: 7,  lunge: 2,  hitstop: 0.07, shake: 0.15, poise: 20, swing: SWEEP_LOW },
    { name: 'Impale', duration: 0.75, windup: 0.22, active: 0.12, cancelAt: 0.55, damage: 2.4,  range: 3.9, arc: 30,  knockback: 12, lunge: 13, hitstop: 0.12, shake: 0.3,  poise: 35, swing: STAB_HIGH },
  ],
  hammer: [
    { name: 'Smash',       duration: 0.78, windup: 0.26, active: 0.14, cancelAt: 0.52, damage: 1.0, range: 2.6, arc: 120, knockback: 9,  lunge: 4, hitstop: 0.1,  shake: 0.3,  poise: 30, swing: SLASH_R },
    { name: 'Earthshaker', duration: 1.05, windup: 0.36, active: 0.14, cancelAt: 0.78, damage: 1.6, range: 2.4, arc: 60,  knockback: 14, lunge: 5, hitstop: 0.16, shake: 0.65, poise: 60, swing: OVERHEAD, vertical: true, shockwave: { radius: 3.8, damage: 0.8 } },
  ],
};

export const WHIRLWIND = {
  name: 'Whirlwind', duration: 0.85, windup: 0.22, active: 0.32, cancelAt: 0.7, damage: 1.4, range: 3.0, arc: 360,
  knockback: 9, lunge: 2, staminaCost: 30, hitstop: 0.07, shake: 0.25, poise: 25, spin: true, swing: SPIN,
};

// Ground dash (tap Shift, or the dodge button): a burst along the stick (straight back with no
// direction) that eases out into the run, invulnerable for most of it; ~4 m.
export const DODGE = { duration: 0.24, iframes: 0.2, speed: 26, stamina: 20 };

// Bakes weapon stats into a move: scaled timings, reach, arc, knockback and damage.
export function resolveMeleeAttack(def, weapon) {
  const s = weapon.stats;
  const t = 1 / s.attackSpeed;
  return {
    ...def,
    duration: def.duration * t,
    windup: def.windup * t,
    active: Math.max(0.06, def.active * t),
    cancelAt: def.cancelAt * t,
    range: def.range * s.range,
    arc: Math.min(360, def.arc * s.arc),
    knockback: def.knockback * s.knockback,
    damage: def.damage * s.damage,
  };
}

// Enemy types live in bestiary.js (re-exported here for older imports).
export { ENEMY_TYPES } from './bestiary.js';
