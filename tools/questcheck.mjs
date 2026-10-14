// Check: the story (rpg/storyline.js: the Prologue and Act I) played through from the first word
// with Warden Maren to the last with Old Ysolde, and side chains (rpg/sidequests.js), through the
// character's own rules as the server runs them (server/characters.js runOp, positions checked):
// quests given, taken and handed in only where they should be; places reached and defences held
// as the server reports them (rpg/questWatch.js); quest drops; objects used; choices that set
// story flags; things refused out of order.
// Run: node tools/questcheck.mjs [seed]
import * as THREE from 'three';
import { HeadlessWorld } from '../server/world.js';
import { runOp } from '../server/characters.js';
import { Stats } from '../src/rpg/Stats.js';
import { Inventory } from '../src/items/Inventory.js';
import { QuestLog } from '../src/rpg/Quests.js';
import { CharacterCore } from '../src/rpg/CharacterCore.js';
import { ACTS, STORY } from '../src/rpg/storyline.js';
import { SIDE_CHAINS } from '../src/rpg/sidequests.js';
import { reachedPlaces, defenceAt, heldObjectives, questDrops } from '../src/rpg/questWatch.js';
import { storyRef } from '../src/world/story.js';
import { settlementFolk } from '../src/world/settlements.js';

const seed = Number(process.argv[2] ?? 12345);
const w = new HeadlessWorld(seed);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};

const position = new THREE.Vector3();
const stats = new Stats();
const host = { hud: null, world: w, encounters: { isCleared: () => false }, stats, player: { position } };
const quests = new QuestLog(host);
const core = new CharacterCore({
  stats, inventory: new Inventory(3), quests, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [], fine: [] },
  settings: { lootFilter: 1 }, position, world: w, strict: true,
});
const op = (o) => runOp(core, { op: o });
// The server's own (server-sent) ops: applied straight to the character.
const give = (o) => core.apply(o).ok;
const go = (x, z) => position.set(x, w.groundHeight(x, z), z);
const ref = (r, q) => storyRef(w, r, { home: q?.home });
const npc = (id) => w.npcById(id);
const by = (n, d = 1.8) => go(n.x + Math.sin(n.facing ?? 0) * d, n.z + Math.cos(n.facing ?? 0) * d);
const away = () => go(position.x + 300, position.z + 300);
let said = [];
const lastFx = [];
const run = (o) => {
  const r = op(o);
  for (const f of r.fx ?? []) { lastFx.push(f); if (f.k === 'say') said.push(f.text); }
  return r;
};

// What the server does every second: places reached, defences (fought and held here at once).
function watch() {
  for (const [id, i] of reachedPlaces(quests, position.x, position.z)) give({ op: 'reach', roll: { id, i } });
  const d = defenceAt(quests, w, position.x, position.z);
  if (d) for (const [id, i] of heldObjectives(quests, d.key)) give({ op: 'defended', roll: { id, i } });
}
// A kill credited here: { type, race, tag } (quest drops always drop, for the test).
function kill(k) {
  const at = [position.x, position.y, position.z];
  const roll = { xp: 10, gold: 1, at, loot: [], kill: { type: k.type ?? 'scavRipper', race: k.race ?? 'scav', tag: k.tag, level: 1, h: 1.8 } };
  const quest = questDrops(quests, { ...roll.kill, at }, () => 0);
  if (quest.length) roll.quest = quest;
  give({ op: 'reward', roll });
}
const stageText = (id) => quests.fill(quests.stageOf(id)?.text ?? '', quests.defs.get(id));

// Plays the current stage of quest `id` to its end, whatever its objectives.
function playStage(id) {
  const q = quests.defs.get(id);
  const objs = quests.objectivesOf(id);
  const stage = quests.stage[id] ?? 0;
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    const left = () => (o.count ?? 1) - (quests.active[id]?.[i] ?? Infinity);
    if ((quests.stage[id] ?? 0) !== stage || left() <= 0) continue;
    if (o.type === 'talk') {
      const n = npc(quests.npcOf(o.npc, q));
      by(n);
      run({ op: 'talk', npc: n.id });
    } else if (o.type === 'goto') {
      const t = ref(o.at, q);
      go(t.x, t.z);
      watch();
    } else if (o.type === 'defend') {
      const t = ref(o.at, q);
      go(t.x + 2, t.z + 2);
      watch();
    } else if (o.type === 'use') {
      const n = npc(quests.npcOf(o.object, q));
      by(n, 1.2);
      run({ op: 'use', id: n.id });
    } else if (o.type === 'choose') {
      const n = npc(quests.npcOf(o.npc, q));
      by(n);
      run({ op: 'talk', npc: n.id });
      run({ op: 'choose', quest: id, i: 0, npc: n.id });
    } else if (o.type === 'clear') {
      const t = ref(o.camp, q) ?? { poi: o.camp, x: position.x, z: position.z };
      go(t.x, t.z);
      give({ op: 'camp', id: typeof t.camp === 'string' ? t.camp : t.poi });
    } else if (o.type === 'dungeon') {
      give({ op: 'dclear', roll: { d: o.d, tier: 0, name: o.d } });
    } else if (o.type === 'attune') {
      const ws = w.poisNear(position.x, position.z, 900, ['waystone']).find((p) => !core.attuned.has(p.id));
      go(ws.x + 1, ws.z + 1);
      run({ op: 'attune', id: ws.id });
    } else {
      // Kills (and the quest drops they carry).
      const near = o.near ? ref(o.near, q) : null;
      if (near) go(near.x, near.z);
      for (let k = 0; k < 40 && left() > 0 && (quests.stage[id] ?? 0) === stage; k++) kill({ race: o.race ?? o.from?.race ?? 'scav', tag: o.tag ?? o.from?.tag });
    }
  }
}

