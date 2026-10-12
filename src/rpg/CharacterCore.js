// A character's progression and belongings, and every way they can change — as operations, so
// that one copy of the rules runs everywhere:
//   - online, the server holds the real character (server/characters.js) and applies each
//     operation the player asks for, after checking it (near the trader to sell, near the chest to
//     open it, the item really there...);
//   - the game applies the same operation to its own copy at once, so the UI never waits —
//     except where chance decides the outcome (loot, quest rewards, the trader's stock, a quest
//     offer): then the authority rolls the dice and both sides apply the same roll;
//   - offline, the game is the authority and does both.
// `apply(op)` never uses chance (it only reads `op.roll`), so both sides end up identical; a
// periodic hash comparison (net/CharacterLink.js) catches anything that slips.
//
// Operations: move, select, equip, unequip, scrap, sell, buy, spend, filter, accept, attune,
// respawn (predicted) · pick, drop, chest, turnin, talk, rest, travel (rolled by the authority) ·
// reward, camp, stock (sent by the server). Each returns { ok, fx }: fx are things for the game
// to show (toasts, numbers, loot appearing on the ground or leaving it, a teleport...).
import { Stats } from './Stats.js';
import { itemFromRecipe, itemValue, isArmor } from '../items/items.js';
import { generateWeapon } from '../items/WeaponGenerator.js';
import { generateArmor } from '../items/ArmorGenerator.js';
import { RARITY } from '../items/rarity.js';
import { ATTRIBUTES } from './Stats.js';
import { NPCS } from '../world/mapData.js';
import { HUB } from '../world/Gen.js';

export const PREDICTED = new Set(['move', 'select', 'equip', 'unequip', 'scrap', 'sell', 'buy', 'spend', 'filter', 'accept', 'attune', 'respawn']);
export const ROLLED = new Set(['pick', 'drop', 'chest', 'turnin', 'talk', 'rest', 'travel']);
export const LOOT_LIFE = [75, 120, 300, Infinity, Infinity]; // seconds on the ground, by rarity tier
const MAX_GROUND = 30;
const REACH = { trader: 9, npc: 9, chest: 7, loot: 7, waystone: 9, reactor: 9 };
const TRADER = NPCS.find((n) => n.role === 'trader');

const build = (recipe) => { try { return recipe ? itemFromRecipe(recipe) : null; } catch { return null; } };
const validLoc = (loc) => loc && ((loc.src === 'slot' && Number.isInteger(loc.i) && loc.i >= 0 && loc.i < 3)
  || (loc.src === 'pack' && Number.isInteger(loc.i) && loc.i >= 0 && loc.i < 40)
  || (loc.src === 'armor' && typeof loc.i === 'string' && loc.i.length < 12));

export class CharacterCore {
  // parts: the state this core works on (the game passes its own objects; the server makes them).
  // `strict`: check positions (the server); the game trusts itself.
  constructor({ stats, inventory, quests, attuned, chests, shop, settings, ground = new Map(), position, world, strict = false }) {
    this.stats = stats;
    this.inventory = inventory;
    this.quests = quests;
    this.attuned = attuned;
    this.chests = chests;
    this.shop = shop;
    this.settings = settings;
    this.ground = ground;      // gid → { gid, item, at: [x, y, z], born }
    this.position = position;  // a Vector3 kept current by the owner
    this.world = world;
    this.strict = strict;
    this.nextGid = 1;
    this.time = 0;             // the authority's clock, for loot lifetimes
    this.teleportUntil = 0;    // a travel or respawn may move the character far (server checks)
  }

  near(x, z, r) {
    if (!this.strict) return true;
    return Math.hypot(this.position.x - x, this.position.z - z) <= r;
  }

