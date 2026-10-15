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
// Operations: move, select, equip, unequip, scrap, sell, buy, learn, respec, slot, filter, threat,
// title, feat, accept, attune, respawn, use, choose (predicted) · pick, drop, chest, turnin, talk,
// rest, travel, enter, leave, dloot, dchest (rolled by the authority) · reward, bonus, visit, camp,
// stock, reach, defended, evwon, dclear, rclear, event (sent by the server).
// Public events (gameplay phase 6, sim/WorldEvents.js): an event's chest is an 'event' op, rolled
// by the authority for each participant who earned it; inside an event under way its voted tier
// is the character's Threat (the host plugs in `eventTier`).
// Raids (gameplay phase 7) are copies like dungeons (world/raids.js): the same enter and leave, and
// each arena's chest is a 'dchest' locked for the week (per raid, encounter and tier).
// Dungeons (gameplay phase 5): going in and out of a copy, and its chests, are rolled by the
// instance manager (sim/Dungeons.js), which the host plugs in as `dungeons`: enter(ask) ·
// leave() · current() · claim(id, kind).
// The character's records (kills by faction, type and Threat, bosses, places, sets worn…) change
// only through these, and after each change the achievements they reach are marked
// (rpg/achievements.js). Each returns { ok, fx }: fx are things for the game
// to show (toasts, numbers, loot appearing on the ground or leaving it, a teleport...).
import { Stats } from './Stats.js';
import { itemFromRecipe, itemValue, isArmor } from '../items/items.js';
import { generateWeapon } from '../items/WeaponGenerator.js';
import { generateArmor } from '../items/ArmorGenerator.js';
import { THEMES, cacheTheme } from '../items/sets.js';
import { RARITY } from '../items/rarity.js';
import { TALENTS, respecCost, MAX_LEVEL } from './talents.js';
import { ACHIEVEMENTS, ACHIEVEMENT, newRecords, loadRecords } from './achievements.js';
import { xpGapMult, TRIVIAL_GAP, TIERS, tierOf } from './balance.js';
import { HUB } from '../world/Gen.js';
import { lockDay, lockKey } from '../world/dungeons.js';
import { RAIDS, lockWeek, raidLockKey } from '../world/raids.js';

