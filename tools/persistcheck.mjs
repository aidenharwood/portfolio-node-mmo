// Check: what a crashed layer leaves in the database. A layer can die between any two writes, so
// each case here runs once to count its writes, then again for every k, with the store "crashing"
// at its k-th write (that write and every one after it never land), and the database is read back
// with a fresh store — what the next layer would load. Either the whole op is there or none of it:
//   trade        both sides' items and gold swapped, or neither (never one side's items twice)
//   mail sent    the item and gold either in the letter or still with the sender, never both
//   mail claimed either still in the letter or with the claimer, never neither
//   chest        the loot and its lockout come back together (one character row), or not at all
//   stale layer  a layer that has lost a character (it stalled; another layer took them) can't
//                write over what the new layer saves
// Run: node tools/persistcheck.mjs
import * as THREE from 'three';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Realm } from '../server/realm.js';
import { Trades } from '../server/trade.js';
import { Social } from '../server/social.js';
import { loadCharacter, characterData } from '../server/characters.js';
import { generateWeapon } from '../src/items/WeaponGenerator.js';
import { log } from '../server/ops.js';

// The crashes are on purpose: the server's complaints about them aren't news here.
log.info = log.warn = log.error = () => {};

let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};

const LAYER = 0;
const simhost = { world: { groundHeight: () => 0 }, cleared: new Set(), inCombat: () => false, eventTier: () => null, dungeonPort: () => null };
const dirs = [];
const stores = [];
const key = (r) => JSON.stringify(r);
const weapon = (seed) => generateWeapon({ seed, level: 5, type: 'sword', rarity: 'rare' });

class Crash extends Error {}
// The store's writes counted; from the k-th on, each one fails (as if the process had died there).
function crashAt(store, k) {
  const real = store.db;
  const count = { writes: 0 };
  const wrap = (db) => ({
    kind: db.kind,
    all: (...a) => db.all(...a),
    get: (...a) => db.get(...a),
    exec: (...a) => db.exec(...a),
    run: async (sql, p) => {
      if (++count.writes > k) throw new Crash('crashed');
      return db.run(sql, p);
    },
    tx: (fn) => real.tx((t) => fn(wrap(t))),
    close: () => real.close(),
  });
  store.db = wrap(real);
  return count;
}

// A realm with two players standing together, each with a few items and some gold, saved.
async function setup({ items = [[], []], gold = [0, 0] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'celblade-persist-'));
  dirs.push(dir);
  const store = await new Store({ dir }).init();
  stores.push(store);
  const sessions = [];
  for (const [n, name] of ['Ana', 'Bo'].entries()) {
    const account = await store.addAccount(`acct${name}`, 'x');
    const charId = await store.addCharacter(account, name, {});
    const s = { id: n + 1, charId, name, proxy: { position: new THREE.Vector3(n, 0, 0) }, send() {}, ignoring: new Set() };
    Object.assign(s, loadCharacter(s, null, simhost));
    items[n].forEach((seed, i) => { s.core.inventory.backpack[i] = weapon(seed); });
    s.core.stats.gold = gold[n];
    await store.claim(charId, name, account, LAYER);
    await store.saveCharacter(charId, characterData(s.core, s.extras), 1, LAYER);
    sessions.push(s);
  }
  const realm = {
    store, layer: LAYER, standalone: true, bus: { publish() {} },
    sessions: new Map(sessions.map((s) => [s.id, s])),
    sessionOf: (id) => sessions.find((s) => s.charId === id) ?? null,
  };
  for (const k of ['row', 'saveCharacter', 'saveTogether', 'dropUnsaved']) realm[k] = Realm.prototype[k];
  realm.trades = new Trades(realm);
  realm.social = new Social(realm);
  realm.social.sendInbox = async () => {};
  return { dir, store, realm, A: sessions[0], B: sessions[1] };
}

