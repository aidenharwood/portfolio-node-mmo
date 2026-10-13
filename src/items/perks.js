// Weapon perks: data + optional hooks invoked by the damage pipeline (combat/Damage.js).
//   mods            stat mods applied at generation time
//   modifyDamage(c) mutate c.damage before it lands
//   onHit(c)        after a hit lands
//   onKill(c)       after a hit kills
//   pierce          extra enemies a projectile passes through
// c = { game, attacker, target, weapon (null for a weaponless hit), damage, crit, source }
// Armour set bonuses (items/sets.js) can grant these too: their hooks then run on every hit the
// wearer lands. `gear` perks come only that way, never rolled onto a weapon.
import { chainLightning } from '../combat/Status.js';

export const PERKS = {
  vampiric: {
    name: 'Vampiric', desc: 'Heal 4% of damage dealt.',
    onHit: (c) => c.attacker.heal(c.damage * 0.04),
  },
  executioner: {
    name: 'Executioner', desc: '+50% damage to foes below 30% health.',
    modifyDamage: (c) => { if (c.target.hp / c.target.maxHp < 0.3) c.damage *= 1.5; },
  },
  volatile: {
    name: 'Volatile', desc: 'Kills detonate for 40% of the killing blow.',
    onKill: (c) => c.game.explode(c.target.position, 2.8, c.damage * 0.4, c.attacker, null,
      { color: 0xffb347, scaled: true, element: c.weapon?.element ?? 'fire' }),
  },
  bloodrush: {
    name: 'Bloodrush', desc: 'Kills restore 15 stamina and mana.',
    onKill: (c) => {
      const p = c.attacker;
      if (p.stamina !== undefined) p.stamina = Math.min(p.maxStamina, p.stamina + 15);
      if (p.mana !== undefined) p.mana = Math.min(p.maxMana, p.mana + 15);
    },
  },
  ricochet: {
    name: 'Ricochet', desc: 'Projectiles pierce one extra foe.', classes: ['ranged', 'magic'],
    pierce: 1,
  },
  overclocked: {
    name: 'Overclocked', desc: '+15% attack, fire and cast rate.',
    mods: { mul: { attackSpeed: 1.15, fireRate: 1.15, castRate: 1.15 } },
  },
  brutal: {
    name: 'Brutal', desc: '+40% knockback.',
    mods: { mul: { knockback: 1.4 } },
  },
  devour: {
    gear: true, name: 'Devour', desc: 'Kills restore 2% of your health.',
    onKill: (c) => c.attacker.heal(c.attacker.maxHp * 0.02),
  },
  overload: {
    gear: true, name: 'Overload', desc: 'Critical hits arc lightning to two nearby foes.',
    onHit: (c) => { if (c.crit && c.source !== 'status') chainLightning(c.game, c.target, 2, c.damage * 0.4, c.attacker); },
  },

  // ---- legendary (one per legendary weapon; `title` replaces the generated name) ----
  cinderheart: {
    legendary: true, title: 'Cinderheart', name: 'Cinderheart',
    desc: 'Always Fire. Burning foes take +35% damage.', forceElement: 'fire',
    modifyDamage: (c) => { if (c.target.statuses.burn) c.damage *= 1.35; },
  },
  thunderwake: {
    legendary: true, title: 'Thunderwake', name: 'Thunderwake',
    desc: 'Critical hits call lightning on up to 3 nearby foes.',
    onHit: (c) => { if (c.crit && c.source !== 'status') chainLightning(c.game, c.target, 3, c.damage * 0.6, c.attacker); },
  },
  hungering: {
    legendary: true, title: 'The Hungering', name: 'Hunger',
    desc: 'Kills heal 10% of max health.',
    onKill: (c) => c.attacker.heal(c.attacker.maxHp * 0.1),
  },
};

export function perksFor(cls, legendary) {
  return Object.keys(PERKS).filter((id) => {
    const p = PERKS[id];
    return !p.gear && !!p.legendary === legendary && (!p.classes || p.classes.includes(cls));
  });
}
