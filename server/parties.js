// Parties: up to four players playing together.
//   - Invite (/invite Name, or the Social tab); the invitee accepts or declines within a minute.
//   - The leader can kick and promote; anyone can leave. A party of one disbands.
//   - A member who drops keeps their place for five minutes, shown as offline.
//   - Members get each other's positions at any distance (twice a second), for the HUD's party
//     frames, the compass, the minimap and the world map; /p is party chat.
//   - Kills and cleared camps credit every member within PARTY_RANGE (server/simhost.js).
// Members are characters (by character id), so a reconnect picks up where it left off.
// A party lives on one layer (server/realm.js): its members' affinity sends them back to it when
// they reconnect, and accepting an invitation from someone on another layer moves you there.
//
// Protocol: client → server  party { act: invite|accept|decline|leave|kick|promote, name }
//           server → client  party { party: { id, leader, members: [{ id, name, level, online }] } | null }
//                            invite { from, size }      pp [[id, x, z, hp, alive]]
export const PARTY_SIZE = 4;
export const PARTY_RANGE = 100;   // metres: members this close share kills and camps
const INVITE_TTL = 60_000;
const OFFLINE_GRACE = 5 * 60_000;
const POS_EVERY = 500;
const AFFINITY_EVERY = 60_000;  // members' affinity for this layer is refreshed this often
const AFFINITY_TTL = OFFLINE_GRACE + 2 * AFFINITY_EVERY;

