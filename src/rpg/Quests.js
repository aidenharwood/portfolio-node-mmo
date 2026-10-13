// Quests (gameplay phase 4: quest system v2). Every quest is staged: each stage has its objectives
// (all to be done before the next stage starts), a line for the journal, what people say at it, and
// maybe a choice that sets a story flag. Who gives a quest and who it goes back to are named by
// reference (world/story.js storyRef), so the server — which runs the same log for every character —
// checks them where they really stand.
//   the story          rpg/storyline.js: the Prologue and Act I, from Warden Maren, Old Ysolde and
//                      New Meridian's High Warden
//   side chains        rpg/sidequests.js: three quests for each kind of village, from its giver
//   the Wardens        contracts: clear a named camp near your level (every fourth, a stronghold) —
//                      Warden Maren and the Warden of every town's post and city's citadel
//   Old Ysolde         wake waystones, open caches, then hunts against whichever race is about
//   hamlet folk        errands: the camp raiding them, a pack to thin out, supplies lost in the wilds
//   quest boards       three postings at a time: bounties, camps to clear (or captives to free),
//                      salvage runs, waystone surveys and deliveries
//   bounty             repeatable: slay any dozen monsters
// Objective types: talk · goto · use · kill (enemy type, story tag, race, near a place) · killRace ·
// killAny · clear (a camp) · collect (quest drops) · defend (hold a place) · choose · attune · chest.
// Rewards: xp, gold, weapon / armor (generator options). Generated quests are saved whole.
// What happens (stages done, lines said, moments to play) collects in `events`, which the
// character's rules (rpg/CharacterCore.js) hand to the screen.
import { OLD_RACE } from '../combat/bestiary.js';
import { folkName } from '../world/settlements.js';
import { storyRef } from '../world/story.js';
import { STORY } from './storyline.js';
import { SIDE_CHAINS } from './sidequests.js';

export const QUESTS = [
  {
    id: 'ys1', kind: 'side', giver: 'sage', title: 'Stones That Remember',
    offer: 'Old waystones stand all across this land, dear. Wake four of them and it will carry you between them in a blink.',
    progress: 'Touch a waystone and it remembers you. Your map will show the ones you\'ve found.',
    turnIn: 'You can feel them humming, can\'t you? Here, this will keep you warm on the road.',
    objectives: [{ type: 'attune', count: 4, text: 'Attune waystones' }],
    rewards: { xp: 150, gold: 60, armor: { minTier: 1 } },
  },
  {
    id: 'ys2', kind: 'side', giver: 'sage', requires: ['ys1'], title: 'High Places',
    offer: 'Treasure always ends up somewhere awkward. Towers, mesas, old ruins. Climb, jump, scramble — and bring me back stories.',
    progress: 'Look up. Chests glint on high ground — your map marks the ones you\'ve seen.',
    turnIn: 'A born climber! Take this, it\'ll serve you better than it serves my shelf.',
    objectives: [{ type: 'chest', count: 3, text: 'Open treasure chests' }],
    rewards: { xp: 260, gold: 120, weapon: { minTier: 2 } },
  },
  {
    id: 'bounty', kind: 'contract', giver: 'warden', repeatable: true, title: 'Warden\'s Bounty',
    offer: 'There\'s always more of them. Cull a dozen of anything out there and the bounty\'s yours. Standing offer.',
    progress: 'Any monster counts. Come back when it\'s a dozen.',
    turnIn: 'Bounty paid. Same again whenever you like.',
    objectives: [{ type: 'killAny', count: 12, text: 'Slay any monsters' }],
    rewards: { xp: 120, gold: 70, weapon: { minTier: 1 } },
  },
  ...STORY,
];

const RACE = {
  scav: {
    name: 'the Scav Clans', plural: 'scavs', seat: 'Their warlord holds it, in an exo-suit with a hammer the size of a door.',
    line: 'Raiders in salvaged armour — they\'ll swarm you, then the grenades start flying. Drop the tech first.',
  },
  hive: {
    name: 'the Hive', plural: 'hive-spawn', seat: 'A queen broods at the heart of it.',
    line: 'Bugs that came down with the old ships, and they breed. Burn the nests, and don\'t let the psions linger.',
  },
  synth: {
    name: 'the Synths', plural: 'rogue synths', seat: 'A colossus stands guard over the foundry.',
    line: 'War machines nobody switched off. Their sentries hit hard and die fast; the big ones don\'t.',
  },
  fauna: {
    name: 'the Wild', plural: 'wild things', seat: 'Something huge has made it its lair.',
    line: 'Packs that hunt together. Keep your back to something solid.',
  },
};

const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
export function compass(dx, dz) {
  const a = Math.atan2(dz, dx);
  return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());
const pickOf = (list) => list[Math.floor(Math.random() * list.length)];
const FIXED = new Set(['warden', 'sage', 'trader']);
// Which journal tab a quest belongs on.
export const TAB_OF = { story: 'story', side: 'side', errand: 'side', contract: 'contracts', hunt: 'contracts', job: 'contracts' };

