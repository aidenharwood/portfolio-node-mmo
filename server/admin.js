// Admin tools: chat commands for accounts with the admin role. The role is granted at startup to
// the account names in the ADMINS environment variable (comma-separated), e.g.
//   ADMINS=aiden npm start
// All under /admin (so they never clash with players' own commands, like the party's /kick):
//   /admin kick Name [reason] · ban Name hours [reason] · unban Name · mute Name minutes ·
//   unmute Name · announce text · tp Name (go to them) · summon Name (bring them here) ·
//   inspect Name · reports · resolve id · event surge|siege|anomaly (one at the nearest place that
//   suits it) · event win|lose (the nearest one, now)
// Bans and mutes belong to the account (every character on it); a ban also ends their sessions.
// They reach players on any layer (over the bus); tp and summon move one of you to the other's
// layer first.
import { log } from './ops.js';

export class Admin {
  constructor(realm) {
    this.realm = realm;
    const list = String(process.env.ADMINS ?? '').split(',').map((n) => n.trim()).filter(Boolean);
    for (const name of list) {
      realm.store.setRole(name, 'admin').then((ok) => {
        if (ok) log.info('admin', `${name} is an admin`);
        else log.warn('admin', `no account called ${name} (create it, then restart)`);
      }, (err) => log.error('admin', err));
    }
  }

  get store() { return this.realm.store; }
  tell(s, text) { s.send({ t: 'chat', ch: 'system', text }); }
  local(name) {
    const n = String(name ?? '').toLowerCase();
    return [...this.realm.sessions.values()].find((o) => o.name.toLowerCase() === n) ?? null;
  }

  // The account behind a character name (online or not).
  async accountOf(name) {
    const c = await this.store.characterByName(String(name ?? '').trim());
    return c ? { character: c, account: await this.store.accountById(c.account_id) } : null;
  }

  // Returns true if handled (non-admins get nothing: their command falls through to the help).
  command(s, cmd0, arg0) {
    if (cmd0 !== 'admin' || !s.admin) return false;
    this.run(s, String(arg0 ?? '').trim().split(/\s+/)).catch((err) => { log.error('admin', err); this.tell(s, 'That failed (see the server log).'); });
    return true;
  }

