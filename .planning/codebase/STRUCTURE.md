# Codebase Structure

**Analysis Date:** 2026-10-16

## Directory Layout

```
portfolio-node-mmo/                  # repo root (package name: cel-blade)
├── server/              # Node.js server: HTTP, realm, gateway, store, bus, ops (18 files)
├── src/                 # Browser client and shared rules (ES modules, no build)
│   ├── main.js          # client entry and game loop (2,142 lines)
│   ├── anim/            # procedural animation: IK, cloth, ragdoll, weapon motion
│   ├── audio/           # Web Audio engine and sound effects
│   ├── combat/          # shared combat rules: damage, aim, shapes, abilities, bestiary, bosses
│   ├── core/            # input, save/prefs, device detection, noise, rng (shared)
│   ├── dev/             # developer tools (client only; excluded in production)
│   ├── entities/        # player, enemies, NPCs, pickups, dismemberment
│   ├── fx/              # visual effects and telegraphs
│   ├── items/           # shared item generation: weapons, armour, perks, sets, rarity
│   ├── models/          # procedural 3D models for characters, creatures, props
│   ├── net/             # online client: connection, remote players, enemy replicas
│   ├── render/          # Three.js rendering: camera, post-processing, shadows, grass, toon
│   ├── rpg/             # shared character rules: CharacterCore, quests, stats, talents, story
│   ├── sim/             # shared world simulation: WorldSim, enemies, dungeons, raids, nav
│   ├── ui/              # HUD, menus, inventory, map, chat, party, trade, title screen
│   └── world/           # procedural world: generation, chunks, towns, POIs, scenery
│       ├── build/       # building kits: camps, roofs, styles
│       └── scenery/     # props, scenery models and placement
├── tools/               # headless checks, smoke tests, load tests, dev screenshot tools
│   └── load/            # load-test scripts (npm run load*)
├── tests/               # two Node test files (*.test.mjs)
├── deploy/              # Caddyfile for single-host HTTPS
├── docs/                # design and plan documents
│   └── superpowers/     # dated plans and specs (plans/, specs/)
├── .github/workflows/   # CI: test, build image, update Helm chart
├── .claude/             # editor launch config and worktrees
├── data/                # runtime: SQLite database (ignored by git)
├── .test-data/          # runtime test data (ignored)
├── .load-data/          # runtime load-test data (ignored)
├── .shots/              # screenshots from tools (ignored)
├── index.html           # client shell with import map
├── style.css            # client stylesheet
├── manifest.webmanifest # PWA manifest
├── icon.svg             # app icon
├── serve.py             # dev static server with no-cache headers
├── Dockerfile           # node:22.18.0-alpine image
├── docker-compose.yml   # celblade + Caddy
├── package.json         # scripts and three deps: three, ws, pg
└── README.md            # project overview
```

## Directory Purposes

**`server/`:**
- Purpose: everything that runs only on Node
- Contains: `main.js` (entry), `realm.js` (live world), `gateway.js`, `simhost.js`, `world.js` (headless world), `characters.js`, `parties.js`, `trade.js`, `social.js`, `raidgroups.js`, `admin.js`, `api.js`, `accounts.js`, `store.js`, `db.js`, `bus.js`, `ops.js`, `build.js`
- Key files: `server/main.js` (role selection and HTTP/WS wiring), `server/realm.js` (tick and snapshots), `server/store.js` (schema)
- Rule: server modules are flat in `server/`, one concern per file; no subfolders

**`src/`:**
- Purpose: browser client, plus the rules code the server also imports
- Shared with the server (imported by `server/*.js`, must stay render-free): `src/core/`, `src/combat/`, `src/items/`, `src/rpg/`, `src/sim/`, `src/world/` (generation and terrain) — these are the folders `server/build.js` fingerprints
- Client only: `src/render/`, `src/entities/`, `src/ui/`, `src/anim/`, `src/audio/`, `src/fx/`, `src/models/`, `src/net/`, `src/dev/`
- Entry: `src/main.js`

**`src/world/`:**
- Purpose: terrain and places
- Contains: generators (`Gen.js`, `Chunks.js`, `DungeonGen.js`, `Towns.js`, `Landmarks.js`, `Interior.js`, `streets.js`, `plots.js`, `palette.js`), world streaming (`World.js`, `DungeonView.js`), story and place data (`story.js`, `StorySites.js`, `places.js`, `raids.js`, `dungeons.js`, `mapData.js`), and kits in `build/` and `scenery/`
- Note: `src/world/Gen.js` is the seeded generator used everywhere; new terrain features go through it

**`src/sim/`:**
- Purpose: server and client share the enemy and dungeon logic
- Contains: `WorldSim.js` (main), `EnemySim.js`, `enemyDefs.js`, `affixes.js`, `Nav.js`, `OpenNav.js`, `Routes.js`, `Dungeons.js`, `RaidRun.js`, `BossScript.js`, `WorldEvents.js`

