// Elemental status effects. Stored on character.statuses[key] = { time, ...data }.
//   burn    — damage over time
//   chill   — movement slow
//   corrode — target takes increased damage
//   shock   — instant chain lightning to nearby foes
import * as THREE from 'three';
import { dealDamage } from './Damage.js';
import { ELEMENTS } from '../items/elements.js';

const BURN_TICK = 0.5;

export function applyStatus(game, target, element, potency, attacker) {
  if (!target.alive) return;
  // Enemies: the status lives in the world sim (via the enemy's view); shock still chains here.
  if (target.applyStatus) {
    target.applyStatus(element, potency, attacker);
    if (element === 'shock') chainLightning(game, target, 2, potency * 0.5, attacker);
    return;
  }
  const s = target.statuses;
  switch (element) {
    case 'fire': s.burn = { time: 3, tick: BURN_TICK, dps: Math.max(2, potency * 0.35), attacker }; break;
    case 'frost': s.chill = { time: 2.5, slow: 0.45 }; break;
    case 'corrosive': s.corrode = { time: 4, amp: 0.25 }; break;
    case 'shock': chainLightning(game, target, 2, potency * 0.5, attacker); break;
  }
}

export function chainLightning(game, from, count, damage, attacker) {
  const pool = attacker.faction === 'player' ? game.enemies : [game.player];
  const targets = pool
    .filter((e) => e !== from && e.alive && e.position.distanceTo(from.position) < 6)
    .sort((a, b) => a.position.distanceToSquared(from.position) - b.position.distanceToSquared(from.position))
    .slice(0, count);
  from.statuses.shocked = { time: 0.25 };
  for (const t of targets) {
    game.effects.spawnBolt(from.position, t.position, ELEMENTS.shock.color);
    const dir = new THREE.Vector3().subVectors(t.position, from.position).setY(0).normalize();
    dealDamage(game, {
      attacker, target: t, base: damage, direction: dir, knockback: 2, poise: 0,
      source: 'status', element: 'shock', scaled: true,
    });
    t.statuses.shocked = { time: 0.25 };
  }
}

export function updateStatuses(c, dt, game) {
  const s = c.statuses;
  for (const key of Object.keys(s)) {
    const st = s[key];
    st.time -= dt;
    if (key === 'burn' && c.alive) {
      st.tick -= dt;
      if (st.tick <= 0) {
        st.tick += BURN_TICK;
        dealDamage(game, {
          attacker: st.attacker, target: c, base: st.dps * BURN_TICK, poise: 0,
          source: 'status', element: 'fire', scaled: true,
        });
      }
    }
    if (st.time <= 0) delete s[key];
  }
}

const TINTS = {
  burn: new THREE.Color(ELEMENTS.fire.color),
  chill: new THREE.Color(ELEMENTS.frost.color),
  corrode: new THREE.Color(ELEMENTS.corrosive.color),
  shocked: new THREE.Color(ELEMENTS.shock.color),
};

// Writes a subtle emissive tint for the strongest active status into `out`.
export function statusTint(c, out, time) {
  const s = c.statuses;
  if (s.shocked) return out.copy(TINTS.shocked).multiplyScalar(0.6);
  if (s.burn) return out.copy(TINTS.burn).multiplyScalar(0.2 + 0.15 * Math.sin(time * 25));
  if (s.chill) return out.copy(TINTS.chill).multiplyScalar(0.3);
  if (s.corrode) return out.copy(TINTS.corrode).multiplyScalar(0.22);
  return out.setRGB(0, 0, 0);
}
