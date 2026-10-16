# Coding Conventions

**Analysis Date:** 2026-10-16

## Naming Patterns

**Files:**
- Classes and engine modules use PascalCase: `src/entities/Player.js`, `src/render/CameraRig.js`, `src/rpg/CharacterCore.js`, `src/world/Gen.js`
- Data tables and function-only modules use lowercase/camelCase: `src/items/rarity.js`, `src/rpg/storyline.js`, `src/rpg/questWatch.js`, `src/world/campLayout.js`
- Server modules are lowercase single nouns: `server/trade.js`, `server/realm.js`, `server/ops.js`, `server/bus.js`
- Dev/check scripts are lowercase `<thing>check.mjs` in `tools/`: `tools/questcheck.mjs`, `tools/campcheck.mjs`
- Unit tests are kebab-case `*.test.mjs` in `tests/`: `tests/map-regression.test.mjs`

**Functions:**
- camelCase, short verbs: `rollRarity`, `weightedPick`, `reachedPlaces`, `defenceAt`, `generateDungeon`
- Class methods mirror protocol actions (see `server/trade.js` `handle()` dispatching to `request`, `accept`, `lock`, `confirm`)

**Variables:**
- camelCase locals; short names are common in tight code (`s` for session, `w` for world, `q` for quest, `r` for result)
- Module constants SCREAMING_SNAKE_CASE: `REQUEST_TTL`, `TRADE_RANGE`, `MAX_ITEMS` (`server/trade.js`), `RARITIES`, `STORY`, `ACTS`, `CITY_WALL`
- Numeric separators for big literals: `30_000`

**Types:**
- Plain JavaScript (ES modules, `"type": "module"`), no TypeScript, no JSDoc types. Shapes are described in prose comments.
- Lookup maps derived from arrays: `export const RARITY = Object.fromEntries(RARITIES.map((r) => [r.id, r]));` (`src/items/rarity.js`)

## Code Style

**Formatting:**
- No formatter config (no Prettier/Biome). Observed style: 2-space indent, single quotes, semicolons, trailing commas in multi-line literals, arrow params always parenthesised `(r) => ...`
- Long lines are tolerated (~120-150 chars); single-line `if (...) return ...;` guards are common
- Column-aligned data tables (see `src/items/rarity.js` `RARITIES`)
- Section dividers: `// ---------------------------------------------------------------- logs` (`server/ops.js`, `tools/hordecheck.mjs`)

**Linting:**
- No ESLint. The only gate is CI `node --check` on every `server/*.js` and `src/**/*.js` (`.github/workflows/deploy.yaml`). Keep every file parseable standalone by Node.

## Import Organization

**Order:**
1. Third-party / Node built-ins (`import * as THREE from 'three';`, `node:fs`, `node:path`)
2. Project modules by relative path (`../src/...`, `./ops.js`)
3. Named imports preferred; `import * as storyline` only when the whole namespace is needed

**Path Aliases:**
- None. Use relative paths with explicit `.js` extensions. Node built-ins use the `node:` prefix.
- `src/` is shared between browser client and server (server imports `../src/rpg/CharacterCore.js` etc.), so `src/` modules used by the server must not touch DOM/browser globals at import time.

## Error Handling

**Patterns:**
- Game/state operations return result objects rather than throwing: `return { ok: false, fx: [] }` / `{ ok: true, fx }` (`src/rpg/CharacterCore.js`)
- Player-facing refusals are sent as system chat and return early: `return this.tell(s, \`${name} isn't online.\`)` (`server/trade.js`)
- Fire-and-forget promises get an explicit swallow or log: `.catch(() => {})` (`server/accounts.js`), `.catch((err) => log.warn('bus', ...))` (`server/bus.js`)
- Expected parse failures use bare `catch { ... }` (no binding) with a short comment, e.g. `catch { /* not yet */ }`
- Typed errors for HTTP: `AuthError` in `server/api.js`
- Listener callbacks wrapped so one failure doesn't break the loop: `try { fn(to, msg); } catch (err) { log.error('bus', err); }` (`server/bus.js`)

## Logging

**Framework:** custom `log` in `server/ops.js` (text or `LOG_FORMAT=json`)

**Patterns:**
- Server code: `import { log, metrics } from './ops.js'`; call `log.info|warn|error(tag, msg, extra?)` with a short subsystem tag (`'bus'`, `'admin'`). Pass `Error` objects to `log.error` to get the stack.
- Count events with `metrics.inc('trades')`.
- Do not use raw `console.*` in `server/`; `tools/` scripts print with `console.log`.

## Comments

**When to Comment:**
- Every file opens with a prose header explaining what the module does, how it fits, and (for servers) the wire protocol — see `server/trade.js`, `server/ops.js`, `tools/questcheck.mjs`, `tools/smoke.mjs`
- Comments are full plain-English sentences explaining intent and game rules ("why"), not restating code
- Inline field comments for maps: `this.byChar = new Map();   // char id → trade`
- British spelling is used in identifiers and prose (`defence`, `neighbour`); keep it consistent

**JSDoc/TSDoc:**
- Not used. Do not add JSDoc blocks; write a prose comment instead.

## Function Design

**Size:** Small helpers are one-liners (arrow consts); large modules are tolerated (`src/main.js` 2142 lines, `src/entities/Player.js` 1781). Prefer adding new focused modules over growing these.

**Parameters:** Options objects with defaults for constructors (`new CharacterCore({ stats, inventory, quests, ... })`); positional with defaults for pure functions (`rollRarity(rng, luck = 0, minTier = 0)`). Randomness is injected (`rng`), use `mulberry32`/`weightedPick` from `src/core/rng.js` for determinism.

**Return Values:** Early returns; optional chaining and nullish coalescing heavily (`a.proxy?.position`, `msg.act ?? ...`); `null` for "not found".

## Module Design

**Exports:** Named exports only (`export class Trades`, `export const RARITIES`, `export function rollRarity`). No default exports.

**Barrel Files:** None. Import directly from the defining file.

---

*Convention analysis: 2026-10-16*