**`src/rpg/`:**
- Purpose: the character and quest rules
- Contains: `CharacterCore.js`, `Stats.js`, `Quests.js`, `questWatch.js`, `sidequests.js`, `storyline.js`, `talents.js`, `achievements.js`, `balance.js`, `codex.js`

**`src/items/`:**
- Purpose: item generation and descriptions
- Contains: `WeaponGenerator.js`, `ArmorGenerator.js`, `WeaponModel.js`, `Inventory.js`, `LootDrop.js`, `weaponTypes.js`, `armorTypes.js`, `perks.js`, `sets.js`, `rarity.js`, `parts.js`, `manufacturers.js`, `names.js`, `describe.js`

**`src/render/`:**
- Purpose: Three.js rendering
- Contains: `Quality.js` (quality tiers), `PostFX.js`, `Toon.js`, `Shadows.js`, `Grass.js`, `Wind.js`, `CameraRig.js`, `ViewModel.js`, `Particles.js`, `Loft.js`, `ModelKit.js`, `Surfaces.js`, `Shell.js`, `Greeble.js`

**`src/ui/`:**
- Purpose: DOM and canvas UI
- Contains: `HUD.js`, `GameMenu.js`, `TitleMenu.js`, `InventoryUI.js`, `MapUI.js`, `Minimap.js`, `ChatUI.js`, `PartyUI.js`, `TradeUI.js`, `SocialUI.js`, `RaidUI.js`, `TalentsUI.js`, `JournalUI.js`, `DialogueUI.js`, `EventUI.js`, `TouchControls.js`, `Thumbnails.js`

**`src/net/`:**
- Purpose: online client
- Contains: `Net.js` (connection and API), `CharacterLink.js` (operations to the server), `Remotes.js` and `RemotePlayer.js` (other players), `EnemyReplica.js` (enemies from snapshots)

**`tools/`:**
- Purpose: checks run by `npm test` and tools for development
- Contains: `*check.mjs` (balance, places, quests, dungeons, camps, raids, events, physics, AI, persistence), `smoke.mjs` (realm smoke test, `cluster` mode), `powercurve.mjs`, `worldstats.mjs`, `bot.mjs`, `loadsim.mjs`, `shotkit.js`, `worldshots.js`, `enemyshots.js`, `armory.html`, `figure.html`
- `tools/load/`: `all.mjs`, `http.mjs`, `players.mjs`, `auth.mjs`, `lib.mjs`
- Served to the browser only when not in production (`server/main.js`, `DEV`)

**`tests/`:**
- Purpose: Node tests for the map and online persistence
- Files: `map-regression.test.mjs`, `map-persistence-online.test.mjs`

**`docs/`:**
- Purpose: design and plan documents
- Key files: `MULTIPLAYER.md` (netcode and phases), `DEPLOY.md` (running a realm), `ROADMAP.md`, `WORK_PLAN.md`, `GAMEPLAY_PLAN.md`, `GRAPHICS_PLAN.md`, `UI_UX_PLAN.md`
- `docs/superpowers/plans/` and `docs/superpowers/specs/`: dated plans and specs (e.g. `2026-10-15-act-iii-b1.md`)

**`deploy/`:**
- Purpose: reverse proxy config for the single-host Docker setup
- Contains: `Caddyfile`

**`.github/workflows/`:**
- Purpose: CI pipeline
- Contains: `deploy.yaml`

**Runtime folders (git-ignored):**
- `data/` - SQLite database and backups (`DATA_DIR` default); contains player accounts, never commit
- `.test-data/`, `.load-data/`, `.shots/`, `.pg-test/` - test, load-test and screenshot output

## Key File Locations

**Entry Points:**
- `index.html`: browser page; import map for `three`
- `src/main.js`: client game entry and loop
- `server/main.js`: server entry (`npm start`)
- `serve.py`: dev static server

**Configuration:**
- `package.json`: scripts, engines, dependencies
- `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`: deployment
- `.github/workflows/deploy.yaml`: CI
- `.gitignore`, `.dockerignore`: what is committed and what goes in the image

**Core Logic:**
- `server/realm.js`: realm tick, snapshots, sessions
- `server/characters.js`: authoritative character operations
- `src/rpg/CharacterCore.js`: character rules
- `src/sim/WorldSim.js`: enemy and camp simulation
- `src/world/Gen.js`: seeded world generation
- `src/world/World.js`: client world streaming

**Testing:**
- `tools/smoke.mjs`: realm smoke test
- `tools/*check.mjs`: rule checks
- `tests/*.test.mjs`: map tests

## Naming Conventions

