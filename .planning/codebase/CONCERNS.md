# Codebase Concerns

**Analysis Date:** 2026-10-16

No `TODO`/`FIXME`/`HACK` markers exist in `src/` or `server/`; the concerns below come from structure, file size and trust-model review.

## Tech Debt

**Oversized client modules:**
- Issue: Several files mix many responsibilities and exceed 1,000 lines.
- Files: `src/main.js` (2142), `src/entities/Player.js` (1781), `src/world/World.js` (1759), `src/world/Gen.js` (1270), `src/sim/EnemySim.js` (1209), `src/world/Towns.js` (1130), `src/items/forms.js` (1125), `src/anim/Animator.js` (1020)
- Impact: Hard to change safely; `src/main.js` wires every system, so most features touch it and merge conflicts between parallel worktrees concentrate there.
- Fix approach: Extract cohesive subsystems (online/offline start, HUD wiring, input dispatch) from `src/main.js` into modules under `src/core/` or `src/ui/`; split `Player.js` into movement/combat/equipment parts.

**Large server realm file:**
- Issue: `server/realm.js` (787 lines) holds session lifecycle, message dispatch, rate limits, sanitisers and saves in one class.
- Files: `server/realm.js`
- Impact: Every new message type grows a central `switch` (around line 447) and the `LIMITS` table (line 67).
- Fix approach: Move message handlers into per-feature modules (as `server/parties.js`, `server/trade.js` already do) and register them in a table.

**Test suite is a chain of bespoke scripts:**
- Issue: `npm test` in `package.json` is a 17-step `&&` chain of `tools/*check.mjs` scripts; there is no test runner, no per-test reporting, and the first failure hides the rest.
- Files: `package.json`, `tools/*.mjs`, `tests/map-regression.test.mjs`, `tests/map-persistence-online.test.mjs`
- Impact: Slow feedback, no coverage data, `tests/*.test.mjs` are not part of `npm test`.
- Fix approach: Adopt `node --test` and convert check scripts to test files, keeping them runnable standalone.

## Known Bugs

Not detected from static review (no failing markers or bug notes in code).

## Security Considerations

**Client-authoritative damage within a cap:**
- Risk: `SimHost.hit()` trusts client-reported damage if it is in reach and `<= maxHit(s.core)`. With the `hit` rate limit of 60/s burst 120 (`server/realm.js:67`), a modified client can deal max-hit damage every message, far beyond legitimate DPS.
- Files: `server/simhost.js:476-496`, `server/realm.js:67`
- Current mitigation: Reach check, per-hit cap, strike counter (disconnect at 200 strikes, `server/realm.js:415`).
- Recommendations: Track per-player damage over a sliding window against weapon fire rate; validate `m.cp` component against the enemy's parts.

**Client-authoritative movement (XZ only):**
- Risk: `updatePlayer` checks horizontal distance against a speed bank but does not bound vertical position `st.p[1]`; free movement during `teleportUntil` is accepted unchecked.
- Files: `server/simhost.js:314-331`
- Current mitigation: Speed bank, server sends corrective `pos`.
- Recommendations: Clamp Y against terrain height from `server/world.js`; validate teleport destinations.

**Proxy header trust:**
- Risk: With `TRUST_PROXY` set, the first `X-Forwarded-For` value keys rate limiting; if the server is reachable without the proxy, limits on register/login can be bypassed by spoofing.
- Files: `server/main.js:65`, `server/api.js:16-25`
- Current mitigation: Opt-in env var; `deploy/Caddyfile` fronts production.
- Recommendations: Use the right-most untrusted hop, or restrict to known proxy addresses.

**In-memory rate limiter maps:**
- Risk: `RateLimiter.hits` in `server/api.js` is a `Map` keyed per address; per-process only, so a cluster of gateways multiplies the allowance.
- Files: `server/api.js`
- Recommendations: Ensure stale keys are pruned; move to store-backed limits if clustering scales out.

**Metrics endpoint optional auth:**
- Risk: `/metrics` is open when `METRICS_TOKEN` is unset; token compared with `!==` (not constant-time).
- Files: `server/main.js:104-105`
- Recommendations: Require the token in production, use `timingSafeEqual`.

**Admin by account name:**
- Risk: `ADMINS` lists account names; whoever registers a listed name first (e.g. on a fresh database) gains admin.
- Files: `server/admin.js:17`
- Recommendations: Key admins by account id or a DB flag.

## Performance Bottlenecks

