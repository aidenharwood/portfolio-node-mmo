// The story's flags (rpg/Quests.js QuestLog.flags): what has happened and what was chosen, saved
// with the character. Every flag the game sets or reads is listed here with what it means, what
// sets it and what reads it, named the way tools/questcheck.mjs finds them in the game:
//   '<quest> setFlags'                  set when the quest is handed in
//   '<quest> needFlags'                 the quest isn't offered until they're all set
//   '<quest> offer|turnIn|progress'     a line keyed by flags: { <flag>: text, …, default: text }
//   '<quest> stage <n> text|say|objectives'   the nth stage's lines, keyed the same way
//   '<quest> stage <n> done|choices'    set when the stage is done (done.flags), or by a choice
//   'side:<kind>:<k> …'                 the same, in the kth quest of a village's side chain
//   'bark <npc>' · 'folk <place>:<who>' a `when: { flag }` (rpg/storyline.js BARKS, world/story.js)
//   'dungeon <id>' · 'raid <id>'        a `needs: { flag }` (world/dungeons.js, world/raids.js)
//   'achievement <id>'                  flag(c, '<flag>') in its stat (rpg/achievements.js)
// questcheck holds this list to the game: a flag read but never set fails, one set but never read
// warns, and a flag missing here, or a setter or reader this list doesn't name, fails (it says
// what to write). `pending`: a flag the game reads before what sets it is built (it names that
// work). It warns instead of failing, and fails once something does set it, so the mark comes off.
import { QUESTS } from '../src/rpg/Quests.js';
import { ACHIEVEMENTS } from '../src/rpg/achievements.js';
import { SIDE_CHAINS } from '../src/rpg/sidequests.js';
import { BARKS } from '../src/rpg/storyline.js';
import { DUNGEONS } from '../src/world/dungeons.js';
import { RAIDS } from '../src/world/raids.js';
import { storyPlaces } from '../src/world/story.js';