// What the next layer would load: each character's backpack (as recipe keys) and gold, and every
// letter.
async function readBack(dir, ids) {
  const store = await new Store({ dir }).init();
  const out = { chars: [], mail: [] };
  for (const id of ids) {
    const row = await store.character(id);
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    out.chars.push({ items: (data?.inventory?.backpack ?? []).filter(Boolean).map(key).sort(), gold: data?.stats?.gold ?? 0, settings: data?.settings ?? {} });
    out.mail.push(...(await store.db.all('SELECT gold, item, claimed FROM mail WHERE to_id = ?', [id])).map((m) => ({ ...m, item: m.item ? key(JSON.parse(m.item)) : null })));
  }
  await store.close();
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const settle = (...ps) => Promise.allSettled(ps.map((p) => p ?? Promise.resolve()));

// Runs `op` crashing at every write in turn; `judge(state, k, n)` says what was wrong, or ''.
async function everyCut(name, make, op, judge) {
  const full = await make();
  const count = crashAt(full.store, Infinity);
  await op(full);
  const n = count.writes;
  const bad = [];
  for (let k = 0; k <= n; k++) {
    const t = await make();
    crashAt(t.store, k);
    await op(t).catch((err) => { if (!(err instanceof Crash)) throw err; });
    const state = await readBack(t.dir, [t.A.charId, t.B.charId]);
    const why = judge(state, k, n);
    if (why) bad.push(`cut at write ${k} of ${n}: ${why}`);
  }
  check(n > 0 && !bad.length, `${name}: all of it or none of it, crashing at each of its ${n} write(s)${bad.length ? `: ${bad.join('; ')}` : ''}`);
}

// ---------------------------------------------------------------- trade
console.log('Trade:');
{
  const make = () => setup({ items: [[101, 102], [201]], gold: [300, 50] });
  const before = { a: [weapon(101), weapon(102)].map((w) => key(w.recipe)).sort(), b: [key(weapon(201).recipe)], ga: 300, gb: 50 };
  const after = { a: [key(weapon(102).recipe), key(weapon(201).recipe)].sort(), b: [key(weapon(101).recipe)], ga: 300 - 120 + 20, gb: 50 + 120 - 20 };
  const op = async ({ realm, A, B }) => {
    const t = realm.trades;
    t.request(A, 'Bo');
    t.accept(B);
    t.offer(A, [0], 120);
    t.offer(B, [0], 20);
    t.lock(A);
    t.lock(B);
    t.confirm(A);
    t.confirm(B);
    await settle(A.saving, B.saving);
  };
  await everyCut('a trade', make, op, ({ chars: [a, b] }, k, n) => {
    const now = { a: a.items, b: b.items, ga: a.gold, gb: b.gold };
    if (same(now, after)) return '';
    if (same(now, before)) return k === n ? 'nothing landed with no crash' : '';
    const keys = [...a.items, ...b.items];
    return new Set(keys).size < keys.length ? `an item on both sides (${a.items.length} + ${b.items.length})` : `half-swapped (gold ${a.gold} + ${b.gold})`;
  });
}

// ---------------------------------------------------------------- mail
console.log('Mail:');
{
  const sword = key(weapon(301).recipe);
  const make = () => setup({ items: [[301], []], gold: [200, 0] });
  const send = async ({ realm, A }) => { await realm.social.send(A, { to: 'Bo', body: 'for you', gold: 80, bi: 0 }); };
  await everyCut('sending a letter with an item and gold', make, send, ({ chars: [a], mail }, k, n) => {
    const kept = a.items.includes(sword) && a.gold === 200 && !mail.length;
    const sent = !a.items.includes(sword) && a.gold === 120 && mail.length === 1 && mail[0].item === sword && mail[0].gold === 80;
    if (sent) return '';
    if (kept) return k === n ? 'nothing landed with no crash' : '';
    return a.items.includes(sword) && mail.some((m) => m.item === sword) ? 'the item both kept and in the letter' : `half-sent (gold ${a.gold}, ${mail.length} letter(s))`;
  });

  // A letter already waiting for Bo, claimed.
  const makeClaim = async () => {
    const t = await setup({ items: [[], []], gold: [0, 0] });
    await t.store.sendMail(t.B.charId, 'Ana', 'for you', 80, weapon(301).recipe);
    t.letter = (await t.store.inbox(t.B.charId))[0].id;
    return t;
  };
  const claim = async ({ realm, B, letter }) => { await realm.social.claim(B, letter); };
  await everyCut('claiming a letter', makeClaim, claim, ({ chars: [, b], mail }, k, n) => {
    const waiting = !b.items.includes(sword) && b.gold === 0 && mail[0]?.claimed === 0;
    const taken = b.items.includes(sword) && b.gold === 80 && mail[0]?.claimed === 1;
    if (taken) return '';
    if (waiting) return k === n ? 'nothing landed with no crash' : '';
    return mail[0]?.claimed && !b.items.includes(sword) ? 'claimed, but the item never reached them' : `half-claimed (gold ${b.gold}, claimed ${mail[0]?.claimed})`;
  });
}

// ---------------------------------------------------------------- chests and lockouts
console.log('Chests:');
{
  const loot = key(weapon(401).recipe);
  const make = () => setup();
  const open = async ({ realm, A }) => {
    A.core.inventory.backpack[3] = weapon(401);
    (A.core.settings.lockouts ??= {})['foundry:2'] = 'w1';
    A.dirty = true;
    await realm.saveCharacter(A);
  };
  await everyCut('a chest and its lockout', make, open, ({ chars: [a] }) => {
    const got = a.items.includes(loot);
    const locked = a.settings.lockouts?.['foundry:2'] === 'w1';
    return got === locked ? '' : got ? 'the loot without its lockout' : 'the lockout without its loot';
  });
}

// ---------------------------------------------------------------- a stale layer
console.log('Stale layer:');
{
  const t = await setup({ items: [[501], []] });
  // Layer 0 stalls; Ana's presence goes stale and layer 1 takes her, saving her without the sword
  // (traded away there, say).
  await t.store.db.run('UPDATE presence SET seen = 0 WHERE character_id = ?', [t.A.charId]);
  check(await t.store.claim(t.A.charId, 'Ana', 1, 1), 'layer 1 can take a character from a layer that stopped refreshing it');
  const there = JSON.parse(JSON.stringify(characterData(t.A.core, t.A.extras)));
  there.inventory.backpack[0] = null;
  await t.store.db.run('UPDATE characters SET data = ? WHERE id = ?', [JSON.stringify(there), t.A.charId]);
  // Layer 0 wakes and saves its old copy, sword and all.
  t.A.dirty = true;
  await t.realm.saveCharacter(t.A).catch(() => {});
  const [a] = (await readBack(t.dir, [t.A.charId])).chars;
  check(!a.items.includes(key(weapon(501).recipe)), "the stalled layer's save doesn't write over the newer one (the sword stays gone)");
}

for (const st of stores) await st.close();
for (const d of dirs) rmSync(d, { recursive: true, force: true });
console.log(failed ? `${failed} problem(s)` : 'persistcheck: ok');
process.exit(failed ? 1 : 0);
