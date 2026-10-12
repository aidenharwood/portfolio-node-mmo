// Accounts and sessions. Passwords are stored as scrypt hashes; session tokens are random and only
// their SHA-256 is kept, so a leaked database can't be used to log in.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { validChoice } from '../src/models/heroLooks.js';

const scrypt = promisify(scryptCb);
const KEY_LEN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const SESSION_MAX_AGE = 30 * 24 * 3600 * 1000;
export const MAX_CHARACTERS = 6;

const ACCOUNT_NAME = /^[A-Za-z0-9_]{3,20}$/;
// Character names are public: a capital-first word of letters, optionally one apostrophe or hyphen.
const CHARACTER_NAME = /^[A-Z][a-z]+(?:['-][A-Za-z][a-z]+)?$/;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPassword(password, stored) {
  const [kind, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const got = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
  return timingSafeEqual(got, expected);
}

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export class Accounts {
  constructor(store) {
    this.store = store;
    store.pruneSessions(SESSION_MAX_AGE).catch(() => {});
  }

  async register(name, password) {
    name = String(name ?? '').trim();
    password = String(password ?? '');
    if (!ACCOUNT_NAME.test(name)) throw new AuthError('Account names are 3–20 letters, digits or underscores.');
    if (password.length < 8 || password.length > 200) throw new AuthError('Passwords need at least 8 characters.');
    if (await this.store.accountByName(name)) throw new AuthError('That account name is taken.', 409);
    let id;
    try {
      id = await this.store.addAccount(name, await hashPassword(password));
    } catch {
      throw new AuthError('That account name is taken.', 409); // taken in the meantime
    }
    return this.openSession(id, name);
  }

  async login(name, password) {
    const acct = await this.store.accountByName(String(name ?? '').trim());
    // Hash anyway when the account doesn't exist, so timing doesn't reveal which names are taken.
    const ok = acct ? await checkPassword(String(password ?? ''), acct.hash) : (await hashPassword('x'), false);
    if (!ok) throw new AuthError('Wrong account name or password.', 401);
    if (acct.banned_until > Date.now()) throw new AuthError(`This account is banned until ${new Date(acct.banned_until).toUTCString()}.`, 403);
    return this.openSession(acct.id, acct.name);
  }

  async openSession(accountId, name) {
    const token = randomBytes(32).toString('base64url');
    await this.store.addSession(sha256(token), accountId);
    return { token, account: { name } };
  }

  // The account a token belongs to, or null if it's unknown or expired.
  async resolve(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const h = sha256(token);
    const s = await this.store.session(h);
    if (!s) return null;
    if (Date.now() - s.seen > SESSION_MAX_AGE) { await this.store.dropSession(h); return null; }
    // Seen at most once a minute per token (every request and every join would otherwise write).
    if (Date.now() - s.seen > 60_000) await this.store.touchSession(h);
    return this.store.accountById(s.account_id);
  }

  async logout(token) {
    if (typeof token === 'string') await this.store.dropSession(sha256(token));
  }

  async createCharacter(account, name, look) {
    name = String(name ?? '').trim();
    if (name.length < 3 || name.length > 16 || !CHARACTER_NAME.test(name)) {
      throw new AuthError('Character names are 3–16 letters, starting with a capital (one \' or - allowed).');
    }
    if (!validChoice(look)) throw new AuthError('Invalid appearance.');
    if (await this.store.characterCount(account.id) >= MAX_CHARACTERS) throw new AuthError(`You can have up to ${MAX_CHARACTERS} characters.`);
    if (await this.store.characterNameTaken(name)) throw new AuthError('That name is taken.', 409);
    let id;
    try {
      id = await this.store.addCharacter(account.id, name, look);
    } catch {
      throw new AuthError('That name is taken.', 409); // taken in the meantime
    }
    return { id, name, level: 1, look };
  }
}
