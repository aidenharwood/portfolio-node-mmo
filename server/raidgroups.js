// Raid groups (gameplay phase 7): parties linked to go into a raid together — up to RAID_UNITS of
// them (a lone player counts as a party of one), RAID_SIZE players in all.
//   - A party leader (or anyone on their own) forms one: /raid form, or the war table in a city.
//   - The raid leader invites another party by naming any of its members (/raid invite Name); the
//     invitation goes to that party's leader, who accepts or declines within a minute.
//   - A party's leader takes it out (/raid leave); the raid leader can remove a party (/raid kick
//     Name) or pass the lead to another party's leader (/raid promote Name); /raid disband ends it.
//   - Who's in it follows the parties: someone who leaves their party leaves the raid with it, a
//     party that disbands is gone from it. A player on their own who drops keeps their place for
//     five minutes.
//   - /ra is raid chat. Members get each other's positions and health once a second (`rp`), for the
//     raid frames; the instance manager (sim/Dungeons.js) runs one raid copy per group (`keyOf`).
// A raid group lives on one layer, as its parties do: invitations go only to players on it.
//
// Protocol: client → server  raid { act: form|invite|accept|decline|leave|kick|promote|disband, name }
//           server → client  raid { raid: { id, leader, units: [{ key, leader, members: [{ id, name,
//                            level, online, sid }] }] } | null } · rinvite { from, size } ·
//                            rp [[charId, x, z, hp, alive]]
import { RAID_SIZE } from '../src/world/raids.js';

export const RAID_UNITS = 4;
const INVITE_TTL = 60_000;
const OFFLINE_GRACE = 5 * 60_000;
const VIEW_EVERY = 1000;

export class RaidGroups {
  constructor(realm) {
    this.realm = realm;
    this.groups = new Map();  // group id → { id, leader (char id), units: [unit key], last (view sent) }
    this.of = new Map();      // unit key → group id
    this.invites = new Map(); // invited unit key → { group, from (name), at }
    this.gone = new Map();    // solo char id → when they went offline
    this.names = new Map();   // char id → name (for those offline)
    this.nextId = 1;
    this.viewAt = 0;
  }

  get parties() { return this.realm.parties; }
  tell(s, text) { s.send({ t: 'chat', ch: 'system', text }); }

  // A player's unit: their party ('p:<party id>'), or themselves ('c:<char id>').
  unitOf(s) {
    const party = this.parties.partyOf(s);
    return party ? `p:${party.id}` : `c:${s.charId}`;
  }
  // The char ids in a unit, and its leader's.
  membersOf(key) {
    if (key.startsWith('c:')) return [Number(key.slice(2))];
    return this.parties.parties.get(Number(key.slice(2)))?.members ?? [];
  }
  leaderOf(key) {
    if (key.startsWith('c:')) return Number(key.slice(2));
    return this.parties.parties.get(Number(key.slice(2)))?.leader ?? null;
  }
  isLeaderOfUnit(s) { return this.leaderOf(this.unitOf(s)) === s.charId; }

  groupOf(s) { return this.groups.get(this.of.get(this.unitOf(s))) ?? null; }
  // The instance manager's key for a player's raid group (null when they're not in one).
  keyOf(s) { const g = this.groupOf(s); return g ? `raid:${g.id}` : null; }
  size(g) { return g.units.reduce((n, k) => n + this.membersOf(k).length, 0); }
  sessions(g) { return g.units.flatMap((k) => this.membersOf(k)).map((id) => this.parties.sessionOf(id)).filter(Boolean); }

  // ---------------------------------------------------------------- requests
  handle(s, msg) {
    switch (msg.act) {
      case 'form': return this.form(s);
      case 'invite': return this.invite(s, msg.name);
      case 'accept': return this.accept(s);
      case 'decline': return this.decline(s);
      case 'leave': return this.leave(s);
      case 'kick': return this.kick(s, msg.name);
      case 'promote': return this.promote(s, msg.name);
      case 'disband': return this.disband(s);
    }
  }

  // /raid … from chat.
  command(s, arg) {
    const [verb, ...rest] = String(arg ?? '').trim().split(/\s+/);
    const name = rest.join(' ');
    const act = (verb || 'help').toLowerCase();
    if (['form', 'invite', 'accept', 'decline', 'leave', 'kick', 'promote', 'disband'].includes(act)) return this.handle(s, { act, name });
    const g = this.groupOf(s);
    if (g) return this.tell(s, `Raid of ${this.size(g)} (${g.units.length} part${g.units.length === 1 ? 'y' : 'ies'}), led by ${this.nameOf(g.leader)}. /raid invite Name · /raid leave · /raid kick Name · /raid promote Name · /raid disband · /ra to talk`);
    return this.tell(s, 'Raids: /raid form (your party becomes a raid group) · /raid invite Name · /raid accept · /raid decline · /ra to talk');
  }