export const STORY_FLAGS = {
  // ---------------------------------------------------------------- Prologue
  heard_pilgrim: { means: 'The Pilgrim\'s voice spoke to the player through the Brightwater waystone.', setBy: ['p3 setFlags'], readBy: [] },
  pilgrim_awake: { means: 'The wreck\'s bridge console woke and knew the player: unit seven, crew of the Pilgrim.', setBy: ['p4 setFlags'], readBy: [] },
  // ---------------------------------------------------------------- Act I: Signal Fire
  ironjaw_named: { means: 'The village raid was Ironjaw\'s, and his orders send every Maker stone to the Foundry.', setBy: ['a1 setFlags'], readBy: [] },
  met_ashe: { means: 'The player reached New Meridian and High Warden Ashe took them on.', setBy: ['a2 setFlags'], readBy: [] },
  key_half: { means: 'The relic dig\'s half of the Maker key is the Wardens\'; Ironjaw holds the other.', setBy: ['a3 setFlags'], readBy: [] },
  beacons_lit: { means: 'The signal beacons round New Meridian are lit.', setBy: ['a4 setFlags'], readBy: ['achievement story_beacons'] },
  has_pass: { means: 'The player took the Rustjaw gate-pass from the outpost.', setBy: ['a5 setFlags'], readBy: [] },
  ironjaw_fell: { means: 'Ironjaw is dead.', setBy: ['a6 setFlags'], readBy: ['achievement story_ironjaw'] },
  krell_captured: { means: 'Krell was sent to New Meridian in chains (the choice at a6).', setBy: ['a6 stage 3 choices'], readBy: ['a6 turnIn', 'a7 offer', 'achievement story_krell', 'b1 offer'] },
  krell_freed: { means: 'Krell was let go (the choice at a6).', setBy: ['a6 stage 3 choices'], readBy: ['achievement story_krell', 'bark sporefield:krell', 'folk sporefield:krell'] },
  vault_open: { means: 'The player opened the Sunken Vault, so it can be gone into.', setBy: ['a7 setFlags'], readBy: ['dungeon vault'] },
  trusted_ysolde: { means: 'The player told Ysolde the voice warned them at the vault (the choice at a8).', setBy: ['a8 stage 1 choices'], readBy: ['b5 stage 1 say'] },
  kept_secret: { means: 'The player kept the voice to themselves (the choice at a8).', setBy: ['a8 stage 1 choices'], readBy: [] },
  act1_done: { means: 'Act I is over.', setBy: ['a8 setFlags'], readBy: ['achievement story_act1'] },
  // ---------------------------------------------------------------- Act II: The Brood
  act2_started: { means: 'The player reached Farcall and its captain of the watch (b1).', setBy: ['b1 setFlags'], readBy: [] },
  hamlets_cleared: { means: 'The hamlets gone quiet were found and the spore pods burned (b2).', setBy: ['b2 setFlags'], readBy: [] },
  array_found: { means: 'The player found the Farcall Array calling the Hive, with Warden marks on it (b4).', setBy: ['b4 setFlags'], readBy: [] },
  told_ashe: { means: "The player chose to tell Ashe the Wardens' forgotten purpose (the choice at b5).", setBy: ['b5 stage 1 choices'], readBy: ['b10 stage 1 say', 'b5 turnIn', 'b6 offer'] },
  kept_wardens_secret: { means: "The player kept the Wardens' secret between themselves and Ysolde (the choice at b5).", setBy: ['b5 stage 1 choices'], readBy: ['b10 stage 1 say', 'b5 turnIn'] },
  psion_slain: { means: "The Hive Psion steering the swarms is dead; its chitin mapped the way to the Brood Pits (b6).", setBy: ['b6 setFlags'], readBy: [] },
  matron_read: { means: "The player read the Matron's nest-node: the Array's call feeds a deeper nest, the Brood Mother's (b8).", setBy: ['b8 setFlags'], readBy: [] },
  array_destroyed: { means: "The Farcall Array's transmitter is destroyed; its death-pulse woke the Synths (b9; Acts III and IV read it).", setBy: ['b9 setFlags'], readBy: [] },
  act2_done: { means: "Act II is over: the Array silenced, the Brood Mother's gate open (b12).", setBy: ['b12 setFlags'], readBy: [] },
  broodgate_open: {
    means: 'The Wardens opened the Brood Mother\'s raid gate to the player (DEC-4: one in a raid group or party who has it takes the rest in).',
    setBy: ['b11 setFlags'], readBy: ['raid broodmother'],
  },
};

// Flags the game makes as it runs, one per thing (listed here, not checked: their ids come from
// the world):
//   used:<object id>   a quest object (someone with role 'object') has been used. Set by
//                      QuestLog.useObject for any `use` objective; read by main.js refreshObject
//                      (the object's used look) and useObject (its "done" line).

// ---------------------------------------------------------------- finding them in the game
// A quest's own lines, which the quest log reads through QuestLog.fill (and so picks by flag), as
// it does a stage's text and say lines and its objectives' text.
const LINES = ['offer', 'turnIn', 'progress'];
// How an achievement's stat reads a flag (rpg/achievements.js `flag`).
const FLAG_CALL = /\bflag\(\s*\w+\s*,\s*['"]([^'"]+)['"]\s*\)/g;

// Story folk with a `when` (world/story.js), as the world places them: { who, when }.
export function storyFolk(world) {
  const out = [];
  for (const [key, P] of Object.entries(storyPlaces(world.gen))) {
    const poi = world.gen.region(P.rx, P.rz).pois.find((p) => p.story === key);
    for (const n of poi?.npcs ?? []) if (n.when) out.push({ who: n.object ?? `${key}:${n.folk ?? n.role}`, when: n.when });
  }
  return out;
}

