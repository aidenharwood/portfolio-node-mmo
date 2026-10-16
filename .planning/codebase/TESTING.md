# Testing Patterns

**Analysis Date:** 2026-10-16

## Test Framework

**Runner:**
- Primary: hand-rolled check scripts in `tools/*check.mjs` plus `tools/smoke.mjs`, run with plain `node` and chained by `npm test` (`package.json`)
- Secondary: Node built-in `node:test` for unit tests in `tests/*.test.mjs`
- Config: none (no Jest/Vitest). Node >= 22.13 (`package.json` engines); CI uses 22.18.0

**Assertion Library:**
- Check scripts: a local `check(ok, what)` helper printing `✓` / `✗`
- Unit tests: `node:assert/strict`

**Run Commands:**
```bash
npm test                         # all check scripts + single-process smoke test (SQLite)
npm run test:cluster             # smoke: gateway + two realm layers on DATABASE_URL (Postgres)
node tools/questcheck.mjs 999    # one check script, optional world seed (default 12345)
node --test tests/               # node:test unit tests (NOT included in npm test)
npm run load                     # load tests (tools/load/*.mjs)
```

CI (`.github/workflows/deploy.yaml`): `node --check` on every source file, then `npm test`, then `npm run test:cluster` against a Postgres 17 service.

## Test File Organization

**Location:**
- Domain checks: `tools/<area>check.mjs` (`aicheck`, `buildcheck`, `campcheck`, `dungeoncheck`, `effectcheck`, `eventcheck`, `hordecheck`, `persistcheck`, `physicscheck`, `placecheck`, `poicheck`, `progresscheck`, `questcheck`, `raidcheck`, `surfacecheck`) and `tools/powercurve.mjs`
- End-to-end: `tools/smoke.mjs`
- Unit: `tests/*.test.mjs`
- Load: `tools/load/` (`lib.mjs` shared)
- Shared check helpers: `tools/storyflags.mjs`

**Naming:**
- `tools/<area>check.mjs`; `tests/<kebab-topic>.test.mjs`

## Test Structure

**Check script pattern** (`tools/hordecheck.mjs`, `tools/questcheck.mjs`):
```javascript
// Dev check: <what it checks, in prose>.
// Run: node tools/xcheck.mjs [seed]
import { HeadlessWorld } from '../server/world.js';

const seed = Number(process.argv[2] ?? 12345);
const world = new HeadlessWorld(seed);
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  return ok;
};

// ---------------------------------------------------------------- section
{
  const off = STORY.filter(/* ... */);
  check(!off.length, `every story quest ...${off.length ? ` (not: ${off.map((q) => q.id).join(', ')})` : ''}`);
}

console.log(failed ? `xcheck: ${failed} failed` : 'xcheck: all good');
process.exit(failed ? 1 : 0);
```

**Unit test pattern** (`tests/map-regression.test.mjs`):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { Discovery } from '../src/world/Discovery.js';

test('discovery saves compactly and round-trips', () => {
  const d = new Discovery();
  d.reveal(0, 0, 8);
  const loaded = new Discovery();
  loaded.load(d.toJSON());
  assert.equal(loaded.isKnown(0, 0), true);
});
```

**Patterns:**
- Check descriptions are plain-English statements of the rule; include offending ids in the message on failure
- Group related checks in bare `{ ... }` blocks with `// ----` section headers
- Keep going after a failure (count, don't throw) in check scripts; exit code 1 at the end
- `tools/smoke.mjs` instead throws on first failure (`check` throws `new Error(what)`)

## Mocking

**Framework:** None. Use real modules with lightweight stand-ins.

**Patterns:**
```javascript
// tools/questcheck.mjs: real server rules, stub host objects
const host = { hud: null, world: w, encounters: { isCleared: () => false }, stats, player: { position } };
const core = new CharacterCore({ stats, inventory: new Inventory(3), quests, ..., world: w, strict: true });
const op = (o) => runOp(core, { op: o });   // same path the server uses
```

**What to Mock:**
- Client-only collaborators (HUD, encounters, player) with minimal object literals
- Randomness: pass a fixed `rng` (`() => 0`) or seeded `mulberry32` from `src/core/rng.js`

**What NOT to Mock:**
- World generation: use `HeadlessWorld(seed)` from `server/world.js`
- Character ops: go through `runOp` (`server/characters.js`) so server validation is exercised
- Server/database in smoke: spawn the real `server/main.js` with a temp `DATA_DIR` (`mkdtempSync`) and random port (`18000 + rand`), hitting it via `fetch` and WebSocket

## Fixtures and Factories

**Test Data:**
```javascript
// Fresh character factory (tools/questcheck.mjs)
function fresh(pick) { stats = new Stats(); quests = new QuestLog(host); core = makeCore(); choices = pick; }
// Unique names per smoke run (tools/smoke.mjs)
const TAG = [...String(Date.now() % 1e5)].map((d) => 'abcdefghij'[d]).join('');
```

**Location:**
- Inline in each script; no fixtures directory. Deterministic seeds provide the world. `.test-data/` and `.load-data/` are scratch output dirs.

## Coverage

**Requirements:** None enforced; no coverage tooling.

**View Coverage:** Not applicable (`node --test --experimental-test-coverage tests/` works ad hoc).

## Test Types

**Unit Tests:**
- `tests/*.test.mjs` with `node:test`; pure logic (discovery/fog, save normalization). Not wired into `npm test` or CI — add them to the `test` script if relied on.

**Integration Tests:**
- `tools/*check.mjs`: whole subsystems against a headless seeded world. New gameplay systems should get a `tools/<area>check.mjs` and be appended to the `npm test` chain in `package.json`.

**E2E Tests:**
- `tools/smoke.mjs` (signup, character, join, chat, camps, quest board, raid group; cluster mode adds cross-layer chat). Visual tools (`tools/worldshots.js`, `tools/enemyshots.js`, `tools/shotkit.js`) are manual.

## Common Patterns

**Async Testing:**
```javascript
async function up(port) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return; } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error(`nothing listening on ${port}`);
}
```

**Error Testing:**
```javascript
// Ops refused out of order return { ok: false }
check(!run({ op: 'turnIn', id: 'q2' }).ok, 'cannot hand in before the objectives are done');
```

---

*Testing analysis: 2026-10-16*