  nameOf(charId) { return this.parties.sessionOf(charId)?.name ?? this.names.get(charId) ?? this.parties.names?.get(charId) ?? '?'; }

  form(s) {
    if (this.groupOf(s)) return this.tell(s, 'You\'re already in a raid group.');
    if (!this.isLeaderOfUnit(s)) return this.tell(s, 'Only your party\'s leader can form a raid group.');
    const g = { id: this.nextId++, leader: s.charId, units: [], last: '' };
    this.groups.set(g.id, g);
    this.add(g, this.unitOf(s));
    this.say(g, `${s.name} formed a raid group.`);
    this.broadcast(g);
    return g;
  }

  invite(s, name) {
    let g = this.groupOf(s);
    if (!g) g = this.form(s);
    if (!g) return;
    if (g.leader !== s.charId) return this.tell(s, 'Only the raid leader can invite.');
    const to = this.parties.byName(name);
    if (!to) return this.tell(s, `${name} isn't on your layer — raid groups gather on one layer.`);
    if (to === s) return this.tell(s, "You can't invite yourself.");
    const key = this.unitOf(to);
    if (this.of.has(key)) return this.tell(s, `${to.name} is already in a raid group.`);
    if (g.units.length >= RAID_UNITS) return this.tell(s, `A raid is ${RAID_UNITS} parties at most.`);
    if (this.size(g) + this.membersOf(key).length > RAID_SIZE) return this.tell(s, `That's more than ${RAID_SIZE} in the raid.`);
    if (this.realm.social?.ignores(to, s)) return this.tell(s, `${to.name} isn't taking invitations.`);
    const lead = this.parties.sessionOf(this.leaderOf(key)) ?? to;
    this.invites.set(key, { group: g.id, from: s.name, at: Date.now() });
    lead.send({ t: 'rinvite', from: s.name, size: this.size(g) });
    this.tell(lead, `${s.name} invites ${key.startsWith('p:') ? 'your party' : 'you'} to their raid group — /raid accept or /raid decline.`);
    this.tell(s, `Invited ${lead.name}${lead !== to ? `'s party (${to.name})` : ''}.`);
  }

  accept(s) {
    const key = this.unitOf(s);
    const inv = this.invites.get(key);
    // (Only the party's leader answers for it: anyone else leaves the invitation standing.)
    if (inv && !this.isLeaderOfUnit(s)) return this.tell(s, 'Only your party\'s leader can answer for it.');
    this.invites.delete(key);
    if (!inv || Date.now() - inv.at > INVITE_TTL) return this.tell(s, 'No raid invitation to accept.');
    const g = this.groups.get(inv.group);
    if (!g) return this.tell(s, 'That raid group is gone.');
    if (this.of.has(key)) return this.tell(s, "You're already in a raid group.");
    if (g.units.length >= RAID_UNITS || this.size(g) + this.membersOf(key).length > RAID_SIZE) return this.tell(s, 'That raid is full.');
    this.add(g, key);
    this.say(g, `${s.name}${key.startsWith('p:') ? '\'s party' : ''} joined the raid.`);
    this.broadcast(g);
  }

  decline(s) {
    const key = this.unitOf(s);
    const inv = this.invites.get(key);
    if (!inv || !this.isLeaderOfUnit(s)) return;
    this.invites.delete(key);
    const g = this.groups.get(inv.group);
    const lead = g && this.parties.sessionOf(g.leader);
    if (lead) this.tell(lead, `${s.name} declined the raid invitation.`);
  }

  leave(s) {
    const g = this.groupOf(s);
    if (!g) return this.tell(s, "You're not in a raid group.");
    const key = this.unitOf(s);
    if (!this.isLeaderOfUnit(s)) return this.tell(s, 'Only your party\'s leader can take it out of the raid (or /leave your party).');
    this.remove(g, key, `${s.name}${key.startsWith('p:') ? '\'s party' : ''} left the raid.`);
    for (const id of this.membersOf(key)) this.parties.sessionOf(id)?.send({ t: 'raid', raid: null });
  }

  kick(s, name) {
    const g = this.groupOf(s);
    if (!g || g.leader !== s.charId) return this.tell(s, 'Only the raid leader can remove a party.');
    const key = this.unitByName(g, name);
    if (!key || key === this.unitOf(s)) return this.tell(s, `${name} isn't in another party of your raid.`);
    this.remove(g, key, `${name}${key.startsWith('p:') ? '\'s party was' : ' was'} removed from the raid.`);
    for (const id of this.membersOf(key)) this.parties.sessionOf(id)?.send({ t: 'raid', raid: null });
  }

  promote(s, name) {
    const g = this.groupOf(s);
    if (!g || g.leader !== s.charId) return this.tell(s, 'Only the raid leader can pass the lead on.');
    const key = this.unitByName(g, name);
    const lead = key ? this.leaderOf(key) : null;
    if (!lead) return this.tell(s, `${name} isn't in your raid.`);
    g.leader = lead;
    this.say(g, `${this.nameOf(lead)} leads the raid now.`);
    this.broadcast(g);
  }

  disband(s) {
    const g = this.groupOf(s);
    if (!g || g.leader !== s.charId) return this.tell(s, 'Only the raid leader can disband the raid.');
    this.say(g, 'The raid group disbanded.');
    this.drop(g);
  }

  unitByName(g, name) {
    const n = String(name ?? '').toLowerCase();
    return g.units.find((k) => this.membersOf(k).some((id) => this.nameOf(id).toLowerCase() === n)) ?? null;
  }

  // ---------------------------------------------------------------- membership
  add(g, key) {
    g.units.push(key);
    this.of.set(key, g.id);
  }

  remove(g, key, line) {
    g.units = g.units.filter((k) => k !== key);
    this.of.delete(key);
    if (!g.units.length) { this.drop(g); return; }
    if (!g.units.some((k) => this.leaderOf(k) === g.leader)) g.leader = this.leaderOf(g.units[0]);
    if (line) this.say(g, line);
    this.broadcast(g);
  }

  drop(g) {
    for (const s of this.sessions(g)) s.send({ t: 'raid', raid: null });
    for (const k of g.units) this.of.delete(k);
    this.groups.delete(g.id);
  }

  offline(s) {
    this.names.set(s.charId, s.name);
    if (this.of.has(`c:${s.charId}`)) this.gone.set(s.charId, Date.now());
  }

  online(s) {
    this.gone.delete(s.charId);
    const g = this.groupOf(s);
    if (g) { g.last = ''; this.broadcast(g); }
  }

  // ---------------------------------------------------------------- telling members
  view(g) {
    return {
      id: g.id, leader: g.leader,
      units: g.units.map((key) => ({
        key, leader: this.leaderOf(key),
        members: this.membersOf(key).map((id) => {
          const m = this.parties.sessionOf(id);
          return { id, name: m?.name ?? this.nameOf(id), level: m?.level ?? 0, online: !!m, sid: m?.id ?? 0 };
        }),
      })),
    };
  }

  broadcast(g) {
    const v = this.view(g);
    g.last = JSON.stringify(v);
    for (const s of this.sessions(g)) s.send({ t: 'raid', raid: v });
  }

  say(g, text) { for (const s of this.sessions(g)) s.send({ t: 'chat', ch: 'raid', text }); }

  chat(s, text) {
    const g = this.groupOf(s);
    if (!g) return this.tell(s, "You're not in a raid group.");
    for (const m of this.sessions(g)) if (!this.realm.social?.ignores(m, s)) m.send({ t: 'chat', ch: 'raid', from: s.name, text });
  }

  // Once a second: parties that have gone, lone players gone too long, invitations run out; then
  // anything that changed to the members, and everyone's whereabouts for the raid frames.
  tick(now) {
    for (const [k, inv] of this.invites) if (now - inv.at > INVITE_TTL) this.invites.delete(k);
    if (now - this.viewAt < VIEW_EVERY) return;
    this.viewAt = now;
    for (const g of [...this.groups.values()]) {
      for (const key of [...g.units]) {
        const solo = key.startsWith('c:') ? Number(key.slice(2)) : null;
        // A party that disbanded; someone alone who's been gone too long — or who's joined a party
        // since (they come with it, if it's asked in).
        const goneParty = !solo && !this.parties.parties.has(Number(key.slice(2)));
        const goneSolo = solo !== null && ((this.gone.has(solo) && now - this.gone.get(solo) > OFFLINE_GRACE) || this.parties.of.has(solo));
        if (goneParty || goneSolo) this.remove(g, key, goneSolo ? `${this.nameOf(solo)} left the raid.` : null);
      }
      if (!this.groups.has(g.id)) continue;
      const v = this.view(g);
      const json = JSON.stringify(v);
      const list = this.sessions(g);
      if (json !== g.last) {
        g.last = json;
        for (const s of list) s.send({ t: 'raid', raid: v });
      }
      const rp = list.filter((m) => m.state).map((m) => [m.charId, Math.round(m.state.p[0]), Math.round(m.state.p[2]), m.state.hp, m.state.fl & 16 ? 0 : 1]);
      for (const s of list) s.send({ t: 'rp', rp });
    }
  }
}
