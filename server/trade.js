// Trading between two players: a window both sides see. Each puts in items from their backpack
// and gold; any change unlocks both offers; when both have locked, both confirm, and the server
// swaps everything at once — checking at that moment that every item and coin is still there,
// that each side has room for what's coming, and that they're standing close together. The swap
// is a server operation on each character (src/rpg/CharacterCore.js 'trade'), sent to both.
//
// Protocol: client → server  trade { act: request|accept|decline|offer|lock|confirm|cancel, name, items, gold }
//           server → client  tradeReq { from }   trade { state: { with, mine, theirs } | null, reason }
//             mine / theirs: { items: [{ i, recipe }], gold, locked, confirmed }
import { log, metrics } from './ops.js';

const REQUEST_TTL = 30_000;
const TRADE_RANGE = 20;
const MAX_ITEMS = 8;

export class Trades {
  constructor(realm) {
    this.realm = realm;
    this.byChar = new Map();   // char id → trade
    this.requests = new Map(); // target char id → { from: char id, at }
  }

  sessionOf(charId) {
    for (const s of this.realm.sessions.values()) if (s.charId === charId) return s;
    return null;
  }
  byName(name) {
    const n = String(name ?? '').toLowerCase();
    for (const s of this.realm.sessions.values()) if (s.name.toLowerCase() === n) return s;
    return null;
  }
  tell(s, text) { s.send({ t: 'chat', ch: 'system', text }); }

  handle(s, msg) {
    switch (msg.act) {
      case 'request': return this.request(s, msg.name);
      case 'accept': return this.accept(s);
      case 'decline': return this.decline(s);
      case 'offer': return this.offer(s, msg.items, msg.gold);
      case 'lock': return this.lock(s);
      case 'confirm': return this.confirm(s);
      case 'cancel': return this.cancel(s, `${s.name} cancelled the trade.`);
    }
  }

  near(a, b) {
    const pa = a.proxy?.position;
    const pb = b.proxy?.position;
    return !!pa && !!pb && Math.hypot(pa.x - pb.x, pa.z - pb.z) <= TRADE_RANGE;
  }

  request(s, name) {
    const to = this.byName(name);
    if (!to || to === s) return this.tell(s, `${name} isn't online.`);
    if (this.realm.social?.ignores(to, s)) return this.tell(s, `${to.name} isn't taking trades.`);
    if (this.byChar.has(s.charId) || this.byChar.has(to.charId)) return this.tell(s, 'One of you is already trading.');
    if (!this.near(s, to)) return this.tell(s, `Get closer to ${to.name} to trade.`);
    this.requests.set(to.charId, { from: s.charId, at: Date.now() });
    to.send({ t: 'tradeReq', from: s.name });
    this.tell(s, `Asked ${to.name} to trade.`);
  }

  accept(s) {
    const req = this.requests.get(s.charId);
    this.requests.delete(s.charId);
    const from = req && Date.now() - req.at < REQUEST_TTL ? this.sessionOf(req.from) : null;
    if (!from) return this.tell(s, 'No trade to accept.');
    if (this.byChar.has(s.charId) || this.byChar.has(from.charId)) return this.tell(s, 'One of you is already trading.');
    const t = { a: from.charId, b: s.charId, offers: new Map([[from.charId, this.empty()], [s.charId, this.empty()]]) };
    this.byChar.set(t.a, t);
    this.byChar.set(t.b, t);
    this.show(t);
  }

  decline(s) {
    const req = this.requests.get(s.charId);
    this.requests.delete(s.charId);
    const from = req ? this.sessionOf(req.from) : null;
    if (from) this.tell(from, `${s.name} declined the trade.`);
  }

  empty() { return { items: [], gold: 0, locked: false, confirmed: false }; }
  other(t, charId) { return t.a === charId ? t.b : t.a; }