export const PREDICTED = new Set(['move', 'select', 'equip', 'unequip', 'scrap', 'sell', 'buy', 'learn', 'respec', 'slot', 'filter', 'threat', 'title', 'feat', 'accept', 'attune', 'respawn', 'use', 'choose']);
export const ROLLED = new Set(['pick', 'drop', 'chest', 'turnin', 'talk', 'rest', 'travel', 'enter', 'leave', 'dloot', 'dchest']);
export const LOOT_LIFE = [75, 120, 300, Infinity, Infinity]; // seconds on the ground, by rarity tier
const MAX_GROUND = 30;
const REACH = { trader: 9, npc: 9, chest: 7, loot: 7, waystone: 9, reactor: 9, use: 6 };
const PLACE_TYPES = ['settlement', 'hamlet', 'town', 'city'];

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
    this.dungeon = null;       // the dungeon copy they're in: { id, d, tier, ..., back }
    this.dungeons = null;      // the instance manager's port (the host's: sim/Dungeons.js)
    this.inCombat = () => false; // the host says whether the character is in a fight
    this.eventTier = () => null; // the host: the tier of the public event they're in, if any
    this.records = newRecords();
    this.achievements = {};      // achievement id → when it was reached
  }

  // Records and achievements from saved data (the rest of a character loads through its parts).
  loadProgress(d) {
    this.records = loadRecords(d?.records);
    // (Characters from before records kept their kill count: it carries over.)
    if (!d?.records && this.stats.kills) this.records.kills = this.stats.kills;
    this.achievements = {};
    for (const [id, t] of Object.entries(d?.achievements ?? {})) if (ACHIEVEMENT[id]) this.achievements[id] = Number(t) || 0;
    this.refreshGear();
    if (this.settings.title && !this.achievements[this.settings.title]) this.settings.title = null;
  }

  // Armour stats on this copy (the server's has no Player to do it), and what the gear tells the
  // records: makers carried, full sets worn.
  refreshGear() {
    const inv = this.inventory;
    this.stats.setGear(Object.values(inv.armor));
    for (const it of [...inv.slots, ...Object.values(inv.armor), ...inv.backpack]) if (it?.manufacturer) this.records.makers[it.manufacturer] = true;
    for (const [set, n] of Object.entries(this.stats.gearSets)) if (n >= 5) this.records.fullSets[set] = true;
  }

  // After every change: any achievement newly reached is marked, and shown.
  checkAchievements(fx) {
    for (const a of ACHIEVEMENTS) {
      if (this.achievements[a.id] !== undefined || (a.stat(this.records, this) ?? 0) < a.goal) continue;
      this.achievements[a.id] = Date.now();
      fx.push({ k: 'achievement', id: a.id });
    }
  }

  // A kill, in the records.
  recordKill(k) {
    const R = this.records;
    R.kills++;
    R.race[k.race] = (R.race[k.race] ?? 0) + 1;
    R.types[k.type] = (R.types[k.type] ?? 0) + 1;
    if (k.variant) R.variants[k.variant] = true;
    if (k.elite) R.elites++;
    if (k.champion) R.champions++;
    if (k.boss) R.bosses[k.type] = (R.bosses[k.type] ?? 0) + 1;
    for (const a of k.affixes ?? []) {
      R.affixes[a] = (R.affixes[a] ?? 0) + 1;
      (R.typeAffixes[k.type] ??= {})[a] = true;
    }
    if (Number.isInteger(k.tier) && k.tier >= 0 && k.tier < R.threat.length) R.threat[k.tier]++;
  }

  // An item come to hand: a legendary counts.
  recordItem(item) {
    if (item?.rarity === 'legendary') this.records.legendaries++;
    if (item?.manufacturer) this.records.makers[item.manufacturer] = true;
  }

  near(x, z, r) {
    if (!this.strict) return true;
    return Math.hypot(this.position.x - x, this.position.z - z) <= r;
  }

  // By a trader (the hub's, or one world/places.js placed): any of them buys. To sell you `item`
  // (from the fine stock or not) their stock must cover it — the general traders sell the everyday
  // stock, the gunsmiths and armourers their own kind of it and the fine stock too.
  nearTrader(item = null, fine = false) {
    if (!this.strict) return true;
    const kind = item && (isArmor(item) ? 'armor' : 'weapons');
    return this.world.folkNear(this.position.x, this.position.z, REACH.trader, 'trader').some((n) => {
      const s = n.stock ?? 'all';
      return !item || (fine ? s === kind : s === 'all' || s === kind);
    });
  }

  // One of the folk in a role close by: an innkeeper, a smith at a workshop.
  nearFolk(role) {
    return !this.strict || this.world.folkNear(this.position.x, this.position.z, REACH.npc, role).length > 0;
  }

  // Standing with a quest's giver: one of the folk, or a quest board.
  atGiver(id) {
    if (!this.strict) return true;
    const n = this.world?.npcById?.(id, this.position);
    return !!n && this.near(n.x, n.z, REACH.npc);
  }

  // The Threat that counts: a private run's tier while in one, a public event's while in one under
  // way, else their own setting.
  get tier() {
    if (this.dungeon && Number.isInteger(this.dungeon.tier)) return this.dungeon.tier;
    const ev = this.eventTier();
    return Number.isInteger(ev) ? ev : this.settings.threat ?? 0;
  }

  // ================================================================ the authority's dice
  roll(op) {
    const lvl = this.stats.level;
    switch (op.op) {
      case 'pick': case 'drop': return { gid: this.gid() };
      case 'chest': {
        const poi = this.world?.poiById?.(op.id);
        const level = Math.max(poi?.level ?? lvl, lvl - 1);
        // Caches hold kit suited to where they sit: relics at precursor sites, issue gear on
        // Warden masts, the local faction's elsewhere.
        const theme = cacheTheme(poi, poi && this.world?.regionAt?.(poi.x, poi.z)?.race);
        const items = [0, 1].map((i) => ({ gid: this.gid(), recipe: rollItem({ level, luck: 1.5, minTier: i === 0 ? 2 : 1, theme }, 0.4).recipe }));
        return { gold: 20 * level + Math.round(Math.random() * 20 * level), items };
      }
      case 'turnin': {
        const q = this.quests.defs.get(op.id);
        const r = q?.rewards;
        if (!r || !(r.weapon || r.armor)) return { item: null };
        const theme = THEMES[q.theme ?? q.giver] ?? null;
        const item = r.armor ? generateArmor({ level: lvl, luck: 1, theme, ...r.armor }) : generateWeapon({ level: lvl, luck: 1, theme, ...r.weapon });
        return { item: item.recipe, gid: this.gid() };
      }
      // A quest board shows three postings; anyone else has one thing to offer.
      case 'talk': {
        const npc = this.world?.npcById?.(op.npc, this.position);
        if (!npc) return { offer: null };
        if (npc.role === 'board') return { offers: [0, 1, 2].map((k) => this.quests.offer(`${npc.id}#${k}`, true) ?? null) };
        return { offer: this.quests.offer(npc.id, true) ?? null };
      }
      case 'rest': return { stock: stockFor(lvl), fine: fineStockFor(lvl) };
      case 'travel': {
        const w = this.world?.poiById?.(op.id);
        return w ? { at: [w.x + 2.5, 0, w.z - 2.5] } : null;
      }
      // ---- dungeons: the instance manager decides where they go, and whether a chest is theirs.
      case 'enter': return this.dungeons?.enter(op) ?? null;
      case 'leave': return this.dungeons?.leave(op) ?? null;
      case 'dloot': {
        const c = this.dungeons?.claim(op.id, 'chest');
        if (!c) return null;
        const level = Math.max(c.level, lvl - 1);
        const items = [0, 1].map((i) => ({ gid: this.gid(), recipe: rollItem({ level, luck: 1.6, minTier: i === 0 ? 2 : 1, theme: c.theme }, 0.4).recipe }));
        return { gold: 25 * level + Math.round(Math.random() * 25 * level), items, at: c.at };
      }
      case 'dchest': {
        // The reward chest past a private run's final boss: once a day per dungeon per tier.
        const cur = this.dungeons?.current();
        if (!cur || cur.shared || (!cur.raid && this.settings.lockouts?.[lockKey(cur.dungeon, cur.tier)] === lockDay())) return null;
        const c = this.dungeons.claim(op.id, 'reward');
        if (!c) return null;
        const T = tierOf(c.tier);
        const level = Math.max(c.level, lvl);
        if (c.raid) {
          // A raid's chest (one per encounter): once a week per tier. Rare and better, epic and
          // better from the last; sometimes a piece of the raid's own set — always from the last.
          const key = raidLockKey(c.dungeon, c.enc, c.tier);
          if (this.settings.lockouts?.[key] === lockWeek()) return null;
          const floors = c.final ? [4, 3, 3, 2 + Math.min(1, T.floor)] : [3, 3, 2 + Math.min(1, T.floor)];
          const items = floors.map((minTier) => ({ gid: this.gid(), recipe: rollItem({ level, luck: 2.5 + T.luck, minTier, theme: c.theme }, 0.45).recipe }));
          if (c.set && (c.final || Math.random() < 0.35 + 0.1 * c.tier)) items.push({ gid: this.gid(), recipe: generateArmor({ level, set: c.set, rarity: 'legendary' }).recipe });
          return { gold: Math.round((120 + 60 * level) * (1 + 0.5 * c.tier) * (c.final ? 1.5 : 1)), items, at: c.at, key, day: lockWeek(), tier: c.tier, raid: true };
        }
        const floors = [3, 2 + Math.min(1, T.floor), 2 + Math.max(0, T.floor - 1)];
        const items = floors.map((minTier) => ({ gid: this.gid(), recipe: rollItem({ level, luck: 2 + T.luck, minTier, theme: c.theme }, 0.45).recipe }));
        return { gold: Math.round((60 + 40 * level) * (1 + 0.5 * c.tier)), items, at: c.at, key: lockKey(c.dungeon, c.tier), day: lockDay(), tier: c.tier };
      }
      default: return null;
    }
  }

  gid() { return this.nextGid++; }

  // ================================================================ the rules (both sides)
  apply(op) {
    const fx = [];
    const ok = this.run(op, fx);
    // What the quest log saw happen (stages done, lines said, moments): for the screen.
    const events = this.quests.drain?.() ?? [];
    if (!ok) return { ok: false, fx: [] };
    fx.push(...events);
    if (fx.some((f) => f.k === 'gear')) this.refreshGear();
    this.checkAchievements(fx);
    return { ok: true, fx };
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
        if (op.op === 'sell' && !this.nearTrader()) return false;
        const value = itemValue(item);
        inv.remove(item);
        s.gold += op.op === 'sell' ? value : Math.ceil(value * 0.5);
        fx.push({ k: 'gear' });
        return true;
      }
      // From the everyday stock, or (at a gunsmith's or an armourer's) the fine stock.
      case 'buy': {
        const list = op.fine ? (this.shop.fine ??= []) : this.shop.stock;
        const item = Number.isInteger(op.i) ? list[op.i] : null;
        if (!item || !this.nearTrader(item, !!op.fine)) return false;
        const price = itemValue(item) * 3;
        if (s.gold < price) return false;
        const to = Number.isInteger(op.to) && op.to >= 0 && op.to < inv.backpack.length && !inv.backpack[op.to] ? op.to : inv.backpack.indexOf(null);
        if (to === -1) return false;
        s.gold -= price;
        inv.backpack[to] = item;
        list.splice(op.i, 1);
        return true;
      }
      // ---- progression
      // Talents (rpg/talents.js): a rank learned, every point back (free below level 10, after
      // that for gold, from a smith at a town's or city's workshop), an ability put in a slot.
      case 'learn':
        if (typeof op.id !== 'string' || !TALENTS[op.id] || !s.learn(op.id)) return false;
        fx.push({ k: 'talents' });
        return true;
      case 'respec': {
        if (!Object.keys(s.talents).length) return false;
        const cost = respecCost(s.level);
        if (cost > 0 && (s.gold < cost || !this.nearFolk('smith'))) return false;
        s.gold -= cost;
        s.respec();
        fx.push({ k: 'talents' }, { k: 'toast', text: cost ? `Talents reset (−${cost}g)` : 'Talents reset' });
        return true;
      }
      case 'slot':
        if (!s.slot(op.i, typeof op.a === 'string' ? op.a : null)) return false;
        fx.push({ k: 'talents' });
        return true;
      case 'filter':
        if (![0, 1, 2].includes(op.v)) return false;
        this.settings.lootFilter = op.v;
        return true;
      // A title to wear (from an achievement reached), or none.
      case 'title':
        if (op.id !== null && (!ACHIEVEMENT[op.id]?.title || this.achievements[op.id] === undefined)) return false;
        this.settings.title = op.id;
        fx.push({ k: 'title' });
        return true;
      // Feats only the player's screen sees: a melee combo, kills in quick succession, a kill
      // from the air.
      case 'feat': {
        const R = this.records;
        if (op.f === 'combo' && Number.isInteger(op.v) && op.v <= 999 && op.v > R.bestCombo) R.bestCombo = op.v;
        else if (op.f === 'multi' && Number.isInteger(op.v) && op.v <= 50 && op.v > R.bestMulti) R.bestMulti = op.v;
        else if (op.f === 'air') R.airKills++;
        else return false;
        return true;
      }
      // The Threat setting (rpg/balance.js: TIERS) — not in the middle of a fight.
      case 'threat':
        if (!Number.isInteger(op.v) || !TIERS[op.v] || this.inCombat()) return false;
        this.settings.threat = op.v;
        fx.push({ k: 'toast', text: `Threat: ${TIERS[op.v].name}` });
        return true;
      case 'respawn': {
        this.teleportUntil = this.time + 10;
        return true;
      }
      // ---- quests
      case 'talk': {
        const npc = this.world?.npcById?.(op.npc, this.position);
        if (!npc || !this.near(npc.x, npc.z, REACH.npc)) return false;
        if (op.roll?.offer !== undefined) this.quests.setOffer(op.npc, op.roll.offer);
        if (Array.isArray(op.roll?.offers)) op.roll.offers.slice(0, 3).forEach((q, k) => this.quests.setOffer(`${npc.id}#${k}`, q));
        this.quests.talkTo(npc.id);
        return true;
      }
      // An answer to someone a quest's stage puts a question to (rpg/storyline.js `choices`): its
      // story flag set.
      case 'choose': {
        const npc = this.world?.npcById?.(op.npc, this.position);
        if (!npc || !this.near(npc.x, npc.z, REACH.npc) || typeof op.quest !== 'string' || !Number.isInteger(op.i)) return false;
        return this.quests.choose(op.quest, op.i, npc.id);
      }
      case 'accept': {
        const q = this.quests.offerable(op.id);
        if (!q || !this.atGiver(this.quests.giverId(q) ?? q.giver)) return false;
        this.quests.accept(op.id);
        fx.push({ k: 'toast', text: `Quest accepted: ${q.title}` });
        return true;
      }
      case 'turnin': {
        const q = this.quests.defs.get(op.id);
        if (!q || !this.quests.isComplete(op.id)) return false;
        const to = this.quests.returnId(q);
        if (to !== null && !this.atGiver(to)) return false;
        const rewards = this.quests.turnIn(op.id);
        this.records.quests++;
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
      // An object a quest needs used (a beacon to light, a console, a door): only when one does.
      case 'use': {
        const n = this.world?.npcById?.(op.id, this.position);
        if (!n || n.role !== 'object' || !this.near(n.x, n.z, REACH.use) || !this.quests.useObject(n.id)) return false;
        fx.push({ k: 'used', id: n.id, object: n.object });
        return true;
      }
      // From the authority: a quest's place reached, a place held against its waves.
      case 'reach': return !!op.roll && this.quests.bump(op.roll.id, op.roll.i, 'goto');
      case 'defended': {
        if (!op.roll || !this.quests.bump(op.roll.id, op.roll.i, 'defend')) return false;
        fx.push({ k: 'toast', text: 'Held!' });
        return true;
      }
      // A public event a quest called for, won with this character taking part (chest-worthy).
      case 'evwon': return !!op.roll && this.quests.bump(op.roll.id, op.roll.i, 'event');
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
        this.dungeon = null;
        fx.push({ k: 'teleport', at: op.roll.at, id: op.id });
        return true;
      }
      // ---- dungeons (sim/Dungeons.js)
      case 'enter': {
        const r = op.roll;
        if (!r?.run || !Array.isArray(r.at)) return false;
        this.dungeon = { ...r.run, back: r.back };
        this.teleportUntil = this.time + 10;
        fx.push({ k: 'dungeon', run: r.run, at: r.at, facing: r.facing ?? 0 });
        return true;
      }
      case 'leave': {
        if (!this.dungeon || !Array.isArray(op.roll?.at)) return false;
        this.dungeon = null;
        this.teleportUntil = this.time + 10;
        fx.push({ k: 'outside', at: op.roll.at });
        return true;
      }
      case 'dloot': case 'dchest': {
        const r = op.roll;
        if (!r?.items) return false;
        if (op.op === 'dchest') {
          const locks = (this.settings.lockouts ??= {});
          if (locks[r.key] === r.day) return false;
          locks[r.key] = r.day;
          fx.push({ k: 'banner', title: r.raid ? 'Raid chest' : 'Reward chest', sub: `${TIERS[r.tier]?.name ?? 'Normal'} · +${r.gold}g${r.raid ? ' · back next week' : ''}` });
        }
        s.gold += r.gold;
        for (const { gid, recipe } of r.items) this.spawn(gid, build(recipe), r.at, fx, true);
        fx.push({ k: 'dchest', id: op.id, gold: r.gold });
        return true;
      }
      // From the authority: a dungeon beaten (its final boss down) with this character in it.
      case 'dclear': {
        const r = op.roll;
        if (!r?.d) return false;
        const row = (this.records.dungeons[r.d] ??= [0, 0, 0, 0]);
        // [open world, Normal, Veteran, Elite]
        row[Number.isInteger(r.tier) ? Math.min(3, r.tier + 1) : 0]++;
        fx.push({ k: 'banner', title: `${r.name} cleared`, sub: Number.isInteger(r.tier) ? `${TIERS[r.tier].name} run` : 'Open world' });
        this.quests.dungeonCleared(r.d);
        return true;
      }
      // From the authority: one of a raid's encounters beaten with this character in it (`final`:
      // the raid's last — the raid beaten). `flawless`: nobody fell. records.raids: raid id →
      // { encounter id → [Normal, Veteran, Elite], clears: [...], flawless: [...] }.
      case 'rclear': {
        const r = op.roll;
        const def = RAIDS[r?.raid];
        if (!def || !Number.isInteger(r.tier) || r.tier < 0 || r.tier > 2 || !def.encounters.some((e) => e.id === r.enc)) return false;
        const rec = (this.records.raids[r.raid] ??= {});
        const bump = (k) => { (rec[k] ??= [0, 0, 0])[r.tier]++; };
        bump(r.enc);
        if (r.flawless) bump(`${r.enc}:flawless`);
        if (r.final) bump('clears');
        fx.push({ k: 'banner', title: r.final ? `${def.name} beaten` : `${r.name} defeated`, sub: `${TIERS[r.tier].name} raid${r.flawless ? ' · nobody fell' : ''}` });
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
      // At Brightwater's reactor, or with an innkeeper (`at`), who keeps a bed for you after: you
      // wake there if you fall.
      case 'rest': {
        const inn = op.at ? this.world?.npcById?.(op.at, this.position) : null;
        const here = op.at ? inn?.role === 'innkeeper' && this.near(inn.x, inn.z, REACH.npc) : this.near(HUB.x, HUB.z, 15 + REACH.reactor);
        if (!here || !op.roll) return false;
        this.chests.clear();
        this.shop.stock = op.roll.stock.map(build).filter(Boolean);
        this.shop.fine = (op.roll.fine ?? []).map(build).filter(Boolean);
        this.settings.home = inn ? inn.id : null;
        fx.push({ k: 'rested' });
        return true;
      }
      case 'stock':
        this.shop.stock = (op.roll?.stock ?? []).map(build).filter(Boolean);
        this.shop.fine = (op.roll?.fine ?? []).map(build).filter(Boolean);
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
      case 'bonus': return this.bonus(op.roll, fx);
      // From the authority: a public event won with this character in it — its chest (`top`: an
      // extra item for a top contributor; `lead`: the top of three or more).
      case 'event': {
        const r = op.roll;
        if (!r || !EVENT_KINDS.includes(r.kind) || !Number.isInteger(r.tier) || r.tier < 0 || r.tier > 2) return false;
        (this.records.events[r.kind] ??= [0, 0, 0])[r.tier]++;
        if (r.lead) this.records.eventLead++;
        return this.bonus(r, fx);
      }
      // Somewhere new (the authority watches where the character goes): a biome, a region's
      // level, a landmark, a settlement.
      case 'visit': {
        const v = op.roll;
        const R = this.records;
        if (!v) return false;
        let news = false;
        if (typeof v.b === 'string' && !R.biomes[v.b]) { R.biomes[v.b] = true; news = true; }
        if (Number.isFinite(v.l) && v.l > R.regionLevel) { R.regionLevel = v.l; news = true; }
        if (typeof v.lm === 'string' && !R.landmarks.includes(v.lm)) {
          R.landmarks.push(v.lm);
          if (typeof v.lk === 'string' && !R.landmarkKinds[v.lk]) { R.landmarkKinds[v.lk] = true; fx.push({ k: 'codex', text: 'New codex entry' }); }
          news = true;
        }
        if (typeof v.st === 'string' && !R.settlements.includes(v.st)) { R.settlements.push(v.st); news = true; }
        return news;
      }
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
    if (!this.records.types[r.kill.type]) fx.push({ k: 'codex', text: 'New codex entry' });
    this.recordKill(r.kill);
    // Quest drops first: the authority rolled them for the stage the quest was at.
    for (const [id, i] of r.quest ?? []) {
      const o = this.quests.objectivesOf(id)[i];
      if (o?.type === 'collect' && this.quests.bump(id, i, 'collect')) fx.push({ k: 'toast', text: `Found: ${o.item}` });
    }
    this.quests.onKill({ type: r.kill.type, race: r.kill.race, tag: r.kill.tag, at: r.at });
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

  // A reward for something bigger than one kill — a warband broken, a stronghold stormed: XP, gold
  // and loot, with a banner.
  bonus(r, fx) {
    if (!r) return false;
    if (r.kind === 'warband') this.records.warbands++;
    else if (r.kind === 'stronghold') this.records.strongholds++;
    this.stats.gold += r.gold;
    fx.push({ k: 'banner', title: r.title, sub: `+${r.xp} XP · +${r.gold}g` });
    this.gainXp(r.xp, fx);
    for (const { gid, recipe } of r.loot ?? []) {
      const item = build(recipe);
      if (item) this.spawn(gid, item, r.at, fx, true);
    }
    return true;
  }

  // Into the inventory if there's room, else onto the ground at the character's feet.
  give(item, gid, fx) {
    this.recordItem(item);
    const where = this.inventory.add(item);
    if (where) {
      if (where === 'equipped') fx.push({ k: 'gear' });
      return;
    }
    this.spawn(gid, item, [this.position.x, this.position.y, this.position.z], fx, false);
    fx.push({ k: 'toast', text: 'Backpack full — reward dropped at your feet' });
  }

  // Tap F adds loot when there's room. Hold F equips it in place of the current item, keeping the
  // replaced item in the backpack when possible or on the ground where this drop landed.
  pick(op, fx) {
    const g = this.ground.get(op.gid);
    if (!g || !op.roll || !this.near(g.at[0], g.at[2], REACH.loot)) return false;
    const inv = this.inventory;
    const item = g.item;
    const at = Array.isArray(op.at) && op.at.length === 3 && op.at.every(Number.isFinite) ? op.at : g.at;
    if (Math.hypot(at[0] - g.at[0], at[2] - g.at[2]) > 6 || !this.near(at[0], at[2], REACH.loot)) return false;
    let where = op.swap ? null : inv.add(item);
    if (!op.swap && !where) return false;
    let old = null;
    if (op.swap) {
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
    this.recordItem(item);
    fx.push({ k: 'unground', gid: op.gid });
    if (old && (!op.swap || !inv.stash(old))) this.spawn(op.roll.gid, old, at, fx, false);
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
      fine: (this.shop.fine ?? []).map((it) => it.recipe),
      records: this.records,
      achievements: this.achievements,
      // In a dungeon: where they came in, for wherever they turn up next.
      run: this.dungeon ? { d: this.dungeon.d, back: this.dungeon.back } : null,
    };
  }

  // A short fingerprint of everything that matters, to tell whether two copies still agree.
  hash() {
    const d = this.toJSON();
    const text = JSON.stringify([d.stats, d.inventory, d.quests.active, d.quests.stage, d.quests.flags, d.quests.completed, d.attuned, d.chests, d.settings.lootFilter, d.settings.home ?? null, d.shop, d.fine, d.records.kills, Object.keys(d.achievements).sort()]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(36);
  }
}

// What a kill is worth to one character of `level` on Threat `tier` (the authority rolls it;
// `reward` applies it): XP scaled by the level gap, gold, and their own loot — nothing extra from
// anything far below them.
export function rewardRoll(e, level, gid, tier = 0) {
  const type = e.type;
  const trivial = level - e.level >= TRIVIAL_GAP;
  const T = trivial ? TIERS[0] : tierOf(tier);
  const xp = Math.max(1, Math.round(type.xp * e.level * xpGapMult(level, e.level) * T.xp));
  const [gMin, gMax] = type.gold;
  const gold = Math.round((gMin + Math.random() * (gMax - gMin)) * (1 + (e.level - 1) * 0.3));
  const drops = type.boss ? 2 : type.champion ? 3 : e.elite ? 2 : Math.random() < type.dropChance ? 1 : 0;
  const loot = [];
  for (let i = 0; i < drops; i++) {
    const item = rollItem({
      level: Math.max(1, e.level + (Math.random() < 0.25 ? 1 : 0)),
      luck: (trivial ? 0 : type.boss ? 3 : e.level * 0.15) + T.luck,
      minTier: Math.min(4, Math.max(T.floor, type.boss ? (i === 0 ? 4 : 2) : type.champion && i > 0 ? 2 : (type.eliteMinTier ?? 0))),
      theme: THEMES[type.race] ?? null, // a faction's dead drop its own kit, mostly
    });
    loot.push({ gid: gid(), recipe: item.recipe });
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    xp, gold, loot, at: [r2(e.position.x), r2(e.position.y), r2(e.position.z)],
    kill: {
      type: e.typeName, variant: e.variant ?? null, race: type.race, level: e.level, boss: !!type.boss, elite: !!e.elite, champion: !!type.champion, tag: e.tag ?? undefined,
      affixes: e.affixes?.length ? [...e.affixes] : undefined, tier: TIERS.indexOf(T), h: type.height,
    },
  };
}

// A bonus for one character of `level` (the authority rolls it; `bonus` applies it): `xp` as the
// feat is worth (less for anything far below them), gold, and `items` rare-or-better pieces.
export function bonusRoll({ title, kind, xp, level, race = null, items = 1, at }, playerLevel, gid, tier = 0) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const T = playerLevel - level >= TRIVIAL_GAP ? TIERS[0] : tierOf(tier);
  const loot = [];
  for (let i = 0; i < items; i++) {
    loot.push({ gid: gid(), recipe: rollItem({ level: Math.max(1, level), luck: 1.5 + T.luck, minTier: Math.min(4, 2 + T.floor), theme: THEMES[race] ?? null }).recipe });
  }
  return {
    title, kind, xp: Math.max(1, Math.round(xp * xpGapMult(playerLevel, level) * T.xp)), gold: Math.round(level * (8 + Math.random() * 6)),
    loot, at: at.map(r2),
  };
}

