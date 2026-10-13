// Single entry point for all damage: crits, perks, elemental procs, status ticks and explosions
// all flow through dealDamage so new mechanics only need to hook in here.
import * as THREE from 'three';
import { PERKS } from '../items/perks.js';
import { applyStatus } from './Status.js';
import { levelGapMult } from '../rpg/balance.js';

const _d = new THREE.Vector3();
const _f = new THREE.Vector3();
const ZERO = new THREE.Vector3();

/**
 * @param o.attacker   Character dealing damage
 * @param o.target     Character receiving it
 * @param o.base       raw damage before attacker multiplier / crit / perks
 * @param o.weapon     generated weapon (enables crits, perks, element procs)
 * @param o.source     'melee' | 'projectile' | 'explosion' | 'status'
 * @param o.scaled     base already includes the attacker's damage multiplier
 * @param o.inflict    element whose status a weaponless (enemy) hit applies
 */
export function dealDamage(game, o) {
  const { attacker, target, weapon = null, source = 'melee' } = o;
  if (!target.canBeHit()) return null;

  const stats = weapon?.stats;
  let damage = o.base * (o.scaled ? 1 : attacker.damageMultiplier);
  const crit = o.canCrit !== false && !!stats && source !== 'status' && Math.random() < stats.critChance + (attacker.critBonus ?? 0);
  if (crit) damage *= stats.critMult + (attacker.critDamage ?? 0);
  const element0 = o.element ?? weapon?.element ?? 'none';
  if (element0 !== 'none') damage *= 1 + (attacker.elementDamage?.(element0) ?? 0);
  // Enemies far above your level shrug off some of it, and more on a higher Threat (rpg/balance.js);
  // armour is measured against the attacker's level.
  if (attacker.faction === 'player' && target.faction === 'enemy') {
    damage *= levelGapMult(attacker.level ?? target.level, target.level) / (attacker.threat?.health ?? 1);
  }
  damage *= target.damageTakenMultiplier(element0, source, attacker);

  // The weapon's perks, and any weapon perks the attacker's armour sets grant (those run on every
  // hit — except the blasts their own kills set off, so a pack can't chain-detonate).
  const ids = new Set(weapon ? weapon.perks : []);
  if (attacker.perks && (weapon || source !== 'explosion')) for (const id of attacker.perks) if (PERKS[id]) ids.add(id);
  const perks = [...ids].map((id) => PERKS[id]);
  const ctx = { game, attacker, target, weapon, damage, crit, source };
  for (const p of perks) p.modifyDamage?.(ctx);
  ctx.damage = Math.max(1, Math.round(ctx.damage * (source === 'status' ? 1 : 0.92 + Math.random() * 0.16)));
  if (game.dev?.flags.oneHit && attacker === game.player) ctx.damage = Math.max(ctx.damage, Math.ceil(target.hp));

  const element = o.element ?? weapon?.element ?? 'none';
  const hit = {
    damage: ctx.damage, crit, element, source, attacker,
    attack: o.attack,
    direction: o.direction ?? ZERO,
    knockback: o.knockback ?? 0,
    poise: o.poise ?? ctx.damage,
  };
  if (!target.takeHit(hit)) return null;
  game.onHit(attacker, target, hit);
  target.onDamaged?.(hit);

  if (weapon && element !== 'none' && target.alive && Math.random() < stats.elementChance) {
    applyStatus(game, target, element, ctx.damage * stats.elementPotency, attacker);
  }
  else if (!weapon && o.inflict && o.inflict !== 'none' && target.alive && source !== 'status') {
    applyStatus(game, target, o.inflict, ctx.damage * 0.8, attacker);
  }
  for (const p of perks) p.onHit?.(ctx);
  if (!target.alive) for (const p of perks) p.onKill?.(ctx);
  return hit;
}

// Melee arc check: every target inside range + arc in front of the attacker, once per swing.
export function performSweep(game, attacker, attack, targets, hitSet, weapon = null) {
  attacker.forward(_f);
  const halfArc = (attack.arc * Math.PI) / 360;
  for (const t of targets) {
    if (!t.alive || hitSet.has(t)) continue;
    _d.subVectors(t.position, attacker.position);
    _d.y = 0;
    const dist = _d.length();
    if (dist - t.radius > attack.range) continue;
    // Vertical reach: can't sweep someone standing on a tower above you.
    if (t.position.y > attacker.position.y + attacker.height * 0.9 || t.position.y + t.height < attacker.position.y - 0.4) continue;
    if (attack.arc < 360 && dist > 0.001 && _f.angleTo(_d) > halfArc + Math.atan2(t.radius, dist)) continue;
    hitSet.add(t);
    const dir = dist > 0.001 ? _d.clone().divideScalar(dist) : _f.clone();
    dealDamage(game, {
      attacker, target: t, base: attack.damage, weapon, direction: dir,
      knockback: attack.knockback, poise: attack.poise, source: 'melee', attack,
      ...(weapon ? {} : { element: attack.element, inflict: attack.status ?? attack.element }),
    });
  }
}