export class Parties {
  constructor(realm) {
    this.realm = realm;
    this.parties = new Map();  // party id → { id, leader, members: [charId], gone: Map(charId → since) }
    this.of = new Map();       // char id → party id
    this.invites = new Map();  // invitee char id → { from: char id, at, remote }
    this.remoteInvites = new Map(); // invitee here → { fromChar, fromName, fromLayer, at }: from another layer
    this.affinityAt = 0;
    this.nextId = 1;
    this.posAt = 0;
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
  partyOf(s) { return this.parties.get(this.of.get(s.charId)) ?? null; }
  members(party) { return party.members.map((id) => this.sessionOf(id)).filter(Boolean); }

  // Party mates of `s` online (not `s` itself).
  mates(s) {
    const party = this.partyOf(s);
    return party ? this.members(party).filter((m) => m !== s) : [];
  }

  tell(s, text) { s.send({ t: 'chat', ch: 'system', text }); }

  // ---------------------------------------------------------------- requests
  handle(s, msg) {
    switch (msg.act) {
      case 'invite': return this.invite(s, msg.name);
      case 'accept': return this.accept(s);
      case 'decline': return this.decline(s);
      case 'leave': return this.leave(s);
      case 'kick': return this.kick(s, msg.name);
      case 'promote': return this.promote(s, msg.name);
    }
  }

  invite(s, name) {
    const party = this.partyOf(s);
    if (party && party.leader !== s.charId) return this.tell(s, 'Only the party leader can invite.');
    if (party && party.members.length >= PARTY_SIZE) return this.tell(s, `Parties are ${PARTY_SIZE} at most.`);
    const to = this.byName(name);
    if (!to) { this.inviteElsewhere(s, name, party).catch(() => this.tell(s, `${name} isn't online.`)); return; }
    if (to === s) return this.tell(s, "You can't invite yourself.");
    if (this.partyOf(to)) return this.tell(s, `${to.name} is already in a party.`);
    if (this.realm.social?.ignores(to, s)) return this.tell(s, `${to.name} isn't taking invitations.`);
    this.invites.set(to.charId, { from: s.charId, at: Date.now() });
    to.send({ t: 'invite', from: s.name, size: party ? party.members.length : 1 });
    this.tell(s, `Invited ${to.name}.`);
  }

  // Someone on another layer: their layer shows them the invitation; accepting brings them here.
  async inviteElsewhere(s, name, party) {
    const where = await this.realm.store.presentByName(name);
    if (!where || where.layer === this.realm.layer || this.realm.standalone) return this.tell(s, `${name} isn't online.`);
    this.invites.set(where.id, { from: s.charId, at: Date.now(), remote: true });
    this.realm.bus.publish(`layer:${where.layer}`, { k: 'pinvite', toChar: where.id, fromChar: s.charId, fromName: s.name, fromLayer: this.realm.layer, size: party ? party.members.length : 1 });
    this.tell(s, `Invited ${where.name}.`);
  }

  onBus(m) {
    if (m.k !== 'pinvite') return;
    const to = this.sessionOf(m.toChar);
    if (!to) return;
    const back = (text) => this.realm.deliver(m.fromChar, { t: 'chat', ch: 'system', text }, m.fromLayer);
    if (this.partyOf(to)) return back(`${to.name} is already in a party.`);
    if (to.ignoring?.has(m.fromChar)) return back(`${to.name} isn't taking invitations.`);
    this.remoteInvites.set(to.charId, { fromChar: m.fromChar, fromName: m.fromName, fromLayer: m.fromLayer, at: Date.now() });
    to.send({ t: 'invite', from: m.fromName, size: m.size });
  }

  accept(s) {
    const remote = this.remoteInvites.get(s.charId);
    this.remoteInvites.delete(s.charId);
    if (remote && !this.invites.has(s.charId) && Date.now() - remote.at <= INVITE_TTL) {
      if (this.partyOf(s)) return this.tell(s, "You're already in a party.");
      this.tell(s, `Joining ${remote.fromName}'s party on layer ${remote.fromLayer + 1}…`);
      this.realm.move(s, remote.fromLayer, { party: remote.fromChar });
      return;
    }
    const inv = this.invites.get(s.charId);
    this.invites.delete(s.charId);
    if (!inv || Date.now() - inv.at > INVITE_TTL) return this.tell(s, 'No invitation to accept.');
    const from = this.sessionOf(inv.from);
    if (this.partyOf(s)) return this.tell(s, "You're already in a party.");
    let party = this.parties.get(this.of.get(inv.from));
    if (!party) {
      if (!from) return this.tell(s, 'They left before you answered.');
      party = { id: this.nextId++, leader: inv.from, members: [inv.from], gone: new Map() };
      this.parties.set(party.id, party);
      this.of.set(inv.from, party.id);
    }
    if (party.members.length >= PARTY_SIZE) return this.tell(s, 'That party is full.');
    party.members.push(s.charId);
    this.of.set(s.charId, party.id);
    this.say(party, `${s.name} joined the party.`);
    this.broadcast(party);
  }

  // This layer is closing: every party is sent, whole, to the least busy other layer, where the
  // first member to arrive puts it back together (see regroup). Members away in their grace time
  // go there too when they come back.
  async evacuate() {
    if (!this.parties.size) return;
    const others = (await this.realm.store.liveLayers()).filter((l) => l.id !== this.realm.layer && !l.draining);
    if (!others.length) return;
    others.sort((a, b) => a.players - b.players);
    let i = 0;
    for (const party of this.parties.values()) {
      const to = others[i++ % others.length];
      const names = Object.fromEntries(party.members.map((id) => [id, this.sessionOf(id)?.name ?? this.names?.get(id) ?? '?']));
      const regroup = { leader: party.leader, members: party.members, names };
      for (const id of party.members) await this.realm.store.setAffinity(id, to.id, { regroup }, AFFINITY_TTL);
    }
  }

  // Arrived with a party from a layer that closed: join it again, making it if no one has yet.
  regroup(s, { leader, members, names }) {
    if (this.partyOf(s)) return;
    let party = this.parties.get(this.of.get(leader)) ?? members.map((id) => this.parties.get(this.of.get(id))).find(Boolean);
    if (!party) {
      party = { id: this.nextId++, leader, members: [], gone: new Map() };
      this.parties.set(party.id, party);
      this.names ??= new Map();
      for (const id of members) {
        if (this.of.has(id)) continue; // in a party here already
        party.members.push(id);
        this.of.set(id, party.id);
        if (!this.sessionOf(id)) party.gone.set(id, Date.now());
        if (names?.[id]) this.names.set(id, names[id]);
      }
    }
    if (!party.members.includes(s.charId)) {
      if (party.members.length >= PARTY_SIZE) return;
      party.members.push(s.charId);
      this.of.set(s.charId, party.id);
    }
    party.gone.delete(s.charId);
    this.broadcast(party);
  }

  // Arrived from another layer after accepting an invitation from `leader` here.
  arrived(s, leader) {
    const inv = this.invites.get(s.charId);
    if (inv?.from === leader) this.accept(s);
  }

  decline(s) {
    const remote = this.remoteInvites.get(s.charId);
    this.remoteInvites.delete(s.charId);
    if (remote) this.realm.deliver(remote.fromChar, { t: 'chat', ch: 'system', text: `${s.name} declined.` }, remote.fromLayer);
    const inv = this.invites.get(s.charId);
    this.invites.delete(s.charId);
    if (!inv) return;
    const from = this.sessionOf(inv.from);
    if (from) this.tell(from, `${s.name} declined.`);
  }

  leave(s) {
    const party = this.partyOf(s);
    if (!party) return this.tell(s, "You're not in a party.");
    this.remove(party, s.charId, `${s.name} left the party.`);
    s.send({ t: 'party', party: null });
  }

  kick(s, name) {
    const party = this.partyOf(s);
    if (!party || party.leader !== s.charId) return this.tell(s, 'Only the party leader can remove members.');
    const id = this.memberId(party, name);
    if (!id || id === s.charId) return this.tell(s, `${name} isn't in your party.`);
    const them = this.sessionOf(id);
    this.remove(party, id, `${them?.name ?? name} was removed from the party.`);
    them?.send({ t: 'party', party: null });
  }

  promote(s, name) {
    const party = this.partyOf(s);
    if (!party || party.leader !== s.charId) return this.tell(s, 'Only the party leader can pass leadership on.');
    const id = this.memberId(party, name);
    if (!id) return this.tell(s, `${name} isn't in your party.`);
    party.leader = id;
    this.say(party, `${this.sessionOf(id)?.name ?? name} leads the party now.`);
    this.broadcast(party);
  }

  memberId(party, name) {
    const n = String(name ?? '').toLowerCase();
    return party.members.find((id) => (this.sessionOf(id)?.name ?? this.names?.get(id) ?? '').toLowerCase() === n) ?? null;
  }

  remove(party, charId, line) {
    party.members = party.members.filter((id) => id !== charId);
    party.gone.delete(charId);
    this.of.delete(charId);
    this.unpin(charId);
    if (party.leader === charId) party.leader = party.members.find((id) => this.sessionOf(id)) ?? party.members[0];
    if (party.members.length <= 1) {
      // A party of one isn't one.
      for (const id of party.members) {
        this.of.delete(id);
        this.unpin(id);
        this.sessionOf(id)?.send({ t: 'party', party: null });
      }
      this.parties.delete(party.id);
      if (party.members.length) this.tell(this.sessionOf(party.members[0]) ?? { send() {} }, 'The party disbanded.');
      return;
    }
    if (line) this.say(party, line);
    this.broadcast(party);
  }

  // ---------------------------------------------------------------- comings and goings
  online(s) {
    const party = this.partyOf(s);
    if (!party) return;
    party.gone.delete(s.charId);
    this.say(party, `${s.name} is back.`);
    this.broadcast(party);
  }

  offline(s) {
    this.invites.delete(s.charId);
    this.remoteInvites.delete(s.charId);
    const party = this.partyOf(s);
    if (!party) return;
    (this.names ??= new Map()).set(s.charId, s.name);
    party.gone.set(s.charId, Date.now());
    if (party.leader === s.charId) {
      const next = party.members.find((id) => id !== s.charId && this.sessionOf(id) && this.sessionOf(id) !== s);
      if (next) party.leader = next;
    }
    this.say(party, `${s.name} went offline.`, s);
    this.broadcast(party, s);
  }

  // ---------------------------------------------------------------- telling members
  view(party, except = null) {
    return {
      id: party.id,
      leader: party.leader,
      members: party.members.map((id) => {
        const m = this.sessionOf(id);
        const on = !!m && m !== except;
        return { id, name: m?.name ?? this.names?.get(id) ?? '?', level: m?.level ?? 0, online: on, sid: on ? m.id : 0 };
      }),
    };
  }

  broadcast(party, except = null) {
    const v = this.view(party, except);
    for (const m of this.members(party)) if (m !== except) m.send({ t: 'party', party: v });
    this.pin(party);
  }

  // Members come back to this layer when they reconnect (their affinity), for as long as the
  // party keeps their place.
  // (Not while this layer is closing: evacuate has pointed everyone elsewhere.)
  pin(party) {
    if (this.realm.standalone || this.realm.draining) return;
    for (const id of party.members) this.realm.store.pinAffinity(id, this.realm.layer, AFFINITY_TTL).catch(() => {});
  }

  unpin(charId) {
    if (!this.realm.standalone && !this.realm.draining) this.realm.store.dropAffinity(charId).catch(() => {});
  }

  say(party, text, except = null) {
    for (const m of this.members(party)) if (m !== except) m.send({ t: 'chat', ch: 'party', text });
  }

  chat(s, text) {
    const party = this.partyOf(s);
    if (!party) return this.tell(s, "You're not in a party.");
    for (const m of this.members(party)) m.send({ t: 'chat', ch: 'party', from: s.name, text });
  }

  // Each tick: positions to members (any distance), expired invites and long-gone members.
  tick(now) {
    for (const [id, inv] of this.invites) if (now - inv.at > INVITE_TTL) this.invites.delete(id);
    for (const [id, inv] of this.remoteInvites) if (now - inv.at > INVITE_TTL) this.remoteInvites.delete(id);
    if (now - this.affinityAt > AFFINITY_EVERY) {
      this.affinityAt = now;
      for (const party of this.parties.values()) this.pin(party);
    }
    for (const party of [...this.parties.values()]) {
      for (const [id, since] of party.gone) {
        if (this.sessionOf(id)) { party.gone.delete(id); continue; }
        if (now - since > OFFLINE_GRACE) this.remove(party, id, `${this.names?.get(id) ?? 'A member'} left the party.`);
      }
    }
    if (now - this.posAt < POS_EVERY) return;
    this.posAt = now;
    for (const party of this.parties.values()) {
      const list = this.members(party);
      const pp = list.filter((m) => m.state).map((m) => [m.charId, Math.round(m.state.p[0]), Math.round(m.state.p[2]), m.state.hp, m.state.fl & 16 ? 0 : 1]);
      for (const m of list) m.send({ t: 'pp', pp });
    }
  }
}