  async run(s, [cmd = '', name, ...rest]) {
    const bus = this.realm.bus;
    switch (cmd.toLowerCase()) {
      case 'kick': {
        const who = await this.accountOf(name);
        if (!who || !await this.store.present(who.character.id)) return this.tell(s, `${name} isn't online.`);
        bus.publish('all', { k: 'kick', charId: who.character.id, code: 4012, reason: `Removed by an admin${rest.length ? `: ${rest.join(' ')}` : '.'}` });
        return this.log(s, `kicked ${who.character.name}`);
      }
      case 'ban': {
        const hours = Number(rest[0]);
        const who = await this.accountOf(name);
        if (!who || !Number.isFinite(hours) || hours <= 0) return this.tell(s, 'Usage: /admin ban Name hours [reason]');
        const until = Date.now() + hours * 3600_000;
        await this.store.setBan(who.account.id, until);
        bus.publish('all', { k: 'kick', accountId: who.account.id, code: 4011, reason: `Banned until ${new Date(until).toUTCString()}${rest.length > 1 ? `: ${rest.slice(1).join(' ')}` : ''}.` });
        return this.log(s, `banned ${who.account.name} (${who.character.name}) for ${hours} h`);
      }
      case 'unban': {
        const who = await this.accountOf(name);
        if (!who) return this.tell(s, `No character called ${name}.`);
        await this.store.setBan(who.account.id, 0);
        return this.log(s, `unbanned ${who.account.name}`);
      }
      case 'mute': case 'unmute': {
        const who = await this.accountOf(name);
        const minutes = cmd === 'mute' ? Number(rest[0]) : 0;
        if (!who || (cmd === 'mute' && !(minutes > 0))) return this.tell(s, 'Usage: /admin mute Name minutes · /admin unmute Name');
        const until = cmd === 'mute' ? Date.now() + minutes * 60_000 : 0;
        await this.store.setMute(who.account.id, until);
        bus.publish('all', { k: 'mute', accountId: who.account.id, until, minutes });
        return this.log(s, `${cmd}d ${who.character.name}${until ? ` for ${minutes} min` : ''}`);
      }
      case 'announce': {
        const text = [name, ...rest].join(' ').trim();
        if (!text) return this.tell(s, 'Usage: /admin announce text');
        bus.publish('all', { k: 'announce', text });
        return undefined;
      }
      case 'tp': case 'summon': {
        const t = this.local(name);
        if (t?.state) {
          const [from, to] = cmd === 'tp' ? [t, s] : [s, t];
          // Moving someone is a teleport the speed check lets through.
          to.core.teleportUntil = to.core.time + 10;
          to.send({ t: 'pos', p: from.state.p });
        } else {
          const who = await this.accountOf(name);
          const where = who && await this.store.present(who.character.id);
          if (!where) return this.tell(s, `${name} isn't online.`);
          // On another layer: go there and stand by them, or bring them here.
          if (cmd === 'tp') await this.realm.move(s, where.layer, { near: where.id });
          else bus.publish(`layer:${where.layer}`, { k: 'summon', charId: where.id, layer: this.realm.layer, near: s.charId });
        }
        return this.log(s, `${cmd === 'tp' ? 'went to' : 'summoned'} ${name}`);
      }
      case 'inspect': {
        const who = await this.accountOf(name);
        if (!who) return this.tell(s, `No character called ${name}.`);
        const t = this.local(name);
        const where = await this.store.present(who.character.id);
        const c = t?.core;
        return this.tell(s, `${who.character.name} · account ${who.account.name} · level ${c?.stats.level ?? who.character.level}`
          + (where ? ` · layer ${where.layer + 1}` : ' · offline')
          + (c ? ` · ${c.stats.gold}g · at ${t.state?.p.map(Math.round).join(', ') ?? '?'} · from ${t.ws.ip}` : '')
          + (who.account.banned_until > Date.now() ? ` · BANNED until ${new Date(who.account.banned_until).toUTCString()}` : '')
          + (who.account.muted_until > Date.now() ? ' · muted' : ''));
      }
      case 'reports': {
        const list = await this.store.reports();
        if (!list.length) return this.tell(s, 'No open reports.');
        for (const r of list) this.tell(s, `#${r.id} ${new Date(r.created).toISOString().slice(0, 16)} ${r.reporter} → ${r.target}: ${r.reason}`);
        return undefined;
      }
      case 'resolve': {
        await this.store.handleReport(Number(name));
        return this.tell(s, `Report #${name} resolved.`);
      }
      // Public events (sim/WorldEvents.js), for trying them out.
      case 'event': {
        const d = this.realm.simhost.sim.director;
        const at = s.proxy?.placed ? s.proxy.position : null;
        const what = String(name ?? '').toLowerCase();
        if (!at) return this.tell(s, 'Not in the world yet.');
        if (what === 'win' || what === 'lose') {
          const ev = d.force(at.x, at.z, what === 'win');
          return ev ? this.log(s, `${what === 'win' ? 'won' : 'lost'} ${ev.name}`) : this.tell(s, 'No event under way near you.');
        }
        const ev = d.startNear(at.x, at.z, what);
        return ev ? this.log(s, `started ${ev.name}`) : this.tell(s, 'Usage: /admin event surge|siege|anomaly|win|lose');
      }
      default:
        return this.tell(s, 'Admin: /admin kick · ban · unban · mute · unmute · announce · tp · summon · inspect · reports · resolve · event');
    }
  }

  // Mutes reach the player on whichever layer they're on.
  onBus(m) {
    if (m.k !== 'mute') return;
    for (const o of this.realm.sessions.values()) {
      if (o.accountId !== m.accountId) continue;
      o.mutedUntil = m.until;
      this.tell(o, m.until ? `You've been muted for ${m.minutes} minute${m.minutes === 1 ? '' : 's'}.` : 'You can chat again.');
    }
  }

  log(s, what) {
    log.info('admin', what, { by: s.name });
    this.tell(s, `Done: ${what}.`);
  }
}
