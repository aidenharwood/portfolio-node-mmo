// What the authority watches on a character's quests (the server for everyone online —
// server/simhost.js; the game itself offline): the places they've reached, the places they should
// be holding (a defence the world sim runs: src/sim/WorldSim.js Encounters.defend), the public
// events their quests call for (sim/WorldEvents.js startStory), and the quest drops off the
// enemies they kill. Each result is the [quest id, objective index] pairs the character's rules
// move on ('reach', 'defended', 'evwon', and a reward's `quest`).

// Every current 'goto' objective whose place (x, z) is within.
export function reachedPlaces(quests, x, z) {
  const out = [];
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    quests.objectivesOf(id).forEach((o, i) => {
      if (o.type === 'goto' && quests.active[id][i] < (o.count ?? 1) && quests.within(o, q, x, z)) out.push([id, i]);
    });
  }
  return out;
}

// The place a 'defend' objective names, as the world sim keys its defences (shared by everyone
// holding the same place).
export function defenceKey(quests, o, q) {
  const t = quests.ref(o.at, q);
  return t ? (t.poi ?? `${Math.round(t.x)},${Math.round(t.z)}`) : null;
}

// A defence this character should be fighting, standing where they are: the first current
// 'defend' objective whose place they're in, as the world sim's defence spec.
export function defenceAt(quests, world, x, z) {
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    const prog = quests.active[id];
    const objectives = quests.objectivesOf(id);
    for (let i = 0; i < objectives.length; i++) {
      const o = objectives[i];
      if (o.type !== 'defend' || prog[i] >= (o.count ?? 1) || !quests.within(o, q, x, z, 6)) continue;
      const t = quests.ref(o.at, q);
      const region = world.regionAt(t.x, t.z);
      return {
        key: defenceKey(quests, o, q), x: t.x, z: t.z, r: Math.max(12, o.r ?? t.r ?? 16), name: t.name ?? q.title,
        race: o.race ?? region.race, level: Math.max(1, region.level), waves: o.waves ?? 2,
        ...(t.gate !== undefined ? { gate: t.gate } : {}),
      };
    }
  }
  return null;
}

// The current 'defend' objectives a held defence (by its key) counts for.
export function heldObjectives(quests, key) {
  const out = [];
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    quests.objectivesOf(id).forEach((o, i) => {
      if (o.type === 'defend' && quests.active[id][i] < (o.count ?? 1) && defenceKey(quests, o, q) === key) out.push([id, i]);
    });
  }
  return out;
}

// An 'event' objective ({ type: 'event', event: 'surge', at: ref }) calls a public event at a
// place: the director's site is the place's poi (a hamlet, a settlement or a town for a surge or a
// siege; a landmark or a ruin for an anomaly). Coming within this many metres of the place's edge
// starts it (sim/WorldEvents.js startStory), so there's time to reach the beacon while it gathers.
export const EVENT_CALL = 80;

export function eventSite(quests, o, q) { return quests.ref(o.at, q)?.poi ?? null; }

// The event this character's quests call for, standing where they are: the first current 'event'
// objective whose place they're near, as { site, type } for the director.
export function eventCalled(quests, x, z) {
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    const prog = quests.active[id];
    const objectives = quests.objectivesOf(id);
    for (let i = 0; i < objectives.length; i++) {
      const o = objectives[i];
      if (o.type !== 'event' || prog[i] >= (o.count ?? 1) || !quests.within(o, q, x, z, EVENT_CALL)) continue;
      const site = eventSite(quests, o, q);
      if (site) return { site, type: o.event ?? 'surge' };
    }
  }
  return null;
}

// The current 'event' objectives an event won counts for (`ev`: { type, site: { id } }), for
// someone who earned its chest — any event of that kind at that place, whoever started it.
export function eventObjectives(quests, ev) {
  const out = [];
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    quests.objectivesOf(id).forEach((o, i) => {
      if (o.type === 'event' && quests.active[id][i] < (o.count ?? 1) && (o.event ?? 'surge') === ev.type && eventSite(quests, o, q) === ev.site?.id) out.push([id, i]);
    });
  }
  return out;
}

// Quest drops off a kill credited to this character ({ type, race, tag, at }): each current
// 'collect' objective the kill matches (`from`: race, tag, near a place) has its `chance`.
export function questDrops(quests, kill, rand = Math.random) {
  const out = [];
  const at = kill.at ?? [0, 0, 0];
  for (const id of Object.keys(quests.active)) {
    const q = quests.defs.get(id);
    quests.objectivesOf(id).forEach((o, i) => {
      if (o.type !== 'collect' || quests.active[id][i] >= (o.count ?? 1)) return;
      const f = o.from ?? {};
      if (f.race && f.race !== kill.race) return;
      if (f.tag && f.tag !== kill.tag) return;
      if (f.near && !quests.within({ near: f.near, r: f.r }, q, at[0], at[2], 20)) return;
      if (rand() < (o.chance ?? 0.3)) out.push([id, i]);
    });
  }
  return out;
}
