// Quests for the endless world: a few fixed ones plus contracts generated from the world itself.
//   Warden Maren   contracts: clear a named camp near your level (every fourth, a stronghold)
//   Old Ysolde     wake waystones, open caches, then hunts against whichever race is about
//   bounty         repeatable: slay any dozen monsters
// Objective types: kill (enemy type), killRace, killAny, clear (camp id), attune, chest.
// Rewards: xp, gold, weapon / armor (generator options). Generated quests are saved whole.
import { OLD_RACE } from '../combat/bestiary.js';

export const QUESTS = [
  {
    id: 'ys1', giver: 'sage', title: 'Stones That Remember',
    offer: 'Old waystones stand all across this land, dear. Wake four of them and it will carry you between them in a blink.',
    progress: 'Touch a waystone and it remembers you. Your map will show the ones you\'ve found.',
    turnIn: 'You can feel them humming, can\'t you? Here, this will keep you warm on the road.',
    objectives: [{ type: 'attune', count: 4, text: 'Attune waystones' }],
    rewards: { xp: 150, gold: 60, armor: { minTier: 1 } },
  },
  {
    id: 'ys2', giver: 'sage', requires: 'ys1', title: 'High Places',
    offer: 'Treasure always ends up somewhere awkward. Towers, mesas, old ruins. Climb, jump, scramble — and bring me back stories.',
    progress: 'Look up. Chests glint on high ground — your map marks the ones you\'ve seen.',
    turnIn: 'A born climber! Take this, it\'ll serve you better than it serves my shelf.',
    objectives: [{ type: 'chest', count: 3, text: 'Open treasure chests' }],
    rewards: { xp: 260, gold: 120, weapon: { minTier: 2 } },
  },
  {
    id: 'bounty', giver: 'warden', repeatable: true, title: 'Warden\'s Bounty',
    offer: 'There\'s always more of them. Cull a dozen of anything out there and the bounty\'s yours. Standing offer.',
    progress: 'Any monster counts. Come back when it\'s a dozen.',
    turnIn: 'Bounty paid. Same again whenever you like.',
    objectives: [{ type: 'killAny', count: 12, text: 'Slay any monsters' }],
    rewards: { xp: 120, gold: 70, weapon: { minTier: 1 } },
  },
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

export class QuestLog {
  constructor(game) {
    this.game = game;
    this.defs = new Map(QUESTS.map((q) => [q.id, q]));
    this.active = {}; // id → [progress per objective]
    this.completed = new Set();
    this.contracts = 0;
    this.hunts = 0;
    this.offers = {};  // npc id → generated offer (not yet accepted)
    // Whether offers are made up here. Online, the server makes them (rpg/CharacterCore.js 'talk')
    // and this copy only shows what it was given.
    this.generate = true;
  }

  available(npcId) {
    const out = [...this.defs.values()].filter((q) => q.giver === npcId && !q.generated && !this.active[q.id]
      && (q.repeatable || !this.completed.has(q.id))
      && (!q.requires || this.completed.has(q.requires)));
    const gen = this.offer(npcId);
    if (gen) out.unshift(gen);
    return out;
  }

  readyToTurnIn(npcId) {
    return Object.keys(this.active).filter((id) => this.defs.get(id)?.giver === npcId && this.isComplete(id)).map((id) => this.defs.get(id));
  }

  inProgress(npcId) {
    return Object.keys(this.active).filter((id) => this.defs.get(id)?.giver === npcId && !this.isComplete(id)).map((id) => this.defs.get(id));
  }

  // The giver's next generated quest (one at a time, only while none of theirs is running).
  offer(npcId, generate = this.generate) {
    if (Object.keys(this.active).some((id) => this.defs.get(id)?.generated && this.defs.get(id).giver === npcId)) return null;
    if (this.offers[npcId] || !generate) return this.offers[npcId] ?? null;
    let q = null;
    if (npcId === 'warden') q = this.makeContract();
    else if (npcId === 'sage' && this.completed.has('ys2')) q = this.makeHunt();
    if (q) this.offers[npcId] = q;
    return q;
  }

  makeContract() {
    const g = this.game;
    const lvl = g.stats.level;
    const p = g.player.position;
    const n = this.contracts + 1;
    // Every fourth contract is a stronghold if one is in reach; otherwise the best-fitting camp.
    const camps = g.world.poisNear(p.x, p.z, 1100, ['camp']).filter((c) => !g.encounters.isCleared(c.id) && !this.claimed(c.id));
    const choose = (list, levelBias) => {
      let best = null;
      let bestScore = Infinity;
      for (const c of list) {
        const score = Math.hypot(c.x - p.x, c.z - p.z) / 120 + Math.abs(c.level - (lvl + levelBias)) * 2.5;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best;
    };
    const best = (n % 4 === 0 && choose(camps.filter((c) => c.stronghold), 1)) || choose(camps.filter((c) => !c.stronghold), 0);
    if (!best) return null;
    const region = g.world.regionAt(best.x, best.z);
    const dir = compass(best.x - p.x, best.z - p.z);
    const dist = Math.round(Math.hypot(best.x - p.x, best.z - p.z) / 10) * 10;
    const R = RACE[best.race];
    const lv = best.level;
    return {
      id: `contract-${n}`, giver: 'warden', generated: true, target: best.id,
      title: best.stronghold ? `Siege: ${best.name}` : `Contract: ${best.name}`,
      offer: best.stronghold
        ? `${best.name} — ${R.name} have dug in there, in ${region.name}, about ${dist} metres ${dir}. ${R.seat} Break the place and end whatever sits on that throne.`
        : `There's a camp of ${R.plural} — ${best.name}, out in ${region.name}, about ${dist} metres ${dir}. ${R.line} Clear it out.`,
      progress: `${best.name} lies ${dir} of here, in ${region.name}. Your map marks it.`,
      turnIn: best.stronghold ? 'You broke their stronghold. Songs will be sung — badly, by Tobbin, but sung.' : `${best.name}'s quiet. Good work. There'll be another.`,
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
      id: `hunt-${n}`, giver: 'sage', generated: true,
      title: `Hunting ${R.name.replace(/^the /, '').replace(/^\w/, (c) => c.toUpperCase())}`,
      offer: `The ${R.plural} are stirring, dear. ${R.line} Thin them — ${count} should do it — and I'll make it worth your while.`,
      progress: `Any of ${R.name} will do. Their camps are marked as you find them.`,
      turnIn: 'There. The land breathes a little easier. Take this.',
      objectives: [{ type: 'killRace', race, count, text: `Slay ${R.plural}` }],
      rewards: { xp: 100 + g.stats.level * 40, gold: 50 + g.stats.level * 20, ...(n % 2 ? { armor: { minTier: 2 } } : { weapon: { minTier: 2 } }) },
    };
  }

  setOffer(npcId, q) {
    if (q) this.offers[npcId] = q;
    else delete this.offers[npcId];
  }

  // The quest `id` if it can be taken on now: a giver's current offer, or a fixed quest whose
  // turn has come.
  offerable(id) {
    if (this.active[id]) return null;
    const offered = Object.values(this.offers).find((q) => q?.id === id);
    if (offered) return offered;
    const q = this.defs.get(id);
    if (!q || q.generated) return null;
    if (!q.repeatable && this.completed.has(id)) return null;
    if (q.requires && !this.completed.has(q.requires)) return null;
    return q;
  }

  // Is a camp already the target of a running contract?
  claimed(campId) {
    return Object.keys(this.active).some((id) => this.defs.get(id)?.target === campId);
  }

  accept(id) {
    const offered = Object.values(this.offers).find((q) => q?.id === id);
    if (offered) {
      this.defs.set(id, offered);
      delete this.offers[offered.giver];
      if (offered.giver === 'warden') this.contracts++;
      else this.hunts++;
    }
    const q = this.defs.get(id);
    this.active[id] = q.objectives.map(() => 0);
  }

  isComplete(id) {
    const prog = this.active[id];
    const q = this.defs.get(id);
    return !!prog && !!q && q.objectives.every((o, i) => prog[i] >= o.count);
  }

  turnIn(id) {
    if (!this.isComplete(id)) return null;
    const q = this.defs.get(id);
    delete this.active[id];
    if (q.generated) this.defs.delete(id);
    else this.completed.add(id);
    return q.rewards;
  }

  advance(match) {
    for (const [id, prog] of Object.entries(this.active)) {
      const q = this.defs.get(id);
      if (!q) continue;
      const wasComplete = this.isComplete(id);
      q.objectives.forEach((o, i) => {
        if (prog[i] < o.count && match(o)) prog[i]++;
      });
      if (!wasComplete && this.isComplete(id)) this.game.hud?.banner('Quest Complete', `${q.title} — return to ${q.giver === 'sage' ? 'Old Ysolde' : 'the Warden'}`);
    }
  }

  onKill(enemy) {
    const race = enemy.type.race;
    this.advance((o) => o.type === 'killAny' || (o.type === 'kill' && o.enemy === enemy.typeName) || (o.type === 'killRace' && o.race === race));
  }

  onCampCleared(campId) {
    this.advance((o) => o.type === 'clear' && o.camp === campId);
  }

  toJSON() {
    const generated = Object.keys(this.active).map((id) => this.defs.get(id)).filter((q) => q?.generated);
    return { active: this.active, completed: [...this.completed], generated, contracts: this.contracts, hunts: this.hunts };
  }

  load(d) {
    for (const q of d.generated ?? []) {
      // Hunts saved before the factions were redesigned name them the old way.
      for (const o of q.objectives ?? []) if (o.race && OLD_RACE[o.race]) o.race = OLD_RACE[o.race];
      this.defs.set(q.id, q);
    }
    // Quests from the old fixed valley no longer exist; drop their progress.
    this.active = Object.fromEntries(Object.entries(d.active ?? {}).filter(([id]) => this.defs.has(id)));
    this.completed = new Set(d.completed ?? []);
    this.contracts = d.contracts ?? 0;
    this.hunts = d.hunts ?? 0;
  }
}

export { RACE };
