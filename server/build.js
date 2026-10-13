// What a client and the server must agree on — the world's generation and the game's rules — as
// this server loaded it: a fingerprint of the shared source folders, taken at startup and again
// (at most every few seconds) when asked. The server hands out the client's files live from disk,
// so if those change while it runs, a client that loads them would play by newer rules than the
// server does. /api/status says when that's so ("stale"), and clients stay offline until the
// server restarts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SHARED = ['world', 'rpg', 'items', 'combat', 'sim', 'core'];

function fingerprint() {
  const h = createHash('sha1');
  const walk = (dir) => {
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) h.update(name).update(readFileSync(p));
    }
  };
  for (const d of SHARED) walk(join(SRC, d));
  return h.digest('hex').slice(0, 12);
}

export const BUILD = fingerprint();
let last = { at: 0, fp: BUILD };

// Has the shared code on disk changed since this server started?
export function stale() {
  if (Date.now() - last.at > 5000) last = { at: Date.now(), fp: fingerprint() };
  return last.fp !== BUILD;
}
