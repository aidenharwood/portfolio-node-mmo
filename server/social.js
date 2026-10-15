// Friends, ignores, guilds, mail and reports (stored in server/store.js). They reach across
// layers: who's online comes from the store's presence table, and chat, invitations and changes
// go out on the bus (server/bus.js) for whichever layer the people involved are on.
//   Friends    /friend Name · /unfriend Name — online status, told when they come and go.
//   Ignore     /ignore Name · /unignore Name — their chat, whispers, invites and trades stop
//              reaching you.
//   Guilds     /guild create Name TAG · /guild invite Name · /guild accept · /guild leave ·
//              /guild kick Name · /guild promote|demote Name · /guild motd text · /guild disband ·
//              /g message. Ranks: member, officer (invites, kicks members), leader. The tag shows
//              on nameplates.
//   Mail       to any character, online or not, with gold and one item attached; the sender's
//              side leaves their character at once (server op 'post'), the receiver claims it
//              (server op 'claim').
//   Reports    /report Name reason — for the admins (server/admin.js).
//
// Protocol: server → client  social { friends: [{ name, level, online }], ignores: [name],
//                                     guild: { name, tag, motd, rank, members: [...] } | null, unread }
//                            mail { list: [...] }   mailNew { from }
//           client → server  mail { act: list|send|read|claim|delete, to, body, gold, bi, id }
// Bus: presence { charId, name, online, guild } · gchat { guild, from, fromChar, text } ·
//      gsay { guild, text, except } · guild { guild, chars } (reload) · ginvite · mailNew · report
import { log } from './ops.js';