// A hamlet's errands, in the voice of its kind (world/places.js HAMLETS).
const ERRAND = {
  raid: {
    farm: (c, where) => `Raiders out of ${c.name} keep hitting our stores — ${where}. We're farmers, not fighters. Make them stop.`,
    prospect: (c, where) => `That lot at ${c.name} jumped our claim twice this month. They're ${where}. Clear them out and we can dig in peace.`,
    fen: (c, where) => `Our boats keep going missing, and the tracks lead to ${c.name}, ${where}. Go and see to it, would you?`,
    nomad: (c, where) => `We can't move on with ${c.name} sitting on the road ahead — ${where}. Clear the way for us.`,
  },
  cull: {
    farm: (R, n) => `${cap(R.plural)} have been at the fields every night. Thin them out — ${n} should keep them off a while.`,
    prospect: (R, n) => `${cap(R.plural)} are nesting in the old cuts. Put down ${n} of them and we can work the seam again.`,
    fen: (R, n) => `Something keeps coming out of the reeds after dark. ${cap(R.plural)}, mostly. ${n} fewer and we'd sleep.`,
    nomad: (R, n) => `The ${R.plural} have been trailing the herd for days. Cull ${n} before they get brave.`,
  },
  salvage: {
    farm: () => 'A supply drop came down in the hills and never reached us. There are caches all over out there — open a couple and bring me word.',
    prospect: () => 'Old survey caches are scattered round these parts, on the high ground mostly. Crack two open — keep what\'s inside, I just want the charts.',
    fen: () => 'The flood took our stores and scattered them. Any cache you find out there might be ours. Open two for me?',
    nomad: () => 'We left caches along our last route and the wilds have had them since. Find two — what\'s in them is yours, the luck is ours.',
  },
};

export class QuestLog {
  constructor(game) {
    this.game = game;
    this.defs = new Map(QUESTS.map((q) => [q.id, q]));
    this.active = {};  // id → [progress per objective of its current stage]
    this.stage = {};   // id → its current stage (absent: the first)
    this.completed = new Set();
    this.flags = {};   // story flags: what has happened, and what was chosen
    this.contracts = 0;
    this.hunts = 0;
    this.jobs = 0;     // errands, side quests and board postings taken
    this.issued = 0;   // generated quests offered (for their ids)
    this.offers = {};  // giver id → generated offer (not yet accepted)
    this.none = new Map(); // giver id → when it last had nothing to offer (asked again later)
    this.events = [];  // for the screen: banners, lines said, moments
    // Whether offers are made up here. Online, the server makes them (rpg/CharacterCore.js 'talk')
    // and this copy only shows what it was given.
    this.generate = true;
  }

  get world() { return this.game.world; }

  // ---------------------------------------------------------------- who and where
  // A reference (or an id) as the world has it: { x, z, r, name, npc?, poi?, camp? }.
  ref(ref, q = null) {
    if (!ref || !this.world) return null;
    if (typeof ref === 'string' && (ref.startsWith('n:') || FIXED.has(ref))) {
      const n = this.world.npcById?.(ref);
      return n ? { x: n.x, z: n.z, r: 3, name: n.name ?? folkName(n, this.world.placeOf?.(n)), npc: n.id } : null;
    }
    return storyRef(this.world, ref, { home: q?.home });
  }

  // The id of the person a reference names (a quest board's slots stay as they are).
  npcOf(ref, q = null) {
    if (!ref) return null;
    if (typeof ref === 'string' && (ref.startsWith('n:') || FIXED.has(ref))) return ref;
    return this.ref(ref, q)?.npc ?? null;
  }
  giverId(q) { return this.npcOf(q.giver, q); }
  // Who a finished quest goes back to: its `returnTo`, else its giver; null when it finishes
  // where it's done.
  returnId(q) { return q.returnTo === null ? null : this.npcOf(q.returnTo ?? q.giver, q); }

  giverOf(id) { return this.world?.npcById?.(id) ?? null; }
  roleOf(id) { return id === 'warden' || id === 'sage' ? id : this.giverOf(id)?.role ?? null; }
  placeOf(id) {
    const n = this.giverOf(id);
    return n ? this.world.placeOf?.(n) ?? null : null;
  }
  placeName(p) { return p?.cityName ?? p?.name ?? 'the settlement'; }

  // The name to go back to with a finished quest.
  giverName(id) {
    if (id === 'warden') return 'Warden Maren';
    if (id === 'sage') return 'Old Ysolde';
    const n = this.giverOf(id);
    if (!n) return 'whoever sent you';
    const where = this.placeName(this.placeOf(id));
    if (n.role === 'board') return `the quest board in ${where}`;
    if (n.name) return `${n.name}${where && !n.name.includes(where) ? ` in ${where}` : ''}`;
    return `${n.role === 'warden' ? 'Warden ' : ''}${folkName(n, this.placeOf(id))} at ${where}`;
  }