  // What `s` puts in: backpack slots and gold. Any change unlocks both sides.
  offer(s, items, gold) {
    const t = this.byChar.get(s.charId);
    if (!t) return;
    const pack = s.core.inventory.backpack;
    const list = [...new Set(Array.isArray(items) ? items : [])].filter((i) => Number.isInteger(i) && pack[i]).slice(0, MAX_ITEMS);
    const g = Math.max(0, Math.min(s.core.stats.gold, Math.floor(Number(gold) || 0)));
    const o = t.offers.get(s.charId);
    o.items = list.map((i) => ({ i, recipe: pack[i].recipe }));
    o.gold = g;
    for (const x of t.offers.values()) { x.locked = false; x.confirmed = false; }
    this.show(t);
  }

  lock(s) {
    const t = this.byChar.get(s.charId);
    if (!t) return;
    t.offers.get(s.charId).locked = true;
    this.show(t);
  }

  confirm(s) {
    const t = this.byChar.get(s.charId);
    if (!t) return;
    if (![...t.offers.values()].every((o) => o.locked)) return this.tell(s, 'Both offers have to be locked first.');
    t.offers.get(s.charId).confirmed = true;
    if ([...t.offers.values()].every((o) => o.confirmed)) this.execute(t);
    else this.show(t);
  }

  // Everything at once, or nothing.
  execute(t) {
    const A = this.sessionOf(t.a);
    const B = this.sessionOf(t.b);
    if (!A || !B) return this.close(t, 'The trade fell through.');
    if (!this.near(A, B)) return this.close(t, 'Too far apart to trade.');
    const oa = t.offers.get(t.a);
    const ob = t.offers.get(t.b);
    const still = (s, o) => o.items.every(({ i, recipe }) => JSON.stringify(s.core.inventory.backpack[i]?.recipe) === JSON.stringify(recipe)) && s.core.stats.gold >= o.gold;
    if (!still(A, oa) || !still(B, ob)) return this.close(t, "Something on offer isn't there any more.");
    const room = (s, give, take) => s.core.inventory.backpack.filter((x) => !x).length + give >= take;
    if (!room(A, oa.items.length, ob.items.length) || !room(B, ob.items.length, oa.items.length)) return this.close(t, 'Not enough room in a backpack.');
    const run = (s, mine, theirs, other) => {
      const op = { op: 'trade', roll: { with: other.name, give: mine.items.map((x) => x.i), take: theirs.items.map((x) => x.recipe), gold: theirs.gold - mine.gold } };
      s.core.apply(op);
      s.dirty = true;
      s.send({ t: 'sop', op });
    };
    run(A, oa, ob, B);
    run(B, ob, oa, A);
    metrics.inc('trades');
    log.info('trade', `${A.name} ⇄ ${B.name}`, { gave: [oa.items.length, oa.gold], got: [ob.items.length, ob.gold] });
    // Both saved in one go: a layer dying between two saves would leave one side's items twice.
    const rows = [this.realm.row(A), this.realm.row(B)];
    this.realm.saveTogether([A, B], () => this.realm.store.saveCharacters(rows, this.realm.layer));
    this.close(t, null, true);
  }

  cancel(s, reason) {
    const t = this.byChar.get(s.charId);
    if (t) this.close(t, reason);
  }

  close(t, reason, done = false) {
    this.byChar.delete(t.a);
    this.byChar.delete(t.b);
    for (const id of [t.a, t.b]) this.sessionOf(id)?.send({ t: 'trade', state: null, reason, done });
  }

  show(t) {
    for (const id of [t.a, t.b]) {
      const s = this.sessionOf(id);
      const other = this.sessionOf(this.other(t, id));
      if (!s || !other) continue;
      const theirs = t.offers.get(other.charId);
      s.send({
        t: 'trade',
        state: { with: other.name, mine: t.offers.get(id), theirs: { ...theirs, items: theirs.items.map(({ recipe }) => ({ recipe })) } },
      });
    }
  }

  // A player left: their trade (and any request to them) is off.
  gone(s) {
    this.requests.delete(s.charId);
    this.cancel(s, `${s.name} left.`);
  }

  tick(now) {
    for (const [id, r] of this.requests) if (now - r.at > REQUEST_TTL) this.requests.delete(id);
    // Walking apart ends it.
    for (const t of new Set(this.byChar.values())) {
      const A = this.sessionOf(t.a);
      const B = this.sessionOf(t.b);
      if (A && B && !this.near(A, B)) this.close(t, 'You walked too far apart.');
    }
  }
}