**Single-process world simulation:**
- Problem: `WorldSim` runs every enemy for every player in one 20 Hz tick per realm process.
- Files: `server/simhost.js`, `src/sim/WorldSim.js`, `src/sim/EnemySim.js`, `server/realm.js`
- Cause: Node single thread; shared client/server sim code with Three.js math objects.
- Improvement path: Profile with `tools/load/players.mjs` / `tools/loadsim.mjs`; spatially partition enemies; use layers (`server/gateway.js`) to cap per-process players.

**JSON over WebSocket:**
- Problem: Snapshots are JSON arrays (`server/simhost.js` enemy state ~line 460); gateway allows 4 MB payloads (`server/gateway.js:149`), realm 512 KB (`server/main.js:159`).
- Improvement path: Binary encoding for snapshots; delta compression.

## Fragile Areas

**Shared client/server rules:**
- Files: `src/rpg/CharacterCore.js`, `src/sim/*`, `src/items/*`, `src/world/*`, consumed by `server/characters.js`, `server/simhost.js`, `server/world.js`
- Why fragile: Server imports browser-side modules; any DOM/WebGL access added to these files breaks the server. `server/build.js` hashes `src/` to detect stale clients, so edits change the build fingerprint.
- Safe modification: Keep shared modules render-free; run `npm test` (includes `tools/smoke.mjs`) and `npm run test:cluster`.
- Test coverage: Behaviour checks exist (`tools/questcheck.mjs`, `tools/persistcheck.mjs`), but no unit tests for `CharacterCore.apply` operations.

**Deterministic world generation:**
- Files: `src/world/Gen.js`, `src/world/Landmarks.js`, `src/world/StorySites.js`, `src/world/Towns.js`, `tests/map-regression.test.mjs`
- Why fragile: Seeded generation; character saves and quest state reference generated places, so changing generation order shifts the world for existing characters.
- Safe modification: Run `tools/placecheck.mjs`, `tools/poicheck.mjs` and `tests/map-regression.test.mjs` after edits.

**Trade and save atomicity:**
- Files: `server/trade.js`, `server/store.js`, `server/characters.js`
- Why fragile: Item duplication risk if swap and persistence can interleave with disconnects or cross-layer moves.
- Safe modification: Keep swaps inside single store transactions; add a disconnect-mid-trade test.

## Scaling Limits

**SQLite default store:**
- Current capacity: One file `data/celblade.db` (WAL), single writer.
- Limit: Single host only; backups are file copies every `BACKUP_HOURS` (`server/ops.js:110-130`) into `data/backups`, same disk.
- Scaling path: Postgres (`server/db.js`, `server/bus.js` PgBus) for cluster mode; ship backups off-host.

**Per-layer world copies:**
- Current capacity: One world per realm process; players split by `server/gateway.js` layer selection.
- Limit: Players on different layers cannot see each other.
- Scaling path: Documented in `docs/MULTIPLAYER.md`.

## Dependencies at Risk

**three 0.160.0:**
- Risk: Pinned, well behind current releases; client loads it without a bundler, and server-side imports depend on its math API.
- Impact: Upgrades touch rendering (`src/render/*`) and server sim simultaneously.
- Migration plan: Upgrade incrementally with `tools/worldshots.js` / `tools/enemyshots.js` visual checks.

**node:sqlite (experimental):**
- Risk: `npm start` passes `--disable-warning=ExperimentalWarning`; Node's built-in SQLite API may change.
- Files: `package.json`, `server/db.js`
- Migration plan: Pin Node version in `Dockerfile` and CI (`.github/workflows/deploy.yaml` uses 22.18.0).

## Missing Critical Features

**Account recovery and moderation tooling:**
- Problem: No password reset, email, or 2FA in `server/accounts.js`; reports in `server/social.js` have no review UI beyond `/admin` chat commands.
- Blocks: Public launch beyond a portfolio demo.

## Test Coverage Gaps

**HTTP API and auth:**
- What's not tested: Register/login error paths, session expiry (`SESSION_MAX_AGE`, `server/accounts.js:10`), rate limiting.
- Files: `server/api.js`, `server/accounts.js`
- Risk: Auth regressions unnoticed. `tools/load/auth.mjs` is load only.
- Priority: High

**Anti-cheat validation:**
- What's not tested: Refused hits/moves, strike disconnects.
- Files: `server/simhost.js`, `server/realm.js`
- Risk: Loosened checks go unnoticed.
- Priority: High

**Client rendering/UI:**
- What's not tested: `src/ui/*`, `src/render/*`, `src/anim/*` have no automated tests; only screenshot tools in `tools/`.
- Risk: Visual regressions.
- Priority: Low

**Social, parties, raid groups:**
- What's not tested directly: `server/social.js`, `server/parties.js`, `server/raidgroups.js` beyond `tools/raidcheck.mjs` and smoke tests.
- Priority: Medium

---

*Concerns audit: 2026-10-16*