  // Who to go back to with a quest (or where it finishes).
  returnTo(q) {
    if (q.from) return q.from;
    const id = this.returnId(q);
    return id ? this.giverName(id) : 'finishes where it\'s done';
  }

  // A line with its {references} filled in: a place's name, or {ref:dir} — which way it lies from
  // Brightwater (or the quest's home).
  fill(text, q = null) {
    if (typeof text !== 'string') text = this.pick(text);
    return (text ?? '').replace(/\{([\w:-]+)\}/g, (m, key) => {
      if (key.endsWith(':dir')) {
        const t = this.ref(key.slice(0, -4), q);
        const from = (q?.home && this.world?.poiById?.(q.home)) || this.giverRefPoint(q) || { x: 0, z: 0 };
        return t ? compass(t.x - from.x, t.z - from.z) : 'somewhere';
      }
      return this.ref(key, q)?.name ?? key.split(':')[0];
    });
  }
  giverRefPoint(q) { return q ? this.ref(q.giver, q) : null; }
  // A line that differs by what's happened ({ flag: text, default }).
  pick(t) {
    if (!t || typeof t === 'string') return t;
    for (const [flag, text] of Object.entries(t)) if (flag !== 'default' && this.flags[flag]) return text;
    return t.default;
  }

  // ---------------------------------------------------------------- stages
  stagesOf(q) { return q?.stages ?? (q?.objectives ? [{ text: q.progress, objectives: q.objectives }] : []); }
  stageOf(id) {
    const q = this.defs.get(id);
    return this.stagesOf(q)[this.stage[id] ?? 0] ?? null;
  }
  objectivesOf(id) { return this.stageOf(id)?.objectives ?? []; }
  lastStage(id) { return (this.stage[id] ?? 0) >= this.stagesOf(this.defs.get(id)).length - 1; }

  // ---------------------------------------------------------------- offers
  requirementsMet(q) {
    const req = q.requires ? [].concat(q.requires) : [];
    return req.every((r) => this.completed.has(r)) && (q.needFlags ?? []).every((f) => this.flags[f]);
  }

  available(npcId) {
    const out = [...this.defs.values()].filter((q) => !q.generated && !this.active[q.id]
      && (q.repeatable || !this.completed.has(q.id)) && this.requirementsMet(q) && this.giverId(q) === npcId);
    const gen = this.offer(npcId);
    if (gen) out.unshift(gen);
    return out;
  }

  readyToTurnIn(npcId) {
    return Object.keys(this.active).filter((id) => this.isComplete(id) && this.returnId(this.defs.get(id)) === npcId).map((id) => this.defs.get(id));
  }

  inProgress(npcId) {
    return Object.keys(this.active).filter((id) => {
      const q = this.defs.get(id);
      return q && !this.isComplete(id) && (this.giverId(q) === npcId || this.returnId(q) === npcId);
    }).map((id) => this.defs.get(id));
  }

  nextId(kind) { return `${kind}:${++this.issued}`; }

  // The giver's next generated quest (one at a time, only while none of theirs is running).
  offer(npcId, generate = this.generate) {
    if (Object.keys(this.active).some((id) => this.defs.get(id)?.generated && this.defs.get(id).giver === npcId)) return null;
    if (this.offers[npcId] || !generate) return this.offers[npcId] ?? null;
    if (Date.now() - (this.none.get(npcId) ?? -Infinity) < 15000) return null;
    const role = this.roleOf(npcId);
    let q = null;
    if (role === 'warden') q = this.makeContract(npcId);
    else if (role === 'sage') q = this.completed.has('ys2') ? this.makeHunt() : null;
    else if (role === 'giver') q = this.placeOf(npcId)?.type === 'settlement' ? this.makeSide(npcId) : this.makeErrand(npcId);
    else if (role === 'board') q = this.makeJob(npcId);
    if (q) {
      q.from ??= this.giverName(npcId);
      this.offers[npcId] = q;
    } else this.none.set(npcId, Date.now());
    return q;
  }

  // Camps near (x, z) nobody's quest already names, still standing (and not the story's own).
  openCamps(x, z, range) {
    const g = this.game;
    return g.world.poisNear(x, z, range, ['camp']).filter((c) => !c.story && !g.encounters.isCleared(c.id) && !this.claimed(c.id));
  }