const NAME_RE = /^[A-Za-z][A-Za-z' -]{2,23}$/;
const TAG_RE = /^[A-Za-z0-9]{2,4}$/;
const MAX_BODY = 500;
const MAX_INBOX = 50;
const GUILD_INVITE_TTL = 60_000;

export class Social {
  constructor(realm) {
    this.realm = realm;
    this.guildInvites = new Map(); // char id → { guildId, from, at }
  }

  get store() { return this.realm.store; }
  get bus() { return this.realm.bus; }
  sessionOf(charId) { return this.realm.sessionOf(charId); }
  tell(s, text) { s.send({ t: 'chat', ch: 'system', text }); }
  // Async work started from a chat command: failures are logged, never thrown at the realm.
  run(p) { p.catch((err) => log.error('social', err)); }

  // Does `a` ignore `b`?
  ignores(a, b) { return !!a?.ignoring?.has(b?.charId); }

  // ---------------------------------------------------------------- coming and going
  async online(s) {
    const [ignores, friends] = await Promise.all([this.store.ignores(s.charId), this.store.friends(s.charId)]);
    s.ignoring = new Set(ignores.map((r) => r.id));
    s.friendIds = new Set(friends.map((f) => f.id));
    await this.loadGuild(s);
    await this.push(s);
    this.bus.publish('all', { k: 'presence', charId: s.charId, name: s.name, online: true, guild: s.guild?.id ?? null });
  }

  // (After the realm has let the character go, so they show offline.)
  offline(s) {
    this.bus.publish('all', { k: 'presence', charId: s.charId, name: s.name, online: false, guild: s.guild?.id ?? null });
  }

  async loadGuild(s) {
    const g = await this.store.guildOf(s.charId);
    s.guild = g ? { id: g.id, name: g.name, tag: g.tag, motd: g.motd, rank: g.rank } : null;
    s.tag = g?.tag ?? null;
  }

  // Everything social about `s`, to them.
  async push(s) {
    const g = s.guild;
    const [friends, ignores, members, unread] = await Promise.all([
      this.store.friends(s.charId), this.store.ignores(s.charId), g ? this.store.guildMembers(g.id) : [], this.store.unread(s.charId),
    ]);
    const online = await this.store.presentIds([...friends.map((f) => f.id), ...members.map((m) => m.id)]);
    s.send({
      t: 'social',
      friends: friends.map((f) => ({ name: f.name, level: f.level, online: online.has(f.id) })),
      ignores: ignores.map((r) => r.name),
      guild: g ? { ...g, members: members.map((m) => ({ name: m.name, level: m.level, rank: m.rank, online: online.has(m.id) })) } : null,
      unread,
    });
  }

  // A guild changed (members, ranks, message of the day, gone): every layer reloads it for its
  // members there, and for `chars` (people who just joined or left it).
  guildChanged(guildId, chars = []) { this.bus.publish('all', { k: 'guild', guild: guildId, chars }); }
  guildSay(guildId, text, exceptChar = null) { this.bus.publish('all', { k: 'gsay', guild: guildId, text, except: exceptChar }); }

  async refresh(s) {
    const was = s.tag;
    await this.loadGuild(s);
    await this.push(s);
    if (s.tag !== was) this.realm.relook?.(s);
  }

  onBus(m) {
    switch (m.k) {
      case 'presence':
        for (const o of this.realm.sessions.values()) {
          if (o.charId === m.charId) continue;
          const friend = o.friendIds?.has(m.charId);
          const guildmate = m.guild !== null && o.guild?.id === m.guild;
          if (friend && m.online) this.tell(o, `${m.name} is online.`);
          if (guildmate && m.online && !friend) o.send({ t: 'chat', ch: 'guild', text: `${m.name} is online.` });
          if (friend || guildmate) this.run(this.push(o));
        }
        return;
      case 'gchat':
        for (const o of this.realm.sessions.values()) {
          if (o.guild?.id === m.guild && !o.ignoring?.has(m.fromChar)) o.send({ t: 'chat', ch: 'guild', from: m.from, text: m.text });
        }
        return;
      case 'gsay':
        for (const o of this.realm.sessions.values()) if (o.guild?.id === m.guild && o.charId !== m.except) o.send({ t: 'chat', ch: 'guild', text: m.text });
        return;
      case 'guild':
        for (const o of this.realm.sessions.values()) if (o.guild?.id === m.guild || m.chars?.includes(o.charId)) this.run(this.refresh(o));
        return;
      case 'ginvite': {
        const to = this.sessionOf(m.toChar);
        if (!to) return;
        if (to.ignoring?.has(m.fromChar)) return this.realm.deliver(m.fromChar, { t: 'chat', ch: 'system', text: `${to.name} isn't taking invitations.` });
        this.guildInvites.set(to.charId, { guildId: m.guildId, from: m.from, at: Date.now() });
        this.tell(to, `${m.from} invites you to the guild ${m.guildName} [${m.tag}]. /guild accept to join.`);
        return;
      }
      case 'mailNew': {
        const to = this.sessionOf(m.toChar);
        if (!to) return;
        to.send({ t: 'mailNew', from: m.from });
        this.run(this.push(to));
        return;
      }
      case 'report':
        for (const o of this.realm.sessions.values()) if (o.admin) this.tell(o, m.text);
    }
  }

  // ---------------------------------------------------------------- chat commands
  // Returns true if the command was one of ours.
  command(s, cmd, arg) {
    switch (cmd) {
      case 'friend': this.run(this.friend(s, arg)); return true;
      case 'unfriend': this.run(this.unfriend(s, arg)); return true;
      case 'ignore': this.run(this.ignore(s, arg)); return true;
      case 'unignore': this.run(this.unignore(s, arg)); return true;
      case 'g': if (arg) this.guildChat(s, arg); return true;
      case 'guild': this.run(this.guild(s, arg)); return true;
      case 'report': this.run(this.report(s, arg)); return true;
      default: return false;
    }
  }

  async target(s, name) {
    const c = await this.store.characterByName(String(name ?? '').trim());
    if (!c) this.tell(s, `No character called ${name}.`);
    else if (c.id === s.charId) { this.tell(s, "That's you."); return null; }
    return c;
  }

  async friend(s, name) {
    const c = await this.target(s, name);
    if (!c) return;
    await this.store.addFriend(s.charId, c.id);
    s.friendIds?.add(c.id);
    this.tell(s, `${c.name} added to your friends.`);
    await this.push(s);
  }

  async unfriend(s, name) {
    const c = await this.target(s, name);
    if (!c) return;
    await this.store.removeFriend(s.charId, c.id);
    s.friendIds?.delete(c.id);
    this.tell(s, `${c.name} removed from your friends.`);
    await this.push(s);
  }

  async ignore(s, name) {
    const c = await this.target(s, name);
    if (!c) return;
    await this.store.addIgnore(s.charId, c.id);
    s.ignoring.add(c.id);
    this.tell(s, `Ignoring ${c.name}.`);
    await this.push(s);
  }

  async unignore(s, name) {
    const c = await this.target(s, name);
    if (!c) return;
    await this.store.removeIgnore(s.charId, c.id);
    s.ignoring.delete(c.id);
    this.tell(s, `No longer ignoring ${c.name}.`);
    await this.push(s);
  }

  async report(s, arg) {
    const m = /^(\S+)\s+(.{3,})$/.exec(arg ?? '');
    if (!m) return this.tell(s, 'Usage: /report Name what happened');
    await this.store.addReport(s.name, m[1], m[2].slice(0, 300));
    this.tell(s, 'Report sent to the admins. Thank you.');
    this.bus.publish('all', { k: 'report', text: `[report] ${s.name} reported ${m[1]}: ${m[2].slice(0, 120)}` });
  }

  // ---------------------------------------------------------------- guilds
  guildChat(s, text) {
    if (!s.guild) return this.tell(s, "You're not in a guild.");
    this.bus.publish('all', { k: 'gchat', guild: s.guild.id, from: s.name, fromChar: s.charId, text });
  }

  async guild(s, arg) {
    const [sub = '', ...rest] = String(arg ?? '').trim().split(/\s+/);
    const tail = rest.join(' ');
    const g = s.guild;
    const officer = g && g.rank >= 1;
    const leader = g && g.rank >= 2;
    switch (sub.toLowerCase()) {
      case 'create': {
        if (g) return this.tell(s, "You're already in a guild.");
        const tag = rest[rest.length - 1] ?? '';
        const name = rest.slice(0, -1).join(' ');
        if (!NAME_RE.test(name) || !TAG_RE.test(tag)) return this.tell(s, 'Usage: /guild create Guild Name TAG (a 3–24 letter name, a 2–4 letter tag).');
        if (await this.store.guildTaken(name, tag)) return this.tell(s, 'That guild name or tag is taken.');
        try {
          await this.store.createGuild(name, tag.toUpperCase(), s.charId);
        } catch {
          return this.tell(s, 'That guild name or tag is taken.');
        }
        this.tell(s, `Founded ${name} [${tag.toUpperCase()}]. /guild invite Name to bring people in.`);
        return this.refresh(s);
      }
      case 'invite': {
        if (!officer) return this.tell(s, 'Only officers and the leader can invite.');
        const c = await this.store.characterByName(rest[0] ?? '');
        const where = c && await this.store.present(c.id);
        if (!where) return this.tell(s, `${rest[0] ?? 'They'} isn't online.`);
        if (await this.store.guildOf(c.id)) return this.tell(s, `${c.name} is already in a guild.`);
        this.bus.publish(`layer:${where.layer}`, { k: 'ginvite', toChar: c.id, fromChar: s.charId, from: s.name, guildId: g.id, guildName: g.name, tag: g.tag });
        return this.tell(s, `Invited ${c.name}.`);
      }
      case 'accept': {
        const inv = this.guildInvites.get(s.charId);
        this.guildInvites.delete(s.charId);
        if (!inv || Date.now() - inv.at > GUILD_INVITE_TTL || g) return this.tell(s, 'No guild invitation to accept.');
        try {
          await this.store.addMember(inv.guildId, s.charId);
        } catch {
          return this.tell(s, "That guild doesn't exist any more.");
        }
        this.guildSay(inv.guildId, `${s.name} joined the guild.`);
        return this.guildChanged(inv.guildId, [s.charId]);
      }
      case 'leave': {
        if (!g) return this.tell(s, "You're not in a guild.");
        if (leader && await this.store.memberCount(g.id) > 1) return this.tell(s, 'Pass leadership on first (/guild promote Name), or /guild disband.');
        await this.store.removeMember(s.charId);
        if (await this.store.memberCount(g.id) === 0) await this.store.deleteGuild(g.id);
        this.guildSay(g.id, `${s.name} left the guild.`);
        return this.guildChanged(g.id, [s.charId]);
      }
      case 'kick': case 'promote': case 'demote': {
        if (!officer) return this.tell(s, 'Only officers and the leader can do that.');
        const m = (await this.store.guildMembers(g.id)).find((x) => x.name.toLowerCase() === rest[0]?.toLowerCase());
        if (!m || m.id === s.charId) return this.tell(s, `${rest[0] ?? 'They'} isn't in your guild.`);
        if (m.rank >= g.rank) return this.tell(s, "You can't do that to someone of your rank or higher.");
        if (sub === 'kick') {
          await this.store.removeMember(m.id);
          this.realm.deliver(m.id, { t: 'chat', ch: 'system', text: `You were removed from ${g.name}.` });
          this.guildSay(g.id, `${m.name} was removed from the guild.`);
        } else if (sub === 'promote') {
          if (m.rank === 1) {
            if (!leader) return this.tell(s, 'Only the leader can hand over leadership.');
            await this.store.setRank(m.id, 2);
            await this.store.setRank(s.charId, 1);
            this.guildSay(g.id, `${m.name} now leads the guild.`);
          } else {
            await this.store.setRank(m.id, 1);
            this.guildSay(g.id, `${m.name} is now an officer.`);
          }
        } else {
          if (!leader) return this.tell(s, 'Only the leader can demote officers.');
          await this.store.setRank(m.id, 0);
          this.guildSay(g.id, `${m.name} is a member again.`);
        }
        return this.guildChanged(g.id, [m.id]);
      }
      case 'motd': {
        if (!officer) return this.tell(s, 'Only officers and the leader can set the message of the day.');
        await this.store.setMotd(g.id, tail.slice(0, 200));
        this.guildSay(g.id, `Message of the day: ${tail.slice(0, 200)}`);
        return this.guildChanged(g.id);
      }
      case 'disband': {
        if (!leader) return this.tell(s, 'Only the leader can disband the guild.');
        this.guildSay(g.id, `${g.name} has been disbanded.`);
        await this.store.deleteGuild(g.id);
        return this.guildChanged(g.id);
      }
      default:
        return this.tell(s, 'Guild: /guild create Name TAG · invite Name · accept · leave · kick Name · promote Name · demote Name · motd text · disband · /g message');
    }
  }

  // ---------------------------------------------------------------- mail
  mail(s, m) {
    switch (m.act) {
      case 'list': return this.run(this.sendInbox(s));
      case 'read': return this.run(this.store.readMail(Number(m.id), s.charId).then(() => this.sendInbox(s)));
      case 'delete': return this.run(this.store.deleteMail(Number(m.id), s.charId).then(() => this.sendInbox(s)));
      case 'claim': return this.run(this.claim(s, Number(m.id)));
      case 'send': return this.run(this.send(s, m));
    }
  }

  async sendInbox(s) {
    s.send({ t: 'mail', list: await this.store.inbox(s.charId) });
    await this.push(s);
  }

  async send(s, m) {
    const to = await this.store.characterByName(String(m.to ?? '').trim());
    if (!to) return this.tell(s, `No character called ${m.to}.`);
    if (to.id === s.charId) return this.tell(s, "You can't mail yourself.");
    const body = String(m.body ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_BODY);
    const gold = Math.max(0, Math.floor(Number(m.gold) || 0));
    const bi = Number.isInteger(m.bi) ? m.bi : null;
    const core = s.core;
    if (!body && !gold && bi === null) return this.tell(s, 'An empty letter.');
    if (await this.store.mailCount(to.id) >= MAX_INBOX) return this.tell(s, `${to.name}'s mailbox is full.`);
    if ((await this.store.ignores(to.id)).some((r) => r.id === s.charId)) return this.tell(s, `${to.name} isn't taking mail from you.`);
    // Checked after the waits above, against the character as it is now.
    if (gold > core.stats.gold) return this.tell(s, "You don't have that much gold.");
    const item = bi !== null ? core.inventory.backpack[bi] : null;
    if (bi !== null && !item) return this.tell(s, 'That item isn\'t in your backpack.');
    // The gold and item leave the sender (a server op both sides apply), and the letter and the
    // sender without them are written in one go, so the two can't come apart.
    const op = { op: 'post', roll: { bi, gold } };
    if (!core.apply(op).ok) return this.tell(s, "Couldn't send that.");
    s.send({ t: 'sop', op });
    const row = this.realm.row(s);
    if (!await this.realm.saveTogether([s], () => this.store.postMail(row, this.realm.layer, to.id, s.name, body, gold, item?.recipe ?? null))) return;
    this.tell(s, `Sent to ${to.name}.`);
    this.bus.publish('all', { k: 'mailNew', toChar: to.id, from: s.name });
  }

  async claim(s, id) {
    const m = await this.store.mailOne(id, s.charId);
    if (!m || m.claimed || (!m.gold && !m.item)) return this.tell(s, 'Nothing to claim.');
    const core = s.core;
    if (m.item && !core.inventory.backpack.includes(null)) return this.tell(s, 'No room in your backpack.');
    // The letter marked claimed and the claimer with what it carried, written in one go.
    const op = { op: 'claim', roll: { gold: m.gold, item: m.item } };
    const ok = await this.realm.saveTogether([s], () => this.store.claimMailInto(id, s.charId, this.realm.layer, () => {
      if (m.item && !core.inventory.backpack.includes(null)) return null;
      core.apply(op);
      s.send({ t: 'sop', op });
      return this.realm.row(s);
    }));
    if (ok === null) return this.tell(s, 'Nothing to claim.');
    if (!ok) return;
    await this.sendInbox(s);
  }

  tick(now) {
    for (const [id, inv] of this.guildInvites) if (now - inv.at > GUILD_INVITE_TTL) this.guildInvites.delete(id);
  }
}
