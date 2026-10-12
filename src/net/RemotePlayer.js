// Another player, as seen on this screen: the same body, gear and animation as the local hero
// (it *is* a Player, for the animation code), driven by states from the network instead of input
// and physics. States are buffered and played back a little in the past, between the two that
// straddle the render time, so motion stays smooth through network jitter.
import { Player } from '../entities/Player.js';
import { wrapAngle } from '../entities/Character.js';
import { itemFromRecipe } from '../items/items.js';
import { lookFromChoice } from '../models/heroLooks.js';
import { MELEE_COMBOS, WHIRLWIND, resolveMeleeAttack } from '../combat/attacks.js';
import { WEAPON_TYPES } from '../items/weaponTypes.js';
import { ELEMENTS } from '../items/elements.js';
import { MANUFACTURERS } from '../items/manufacturers.js';
import { animateWeapon } from '../items/WeaponModel.js';
import { disposeObject } from '../render/Toon.js';

const MAX_EXTRAPOLATE = 0.25; // seconds past the newest state we'll guess along its velocity
const lerp = (a, b, t) => a + (b - a) * t;

const recipeItem = (r) => {
  try { return r ? itemFromRecipe(r) : null; } catch { return null; }
};

export class RemotePlayer extends Player {
  constructor(game, info) {
    super(game);
    this.remote = true;
    this.netId = info.id;
    this.name = info.name;
    this.level = info.lv ?? 1;
    this.look = lookFromChoice(info.look);
    this.buffer = [];
    this.netAimY = 0;
    this.lastAq = null;
    this.hpFrac = 1;
    this.applyProfile(info);
    if (info.s) {
      this.push(info.rt, info.s);
      this.position.fromArray(info.s.p);
      this.facing = info.s.f;
    }
  }

  get aimY() { return this.netAimY; }
  get perks() { return []; }

  applyProfile({ lv, w, a, gt }) {
    if (lv) this.level = lv;
    this.tag = gt ?? null; // guild tag
    const weapon = recipeItem(w);
    this.inventory.slots = [weapon && weapon.kind !== 'armor' ? weapon : null, null, null];
    this.inventory.active = 0;
    for (const slot of Object.keys(this.inventory.armor)) {
      const item = recipeItem(a?.[slot]);
      this.inventory.armor[slot] = item?.slot === slot ? item : null;
    }
    this.attack = null;
    this.rebuildModel();
  }

  push(t, s) {
    const buf = this.buffer;
    if (buf.length && t <= buf[buf.length - 1].t) return; // out of order
    buf.push({ t, s });
    if (buf.length > 40) buf.shift();
  }

  // Plays the buffer back at server time `T` (ms).
  update(dt, T) {
    const buf = this.buffer;
    if (!buf.length) return;
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > T) i--;
    if (i > 1) buf.splice(0, i - 1);
    i = Math.min(i, 1);
    const a = buf[i];
    const b = buf[i + 1] ?? null;
    const sa = a.s;
    const p = this.position;
    if (b && a.t <= T) {
      const k = Math.min(1, (T - a.t) / Math.max(1, b.t - a.t));
      const sb = b.s;
      p.set(lerp(sa.p[0], sb.p[0], k), lerp(sa.p[1], sb.p[1], k), lerp(sa.p[2], sb.p[2], k));
      this.facing = sa.f + wrapAngle(sb.f - sa.f) * k;
      this.velocity.set(lerp(sa.v[0], sb.v[0], k), 0, lerp(sa.v[2], sb.v[2], k));
      this.vy = lerp(sa.v[1], sb.v[1], k);
      this.netAimY = lerp(sa.ay, sb.ay, k);
      this.cameraYaw = sa.cy + wrapAngle(sb.cy - sa.cy) * k;
    } else {
      // Past the newest state: carry on along its velocity briefly, then hold.
      const ext = Math.min(MAX_EXTRAPOLATE, Math.max(0, (T - a.t) / 1000));
      p.set(sa.p[0] + sa.v[0] * ext, sa.p[1] + (sa.gr ? 0 : sa.v[1] * ext), sa.p[2] + sa.v[2] * ext);
      if (sa.gr) p.y = this.game.world.supportHeight(p.x, p.z, p.y + 0.6);
      this.facing = sa.f;
      this.velocity.set(sa.v[0], 0, sa.v[2]);
      this.vy = sa.v[1];
      this.netAimY = sa.ay;
      this.cameraYaw = sa.cy;
    }
    this.root.rotation.y = this.facing;
    this.knockback.set(0, 0, 0);
    this.applyFlags(sa, Math.max(0, (T - a.t) / 1000));

    this.time += dt;
    if (this.weaponModel) animateWeapon(this.weaponModel, this.time);
    this.animate(dt);
    this.updateMaterials(dt);
  }

  applyFlags(s, since) {
    const fl = s.fl;
    this.grounded = !!s.gr;
    this.sprinting = !!(fl & 1);
    this.adsHeld = !!(fl & 2);
    this.aimTimer = fl & 4 ? 1 : 0;
    this.gliding = !!(fl & 8);
    const alive = !(fl & 16);
    if (alive !== this.alive) { this.alive = alive; this.deathFall = 0; }
    this.flipT = s.ft;
    this.bulletJumpT = s.bj;
    this.reloadTimer = s.rt;
    this.charge = s.ch;
    this.mantle = s.md ? { dur: s.md } : null;
    this.slideAttack = s.sa ? { t: s.sa } : null;
    this.hpFrac = s.hp;

    let st = s.st;
    if (st === 'attack' && s.aq !== this.lastAq) {
      this.lastAq = s.aq;
      this.startNetAttack(s.ci);
    }
    if (st === 'attack' && !this.attack) st = 'move';
    this.state = st;
    this.stateTime = s.sT + since;
    if (st === 'attack') this.updateNetAttack();
  }

  startNetAttack(index) {
    const w = this.weapon;
    const chain = w && MELEE_COMBOS[WEAPON_TYPES[w.type]?.combo];
    const def = index < 0 ? WHIRLWIND : chain?.[index];
    if (!w || w.cls !== 'melee' || !def) { this.attack = null; return; }
    this.attack = resolveMeleeAttack(def, w);
    this.comboIndex = index;
    this.swingFrom = { at: this.animator.placeAt.clone(), rot: this.animator.poseIn('chest'), twist: this.anim.twist, lean: 0 };
    this.trailSpawned = false;
  }

  // The swing's trail, as on the swinger's own screen (no hits: those are resolved by its owner).
  updateNetAttack() {
    const a = this.attack;
    if (this.trailSpawned || this.stateTime < a.windup || this.stateTime > a.windup + a.active + 0.1) return;
    this.trailSpawned = true;
    const w = this.weapon;
    this.game.effects.spawnSlash(this.position, this.facing, {
      arc: a.arc, range: a.range, vertical: a.vertical,
      color: w.element !== 'none' ? ELEMENTS[w.element].color : MANUFACTURERS[w.manufacturer].palette.energy,
    });
  }

  dispose() {
    disposeObject(this.root);
  }
}