  // The camp that fits best: near, and near `level`.
  bestCamp(list, x, z, level) {
    let best = null;
    let bestScore = Infinity;
    for (const c of list) {
      const score = Math.hypot(c.x - x, c.z - z) / 120 + Math.abs(c.level - level) * 2.5;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  where(c, p) {
    const dir = compass(c.x - p.x, c.z - p.z);
    const dist = Math.round(Math.hypot(c.x - p.x, c.z - p.z) / 10) * 10;
    return { dir, dist, text: `about ${dist} metres ${dir}` };
  }

  makeContract(giver = 'warden') {
    const g = this.game;
    const lvl = g.stats.level;
    const p = g.player.position;
    const n = this.contracts + 1;
    // Every fourth contract is a stronghold if one is in reach; otherwise the best-fitting camp.
    const camps = this.openCamps(p.x, p.z, 1100);
    const best = (n % 4 === 0 && this.bestCamp(camps.filter((c) => c.stronghold), p.x, p.z, lvl + 1)) || this.bestCamp(camps.filter((c) => !c.stronghold), p.x, p.z, lvl);
    if (!best) return null;
    const region = g.world.regionAt(best.x, best.z);
    const { dir, dist } = this.where(best, p);
    const R = RACE[best.race];
    const lv = best.level;
    const hub = giver === 'warden';
    return {
      id: this.nextId('contract'), kind: 'contract', giver, theme: 'warden', generated: true, target: best.id,
      title: best.stronghold ? `Siege: ${best.name}` : `Contract: ${best.name}`,
      offer: best.stronghold
        ? `${best.name} — ${R.name} have dug in there, in ${region.name}, about ${dist} metres ${dir}. ${R.seat} Break the place and end whatever sits on that throne.`
        : `There's a camp of ${R.plural} — ${best.name}, out in ${region.name}, about ${dist} metres ${dir}. ${R.line} Clear it out.`,
      progress: `${best.name} lies ${dir} of here, in ${region.name}. Your map marks it.`,
      turnIn: best.stronghold
        ? (hub ? 'You broke their stronghold. Songs will be sung — badly, by Tobbin, but sung.' : 'You broke their stronghold. The whole town will be drinking to you tonight.')
        : `${best.name}'s quiet. Good work. There'll be another.`,
      objectives: [{ type: 'clear', camp: best.id, count: 1, text: `Clear ${best.name}` }],
      rewards: {
        xp: Math.round((90 + lv * 45) * (best.stronghold ? 2.5 : 1)),
        gold: Math.round((40 + lv * 22) * (best.stronghold ? 2.5 : 1)),
        ...(best.stronghold ? { weapon: { minTier: 3 } } : n % 2 ? { weapon: { minTier: 1 } } : { armor: { minTier: 1 } }),
      },
    };
  }

  makeHunt() {
    const g = this.game;
    const p = g.player.position;
    const races = new Set(g.world.poisNear(p.x, p.z, 700, ['camp']).map((c) => c.race));
    const list = [...races];
    if (!list.length) return null;
    const race = list[this.hunts % list.length];
    const R = RACE[race];
    const n = this.hunts + 1;
    const count = 8 + Math.min(10, n * 2);
    return {
      id: this.nextId('hunt'), kind: 'hunt', giver: 'sage', generated: true,
      title: `Hunting ${cap(R.name.replace(/^the /, ''))}`,
      offer: `The ${R.plural} are stirring, dear. ${R.line} Thin them — ${count} should do it — and I'll make it worth your while.`,
      progress: `Any of ${R.name} will do. Their camps are marked as you find them.`,
      turnIn: 'There. The land breathes a little easier. Take this.',
      objectives: [{ type: 'killRace', race, count, text: `Slay ${R.plural}` }],
      rewards: { xp: 100 + g.stats.level * 40, gold: 50 + g.stats.level * 20, ...(n % 2 ? { armor: { minTier: 2 } } : { weapon: { minTier: 2 } }) },
    };
  }

  // The next quest of a village's side chain (rpg/sidequests.js), made the same on every copy (so
  // a chain can carry straight on from a step that finishes where it's done).
  makeSide(npcId, place = this.placeOf(npcId)) {
    const chain = SIDE_CHAINS[place?.kind];
    if (!chain) return null;
    const k = chain.quests.findIndex((_, i) => !this.completed.has(`side:${place.kind}:${i}@${place.id}`));
    if (k < 0) return null;
    const T = chain.quests[k];
    const lvl = this.game.stats.level;
    const q = {
      id: `side:${place.kind}:${k}@${place.id}`, kind: 'side', chain: chain.title, step: k, generated: true, record: true, home: place.id,
      giver: npcId, returnTo: T.returnTo, title: `${chain.title}: ${T.title}`, offer: T.offer, turnIn: T.turnIn,
      stages: JSON.parse(JSON.stringify(T.stages)),
      rewards: { xp: Math.round((60 + lvl * 32) * T.k), gold: Math.round((30 + lvl * 15) * T.k), ...(T.item ? (k % 2 ? { armor: { minTier: 2 } } : { weapon: { minTier: 2 } }) : {}) },
    };
    q.from = this.returnTo(q);
    return q;
  }

  // A hamlet's errand: the camp nearest them that's raiding them, a pack of the local faction to
  // thin out, or supplies lost in the wilds.
  makeErrand(giver) {
    const g = this.game;
    const place = this.placeOf(giver);
    if (!place) return null;
    const lvl = g.stats.level;
    const style = { farm: 'farm', prospect: 'prospect', fen: 'fen', nomad: 'nomad' }[place.kind] ?? 'farm';
    const camp = this.bestCamp(this.openCamps(place.x, place.z, 450).filter((c) => !c.stronghold), place.x, place.z, lvl);
    const kinds = camp ? ['raid', 'raid', 'cull', 'salvage'] : ['cull', 'salvage'];
    const kind = pickOf(kinds);
    const name = this.placeName(place);
    const item = Math.random() < 0.5 ? { armor: { minTier: 1 } } : { weapon: { minTier: 1 } };
    const pay = (k) => ({ xp: Math.round((70 + lvl * 35) * k), gold: Math.round((35 + lvl * 16) * k), ...item });
    const base = { id: this.nextId('errand'), kind: 'errand', giver, generated: true };
    if (kind === 'raid') {
      const { text, dir } = this.where(camp, place);
      return {
        ...base, target: camp.id, title: `${name}: ${camp.name}`, offer: ERRAND.raid[style](camp, text),
        progress: `${camp.name} lies ${dir} of ${name}. Your map marks it.`,
        turnIn: 'They won\'t be back in a hurry. Thank you — here, it isn\'t much, but it\'s yours.',
        objectives: [{ type: 'clear', camp: camp.id, count: 1, text: `Clear ${camp.name}` }], rewards: pay(1.3),
      };
    }
    if (kind === 'cull') {
      const race = g.world.regionAt(place.x, place.z).race;
      const R = RACE[race];
      const count = 8 + Math.min(6, Math.floor(lvl / 3));
      return {
        ...base, title: `${name}: Trouble at Night`, offer: ERRAND.cull[style](R, count),
        progress: `Any of ${R.name} will do — their camps are marked as you find them.`,
        turnIn: 'Quiet nights again. You have our thanks — and this.',
        objectives: [{ type: 'killRace', race, count, text: `Slay ${R.plural}` }], rewards: pay(1),
      };
    }
    return {
      ...base, title: `${name}: Lost Supplies`, offer: ERRAND.salvage[style](),
      progress: 'Caches glint on towers, mesas and ruins — your map marks the ones you\'ve seen.',
      turnIn: 'You found them! Well — some of them. That\'s more than we\'d hoped for.',
      objectives: [{ type: 'chest', count: 2, text: 'Open treasure chests' }], rewards: pay(1),
    };
  }

  // A quest board's posting (`slot`: "<board id>#k"): a bounty on the local faction; a camp to
  // clear (sometimes with captives to free); a salvage run, a survey of the waystones, or a
  // delivery to the next settlement — posted by the place's Wardens.
  makeJob(slot) {
    const g = this.game;
    const place = this.placeOf(slot);
    const board = this.giverOf(slot);
    if (!place || !board) return null;
    const lvl = g.stats.level;
    const k = Number(slot.split('#')[1]) || 0;
    const name = this.placeName(place);
    const race = g.world.regionAt(board.x, board.z).race;
    const R = RACE[race];
    const n = this.jobs + this.issued;
    const type = k === 0 ? 'bounty' : k === 1 ? 'clear' : ['salvage', 'survey', 'delivery'][n % 3];
    const item = (k + n) % 3 === 0 ? { armor: { minTier: 1 } } : (k + n) % 3 === 1 ? { weapon: { minTier: 1 } } : {};
    const base = { id: this.nextId('job'), kind: 'job', giver: slot, theme: 'warden', generated: true };
    const posted = `Posted by the Wardens of ${name}:`;
    if (type === 'clear') {
      const camp = this.bestCamp(this.openCamps(board.x, board.z, 800).filter((c) => !c.stronghold), board.x, board.z, lvl + 1);
      if (camp) {
        const { text, dir } = this.where(camp, board);
        const rescue = n % 2 === 1;
        return {
          ...base, target: camp.id, title: rescue ? `Rescue: ${camp.name}` : `Wanted Cleared: ${camp.name}`,
          offer: rescue
            ? `${posted} Settlers taken on the road are held at ${camp.name}, ${text}. Break the camp and they'll find their own way home; the reward is held here.`
            : `${posted} ${camp.name}, ${text}. ${RACE[camp.race].line} Clear the camp; the reward is held here.`,
          progress: `${camp.name} lies ${dir} of ${name}. Your map marks it.`,
          turnIn: rescue ? 'Word came ahead of you: the captives are walking home. Paid, with thanks.' : 'You tear the notice down. The Wardens\' seal on the back is stamped PAID.',
          objectives: [{ type: 'clear', camp: camp.id, count: 1, text: rescue ? `Free the captives at ${camp.name}` : `Clear ${camp.name}` }],
          rewards: { xp: 95 + camp.level * 45, gold: 45 + camp.level * 22, ...item },
        };
      }
    }
    if (type === 'delivery') {
      const to = g.world.poisNear(place.x, place.z, 900, ['settlement', 'town', 'city']).filter((p) => p.id !== place.id && p.npcs?.some((m) => m.role === 'trader'))
        .sort((a, b) => Math.hypot(a.x - place.x, a.z - place.z) - Math.hypot(b.x - place.x, b.z - place.z))[0];
      const trader = to?.npcs.find((m) => m.role === 'trader');
      if (trader) {
        const { text } = this.where(to, place);
        return {
          ...base, returnTo: trader.id, title: `Delivery: ${to.name}`,
          offer: `${posted} A sealed satchel for the trader at ${to.name}, ${text}. Carry it there; they pay on delivery.`,
          progress: `Take the satchel to ${to.name}.`,
          turnIn: 'The trader breaks the seal, counts what\'s inside twice, and pays you.',
          objectives: [{ type: 'talk', npc: trader.id, count: 1, text: `Deliver the satchel at ${to.name}` }],
          rewards: { xp: 70 + lvl * 30, gold: 60 + lvl * 22, ...item },
        };
      }
    }
    if (type === 'salvage') {
      return {
        ...base, title: 'Salvage Run',
        offer: `${posted} Caches lie forgotten out in the wilds — on towers, mesas, in ruins. Open three and bring word; the charts are worth paying for.`,
        progress: 'Caches glint on high ground — your map marks the ones you\'ve seen.',
        turnIn: 'You pin your notes to the board. A runner hands you the purse.',
        objectives: [{ type: 'chest', count: 3, text: 'Open treasure chests' }], rewards: { xp: 70 + lvl * 32, gold: 50 + lvl * 20, ...item },
      };
    }
    if (type === 'survey') {
      return {
        ...base, title: 'Survey the Stones',
        offer: `${posted} The waystone network is waking. Attune two stones you haven't touched yet and report back.`,
        progress: 'Any waystone you haven\'t attuned counts. The map shows the ones you\'ve found.',
        turnIn: 'You mark the stones on the Wardens\' chart. Paid in full.',
        objectives: [{ type: 'attune', count: 2, text: 'Attune waystones' }], rewards: { xp: 90 + lvl * 30, gold: 40 + lvl * 16, ...item },
      };
    }
    const count = 10 + Math.min(8, Math.floor(lvl / 2));
    return {
      ...base, title: `Bounty: ${cap(R.plural)}`,
      offer: `${posted} ${R.line} ${count} confirmed kills of ${R.name} pays out here.`,
      progress: `Any of ${R.name} will do. Their camps are marked as you find them.`,
      turnIn: 'The clerk counts your tally twice, then pays.',
      objectives: [{ type: 'killRace', race, count, text: `Slay ${R.plural}` }], rewards: { xp: 80 + lvl * 36, gold: 40 + lvl * 18, ...item },
    };
  }

  setOffer(npcId, q) {
    if (q) this.offers[npcId] = q;
    else delete this.offers[npcId];
  }

  // The quest `id` if it can be taken on now: a giver's current offer, or a fixed quest whose turn
  // has come.
  offerable(id) {
    if (this.active[id]) return null;
    const offered = Object.values(this.offers).find((q) => q?.id === id);
    if (offered) return offered;
    const q = this.defs.get(id);
    if (!q || q.generated) return null;
    if (!q.repeatable && this.completed.has(id)) return null;
    return this.requirementsMet(q) ? q : null;
  }

  // Is a camp already the target of a running quest?
  claimed(campId) {
    return Object.keys(this.active).some((id) => this.defs.get(id)?.target === campId);
  }

  accept(id) {
    const offered = Object.values(this.offers).find((q) => q?.id === id);
    if (offered) {
      this.defs.set(id, offered);
      delete this.offers[offered.giver];
      const kind = offered.kind ?? (offered.giver === 'warden' ? 'contract' : 'hunt');
      if (kind === 'contract') this.contracts++;
      else if (kind === 'hunt') this.hunts++;
      else this.jobs++;
    }
    this.begin(id);
    const q = this.defs.get(id);
    if (q.moments?.accept) this.events.push({ k: 'moment', id: q.moments.accept });
  }

  // A quest under way, at its first stage.
  begin(id) {
    this.stage[id] = 0;
    this.active[id] = this.objectivesOf(id).map(() => 0);
    this.startStage(id);
  }

  startStage(id) {
    const st = this.stageOf(id);
    if (st?.start?.moment) this.events.push({ k: 'moment', id: st.start.moment });
    this.events.push({ k: 'quest', id });
  }

  isComplete(id) {
    const prog = this.active[id];
    if (!prog || !this.defs.get(id)) return false;
    return this.lastStage(id) && this.objectivesOf(id).every((o, i) => prog[i] >= (o.count ?? 1));
  }

  // Finished: the rewards (CharacterCore rolls any item), story flags, the next step of a side
  // chain that carries straight on.
  turnIn(id) {
    if (!this.isComplete(id)) return null;
    const q = this.defs.get(id);
    delete this.active[id];
    delete this.stage[id];
    if (q.generated) this.defs.delete(id);
    if (!q.generated || q.record) this.completed.add(id);
    for (const f of q.setFlags ?? []) this.flags[f] = true;
    if (q.moments?.done) this.events.push({ k: 'moment', id: q.moments.done });
    this.events.push({ k: 'quest', id });
    // A side chain's next step, when this one finished out where it was done.
    if (q.kind === 'side' && q.returnTo === null) {
      const next = this.makeSide(q.giver, this.world?.poiById?.(q.home));
      if (next) {
        this.defs.set(next.id, next);
        this.jobs++;
        this.begin(next.id);
        this.events.push({ k: 'banner', title: next.title, sub: this.fill(this.stagesOf(next)[0]?.text ?? '', next) });
      }
    }
    return q.rewards;
  }

  // Progress: every objective of a running quest's current stage that `match` accepts moves on
  // one; a stage done moves the quest to its next (its moment, its line in the journal), the last
  // one done says where to take it.
  advance(match) {
    for (const id of Object.keys(this.active)) {
      const q = this.defs.get(id);
      if (!q) continue;
      const prog = this.active[id];
      let moved = false;
      this.objectivesOf(id).forEach((o, i) => {
        if (prog[i] < (o.count ?? 1) && match(o, q)) {
          prog[i]++;
          moved = true;
        }
      });
      if (moved) this.settle(id);
    }
  }

  // One objective of one quest moves on (a place reached, a defence held, a quest drop found).
  bump(id, i, type) {
    const prog = this.active[id];
    const o = this.objectivesOf(id)[i];
    if (!prog || !o || o.type !== type || prog[i] >= (o.count ?? 1)) return false;
    prog[i]++;
    this.settle(id);
    return true;
  }

  // After progress: a stage done carries on to the next, or the quest is ready to hand in.
  settle(id) {
    const q = this.defs.get(id);
    const prog = this.active[id];
    if (!q || !prog || !this.objectivesOf(id).every((o, i) => prog[i] >= (o.count ?? 1))) return;
    if (prog.done) return;
    const st = this.stageOf(id);
    if (st?.done?.moment) this.events.push({ k: 'moment', id: st.done.moment });
    for (const f of st?.done?.flags ?? []) this.flags[f] = true;
    if (!this.lastStage(id)) {
      this.stage[id] = (this.stage[id] ?? 0) + 1;
      this.active[id] = this.objectivesOf(id).map(() => 0);
      this.events.push({ k: 'banner', title: q.title, sub: this.fill(this.stageOf(id)?.text ?? '', q) });
      this.startStage(id);
      return;
    }
    Object.defineProperty(prog, 'done', { value: true, enumerable: false, configurable: true });
    if (q.returnTo === null) this.events.push({ k: 'autoturnin', id });
    else this.events.push({ k: 'banner', title: 'Quest Complete', sub: `${q.title} — return to ${this.returnTo(q)}` });
    this.events.push({ k: 'quest', id });
  }

  // Is (x, z) where an objective's place reference means (`near` / `at`)?
  within(o, q, x, z, pad = 0) {
    const ref = o.near ?? o.at;
    if (!ref) return true;
    const t = this.ref(ref, q);
    return !!t && Math.hypot(t.x - x, t.z - z) <= (o.r ?? t.r ?? 20) + pad;
  }

  // ---------------------------------------------------------------- what the world reports
  // A kill credited to this character: { type, race, tag, at: [x, y, z] }.
  onKill(k) {
    const at = k.at ?? [0, 0, 0];
    this.advance((o, q) => {
      if (o.type === 'killAny') return this.within(o, q, at[0], at[2], 30);
      if (o.type === 'killRace') return o.race === k.race && this.within(o, q, at[0], at[2], 30);
      if (o.type !== 'kill') return false;
      return (!o.enemy || o.enemy === k.type) && (!o.tag || o.tag === k.tag) && (!o.race || o.race === k.race) && this.within(o, q, at[0], at[2], 30);
    });
  }

  onCampCleared(campId) {
    this.advance((o, q) => o.type === 'clear' && (o.camp === campId || this.ref(o.camp, q)?.camp === campId || (this.ref(o.camp, q)?.camp === true && this.ref(o.camp, q)?.poi === campId)));
  }

  // Talked to someone: their line for a quest's stage (said before it moves on), and progress on
  // any objective to talk to them.
  talkTo(npcId) {
    for (const id of Object.keys(this.active)) {
      const q = this.defs.get(id);
      const st = this.stageOf(id);
      if (!q || !st?.say) continue;
      for (const [ref, text] of Object.entries(st.say)) {
        if (this.npcOf(ref, q) === npcId) this.events.push({ k: 'say', npc: npcId, text: this.fill(text, q), quest: id });
      }
    }
    this.advance((o, q) => o.type === 'talk' && this.npcOf(o.npc, q) === npcId);
  }

  // Used an object (one of the folk with role 'object'): progress on any objective naming it.
  useObject(npcId) {
    let hit = false;
    this.advance((o, q) => {
      const ok = o.type === 'use' && this.npcOf(o.object, q) === npcId;
      hit ||= ok;
      return ok;
    });
    if (hit) this.flags[`used:${npcId}`] = true;
    return hit;
  }

  // The choice a stage offers someone (its `choices`), if they're who `npcId` is.
  choiceAt(id, npcId) {
    const q = this.defs.get(id);
    const c = this.stageOf(id)?.choices;
    return c && this.npcOf(c.npc, q) === npcId && this.active[id] ? c : null;
  }

  // Answered: the option's flag set, its reply said, the stage's 'choose' objective done.
  choose(id, i, npcId) {
    const c = this.choiceAt(id, npcId);
    const opt = c?.options?.[i];
    if (!opt) return false;
    if (opt.set) this.flags[opt.set] = true;
    if (opt.reply) this.events.push({ k: 'say', npc: npcId, text: opt.reply, quest: id });
    const prog = this.active[id];
    const objectives = this.objectivesOf(id);
    const at = objectives.findIndex((o, k) => o.type === 'choose' && prog[k] < (o.count ?? 1));
    if (at !== -1) this.bump(id, at, 'choose');
    return true;
  }

  // Does a running quest want this one now — someone to talk to or answer, an object to use?
  wants(npcId) {
    for (const id of Object.keys(this.active)) {
      const q = this.defs.get(id);
      const prog = this.active[id];
      const objectives = this.objectivesOf(id);
      for (let i = 0; i < objectives.length; i++) {
        const o = objectives[i];
        if (prog[i] >= (o.count ?? 1)) continue;
        if ((o.type === 'talk' || o.type === 'choose') && this.npcOf(o.npc, q) === npcId) return true;
        if (o.type === 'use' && this.npcOf(o.object, q) === npcId) return true;
      }
    }
    return false;
  }

  // A condition on the story's state (story folk who only appear at a stage, what people call
  // out): { quest, stage } running at that stage · { notStarted } · { flag } · { done }.
  whenHolds(c) {
    if (!c) return true;
    if (c.flag && !this.flags[c.flag]) return false;
    if (c.done && !this.completed.has(c.done)) return false;
    if (c.notStarted && (this.active[c.notStarted] || this.completed.has(c.notStarted))) return false;
    if (c.quest && (!this.active[c.quest] || (c.stage !== undefined && (this.stage[c.quest] ?? 0) !== c.stage))) return false;
    return true;
  }

  // Generated quests offered or begun elsewhere (the server's), and the active ones' stages.
  activeIds(tab = null) { return Object.keys(this.active).filter((id) => !tab || TAB_OF[this.defs.get(id)?.kind ?? 'contract'] === tab); }

  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }

  toJSON() {
    const generated = Object.keys(this.active).map((id) => this.defs.get(id)).filter((q) => q?.generated);
    return {
      active: this.active, stage: this.stage, flags: this.flags, completed: [...this.completed], generated,
      contracts: this.contracts, hunts: this.hunts, jobs: this.jobs, issued: this.issued,
    };
  }

  load(d) {
    for (const q of d.generated ?? []) {
      // Hunts saved before the factions were redesigned name them the old way.
      for (const o of q.objectives ?? []) if (o.race && OLD_RACE[o.race]) o.race = OLD_RACE[o.race];
      this.defs.set(q.id, q);
    }
    // Quests from the old fixed valley no longer exist; drop their progress.
    this.active = Object.fromEntries(Object.entries(d.active ?? {}).filter(([id]) => this.defs.has(id)));
    this.stage = Object.fromEntries(Object.entries(d.stage ?? {}).filter(([id]) => this.active[id]));
    this.flags = { ...(d.flags ?? {}) };
    this.completed = new Set(d.completed ?? []);
    this.contracts = d.contracts ?? 0;
    this.hunts = d.hunts ?? 0;
    this.jobs = d.jobs ?? 0;
    this.issued = d.issued ?? 0;
    // Finished before the save: already announced.
    for (const id of Object.keys(this.active)) {
      if (this.isComplete(id)) Object.defineProperty(this.active[id], 'done', { value: true, enumerable: false, configurable: true });
    }
    this.events = [];
  }

  // Finished quests that end where they're done, waiting to be handed in (after a load, or a
  // dropped connection): the screen hands them in.
  pendingAuto() { return Object.keys(this.active).filter((id) => this.isComplete(id) && this.defs.get(id)?.returnTo === null); }
}

export { RACE };