// ---------------------------------------------------------------- lines keyed by story flags
console.log('Lines keyed by story flags:');
{
  const log = new QuestLog(host);
  log.defs.set('zz', { id: 'zz', kind: 'story', giver: 'warden', stages: [{ text: 't', objectives: [{ type: 'talk', npc: 'warden' }], say: { warden: { trusted_ysolde: 'A', default: 'B' } } }] });
  const heard = (flag) => {
    log.flags.trusted_ysolde = flag;
    log.begin('zz');
    log.events = [];
    log.talkTo('warden');
    return log.events.find((e) => e.k === 'say')?.text;
  };
  check(heard(true) === 'A', 'a line keyed by a flag the character has is the one said');
  check(heard(false) === 'B', 'and without it, the default');
  const act2 = ACTS.find((A) => A.act === 2);
  check(act2?.title === 'Act II' && act2.sub === 'The Brood' && act2.levels === '8–16', 'Act II, The Brood (8–16), is in the journal\'s acts');
}

// ---------------------------------------------------------------- Act II's people and places
console.log('Act II\'s people and places:');
{
  const vey = storyRef(w, 'city2:captain');
  const veyNpc = vey?.npc && npc(vey.npc);
  const shown = veyNpc && settlementFolk(w.placeOf(veyNpc), veyNpc);
  check(shown?.name === 'Vey Okonta' && shown.title === 'Captain of the Watch', `Farcall's captain of the watch stands in the city (${shown?.name ?? 'nobody'})`);
  const quiet = ['quiet1', 'quiet2', 'quiet3'].map((r) => storyRef(w, r));
  check(quiet.every((h) => h?.poi && w.poiById(h.poi)?.type === 'hamlet') && new Set(quiet.map((h) => h?.poi)).size === 3, 'the three hamlets gone quiet are three different hamlets');
  const krell = storyRef(w, 'sporefield:krell');
  const k = krell?.npc && npc(krell.npc);
  const log = new QuestLog(host);
  log.active.b2 = [0];
  log.flags.krell_freed = true;
  check(!!k?.when && log.whenHolds(k.when), 'Krell, let go in Act I, turns up at the Spore Field');
  log.flags.krell_freed = false;
  log.flags.krell_captured = true;
  check(!!k?.when && !log.whenHolds(k.when), 'but not if he was taken in chains');
}

// ---------------------------------------------------------------- dungeon objectives
console.log('Dungeon objectives:');
{
  const dstats = new Stats();
  const dlog = new QuestLog({ ...host, stats: dstats });
  const dcore = new CharacterCore({
    stats: dstats, inventory: new Inventory(3), quests: dlog, attuned: new Set(['w-hub']), chests: new Set(), shop: { stock: [], fine: [] },
    settings: { lootFilter: 1 }, position, world: w, strict: true,
  });
  const clear = (d) => dcore.apply({ op: 'dclear', roll: { d, tier: 0, name: d } });
  dlog.defs.set('zd', { id: 'zd', kind: 'story', giver: 'warden', stages: [{ text: 't', objectives: [{ type: 'dungeon', d: 'brood', count: 1 }] }] });
  clear('brood');
  dlog.begin('zd');
  check(dlog.active.zd[0] === 0, 'a dungeon cleared before the step was taken doesn\'t count');
  clear('foundry');
  check(dlog.active.zd[0] === 0, 'nor does clearing a different one');
  clear('brood');
  check(dlog.isComplete('zd'), 'clearing it with the step under way does');
}