**Files:**
- Classes and modules that export a class: PascalCase, e.g. `src/rpg/CharacterCore.js`, `src/sim/WorldSim.js`, `src/ui/InventoryUI.js`, `src/render/PostFX.js`
- Data, helpers and lowercase modules: camelCase or lowercase, e.g. `src/combat/abilities.js`, `src/world/mapData.js`, `src/rpg/questWatch.js`, `src/world/plots.js`
- Server modules: lowercase single word, e.g. `server/realm.js`, `server/raidgroups.js`
- Checks and tools: `<name>check.mjs` (e.g. `tools/campcheck.mjs`, `tools/raidcheck.mjs`)
- Tests: `<name>.test.mjs` in `tests/`
- Mixed: the server and client both use lowercase files for most modules; UI and rendering use PascalCase for classes

**Directories:**
- Lowercase, single word: `server`, `combat`, `items`, `rpg`, `sim`, `render`, `world`
- Nested kits under `src/world/`: `build/`, `scenery/`

**Imports:**
- Relative paths with `.js` extension: `import { WorldSim } from '../sim/WorldSim.js';`
- Bare specifiers only for `three` and `three/addons/` (import map in `index.html`), and for Node packages on the server (`ws`, `pg`) and built-ins (`node:http`, `node:crypto`)

## Where to Add New Code

**New game rule (shared by client and server):**
- Primary code: the matching folder in `src/` (`src/rpg/` for character rules, `src/sim/` for world simulation, `src/combat/` for damage and abilities, `src/items/` for item generation)
- Must not import `three` or touch the DOM, because `server/` imports it
- Add a headless check under `tools/` (e.g. `tools/<name>check.mjs`) and register it in `package.json` `test` script

**New character operation (server-authoritative):**
- Rule: `src/rpg/CharacterCore.js`
- Server handling: `server/characters.js`
- Client call: `src/net/CharacterLink.js`

**New enemy or boss:**
- Definition: `src/sim/enemyDefs.js`, `src/combat/bestiary.js`, `src/combat/bosses.js`
- Model: `src/models/Creatures.js` or `src/models/Brood.js` (client only)
- Behaviour: `src/sim/EnemySim.js`; raids in `src/sim/BossScript.js` and `src/sim/RaidRun.js`

**New town, place or story site:**
- Data: `src/world/places.js`, `src/world/story.js`, `src/world/StorySites.js`
- Generation: `src/world/Towns.js`, `src/world/Landmarks.js`, `src/world/Gen.js`
- Build pieces: `src/world/build/` (camps: `campKit.js`; styles: `styles.js`) and `src/world/scenery/`

**New UI panel:**
- Implementation: `src/ui/<Name>UI.js`
- Wire-up: `src/main.js` (the game object creates it), and `style.css` for styles

**New HTTP route:**
- Implementation: `server/api.js` (add a `route === 'METHOD /api/...'` branch)
- Document it in the header comment of `server/api.js`
- Client call: `src/net/Net.js`

**New realm message:**
- Server: handler in `server/realm.js` (or the feature module it delegates to, e.g. `server/parties.js`)
- Client: `src/net/Net.js` (send) and `src/net/Remotes.js` or `src/net/CharacterLink.js` (receive)
- Document it in the protocol comment at the top of `server/realm.js`

**New social or cross-layer feature:**
- Logic: `server/social.js` or a new module in `server/`
- Persistence: a table in `server/store.js` (add to both SQLite and Postgres schema blocks)
- Cross-layer: send on `server/bus.js`, addressed to `all` or `layer:<id>`

**New shared utility:**
- `src/core/` for noise, rng and helpers used by both sides; `src/core/` is fingerprinted by `server/build.js`

**New dev or check tool:**
- `tools/`; keep it out of the production image (`.dockerignore` excludes `tools`)

**New document:**
- `docs/` for design, `docs/superpowers/plans/` or `specs/` for dated work

## Special Directories

**`data/`:**
- Purpose: SQLite database and backups for `npm start`
- Generated: Yes, at runtime (`DATA_DIR`)
- Committed: No (`.gitignore`)

**`.test-data/`, `.load-data/`, `.pg-test/`:**
- Purpose: test and load-test output
- Generated: Yes
- Committed: No

**`.shots/`:**
- Purpose: screenshots from `serve.py` (`SHOT_DIR`) and `tools/shotkit.js`
- Generated: Yes
- Committed: No

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (`npm ci`)
- Committed: No

**`.claude/worktrees/`:**
- Purpose: git worktrees for parallel work
- Generated: Yes
- Committed: No (not in tracked files)

**`.planning/`:**
- Purpose: planning output (this codebase map lives in `.planning/codebase/`)
- Generated: Yes
- Committed: Per repository workflow

---

*Structure analysis: 2026-10-16*