  // ================================================================ the authority's dice
  roll(op) {
    const lvl = this.stats.level;
    switch (op.op) {
      case 'pick': case 'drop': return { gid: this.gid() };
      case 'chest': {
        const poi = this.world?.poiById?.(op.id);
        const level = Math.max(poi?.level ?? lvl, lvl - 1);
        const items = [0, 1].map((i) => ({ gid: this.gid(), recipe: rollItem({ level, luck: 1.5, minTier: i === 0 ? 2 : 1 }, 0.4).recipe }));
        return { gold: 20 * level + Math.round(Math.random() * 20 * level), items };
      }
      case 'turnin': {
        const q = this.quests.defs.get(op.id);
        const r = q?.rewards;
        if (!r || !(r.weapon || r.armor)) return { item: null };
        const item = r.armor ? generateArmor({ level: lvl, luck: 1, ...r.armor }) : generateWeapon({ level: lvl, luck: 1, ...r.weapon });
        return { item: item.recipe, gid: this.gid() };
      }
      case 'talk': return { offer: this.quests.offer(op.npc, true) ?? null };
      case 'rest': return { stock: stockFor(lvl) };
      case 'travel': {
        const w = this.world?.poiById?.(op.id);
        return w ? { at: [w.x + 2.5, 0, w.z - 2.5] } : null;
      }
      default: return null;
    }
  }

  gid() { return this.nextGid++; }

  // ================================================================ the rules (both sides)
  apply(op) {
    const fx = [];
    const ok = this.run(op, fx);
    return { ok: !!ok, fx: ok ? fx : [] };
  }