// ---------------------------------------------------------------- the story
console.log(`The story (seed ${seed}):`);
const maren = npc('warden');
by(maren);
run({ op: 'talk', npc: 'warden' });
check(quests.available('warden').some((q) => q.id === 'p1'), 'Warden Maren has the first quest for a new character');
away();
check(!op({ op: 'accept', id: 'p1' }).ok, 'it can\'t be taken from across the map');
by(maren);
check(!op({ op: 'accept', id: 'a1' }).ok, 'nor can Act I be taken before the Prologue');
for (const q of STORY) {
  const giver = npc(quests.giverId(q));
  if (!check(!!giver, `${q.id} · ${q.title}: its giver stands in the world (${giver?.name ?? quests.giverName(giver?.id ?? '')})`)) break;
  by(giver);
  run({ op: 'talk', npc: giver.id });
  if (!check(run({ op: 'accept', id: q.id }).ok, `  taken from ${quests.giverName(giver.id)}`)) break;
  const stages = quests.stagesOf(q).length;
  for (let s = 0; s < stages; s++) {
    const before = quests.stage[q.id] ?? 0;
    said = [];
    playStage(q.id);
    const moved = (quests.stage[q.id] ?? 0) > before || quests.isComplete(q.id);
    if (!check(moved, `  stage ${s + 1}/${stages} done: ${quests.fill(quests.stagesOf(q)[s].text, q)}${said.length ? ` — "${said[0].slice(0, 60)}…"` : ''}`)) break;
  }
  if (!quests.isComplete(q.id)) break;
  const to = quests.returnId(q);
  away();
  check(!op({ op: 'turnin', id: q.id }).ok, '  not handed in away from who it goes back to');
  by(npc(to));
  check(op({ op: 'turnin', id: q.id }).ok && quests.completed.has(q.id), `  handed in to ${quests.giverName(to)}${q.setFlags ? ` (${q.setFlags.join(', ')})` : ''}`);
}
check(quests.flags.act1_done && quests.flags.ironjaw_fell && quests.flags.vault_open, 'Act I complete: Ironjaw fell, the vault is open');
check(quests.flags.krell_captured && !quests.flags.krell_freed && quests.flags.trusted_ysolde, 'choices set their flags (Krell taken in chains, Ysolde told)');
check(quests.pick(STORY.find((q) => q.id === 'a6').turnIn).startsWith('Ironjaw dead, and his bookkeeper'), 'and what people say follows them');
check(STORY.every((q) => quests.completed.has(q.id)) && !Object.keys(quests.active).length, `all ${STORY.length} story quests done, the log clear`);
check(stats.level >= 5, `the story alone is worth some levels (level ${stats.level})`);

// ---------------------------------------------------------------- side chains
console.log('Side chains:');
const villages = [];
for (let r = 1; r < 9 && villages.length < 5; r++) {
  for (let rx = -r; rx <= r; rx++) {
    for (let rz = -r; rz <= r; rz++) {
      if (Math.max(Math.abs(rx), Math.abs(rz)) !== r) continue;
      for (const p of w.gen.region(rx, rz).pois) if (p.type === 'settlement' && SIDE_CHAINS[p.kind] && !villages.some((v) => v.kind === p.kind)) villages.push(p);
    }
  }
}
for (const v of villages) {
  const giver = v.npcs.find((n) => n.role === 'giver');
  const chain = SIDE_CHAINS[v.kind];
  let steps = 0;
  for (let k = 0; k < chain.quests.length; k++) {
    let q = Object.keys(quests.active).map((id) => quests.defs.get(id)).find((x) => x?.home === v.id);
    if (!q) {
      by(giver);
      const offer = run({ op: 'talk', npc: giver.id }).roll?.offer;
      if (!offer || !run({ op: 'accept', id: offer.id }).ok) break;
      q = quests.defs.get(offer.id);
    }
    for (let s = 0; s < quests.stagesOf(q).length && !quests.isComplete(q.id); s++) playStage(q.id);
    if (!quests.isComplete(q.id)) break;
    const to = quests.returnId(q);
    if (to) by(npc(to));
    if (!op({ op: 'turnin', id: q.id }).ok) break;
    steps++;
  }
  check(steps === chain.quests.length, `${v.name} (${v.kind}): "${chain.title}", ${steps} of ${chain.quests.length} quests done`);
}
const story = ['story_prologue', 'story_beacons', 'story_ironjaw', 'story_krell', 'story_act1', 'side_chain_1', 'side_chain_all'];
const missing = story.filter((id) => core.achievements[id] === undefined);
check(!missing.length, `the story's achievements earned along the way${missing.length ? ` (not: ${missing.join(', ')})` : ` (${story.length})`}`);

console.log(failed ? `questcheck: ${failed} failed` : 'questcheck: all good');
process.exit(failed ? 1 : 0);
