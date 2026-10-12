// JSON API under /api: realm status, accounts and sessions, characters.
//   GET    /api/status                 { online, players, version, seed }
//   POST   /api/register  {name, password}  → { token, account }
//   POST   /api/login     {name, password}  → { token, account }
//   POST   /api/logout                 (Authorization: Bearer <token>)
//   GET    /api/characters             → { account, characters: [...] }
//   POST   /api/characters {name, look} → { character }
//   DELETE /api/characters/:id
import { AuthError } from './accounts.js';
import { log } from './ops.js';

const MAX_BODY = 16 * 1024;
export const VERSION = 1;

// Sliding-window limiter per key (client address): `limit` hits per `windowMs`.
class RateLimit {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  allow(key) {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    const ok = list.length < this.limit;
    if (ok) list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10000) this.hits.clear();
    return ok;
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new AuthError('Request too large.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AuthError('Bad JSON.')); }
    });
    req.on('error', reject);
  });
}

const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? null;

// `seed`: the realm's world seed. Who's online comes from the store's presence table, which
// every realm layer keeps (so the API can run in a gateway apart from them).
export function createApi({ store, accounts, seed, clientAddress }) {
  // Sign-ins and sign-ups per address per minute (raise AUTH_LIMIT for local load tests).
  const authLimit = new RateLimit(Number(process.env.AUTH_LIMIT ?? 10), 60_000);
  // Character creation per account per minute (sign-ups are already limited per address above).
  const writeLimit = new RateLimit(30, 60_000);

  const requireAccount = async (req) => {
    const account = await accounts.resolve(bearer(req));
    if (!account) throw new AuthError('Not signed in.', 401);
    return account;
  };

  return async function api(req, res, url) {
    const ip = clientAddress(req);
    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/status') return send(res, 200, { online: true, players: await store.onlineCount(), version: VERSION, seed });

      if (route === 'POST /api/register' || route === 'POST /api/login') {
        if (!authLimit.allow(ip)) throw new AuthError('Too many attempts — wait a minute.', 429);
        const { name, password } = await readJSON(req);
        const out = route === 'POST /api/register' ? await accounts.register(name, password) : await accounts.login(name, password);
        return send(res, 200, out);
      }
      if (route === 'POST /api/logout') {
        await accounts.logout(bearer(req));
        return send(res, 200, {});
      }
      if (route === 'GET /api/characters') {
        const account = await requireAccount(req);
        const chars = await store.characters(account.id);
        const online = await store.presentIds(chars.map((c) => c.id));
        const list = chars.map((c) => ({ ...c, online: online.has(c.id) }));
        return send(res, 200, { account: { name: account.name }, characters: list });
      }
      if (route === 'POST /api/characters') {
        const account = await requireAccount(req);
        if (!writeLimit.allow(account.id)) throw new AuthError('Slow down.', 429);
        const { name, look } = await readJSON(req);
        return send(res, 200, { character: await accounts.createCharacter(account, name, look) });
      }
      const del = /^DELETE \/api\/characters\/(\d+)$/.exec(route);
      if (del) {
        const account = await requireAccount(req);
        const id = Number(del[1]);
        if (await store.present(id)) throw new AuthError('That character is in the world right now.', 409);
        if (!await store.deleteCharacter(id, account.id)) throw new AuthError('No such character.', 404);
        return send(res, 200, {});
      }
      return send(res, 404, { error: 'Not found.' });
    } catch (err) {
      if (err instanceof AuthError) return send(res, err.status, { error: err.message });
      log.error('api', err);
      return send(res, 500, { error: 'Server error.' });
    }
  };
}
