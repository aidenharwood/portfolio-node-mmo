<!-- refreshed: 2026-10-16 -->
# Architecture

**Analysis Date:** 2026-10-16

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                 Browser client (static ES modules, no bundler)            │
│  `index.html` → `src/main.js` (Game loop)  ·  `src/net/Net.js` (realm)     │
│  render/ · entities/ · ui/ · anim/ · audio/ · world/ (streamed terrain)    │
│  shared rules: `src/rpg/` `src/combat/` `src/items/` `src/sim/` `src/world/`│
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ HTTP: /api/*, static files    │ WebSocket: /ws (JSON)
                ▼                               ▼
┌───────────────────────────────┐   ┌──────────────────────────────────────┐
│ HTTP layer                    │   │ Realm (one world copy per process)   │
│ `server/main.js` (dispatch)   │   │ `server/realm.js` (20 Hz tick)        │
│ `server/api.js` (accounts)    │   │  ├ `server/simhost.js` → WorldSim     │
│ `server/accounts.js`          │   │  ├ `server/world.js` (headless World) │
│ `server/ops.js` (health/metr.)│   │  ├ `server/characters.js` (CharacterCore)│
└───────────────────────────────┘   │  ├ `server/parties.js` `trade.js`    │
                                    │  ├ `server/social.js` `admin.js`      │
                                    │  └ `server/raidgroups.js`             │
                                    └───────┬──────────────────┬───────────┘
                                            │ bus              │ persistence
                                            ▼                  ▼
                          ┌──────────────────────────┐  ┌────────────────────┐
                          │ `server/bus.js`           │  │ `server/store.js`  │
                          │ LocalBus | PgBus (NOTIFY) │  │ `server/db.js`     │
                          └──────────────────────────┘  │ SQLite | Postgres  │
                                                         └────────────────────┘

Cluster (ROLE=gateway / ROLE=realm): `server/gateway.js` relays players' /ws
connections to a realm layer chosen by store affinity, presence and load.
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Server entry and dispatch | Chooses role (`all`/`gateway`/`realm`), serves client files, routes `/api`, `/healthz`, `/metrics`, upgrades `/ws` | `server/main.js` |
| Account API | Register, login, logout, character list/create/delete over JSON | `server/api.js`, `server/accounts.js` |
| Realm | Connected players, state relay, area-of-interest snapshots, chat, character saves, world sim host | `server/realm.js` |
| Sim host | Runs the shared `WorldSim` for every player on the server | `server/simhost.js` |
| Headless world | Terrain and collision for the server, without rendering | `server/world.js` |
| Characters | Authoritative character per player; applies client operations through `CharacterCore` | `server/characters.js` |
| Parties | Invitations, membership, party positions and chat | `server/parties.js` |
| Trade | Two-sided trade window; atomic swap with re-checks | `server/trade.js` |
| Social | Friends, ignores, guilds, mail, reports | `server/social.js` |
| Raid groups | Grouping for raid runs | `server/raidgroups.js` |
| Admin | `/admin` chat commands for accounts in `ADMINS` | `server/admin.js` |
| Gateway | Front door in cluster mode; layer selection and relay | `server/gateway.js` |
| Store | One async interface over SQLite or Postgres; schema; presence and affinity | `server/store.js`, `server/db.js` |
| Bus | Cross-layer messages (world chat, whispers, invitations, admin actions) | `server/bus.js` |
| Ops | JSON logging, metrics, health, scheduled SQLite backups | `server/ops.js` |
| Build fingerprint | Hash of shared `src/` folders; reports `stale` when client files change on disk | `server/build.js` |
| Game loop (client) | Frame loop, wiring of systems, offline or online start | `src/main.js` |
| Online client | Accounts API, WebSocket to realm, send ~15 Hz, receive snapshots, clock sync | `src/net/Net.js`, `src/net/Remotes.js`, `src/net/RemotePlayer.js` |
| Shared world sim | Every enemy, camp, roaming pack and combat rule; emits events, draws nothing | `src/sim/WorldSim.js` |
| Dungeon instances | Open-world and private dungeon copies | `src/sim/Dungeons.js`, `src/sim/RaidRun.js` |
| Procedural world | Pure function of (seed, position): terrain, biomes, POIs | `src/world/Gen.js`, `src/world/Chunks.js` |
| Streamed world (client) | Terrain chunks, POIs, collision and placement queries | `src/world/World.js` |
| Character rules | Progression and belongings as operations, shared by client and server | `src/rpg/CharacterCore.js` |
| Quest watch | Checks players' positions against quests each second | `src/rpg/questWatch.js` |
| Enemy layer (client) | Enemies on screen; offline runs `WorldSim` locally, online follows snapshots | `src/entities/EnemyLayer.js`, `src/net/EnemyReplica.js` |
| Renderer | Three.js scene, toon post-processing, shadows, grass, view model | `src/render/*.js` |
| UI | HUD, menus, inventory, map, dialogue, chat, party, trade, title screen | `src/ui/*.js` |

## Pattern Overview

**Overall:** Client-server, authoritative server with shared rules code. The same rules modules (`src/rpg`, `src/combat`, `src/items`, `src/sim`, `src/world`, `src/core`) run in the browser and on the server, and the server is the authority for combat, loot and character state.

**Key Characteristics:**
- **No build step.** The browser loads `src/` directly as ES modules; `three` resolves through an import map to jsDelivr. The server imports the same files from `src/` (`server/build.js` lists `world`, `rpg`, `items`, `combat`, `sim`, `core` as shared).
- **Deterministic world.** `src/world/Gen.js` and `src/world/Chunks.js` derive all terrain from `(seed, position)`, so only the seed needs saving; server and client build identical geometry.
- **Operations, not state dumps.** Character changes are sent as named operations (`op { seq, op }`); `src/rpg/CharacterCore.js` applies them on both sides, and the server rolls dice where chance matters. A fingerprint lets the client detect drift.
- **Offline and online share code.** `src/net/Net.js` detects whether the page was served by the server; without it the game runs `WorldSim` locally for one player.
- **One process or a cluster.** The same `server/main.js` runs as `all` (SQLite, in-process bus) or as `gateway` and `realm` (Postgres, `LISTEN/NOTIFY` bus). Store and bus interfaces hide the difference.
- **Area-of-interest networking.** Each 50 ms tick, `server/realm.js` sends each player only nearby players (160 m), enemies (110 m) and events (130 m), with far players updated less often.
- **Event-driven sim output.** `WorldSim` reports through `host.emit` and callbacks; the realm and the client turn those into snapshot events (`ev`) and effects.

## Layers

**Server HTTP and dispatch:**
- Purpose: static client, JSON API, health, metrics, WebSocket upgrade
- Location: `server/main.js`, `server/api.js`, `server/accounts.js`, `server/ops.js`
- Contains: request routing (`route === 'METHOD /path'` in `server/api.js`), `ws` server with `perMessageDeflate` off for realms
- Depends on: `Store`, `Accounts`, `Realm` or `Gateway`
- Used by: browsers

**Realm (game server core):**
- Purpose: live world state for players on one layer
- Location: `server/realm.js` (787 lines), `server/simhost.js`, `server/world.js`
- Contains: session handling, auth, tick loop (`TICK_MS = 50`), snapshots, chat, presence, saves
- Depends on: `Store`, `Bus`, `Characters`, `SimHost`, `WorldSim` (from `src/sim/`), `World` (from `src/world/`)
- Used by: `server/main.js` (via `Realm` in role `all` or `realm`)

**Characters and social systems:**
- Purpose: authority over character state and player-to-player systems
- Location: `server/characters.js`, `server/parties.js`, `server/trade.js`, `server/social.js`, `server/raidgroups.js`, `server/admin.js`
- Contains: operation handling, invitations, trade state machine, friend/guild/mail data
- Depends on: `Store`, `Bus`, `CharacterCore` (`src/rpg/CharacterCore.js`)
- Used by: `Realm` message handlers

**Persistence and bus:**
- Purpose: one storage interface, two backends; cross-process messages
- Location: `server/store.js` (schema and queries), `server/db.js` (SQLite `SqliteDb`, Postgres `PgDb`), `server/bus.js` (`LocalBus`, `PgBus`)
- Contains: `get`, `all`, `run`, `exec`, `tx` on the DB; presence, layers and affinity tables
- Depends on: `node:sqlite` or `pg`
- Used by: everything in the server

**Gateway (cluster only):**
- Purpose: pick a layer for each connection and relay its traffic
- Location: `server/gateway.js`
- Contains: layer selection in order: affinity → presence → fullest under soft cap (default 150) → emptiest under hard cap (default 200) → "realm is full"; `MOVING` close code (4010) for reconnects
- Depends on: `Store`, `Accounts`, `ws` client connections to layers
- Used by: `server/main.js` when `ROLE=gateway`

**Shared rules and simulation (`src/`, used on both sides):**
- Purpose: game rules that must match between client and server
- Location: `src/rpg/`, `src/combat/`, `src/items/`, `src/sim/`, `src/world/` (generation), `src/core/` (noise, rng, save helpers)
- Contains: `CharacterCore.js`, `WorldSim.js`, `EnemySim.js`, `Dungeons.js`, `RaidRun.js`, `WorldEvents.js`, `Gen.js`, `Chunks.js`, `Damage.js`, `WeaponGenerator.js`
- Depends on: `three` only where a module draws (most shared modules do not import it)
- Used by: `server/simhost.js`, `server/characters.js`, the client `src/main.js`

**Client presentation and control:**
- Purpose: render the world, collect input, show UI, play audio
- Location: `src/main.js` (2,142 lines, the game object and frame loop), `src/render/`, `src/entities/`, `src/ui/`, `src/anim/`, `src/audio/`, `src/fx/`, `src/models/`, `src/core/Input.js`
- Contains: `Player`, `EnemyLayer`, `NPC`, `World` view, `HUD`, `InventoryUI`, `MapUI`, `PostFX`, `Effects`
- Depends on: shared rules layer, `three`
- Used by: browser entry `index.html`

## Data Flow

### Primary Request Path (online play)

1. Browser loads `index.html`, which imports `src/main.js` as a module (`index.html`)
2. `src/net/Net.js` checks whether the server answers; `GET /api/status` returns `stale` if client files changed since startup (`server/api.js`, `server/build.js`)
3. Player signs in: `POST /api/login` or `/api/register` → bearer token (`server/api.js` → `server/accounts.js`)
4. Client opens `WebSocket /ws` and sends `auth { token, character }` (`server/main.js` upgrade handler → `server/realm.js`)
5. Realm replies `welcome` with seed, character and layer; then sends a `snap` each 50 ms tick (`server/realm.js` `tick()`)
6. Client sends own state (`s`) at ~15 Hz and `hit`/`st` reports; realm validates reach and damage caps and forwards to `server/simhost.js`
7. `WorldSim` (`src/sim/WorldSim.js`) advances enemies for all players; results return as `es`/`ea`/`ed`/`ev` in the next snapshot

### Character Operation Path

1. Client applies an operation locally (`src/rpg/CharacterCore.js`) for immediate feedback
2. Client sends `op { seq, op }` (`src/net/Net.js`)
3. `server/characters.js` checks and applies the same operation on the authoritative `CharacterCore`, rolling any dice on the server
4. Result and fingerprint return to the client; a mismatch triggers `resync`

### Cross-Layer Message Path (cluster)

1. A layer publishes a message addressed to `all` or `layer:<id>` (`server/bus.js`)
2. `PgBus` sends it with `pg_notify('celblade', …)`; every layer receives it, including the sender
3. Each layer keeps only messages addressed to it (world/guild chat, whispers, invitations, admin)

### Cluster Connection Path

1. Ingress sends HTTP and WebSocket traffic to a gateway (`server/gateway.js`)
2. Gateway chooses a layer and opens a `ws` connection to `layer.url` with header `x-internal-key`
3. Layer closes the connection with `MOVING` (4010) when a player must be moved; the gateway routes the reconnect

**State Management:**
- Server: authoritative state in `Characters` (per player) and `SimHost`/`WorldSim` (enemies, camps, dungeons) on each layer; durable state in the store; presence and affinity in Postgres or SQLite tables
- Client: `src/main.js` holds the game object; character state mirrors server operations; saves in `localStorage` through `src/core/Save.js`; preferences through `src/core/Prefs.js`

## Key Abstractions

**Store (`Store` class, `server/store.js`):**
- Purpose: one async data interface for accounts, characters, social data, layers, presence
- Examples: `server/store.js`, `server/db.js`
- Pattern: SQL with `?` placeholders run by `SqliteDb` or `PgDb`; `store.tx(fn)` for transactions; `Store.together` backs out a transaction with `NotHeld`/`Rollback` errors

**CharacterCore (`src/rpg/CharacterCore.js`):**
- Purpose: a character's progression, inventory and every change to it, as operations
- Examples: used by `server/characters.js` (authority) and `src/main.js` (local copy)
- Pattern: operation objects checked then applied; chance outcomes resolved by the authority and applied to both sides with the same roll

**WorldSim (`src/sim/WorldSim.js`):**
- Purpose: the living world — enemies, camps, roaming packs, encounters
- Examples: `src/sim/WorldSim.js`, `src/sim/EnemySim.js`, `src/sim/Encounters` (in `WorldSim.js`)
- Pattern: host object supplies world queries (`groundHeight`, `collidersNear`, `regionAt`, …); output is events via `host.emit`; no rendering

**Bus (`server/bus.js`):**
- Purpose: cross-layer messages
- Examples: `LocalBus` (single process), `PgBus` (cluster)
- Pattern: `Handlers.on(fn)` / `deliver(to, msg)`; message size capped at 7,900 bytes (`MAX_PAYLOAD`)

**Procedural world (`src/world/Gen.js`, `src/world/Chunks.js`, `src/world/World.js`):**
- Purpose: endless, seed-based terrain and points of interest
- Pattern: pure functions of `(seed, position)`; 64 m chunks at three levels of detail; instanced scenery meshes

**Entity views on the client (`src/entities/`):**
- Purpose: per-frame presentation of sim state
- Examples: `src/entities/Enemy.js` (one per enemy in `game.enemies`), `src/entities/EnemyLayer.js`, `src/entities/Player.js`, `src/entities/RemotePlayer.js` (in `src/net/`)
- Pattern: view objects follow sim state from snapshots (online) or from the local `WorldSim` (offline)

## Entry Points

**Browser client:**
- Location: `index.html` → `src/main.js`
- Triggers: page load
- Responsibilities: create the `THREE` scene, `World`, UI and the game object; start the `requestAnimationFrame` loop (`src/main.js`, `requestAnimationFrame(this.frame)`)

**Server (`npm start`):**
- Location: `server/main.js`
- Triggers: `node server/main.js` (`package.json` `start`); Docker `CMD` in `Dockerfile`
- Responsibilities: read env (`ROLE`, `PORT`, `DATA_DIR`, `DATABASE_URL`, …), open the store and bus, start `Realm` or `Gateway`, serve HTTP and `/ws`

**Dev static server:**
- Location: `serve.py`
- Triggers: `python serve.py [port]` (default 5173); `.claude/launch.json` uses it
- Responsibilities: serve the client with `Cache-Control: no-store`; accept `POST /__shot/<name>` screenshots to `SHOT_DIR`

**Test and tool entries:**
- Location: `tools/*.mjs`, `tests/*.test.mjs`
- Triggers: `npm test`, `npm run test:cluster`, `npm run load*`
- Responsibilities: headless checks of the shared rules and the realm

## Architectural Constraints

- **Threading:** Single-threaded event loop per Node process. The realm runs one 50 ms `setInterval` tick (`server/realm.js`, `TICK_MS = 50`). Scale-out is by process (layers), not threads. The browser runs the game on the main thread in a `requestAnimationFrame` loop.
- **Global state:** `server/build.js` computes `BUILD` once at import. `src/main.js` and the client modules hold a single game object. `server/main.js` holds module-level `realm`, `gateway`, `api` and `wss` instances.
- **Circular imports:** Not analyzed in depth; no cycles were checked by tooling in this repository.
- **Shared-code boundary:** Server code must not import rendering modules. `src/render/`, `src/entities/` and `src/ui/` are client-only. `src/dev/` is left out of production serving (`HIDDEN` in `server/main.js`) and out of the image via `.dockerignore`.
- **Client files are fingerprinted:** Changing shared `src/` files while a server runs makes `/api/status` report `stale`; clients stay offline until restart (`server/build.js`).
- **Deploy-time coupling:** Gateways and layers must share `DATABASE_URL` and `INTERNAL_KEY`; layers need `LAYER`/`LAYER_URL`/`POD_IP` or a numbered `HOSTNAME`.

## Anti-Patterns

**Serving the whole folder to the browser:**
- What happens: the static handler serves only the `PUBLIC` list in `server/main.js` (`index.html`, `style.css`, `manifest.webmanifest`, `icon.svg`, `src/`, and `tools/` in dev)
- Why it's wrong: serving server code, the database or secrets would leak them
- Do this instead: add any new public client asset to `PUBLIC` in `server/main.js` and to the `COPY` list in `Dockerfile`

**Rendering code in shared modules:**
- What happens: most of `src/rpg/`, `src/sim/` and `src/world/Gen.js` are imported by the server, so they must stay free of `three` and DOM access
- Why it's wrong: the server would fail to load them (`server/simhost.js` uses the headless `server/world.js`)
- Do this instead: put draw code in `src/render/`, `src/entities/` or `src/ui/`, and have shared modules emit events through `host.emit`

**Stateful module imports for per-player data:**
- What happens: per-player data belongs in `Characters`, `Realm` sessions or the store
- Why it's wrong: module-level singletons are per process, so a player's state would not follow them across layers
- Do this instead: keep per-player state in `server/characters.js` or the store, and move players between layers with the `MOVING` reconnect path

## Error Handling

**Strategy:** Validate and reject on the server; keep the client responsive by applying operations locally and reconciling with the authority.

**Patterns:**
- Server operations are checked before they apply (`src/rpg/CharacterCore.js`, `server/characters.js`); rejected operations return an error and trigger resync on mismatch
- Bus delivery wraps each handler in `try/catch` and logs via `log.error('bus', err)` (`server/bus.js`)
- Realm and gateway log warnings and continue (`log.warn('realm', …)` in `server/realm.js`)
- WebSocket close codes carry intent: 4001 auth timeout, 4003 auth failed, 4004 replaced, 4008 flooding, 4010 moving, 4011 banned, 4012 kicked, 1012 restarting (`server/realm.js` header)
- Config errors throw at startup: invalid `ROLE`, or a cluster role without `DATABASE_URL` (`server/main.js`)

## Cross-Cutting Concerns

**Logging:** `log` in `server/ops.js`; JSON lines with `LOG_FORMAT=json`, otherwise text. Client uses `console`.

**Validation:** Server checks message rate, reach, speed (positions), and a damage cap from carried weapons (`server/realm.js`, `server/simhost.js`); account names and passwords are checked in `server/accounts.js`.

**Authentication:** Bearer session token from `server/accounts.js`, sent on `/api/*` and in the WebSocket `auth` message; `ADMINS` grants admin commands; `INTERNAL_KEY` guards layer connections.

**Metrics:** `metrics` registry in `server/ops.js`; `/metrics` guarded by `METRICS_TOKEN` or a separate `METRICS_PORT`.

**Backups:** SQLite only, scheduled by `startBackups` in `server/ops.js` every `BACKUP_HOURS`.

---

*Architecture analysis: 2026-10-16*