  run(op, fx) {
    const inv = this.inventory;
    const s = this.stats;
    switch (op.op) {
      // ---- belongings
      case 'move': {
        if (!validLoc(op.from) || !validLoc(op.to) || !inv.move(op.from, op.to)) return false;
        if (op.from.src !== 'pack' || op.to.src !== 'pack') fx.push({ k: 'gear' });
        return true;
      }
      case 'select': return Number.isInteger(op.i) && inv.select(op.i) && (fx.push({ k: 'wield' }), true);
      case 'equip': {
        const item = inv.backpack[op.bi];
        if (!item) return false;
        if (!isArmor(item) && !(Number.isInteger(op.slot) && op.slot >= 0 && op.slot < 3)) return false;
        inv.equipFromBackpack(op.bi, op.slot);
        fx.push({ k: 'gear' });
        return true;
      }
      case 'unequip': {
        if (!validLoc(op.loc) || op.loc.src === 'pack') return false;
        const done = op.loc.src === 'armor' ? inv.unequipArmor(op.loc.i) : inv.unequip(op.loc.i);
        if (done) fx.push({ k: 'gear' });
        return done;
      }
      case 'scrap': case 'sell': {
        if (!validLoc(op.loc)) return false;
        const item = inv.at(op.loc);
        if (!item) return false;
        if (op.op === 'sell' && !this.near(TRADER.x, TRADER.z, REACH.trader)) return false;
        const value = itemValue(item);
        inv.remove(item);
        s.gold += op.op === 'sell' ? value : Math.ceil(value * 0.5);
        fx.push({ k: 'gear' });
        return true;
      }
      case 'buy': {
        const item = this.shop.stock[op.i];
        if (!item || !this.near(TRADER.x, TRADER.z, REACH.trader)) return false;
        const price = itemValue(item) * 3;
        if (s.gold < price) return false;
        const to = Number.isInteger(op.to) && op.to >= 0 && op.to < inv.backpack.length && !inv.backpack[op.to] ? op.to : inv.backpack.indexOf(null);
        if (to === -1) return false;
        s.gold -= price;
        inv.backpack[to] = item;
        this.shop.stock.splice(op.i, 1);
        return true;
      }
      // ---- progression
      case 'spend': return op.a in ATTRIBUTES && s.spend(op.a);
      case 'filter':
        if (![0, 1, 2].includes(op.v)) return false;
        this.settings.lootFilter = op.v;
        return true;
      case 'respawn': {
        const lost = Math.floor(s.gold * 0.1);
        s.gold -= lost;
        this.teleportUntil = this.time + 10;
        return true;
      }
      // ---- quests
      case 'talk': {
        const npc = NPCS.find((n) => n.id === op.npc);
        if (!npc || !this.near(npc.x, npc.z, REACH.npc)) return false;
        if (op.roll?.offer !== undefined) this.quests.setOffer(op.npc, op.roll.offer);
        return true;
      }
      case 'accept': {
        const q = this.quests.offerable(op.id);
        if (!q) return false;
        const npc = NPCS.find((n) => n.id === q.giver);
        if (npc && !this.near(npc.x, npc.z, REACH.npc)) return false;
        this.quests.accept(op.id);
        fx.push({ k: 'toast', text: `Quest accepted: ${q.title}` });
        return true;
      }
      case 'turnin': {
        const q = this.quests.defs.get(op.id);
        if (!q || !this.quests.isComplete(op.id)) return false;
        const npc = NPCS.find((n) => n.id === q.giver);
        if (npc && !this.near(npc.x, npc.z, REACH.npc)) return false;
        const rewards = this.quests.turnIn(op.id);
        this.gainXp(rewards.xp, fx);
        s.gold += rewards.gold;
        let note = `+${rewards.xp} XP · +${rewards.gold}g`;
        const item = build(op.roll?.item);
        if (item) {
          this.give(item, op.roll.gid, fx);
          note += ` · ${item.name}`;
        }
        fx.push({ k: 'banner', title: 'Quest Complete', sub: note });
        return true;
      }
      // ---- the world
      case 'attune': {
        const w = this.world?.poiById?.(op.id);
        if (!w || w.type !== 'waystone' || this.attuned.has(op.id) || !this.near(w.x, w.z, REACH.waystone)) return false;
        this.attuned.add(op.id);
        this.quests.advance((o) => o.type === 'attune');
        fx.push({ k: 'attuned', id: op.id, name: w.name });
        return true;
      }
      case 'travel': {
        if (!this.attuned.has(op.id) || !op.roll?.at) return false;
        this.teleportUntil = this.time + 10;
        fx.push({ k: 'teleport', at: op.roll.at, id: op.id });
        return true;
      }
      case 'chest': {
        const c = this.world?.poiById?.(op.id);
        if (!c || c.type !== 'chest' || this.chests.has(op.id) || !op.roll || !this.near(c.x, c.z, REACH.chest)) return false;
        this.chests.add(op.id);
        s.gold += op.roll.gold;
        // On top of its tower or ruin, where the world placed it.
        const cy = this.world.chests?.get(op.id)?.position.y ?? this.world.groundHeight?.(c.x, c.z) ?? 0;
        const at = [c.x, cy + 0.8, c.z];
        for (const { gid, recipe } of op.roll.items) this.spawn(gid, build(recipe), at, fx, true);
        this.quests.advance((o) => o.type === 'chest');
        fx.push({ k: 'chest', id: op.id, gold: op.roll.gold });
        return true;
      }
      case 'rest': {
        if (!this.near(HUB.x, HUB.z, HUB.radius + REACH.reactor) || !op.roll) return false;
        this.chests.clear();
        this.shop.stock = op.roll.stock.map(build).filter(Boolean);
        fx.push({ k: 'rested' });
        return true;
      }
      case 'stock':
        this.shop.stock = (op.roll?.stock ?? []).map(build).filter(Boolean);
        return true;
      // ---- loot on the ground
      case 'pick': return this.pick(op, fx);
      case 'drop': {
        if (!validLoc(op.loc) || !op.roll) return false;
        const item = inv.at(op.loc);
        if (!item) return false;
        inv.remove(item);
        this.spawn(op.roll.gid, item, [this.position.x, this.position.y, this.position.z], fx, true);
        fx.push({ k: 'gear' }, { k: 'toast', text: `Dropped ${item.name}` });
        return true;
      }
      // ---- from the server
      case 'reward': return this.reward(op.roll, fx);
      case 'camp':
        this.quests.onCampCleared(op.id);
        return true;
      // A trade the server carried out: our side's items out of the backpack, theirs in, gold
      // across (the server checked everything was there and there's room).
      case 'trade': {
        const r = op.roll;
        if (!r) return false;
        for (const i of r.give) inv.backpack[i] = null;
        for (const recipe of r.take) {
          const item = build(recipe);
          if (item && !inv.stash(item)) this.spawn(this.gid(), item, [this.position.x, this.position.y, this.position.z], fx, false);
        }
        s.gold += r.gold;
        fx.push({ k: 'gear' }, { k: 'toast', text: `Trade with ${r.with} complete` });
        return true;
      }
      // Mail with something attached, claimed (server/social.js).
      case 'claim': {
        const r = op.roll;
        if (!r) return false;
        const item = build(r.item);
        if (item && !inv.stash(item)) return false;
        s.gold += r.gold ?? 0;
        fx.push({ k: 'toast', text: `Claimed ${[r.gold ? `${r.gold}g` : '', item?.name ?? ''].filter(Boolean).join(' and ')}` });
        return true;
      }
      // Sent by mail: the item leaves the backpack, the gold the purse (server/social.js).
      case 'post': {
        const r = op.roll;
        if (!r) return false;
        if (r.bi !== null && r.bi !== undefined) inv.backpack[r.bi] = null;
        s.gold -= r.gold ?? 0;
        fx.push({ k: 'gear' });
        return true;
      }
      default:
        return false;
    }
  }

