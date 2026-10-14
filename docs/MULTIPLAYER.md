# Cel Blade Online — multiplayer

Cel Blade is an MMORPG. One persistent world, generated from a single server-owned seed, is shared
by everyone online and played cooperatively against the world. PvP is out of scope for now;
parties are how players play together. A dedicated Node server hosts both the game client (static
files) and the live world (WebSockets). Running one is covered in [DEPLOY.md](DEPLOY.md).

## Principles

- **The server is the authority** for everything that matters to other players or to progression:
  - enemies, damage and loot
  - XP, gold, inventory and quests
  - trades and mail

  Clients predict and render, but they never decide outcomes.
- **Share recipes, not objects.** The world is regenerated from its seed on every machine, and items
  travel as their generator recipes (a few bytes), so the network carries only state that changes.
- **Instanced loot.** Every kill rolls loot separately for each player who earned it, and only they
  see it. Items change hands only through the trade window or mail.
- **The world doesn't pause.** The game menu (`ui/GameMenu.js`) is an overlay: the world keeps
  running and the character stands idle. Only offline single-player freezes, and only while the
  window is in the background.
- **Characters live on the server.** Accounts own characters, and a character's level, gear, quests
  and discovery are stored server-side. Device settings (`core/Prefs.js`) stay local.
- **One simulation, two hosts.** The world simulation (`src/sim/`) and a character's rules
  (`rpg/CharacterCore.js`) are headless modules. The server runs them for everyone, and offline
  single-player runs the very same code locally, so the two can't drift apart.

## Architecture

One process (`npm start`, ROLE=all):

```
browser ──HTTP──▶ server/main.js ── static client files (index.html, style.css, src/)
        ──HTTP──▶                ── /api/*: accounts, sessions, characters (api.js, accounts.js)
        ──HTTP──▶                ── /healthz, /metrics (ops.js)
        ══ WS ══▶                ── /ws: the realm (realm.js)
                                      ├─ simhost.js + world.js: WorldSim on a headless World
                                      ├─ characters.js: CharacterCore per player, ops
                                      ├─ parties.js · trade.js · social.js · admin.js
                                      ├─ bus.js: messages between layers (here, to itself)
                                      └─ store.js + db.js: SQLite (node:sqlite)
```