// Every flag the game sets and reads: { set, read }, each a Map of flag → the Set of who. The
// sources are the game's own unless given (questcheck gives stand-ins to test the check itself).
export function flagUses(world, {
  quests = QUESTS, sideChains = SIDE_CHAINS, barks = BARKS, folk = storyFolk(world),
  instances = [...Object.values(DUNGEONS), ...Object.values(RAIDS)], achievements = ACHIEVEMENTS,
} = {}) {
  const set = new Map();
  const read = new Map();
  const add = (map, flag, who) => (map.get(flag) ?? map.set(flag, new Set()).get(flag)).add(who);
  // A line keyed by flags names every flag it reads (whether or not it has a default).
  const line = (t, who) => { if (t && typeof t === 'object') for (const f of Object.keys(t)) if (f !== 'default') add(read, f, who); };
  const quest = (q, id) => {
    for (const f of q.setFlags ?? []) add(set, f, `${id} setFlags`);
    for (const f of q.needFlags ?? []) add(read, f, `${id} needFlags`);
    for (const k of LINES) line(q[k], `${id} ${k}`);
    (q.stages ?? [{ objectives: q.objectives ?? [] }]).forEach((st, i) => {
      const at = `${id} stage ${i + 1}`;
      line(st.text, `${at} text`);
      for (const t of Object.values(st.say ?? {})) line(t, `${at} say`);
      for (const o of st.objectives ?? []) line(o.text, `${at} objectives`);
      for (const f of st.done?.flags ?? []) add(set, f, `${at} done`);
      for (const o of st.choices?.options ?? []) if (o.set) add(set, o.set, `${at} choices`);
    });
  };
  for (const q of quests) quest(q, q.id);
  // A village's chain as QuestLog.makeSide makes it: only its offer, turnIn and stages carry over.
  for (const [kind, chain] of Object.entries(sideChains)) {
    chain.quests.forEach((T, k) => quest({ offer: T.offer, turnIn: T.turnIn, stages: T.stages }, `side:${kind}:${k}`));
  }
  for (const b of barks) if (b.when?.flag) add(read, b.when.flag, `bark ${b.npc}`);
  for (const f of folk) if (f.when?.flag) add(read, f.when.flag, `folk ${f.who}`);
  for (const d of instances) if (d.needs?.flag) add(read, d.needs.flag, `${d.raid ? 'raid' : 'dungeon'} ${d.id}`);
  for (const a of achievements) for (const [, f] of String(a.stat).matchAll(FLAG_CALL)) add(read, f, `achievement ${a.id}`);
  return { set, read };
}

// What's wrong: flags read but never set (`unset`), set but never read (`unread`), missing from
// the registry (`unregistered`), registered but nowhere in the game (`stale`), and entries whose
// setters or readers differ from the game's (`wrong`: { flag, field, want }). A flag read but not
// set whose entry is `pending` goes in `pending`, not `unset`; one marked so that something now
// sets goes in `done`.
export function flagProblems({ set, read }, registry = STORY_FLAGS) {
  const all = [...new Set([...set.keys(), ...read.keys()])];
  const stale = Object.keys(registry).filter((f) => !set.has(f) && !read.has(f));
  const wrong = [];
  for (const [flag, e] of Object.entries(registry)) {
    if (stale.includes(flag)) continue;
    for (const [field, found] of [['setBy', set.get(flag)], ['readBy', read.get(flag)]]) {
      const want = [...(found ?? [])].sort();
      if ([...(e[field] ?? [])].sort().join('|') !== want.join('|')) wrong.push({ flag, field, want });
    }
  }
  const waiting = (f) => !!registry[f]?.pending;
  return {
    unset: all.filter((f) => !set.has(f) && !waiting(f)),
    pending: all.filter((f) => !set.has(f) && waiting(f)),
    done: Object.keys(registry).filter((f) => waiting(f) && set.has(f)),
    unread: all.filter((f) => !read.has(f)),
    unregistered: all.filter((f) => !Object.hasOwn(registry, f)),
    stale,
    wrong,
  };
}