  gainXp(xp, fx) {
    const levels = this.stats.addXp(xp);
    if (levels > 0) fx.push({ k: 'levelup', level: this.stats.level, points: this.stats.points });
  }

  // A kill credited to this character: XP, gold, the quest tally, and their own loot (scrapped
  // straight into gold when it's below the loot filter).
  reward(r, fx) {
    if (!r) return false;
    const s = this.stats;
    s.kills++;
    s.gold += r.gold;
    fx.push({ k: 'number', at: [r.at[0], r.at[1] + (r.kill.h ?? 1.6) + 0.4, r.at[2]], text: `+${r.xp} XP  +${r.gold}g` });
    this.gainXp(r.xp, fx);
    this.quests.onKill({ typeName: r.kill.type, type: { race: r.kill.race } });
    for (const { gid, recipe } of r.loot ?? []) {
      const item = build(recipe);
      if (!item) continue;
      if (RARITY[item.rarity].tier < this.settings.lootFilter) {
        const gold = Math.ceil(itemValue(item) * 0.5);
        s.gold += gold;
        fx.push({ k: 'number', at: [r.at[0], r.at[1] + 1, r.at[2]], text: `+${gold}g scrap` });
      } else this.spawn(gid, item, r.at, fx, true);
    }
    return true;
  }

  // Into the inventory if there's room, else onto the ground at the character's feet.
  give(item, gid, fx) {
    const where = this.inventory.add(item);
    if (where) {
      if (where === 'equipped') fx.push({ k: 'gear' });
      return;
    }
    this.spawn(gid, item, [this.position.x, this.position.y, this.position.z], fx, false);
    fx.push({ k: 'toast', text: 'Backpack full — reward dropped at your feet' });
  }

  // Tap F: into an empty matching slot or the backpack; when everything is full (or on a hold of
  // F) it takes the place of what's worn there — the armour in its slot, or the wielded weapon —
  // and that is left on the ground where the new one lay.
  pick(op, fx) {
    const g = this.ground.get(op.gid);
    if (!g || !op.roll || !this.near(g.at[0], g.at[2], REACH.loot)) return false;
    const inv = this.inventory;
    const item = g.item;
    let where = op.swap ? null : inv.add(item);
    let old = null;
    if (!where) {
      if (isArmor(item)) {
        old = inv.armor[item.slot];
        inv.armor[item.slot] = item;
      } else {
        old = inv.current;
        inv.slots[inv.active] = item;
      }
      where = 'swapped';
    }
    this.ground.delete(op.gid);
    fx.push({ k: 'unground', gid: op.gid });
    if (old) this.spawn(op.roll.gid, old, op.swap ? g.at : [this.position.x, this.position.y, this.position.z], fx, false);
    if (where !== 'backpack') fx.push({ k: 'gear' });
    fx.push({ k: 'toast', text: where === 'backpack' ? `${item.name} → backpack` : old && op.swap ? `Swapped ${old.name} for ${item.name}` : `Equipped ${item.name}` });
    return true;
  }