The cluster (ROLE=gateway and ROLE=realm, [DEPLOY.md](DEPLOY.md#on-kubernetes-the-portfolio-cluster)):

```
browser ══▶ ingress ══▶ gateways (gateway.js): client files, /api, /ws relayed to a layer
                              ║ picks a layer: affinity → presence → fullest with room
                              ▼
                        realm layers (realm.js), each a whole copy of the world
                              │ bus: LISTEN/NOTIFY        │ presence, affinity, characters…
                              └────────── Postgres ───────┘
```

- **Transport:** JSON over WebSockets, compressed per connection (permessage-deflate).
- **Tick:** the realm ticks at 20 Hz and clients send their own state at 15 Hz. Each tick, every
  player gets a snapshot of what's in their area of interest:
  - other players within 160 m, found through a spatial grid
  - enemies within 110 m, sent only when they've changed (and once a second regardless)
  - events within 130 m: shots, blasts, deaths, heals and so on

  Players further than 50 m are updated every other tick, and past 100 m every third.
- **Interpolation:** clients draw other players ~120 ms and enemies ~100 ms in the past. They
  interpolate between the snapshots around that time, on a clock synced to the server by ping/pong.
  Events play when the drawn time reaches them.
- **Combat netcode (action combat):** enemy health, AI, deaths and loot belong to the server.
  - **Your hits on enemies** are detected on your screen against the enemies as you see them
    ("favour the shooter"). They're reported and validated by the server: reach, message rate, and
    a damage cap from the weapons you carry.
  - **Enemy attacks on you** are detected on your screen too ("favour the defender"): if you saw the
    dodge, you dodged.

## Layers

A realm runs as **layers**: each layer is a whole copy of the world in its own process, holding
about 110 players. Gateways put players on them.

- **Choosing a layer.** A player goes to their party's layer, or to the one a move sends them
  to. Failing that, a reconnecting player goes back to the layer that still has them. Otherwise
  it's the fullest layer under the soft cap, so layers feel lived-in rather than everyone being
  spread thin. Parties and moves may use the room up to the hard cap.
- **Across layers:** world chat, whispers, `/who`, friends coming and going, guild chat and
  changes, guild and party invitations, mail notices and every admin command. They travel on the
  bus (Postgres LISTEN/NOTIFY); who is where comes from the store's presence table.
- **Within a layer:** seeing each other, fighting together, trading, `/s` nearby chat and party
  play.
- **Moving between layers.** Accepting a party invitation from another layer, an admin's
  `tp`/`summon`, or a layer closing all close the player's connection with *moving*. Their screen
  reconnects at once, the gateway puts them on the new layer (the store's affinity), and the
  arrival does what the move was for: join the party, stand by the admin.
- **One copy of a character.** A layer holds each of its characters in the presence table, saves
  them before letting go, and refreshes its hold. A layer that crashes loses its hold within 45 s,
  or straight away once it's gone from the layer list. So a character can't be loaded in two
  places, or loaded before it's saved.
- **Rolling restarts.** A closing layer marks itself as draining (gateways stop sending players
  there), sends each party whole to another layer, saves everyone and lets them go. The party is
  put back together where it lands.

## Status against the plan

✅ built · 🟡 partly, or built differently · ❌ not built · ➖ dropped

| Phase | Planned | Status |
|---|---|---|
| 1 | Server hosting client + API + WebSocket, SQLite, `npm start` | ✅ |
| 1 | Accounts, characters, look picker, server seed, server saves | ✅ |
| 1 | Other players animated in their gear, nameplates, their effects | ✅ |
| 1 | Chat (world, nearby, whisper, `/who`); offline single-player kept | ✅ |
| 2 | Headless `EnemySim` / `WorldSim`, shared by server and offline | ✅ |
| 2 | Server-run world at 20 Hz with area of interest | ✅ |
| 2 | Hits judged on screen, validated by server; statuses on server | ✅ |
| 2 | Shared kill credit, instanced loot, health scaling with players | ✅ |
| 3 | Inventory, gold, XP, attributes, trader, quests, chests on the server | ✅ predicted and rolled ops, hash checks |
| 3 | Movement validation with corrections; travel done by the server | ✅ one speed bank rather than a per-move envelope |
| 3 | Rate limits and sanity checks on every message | ✅ |
| 4 | Parties | ✅ except below |
| 4 | Party invite from a player's nameplate menu | ❌ Social tab and `/invite` instead |
| 4 | Leader disbands the party | ❌ a party of one disbands by itself |
| 4 | Fast travel to the waystone nearest a party member | ❌ |
| 4 | Friends, guilds with chat, trade window with confirmation, mail | ✅ |
| 4 | Mute, report, ignore; admin kick, ban, teleport, inspect | ✅ admin tools are chat commands, not a separate console |
| 5 | Spatial-grid area of interest | ✅ |
| 5 | Binary delta snapshots | 🟡 deltas and distance tiers, but JSON with compression rather than binary |
| 5 | Per-region simulation in worker threads | 🟡 scaled out with layers (processes) instead; regions within a layer are still a [next step](DEPLOY.md#further-not-built) |
| 5 | Database hot standby, or Postgres | ✅ Postgres for the cluster (SQLite stays for one process), nightly dumps; no standby |
| 5 | Container image; TLS through a reverse proxy | ✅ Dockerfile, Compose with Caddy, and Kubernetes manifests with CI for the portfolio cluster (the image hasn't been built here: no Docker) |
| 5 | Health checks, metrics, structured logs | ✅ |
| 5 | Crash reporting | 🟡 caught and logged, not sent to an external service |
| — | PvP areas | ➖ left out for now |

Built beyond the plan:
- the full-screen game menu
- load-test bots
- the tick and bandwidth optimisations
- backpressure for slow connections
- backups and graceful shutdown

## Phases

### Phase 1 — Online foundation (built)
- Node server serving the client plus the API and WebSocket; SQLite storage; `npm start`.
- Accounts (scrypt-hashed passwords, hashed session tokens) with up to six characters each. A look
  picker (skin, hair, style, outfit) keeps players distinguishable.
- Other players visible and fully animated with their real gear, with nameplates showing name, level,
  guild tag and health. Their shots, spells and runes appear as effects.
- Chat: world, nearby, whispers, party, guild and system.
- Offline single-player still works when the game is served without the server.

### Phase 2 — Shared, authoritative world (built)
- `src/sim/` holds a headless `EnemySim` and a `WorldSim`. They have no models and no effects; they
  emit events.
  - `EnemySim`: AI, movement, attacks, statuses and damage.
  - `WorldSim`: camps, roaming packs, respawns, threat and attack tokens per player, and kill credit.
- The client's `Enemy` view draws and animates an enemy from sim state (offline: the local sim;
  online: interpolated snapshots). It turns events into effects and sound.
- The server keeps a headless `World` (terrain heights and colliders) loaded around every player,
  runs `WorldSim` and streams the result. What comes into range is built a few milliseconds a
  tick. A player who has just arrived waits out of the simulation (nothing spawns round them, no
  camp wakes for them) while their surroundings are built, theirs first and with whatever the tick
  has spare; that's usually well under a second. Brightwater's surroundings are built before a
  layer opens and stay built.
- Status effects (burn, chill, corrosion, shock chains) run on the server. Enemy projectiles and
  blasts are replayed on every screen and only hurt the player whose screen they hit.
- Rewards: every player who damaged an enemy, or was close by, gets the kill's XP and gold. The
  server rolls a separate loot drop for each of them that only they see. Enemy health scales with
  the number of players engaged.
- Hordes (gameplay phase 1, [GAMEPLAY_PLAN.md](GAMEPLAY_PLAN.md)): bigger camps, warbands and
  stronghold reinforcement waves all run in `WorldSim`; elite affixes in `EnemySim`.
  - An enemy's add carries `ch` (a champion), `af` (its affixes) and `hd` (one of a warband); a
    split half is sent with `su: -1`. A Shielded elite's state carries its shield as an 18th field,
    and the flags gain `rallied` (a Commander near it). Events gain `shield`, `horde`, `hordeDown`,
    `alarm` and `wave`.
  - What the Threat setting does is applied on the player's own screen, where their hits and the
    hits on them are decided: enemies' damage to them is multiplied, and their damage to enemies
    divided. The server uses it only for their rewards.
  - Abilities (gameplay phase 2): `ab { id, p? | o, d }` from the player — the server checks the
    ability is unlocked, slotted and off its cooldown, then passes it on as an `fx` (`k: 'ab'`, with
    the user's upgrade as the server knows it) to everyone who can see the user, and puts a
    holo-decoy into the sim, where enemies near it go for it. Ability damage is reported like any
    hit; the damage cap allows for the hardest ability. A party member's Rally Cry and Restoration
    Pulse heal on your own screen (health is each screen's), and their Arc Barrier stops enemy shots
    there too.
  - Titles: the profile and world and nearby chat carry `ti`, the title the server's copy wears.
  - Idle enemies whose camp is more than 40 m from everyone think three times a second rather than
    every tick. `node tools/loadsim.mjs 150` runs the server's simulation headless with 150
    stand-in players fighting at camps: about 640 enemies (430 fighting) cost ~8.6 ms a tick, within
    a quarter of a core.

### Phase 3 — Authoritative character (built)
- `rpg/CharacterCore.js` holds the rules for a character's progress, and the server holds the copy
  that counts. Everything that changes a character is an **op**, of three kinds:
  - **Predicted:** move, select, equip, unequip, scrap, sell, buy, learn, respec, slot, filter,
    threat, title, feat, accept, use, choose, attune and respawn. These apply at once on screen and are confirmed
    by the server (Threat is refused in the middle of a fight; a respec at level 10 or more costs
    gold and needs a smith at a workshop near; a buy needs a trader near whose stock covers the item
    — the fine stock only a gunsmith's or armourer's; feats are bounded).
  - **Rolled:** pick, drop, chest, turnin, talk, rest and travel. These need dice, so they wait for
    the server's roll.
- The folk who matter to these (gameplay phase 3: traders, innkeepers, smiths, Wardens, hamlet
  folk, quest boards) are placed by the world generator, so the server finds any of them by id
  (`World.npcById`, only in the regions round the player) and checks the player stands with them:
  `talk` (a board answers with its three postings), `accept` and `turnin` with the quest's giver,
  `rest` at Brightwater's reactor or with an innkeeper (`at`, which also makes that inn the
  character's home: respawns land there), `respec` with a smith, `buy` with a fitting trader.
  Talking to someone far away is refused before anything is generated. The story (gameplay phase
  4) adds `use` (a quest's object — a console, a beacon, a strongbox, the vault door — within 6 m,
  only while a quest wants it) and `choose` (an answer, with the person asking); `talk` also says
  their lines for the quest's step. Story folk and objects are the world generator's too, and a
  quest's references ("city1:warden", "beacon2:fire", "home:camp") resolve the same on both sides
  (`world/story.js storyRef`).
  - **From the server:** kill rewards, bonuses (a warband broken, a stronghold stormed), visits
    (somewhere new: the server checks every player's position every two seconds — biome, region,
    landmark, and hamlet, village, town or city), camp completions, trader stock (with the fine
    stock), trades and mail. Rewards are rolled for
    each character's own level and Threat. Quests (gameplay phase 4): every second the server
    looks at each player's quests (`rpg/questWatch.js`) — a place a step sends them to, reached
    (`reach`); a place to hold, where the world's simulation starts the waves
    (`WorldSim Encounters.defend`: the local faction, wave after wave, given up if everyone leaves)
    and, once the last is down, `defended`. Quest drops (a raider's orders, a lost patrol's tags)
    are rolled into the kill's reward.
- Achievements (gameplay phase 2) are counted from each character's records, which only these
  operations change, so both copies reach them together; the server's copy is the one saved.
- Each confirmation carries a hash of the server's copy (quest steps and story flags included), and
  the server sends one every 10 seconds. If the client's copy disagrees, it reloads the server's.
- Dungeons (gameplay phase 5): each layer has an instance manager (`sim/Dungeons.js`), which
  offline single-player runs locally too. An open-world dungeon has one shared copy per layer; a
  private run belongs to a party (or one player): its members who go down the same dungeon at the
  same tier join it, and a different one is refused while any of them is inside. Each copy is built
  in a pocket slot of its own far out east (`world/dungeons.js`), so interest management keeps
  copies apart with no extra rules; the server's world gets its walls and doors (boxes) and the
  world sim its rooms (as camps, `world.campsNear`), and nothing of the land is loaded, spawned or
  visited out there. An empty copy closes after ten minutes.
  - **Rolled ops:** `enter { d, mode: 'open' | 'run', tier, via: 'entrance' | 'gate' }` (the
    manager checks the way in is within 9 m — the dungeon's own, or a Wardens' waygate — and any
    story flag it needs, then rolls the copy, where you arrive and where you came from), `leave` (at
    the entrance portal, or the one past the boss once it's down), `dloot` (a treasure chest, once
    per character per copy) and `dchest` (the reward chest past a private run's boss: once a day per
    dungeon per tier, `settings.lockouts`). A refused `enter` comes back with the reason (`err`).
  - **Server-sent:** `dclear` when the final boss falls, to everyone in that copy (their records).
  - **`dun` messages:** the copy's state (`open` doors, the `key`, power `nodes`, `mini` and `boss`
    down, rooms `cleared`) to everyone in it whenever it changes, with a line to show; and from a
    player, `dun { id }` — something used: the key, a power node, the locked door (checked against
    where the server has them).
  - Inside a private run its tier is the Threat that counts (`CharacterCore.tier`), for damage on
    each screen and for the server's reward rolls. Traps are each screen's own danger, like an
    enemy's shots; the lift runs on each screen (enemies don't ride it).
  - Entering and leaving move the character a long way: they open the same window travel does.
    Someone who drops out down there comes back where they went in (`run.back` in the save).
- Raids (gameplay phase 7) are copies to the same instance manager (`world/raids.js`), private only.
  - **Who shares a copy:** a raid copy belongs to a [raid group](#raid-groups), or to the party
    or player if they're not in one. It holds 12 at most, and is entered at a city's raid gate
    (`via: 'gate'`), from level 14.
  - **Encounters** (`sim/RaidRun.js`): each arena is idle until its boss is pulled. Its gate then
    shuts, and the boss's script (`sim/BossScript.js`) runs the fight. Everyone down or out of
    the arena for 3 s is a wipe: the boss resets and the gate opens. Its bosses down beat the
    encounter.
  - **Server-sent:** `rclear { raid, enc, name, tier, final, flawless }` to everyone in the copy for
    each encounter beaten (their records and achievements).
  - **Chests:** each arena's is a `dchest`, once a week per encounter per tier (`settings.lockouts`,
    keyed `raid:tier:encounter`, the week starting 00:00 UTC Monday).
  - **`dun` messages:** they also carry `raid`, each encounter's state (`idle` / `fight` / `down`)
    and, during a fight, each boss's script, phase, seconds to enrage and whether it's immune.
    They go out on every change and every 5 s while a fight lasts. `big: 1` marks a line to
    show as a banner.
  - **Boss events** (in the snapshot's `ev`, like enemy shots):
    - `rt` marks a shape on the floor (`combat/shapes.js`: circle, ring, cone, line, cross), with
      its warning time, element, how many it needs (a soak) and the player it follows. `mk` ties
      it to its landing.
    - `rb` is the landing: damage and knockback. Each screen hurts its own player if they're in
      it, as with enemy shots; the server worked out a soak's split from where players stood.
      `fail: 1` is a failed soak's raid-wide blast.
    - `hz` / `hzx`: a pool or seam that burns while it lasts, again judged on each screen.
    - `rph` (a phase), `renr` (enraged), `rimm` (a hit on an immune boss).
  - **Health:** a raid boss's health is set for the players in the fight when it's pulled, and the
    crowd round it adds nothing. While its adds shield it the boss ignores hits, and its state
    carries an `immune` flag (`FLAG.immune`).
- Both sides must run the same rules: `/api/status` names the server's build (a hash of the shared
  code it loaded — `src/world`, `rpg`, `items`, `combat`, `sim`, `core`) and whether the files have
  changed since it started (`stale`). A client won't go online against a stale or unnamed build;
  the title says the server needs a restart and offers single-player meanwhile.
- Offline, the same ops run locally: roll, apply, save.
- Quests are offered and generated on the server. Characters are saved every 30 seconds and when
  they leave. The client saves only its discovery, map markers, tracked quest and position.
- Movement validation: a movement bank allows 50 m/s over 2 seconds, which covers bullet-jump
  chains and bunched-up packets. Waystone travel and respawns are allowed to jump. Anything else
  gets a position correction.
- Rate limits on every message type (token buckets). Messages over their rate, implausible hits
  and refused moves add strikes, and too many close the connection.

### Phase 4 — Parties and social (built)
- **Parties**: see below.
- **Trade**: `/trade Name` or the Social tab, within 20 m of each other. Both sides offer backpack
  items and gold, lock their offer, then confirm. The server swaps everything in one step, or
  nothing at all.
- **Friends**: `/friend Name`, with online and offline notices. **Ignore**: `/ignore Name` hides
  their chat and whispers, and turns away their invitations and mail.
- **Guilds**: `/guild create Name TAG` founds one. Then:
  - Officers and the leader use `invite`, `kick`, `promote`, `demote` and `motd`; only the leader can `disband`.
  - Members use `accept` and `leave`.
  - Ranks are member, officer and leader. The tag shows on nameplates. `/g` is guild chat.
  - The menu has a Guild tab.
- **Mail** (Mail tab): send a note to any character, online or not, with gold and an item attached.
  The recipient claims the attachments.
- **Moderation**: `/report Name reason`. Admins get kick, ban, mute, announce, teleport, inspect and
  report review under `/admin` (see [DEPLOY.md](DEPLOY.md#admins)). Mutes and bans apply to the
  whole account.

### Phase 5 — Scale and operations (built)
- **Bandwidth:**
  - spatial-grid interest management
  - delta enemy states
  - player update rates tiered by distance
  - compression, about 4–5×
  - backpressure: a connection with 1 MB queued skips snapshots, and at 8 MB it's dropped
- **CPU:**
  - each state is encoded once per tick, however many players it goes to
  - terrain heights are cached on the server (they're the generator's own numbers, so they match
    the clients')
  - enemies separate with a sweep instead of checking every pair
- **Operations:**
  - `/healthz` and Prometheus `/metrics` (tick time, players, enemies, bandwidth, memory)
  - JSON logs; an exception in a handler is logged without taking the realm down
  - scheduled database backups
  - a graceful shutdown that saves everyone
  - a Docker image and a Compose file with Caddy for TLS
- **Load testing:** `tools/bot.mjs` with a count and a spread. 80 players and ~850 enemies run at a
  13 ms median tick (budget 50 ms) in one process; 300 players ran on three layers through one
  gateway. Numbers and sizing are in [DEPLOY.md](DEPLOY.md#capacity).
- **Scaling out:** [layers](#layers) behind gateways on Postgres, with Kubernetes manifests and a CI
  pipeline for the portfolio cluster, and smoke tests of both shapes (`npm test`,
  `npm run test:cluster`).
- **Not built yet:** binary snapshots, PgBouncer, and regions within a layer
  ([DEPLOY.md](DEPLOY.md#further-not-built)).

## Party system

Up to four players play as a party.

- **Forming:** invite from the Social tab or with `/invite Name`. The invitee gets a prompt (Y / N,
  or `/accept` and `/decline`). The leader can `/kick` and `/promote`; anyone can `/leave`.
- **Seeing each other:** party frames on the HUD (name, level, health, distance, offline). Party
  members show in their own colour on nameplates, the compass, the minimap and the world map, at
  any distance: the server sends party positions outside the area of interest twice a second.
- **Fighting together:** a kill credits everyone who damaged the enemy or was within 60 m of it,
  plus their party members within 100 m. Everyone gets the full XP and gold and their own loot roll;
  loot stays instanced, so there's no need/greed. Camp objectives on quests advance for members nearby.
- **Chat:** `/p` party chat, in its own colour.
- **Disconnects:** a member who drops keeps their place for five minutes and shows as offline.

## Raid groups

Parties linked to run a raid together (gameplay phase 7, `server/raidgroups.js`): up to four
parties (a lone player counts as a party of one), twelve players.

- **Forming:**
  - A party's leader (or a player on their own) forms one with `/raid form` or at a city's war
    table.
  - The raid leader invites another party with `/raid invite Name`, naming any of its members. The
    invitation goes to that party's leader, who answers with Y / N, `/raid accept` or
    `/raid decline`.
  - `/raid leave` takes your party out (its leader only). The raid leader can `/raid kick Name`
    (that player's party), `/raid promote Name` (another party's leader) and `/raid disband`.
- **Membership follows the parties:** someone who leaves their party leaves the raid with it, and
  a party that disbands is gone from it. A lone member who drops keeps their place for five
  minutes.
- **Seeing each other:** `raid` sends the roster whenever it changes. `rp` sends everyone's
  position and health once a second, for the raid frames (the members outside your own party).
- **Chat:** `/ra`, in its own colour.
- **One layer:** a raid group lives on one layer, as its parties do. Invitations only reach
  players on it.
- **Protocol:**
  - client → server: `raid { act: form|invite|accept|decline|leave|kick|promote|disband, name }`
  - server → client: `raid { raid: { id, leader, units: [{ key, leader, members }] } | null }`,
    `rinvite { from, size }` and `rp [[charId, x, z, hp, alive]]`

## Known limits

- Enemy attacks on a player are judged by that player's own client. A modified client could
  ignore damage. Server-side checks on health would close that gap.
- Loot on the ground and camp respawn timers live in server memory. They start fresh after a
  restart. Ground loot expires after a few minutes anyway.
- The dev tools act on your own screen only when online (god mode, noclip, spawning, forging). The
  server corrects movement and reloads the character when the copies disagree.
- Players on different layers don't see each other. Parties come together on one layer; friends
  who aren't in a party may land on different ones.
- A layer that crashes (rather than closing) loses its parties and up to 30 seconds of its
  players' progress (characters are saved every 30 seconds and on leaving). Its players reconnect
  to another layer by themselves.
- Each layer simulates its whole world on one core, so a layer holds ~110 players. See
  [DEPLOY.md](DEPLOY.md#capacity).

## Running it

```
npm install
npm start            # http://localhost:8080 — serves the game and the realm
```

For settings, admins, backups, monitoring and a public deployment, see [DEPLOY.md](DEPLOY.md).