// A public event's chest for one participant (sim/WorldEvents.js; the authority rolls it, 'event'
// applies it): a third of what the event's enemies were worth in XP (between 40 and 120 × its
// level: the kills themselves pay too), gold, two rare-or-better items and one more for a top
// contributor, at the event's tier — landing at its beacon.
export function eventRoll(ev, person, playerLevel, gid) {
  const kind = ev.type;
  const at = [ev.bx, ev.by ?? 0, ev.bz];
  const r = bonusRoll({
    title: EVENT_WON[kind]?.replace('{place}', ev.place) ?? `${ev.name}: won`, kind, xp: Math.min(120 * ev.level, Math.max(40 * ev.level, ev.xp / 3)), level: ev.level, race: ev.race, items: 2 + (person.top ? 1 : 0), at,
  }, playerLevel, gid, ev.tier);
  return { ...r, tier: ev.tier, top: !!person.top || undefined, lead: !!person.lead || undefined };
}
const EVENT_KINDS = ['surge', 'siege', 'anomaly', 'retake'];
const EVENT_WON = { surge: 'Surge repelled at {place}', siege: 'Siege lifted at {place}', anomaly: 'Anomaly stabilised', retake: '{place} retaken' };

// Somewhere new for a character with `records`, at (x, z): the biome, the region's level, a
// landmark or settlement (a hamlet, village, town or city) they're at — or null when there's
// nothing new (the authority sends a visit op when there is).
export function visitRoll(world, x, z, records) {
  const b = world.gen.biomeAt(x, z);
  const l = world.regionAt(x, z).level;
  let lm = null;
  let lk = null;
  let st = null;
  for (const p of world.poisNear(x, z, 100, ['landmark', ...PLACE_TYPES])) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (p.type === 'landmark' && d < (p.r ?? 15) + 14) { lm = p.id; lk = p.kind; }
    else if (p.type !== 'landmark' && d < (p.type === 'city' ? p.wall : p.r ?? 20) + 6) st = p.id;
  }
  const R = records;
  const news = !R.biomes[b] || l > R.regionLevel || (lm && !R.landmarks.includes(lm)) || (st && !R.settlements.includes(st));
  return news ? { b, l, lm, lk, st } : null;
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

// The fine stock only a town's or city's gunsmiths and armourers carry: rare and better, a level
// ahead of you (up to the level cap).
export function fineStockFor(level) {
  const ahead = Math.min(MAX_LEVEL, level + 1);
  return [
    ...Array.from({ length: 4 }, (_, i) => generateWeapon({ level: ahead, luck: 2, minTier: i === 0 ? 3 : 2, cls: ['melee', 'ranged', 'magic', 'ranged'][i] })),
    ...['head', 'chest', 'hands', 'legs', 'back'].map((slot, i) => generateArmor({ level: ahead, luck: 2, minTier: i === 1 ? 3 : 2, slot })),
  ].map((it) => it.recipe);
}

export { Stats };