  // An item onto the ground (only this character sees it). Old clutter goes first when there's too much.
  spawn(gid, item, at, fx, pop) {
    if (!item) return;
    this.ground.set(gid, { gid, item, at: [...at], born: this.time });
    fx.push({ k: 'ground', gid, item, at: [...at], pop });
    if (this.ground.size > MAX_GROUND) {
      const victim = [...this.ground.values()].sort((a, b) => RARITY[a.item.rarity].tier - RARITY[b.item.rarity].tier || a.born - b.born)[0];
      this.ground.delete(victim.gid);
      fx.push({ k: 'unground', gid: victim.gid });
    }
  }

  // Loot left lying too long fades (the authority's clock).
  expire(now) {
    this.time = now;
    for (const [gid, g] of this.ground) if (now - g.born > LOOT_LIFE[RARITY[g.item.rarity].tier]) this.ground.delete(gid);
  }

  // ================================================================ persistence
  toJSON() {
    return {
      stats: this.stats.toJSON(),
      inventory: this.inventory.toJSON(),
      quests: this.quests.toJSON(),
      attuned: [...this.attuned],
      chests: [...this.chests],
      settings: { ...this.settings },
      shop: this.shop.stock.map((it) => it.recipe),
    };
  }

  // A short fingerprint of everything that matters, to tell whether two copies still agree.
  hash() {
    const d = this.toJSON();
    const text = JSON.stringify([d.stats, d.inventory, d.quests.active, d.quests.completed, d.attuned, d.chests, d.settings.lootFilter, d.shop]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
  }
}

// What a kill is worth to one character of `level` (the authority rolls it; `reward` applies it):
// XP scaled by the level gap, gold, and their own loot.
export function rewardRoll(e, level, gid) {
  const type = e.type;
  const diff = e.level - level;
  const xp = Math.max(1, Math.round(type.xp * e.level * Math.max(0.1, Math.min(1.5, 1 + diff * 0.15))));
  const [gMin, gMax] = type.gold;
  const gold = Math.round((gMin + Math.random() * (gMax - gMin)) * (1 + (e.level - 1) * 0.3));
  const drops = type.boss ? 2 : e.elite ? 2 : Math.random() < type.dropChance ? 1 : 0;
  const loot = [];
  for (let i = 0; i < drops; i++) {
    const item = rollItem({
      level: Math.max(1, e.level + (Math.random() < 0.25 ? 1 : 0)),
      luck: type.boss ? 3 : e.level * 0.15,
      minTier: type.boss ? (i === 0 ? 4 : 2) : (type.eliteMinTier ?? 0),
    });
    loot.push({ gid: gid(), recipe: item.recipe });
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    xp, gold, loot, at: [r2(e.position.x), r2(e.position.y), r2(e.position.z)],
    kill: { type: e.typeName, race: type.race, level: e.level, boss: !!type.boss, elite: !!e.elite, h: type.height },
  };
}

// One random item: mostly weapons, sometimes armour.
export function rollItem(opts, armorChance = 0.35) {
  return Math.random() < armorChance ? generateArmor(opts) : generateWeapon(opts);
}

// The trader's wares for a character of `level` (recipes).
export function stockFor(level) {
  return [
    ...Array.from({ length: 6 }, (_, i) => generateWeapon({ level, luck: 1.2, minTier: i < 2 ? 2 : 1, cls: ['melee', 'ranged', 'magic'][i % 3] })),
    ...['head', 'chest', 'hands', 'legs', 'back'].map((slot) => generateArmor({ level, luck: 1.2, minTier: 1, slot })),
  ].map((it) => it.recipe);
}

export { Stats };
