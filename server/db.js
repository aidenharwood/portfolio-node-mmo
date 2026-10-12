// The database under server/store.js, behind one small async interface:
//   SQLite (node:sqlite, a file in DATA_DIR) — `npm start`, a single process.
//   Postgres (DATABASE_URL, the `pg` driver) — several processes sharing it (the cluster's
//   gateways and realm layers).
// SQL is written once with `?` placeholders; each backend runs it its own way.
//   all(sql, params) → rows · get(sql, params) → row | null · run(sql, params) → rows changed
//   exec(sql) — statements without parameters · tx(fn) — fn(db) inside a transaction · close()
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Postgres returns 64-bit integers as strings; every one here (ids, millisecond times, counts)
// fits a JavaScript number.
pg.types.setTypeParser(20, (v) => Number(v));

export function openDb({ url, dir }) {
  return url ? new PgDb(url) : new SqliteDb(dir);
}

class SqliteDb {
  constructor(dir) {
    mkdirSync(dir, { recursive: true });
    this.kind = 'sqlite';
    this.file = path.join(dir, 'celblade.db');
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
    this.stmts = new Map();
  }

  stmt(sql) {
    let s = this.stmts.get(sql);
    if (!s) { s = this.db.prepare(sql); this.stmts.set(sql, s); }
    return s;
  }

  async all(sql, params = []) { return this.stmt(sql).all(...params); }
  async get(sql, params = []) { return this.stmt(sql).get(...params) ?? null; }
  async run(sql, params = []) { return Number(this.stmt(sql).run(...params).changes); }
  async exec(sql) { this.db.exec(sql); }

  async tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = await fn(this);
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async close() { this.db.close(); }
}

// `?` → `$1, $2, …` (none of the SQL here has a literal question mark).
const numbered = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

class PgDb {
  constructor(url) {
    this.kind = 'postgres';
    this.pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL ?? 10), idleTimeoutMillis: 30_000 });
    this.pool.on('error', () => {}); // an idle client dropped: the pool replaces it
    this.sqls = new Map();
  }

  text(sql) {
    let t = this.sqls.get(sql);
    if (!t) { t = numbered(sql); this.sqls.set(sql, t); }
    return t;
  }

  async all(sql, params = [], on = this.pool) { return (await on.query(this.text(sql), params)).rows; }
  async get(sql, params = [], on = this.pool) { return (await on.query(this.text(sql), params)).rows[0] ?? null; }
  async run(sql, params = [], on = this.pool) { return (await on.query(this.text(sql), params)).rowCount ?? 0; }
  async exec(sql) { await this.pool.query(sql); }

  async tx(fn) {
    const client = await this.pool.connect();
    const db = {
      all: (sql, p) => this.all(sql, p, client),
      get: (sql, p) => this.get(sql, p, client),
      run: (sql, p) => this.run(sql, p, client),
    };
    try {
      await client.query('BEGIN');
      const out = await fn(db);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async close() { await this.pool.end(); }
}
