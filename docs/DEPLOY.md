# Running a Cel Blade realm

A realm comes in two shapes, from the same code (`ROLE`):

- **One process** (`npm start`, or the Docker image as it is): the game client, the account API
  and the live world in one Node process, on one SQLite file. Simple to run anywhere Node runs,
  and comfortable up to about 110 players.
- **The cluster**: **gateways** (the client, the API and players' connections) in front of
  **realm layers** (each one a copy of the world, ~110 players), sharing **Postgres**. More players
  means more layers; this is how it reaches thousands. Players on one layer don't see those on
  another, but chat, whispers, friends, guilds, mail and admin reach across them, and parties are
  brought together on one layer. See [MULTIPLAYER.md](MULTIPLAYER.md#layers).

## Locally

Needs Node 22.13 or newer (for the built-in `node:sqlite`).

```
npm install
npm start                      # http://localhost:8080
ADMINS=youraccount npm start   # the same, with your account as an admin
npm run dev                    # restarts when server/ changes
npm test                       # smoke test: sign up, join, chat
```

Open the address, register an account on the title screen and make a character. Anyone on your
network can join at `http://<your-ip>:8080` — phones too (they get touch controls).

To try the cluster on one machine, start a Postgres and run a gateway and two layers against it
(each in its own terminal):

```
export DATABASE_URL=postgres://celblade:secret@127.0.0.1:5432/celblade INTERNAL_KEY=local-key
ROLE=realm LAYER=0 PORT=8081 LAYER_URL=ws://127.0.0.1:8081/ws npm start
ROLE=realm LAYER=1 PORT=8082 LAYER_URL=ws://127.0.0.1:8082/ws npm start
ROLE=gateway PORT=8080 LAYER_SOFT_CAP=1 npm start   # a soft cap of 1 spreads players out
npm run test:cluster                                # two players on two layers, chatting
```

## On Kubernetes (the portfolio cluster)

`deploy/k8s/templates/cel-blade/` holds the manifests, written for the portfolio cluster: plain
templates for `portfolio-helm-website/templates/cel-blade/` (Argo CD syncs them into the `website`
namespace), Traefik, `local-path` storage and Cilium.

| File | |
|---|---|
| `application.portfolio-cel-blade.yaml` | The gateway Deployment and the realm StatefulSet (one pod per layer). CI sets the image on both. |
| `service.portfolio-cel-blade.yaml` | The gateway service (for the ingress), the layers' headless service, Postgres. |
| `ingress.portfolio-cel-blade.yaml` | `celblade.aidenharwood.uk` → gateways (WebSockets included). |
| `postgres.portfolio-cel-blade.yaml` | Postgres 17, one pod on a local-path volume. |
| `pvc.portfolio-cel-blade.yaml` | The database's volume and the backups' (kept when the app is pruned). |
| `cronjob.portfolio-cel-blade.yaml` | A nightly `pg_dump`, keeping the newest 14. |
| `networkpolicy.portfolio-cel-blade.yaml` | Only Cel Blade's pods reach its database; only gateways reach the layers. |
| `hpa.portfolio-cel-blade.yaml` | One to four gateways, by CPU. |

`.github/workflows/deploy.yaml` follows the other portfolio apps:
1. **Test:** syntax check, then the smoke test on SQLite and as a cluster against a Postgres
   service container.
2. **Build:** build and push `ghcr.io/aidenharwood/portfolio/cel-blade:<run>`.
3. **Release:** write that image into `portfolio-helm-website`, which Argo CD rolls out.

Setting it up, once:

1. **The secret** (never in git):

   ```
   kubectl -n website create secret generic portfolio-cel-blade \
     --from-literal=postgres-password=$(openssl rand -hex 24) \
     --from-literal=internal-key=$(openssl rand -hex 24)
   ```

   Keep the password hex (or otherwise URL-safe): it goes into `DATABASE_URL`.
2. **The repository**: push this project to GitHub (say `aidenharwood/portfolio-node-cel-blade`).
   Give it the same secrets as the other app repos: `GHCR_USERNAME`, `GHCR_PAT` and `GH_PAT`.
3. **The chart**: copy `deploy/k8s/templates/cel-blade/` into `portfolio-helm-website/templates/`.
   - Set `ADMINS` on the realm StatefulSet to your account name.
   - Push. Argo CD creates Postgres, the services and the ingress straight away. The gateway and
     realm pods wait for the first image.
4. **The first build**: push to `master` (or run the workflow by hand). CI builds the image and bumps
   it in the chart, and Argo CD rolls it out.
5. **DNS**: point `celblade.aidenharwood.uk` at the cluster like the other subdomains.
   WebSockets need nothing special (the realm pings every 20 s, well inside Cloudflare's and
   Traefik's idle timeouts).

**Scaling.** Each realm layer holds about 110 players comfortably. The gateways fill a layer to
`LAYER_SOFT_CAP` (110) before starting on the next, and parties and moves may use the room up to
`LAYER_HARD_CAP` (150). For more players, raise the realm StatefulSet's `replicas` in the chart.
(`kubectl -n website scale statefulset portfolio-cel-blade-realm --replicas=4` works for a quick
try; Argo CD puts it back to what git says.) Gateways scale themselves, one to four.

**Rolling updates** don't throw anyone out:
- A closing layer marks itself as draining, sends every party whole to another layer, saves
  everyone and lets them go. Their screens reconnect at once and land on a running layer. Later
  they come back as the layers return.
- A closing gateway does the same with its connections, and they come back through another
  gateway.
- Players see a moment of "Entering the world…".

**Metrics.** Gateways and layers serve Prometheus metrics on port 9090 (named `metrics`), which
the ingress never routes to. To have Alloy scrape them, add this to `values.alloy.yaml` in
`portfolio-helm-lgtm` (it uses the `discovery.kubernetes "pods"` already there):

```alloy
discovery.relabel "cel_blade" {
  targets = discovery.kubernetes.pods.targets
  rule {
    source_labels = ["__meta_kubernetes_pod_label_app_kubernetes_io_part_of", "__meta_kubernetes_pod_container_port_name"]
    regex         = "cel-blade;metrics"
    action        = "keep"
  }
  rule {
    source_labels = ["__meta_kubernetes_pod_name"]
    target_label  = "pod"
  }
}

prometheus.scrape "cel_blade" {
  targets    = discovery.relabel.cel_blade.output
  forward_to = [ prometheus.remote_write.default.receiver ]
}
```

Logs are JSON lines on stdout.

## On a server, with Docker (one process)

`docker-compose.yml` runs the realm behind [Caddy](https://caddyserver.com), which gets and renews
a TLS certificate by itself (browsers need HTTPS for a public game: secure WebSockets, pointer lock,
fullscreen).

1. Point a domain's DNS at the machine. Ports 80 and 443 must be reachable.
2. On the machine, in a copy of this repository:

   ```
   DOMAIN=play.example.com ADMINS=youraccount docker compose up -d
   ```

3. Open `https://play.example.com`, register, play.

The realm's data lives in the `celblade-data` volume (`/data` in the container). Logs come out of
`docker compose logs celblade` as JSON lines. To update, pull the new code and run
`docker compose up -d --build`. Players are saved on shutdown, and their screens reconnect by
themselves when the server is back.

The image alone, without Caddy:

```
docker build -t celblade .
docker run -d -p 8080:8080 -v celblade-data:/data -e ADMINS=youraccount celblade
```

## On a server, without Docker

Run `npm ci --omit=dev` and then `NODE_ENV=production TRUST_PROXY=1 node server/main.js` under
whatever keeps services running (systemd, pm2). Put a TLS proxy in front that passes WebSocket
upgrades through. `deploy/Caddyfile` does this for Caddy. For nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
location = /metrics { return 404; }
```

## Settings

All settings are environment variables.

| Variable | Default | |
|---|---|---|
| `ROLE` | `all` | `all` (one process), `gateway` or `realm` (a layer). The last two need `DATABASE_URL`. |
| `PORT` | `8080` | HTTP and WebSocket port. |
| `HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` when only a local proxy should reach it). |
| `DATA_DIR` | `./data` | Where the SQLite database (`celblade.db`) and its backups live (one process). |
| `DATABASE_URL` | — | A Postgres connection string. The cluster roles share it, as their database and their message bus. A single process can use it too, instead of SQLite. |
| `DB_POOL` | `10` | Postgres connections each process keeps. |
| `NODE_ENV` | — | `production` turns off the dev endpoints (`/tools/`, screenshot upload, `/__shutdown`) and lets browsers cache the client (revalidated on each load). |
| `TRUST_PROXY` | — | Set it **only** behind a reverse proxy (or on a layer, behind gateways). The client's address (for rate limits and logs) is then taken from `X-Forwarded-For`. |
| `INTERNAL_KEY` | — | Shared by gateways and layers: a layer refuses connections that don't carry it. |
| `LAYER` | the pod name's number | A layer's number (`…-realm-2` is layer 2; players see it counting from 1). |
| `LAYER_URL` | `ws://$POD_IP:$PORT/ws` | Where gateways reach a layer. |
| `LAYER_SOFT_CAP` · `LAYER_HARD_CAP` | `150` · `200` | Gateways fill a layer to the soft cap before using the next; parties and moves may take it to the hard cap. (The manifests use 110 · 150.) |
| `ADMINS` | — | Comma-separated account names given the admin role at startup (on the layers, in the cluster). |
| `LOG_FORMAT` | text | `json` for one JSON object per line (for log collectors). |
| `METRICS_PORT` | — | Serve `/metrics` on this port only, rather than beside the game. |
| `METRICS_TOKEN` | — | If set, `/metrics` needs `Authorization: Bearer <token>`. |
| `BACKUP_HOURS` | `6` | How often to snapshot the SQLite database; `0` turns backups off. |
| `BACKUP_KEEP` | `8` | How many snapshots to keep. |
| `AUTH_LIMIT` | `10` | Sign-ins and sign-ups allowed per address per minute. Raise it only for local load tests. |
| `WORLD_SEED` | random | The world's seed, used only when a new database is created. After that the seed belongs to the realm. |

## Admins

Accounts named in `ADMINS` get the admin role each time the server starts. Admin commands go in
chat, and reach players on any layer:

| Command | |
|---|---|
| `/admin kick Name [reason]` | Disconnects them. |
| `/admin ban Name hours [reason]` | Bans the whole account and ends its sessions. `/admin unban Name` lifts it. |
| `/admin mute Name minutes` | Stops them talking (all channels). `/admin unmute Name` lifts it. |
| `/admin announce text` | A banner for everyone online. |
| `/admin tp Name` · `/admin summon Name` | Go to them, or bring them to you (moving one of you to the other's layer). |
| `/admin inspect Name` | Account, level, layer, gold, position, mute or ban. |
| `/admin reports` · `/admin resolve id` | Player reports (`/report Name reason`) and closing them. |

## Data and backups

Everything persistent is in the database:
- accounts, sessions and characters
- friends, guilds, mail and reports
- in the cluster, which layers are up and who is on which

**SQLite** (one process): `DATA_DIR/celblade.db`. It runs in WAL mode, so the `-wal` and `-shm`
files next to it are part of it while the server runs. Every `BACKUP_HOURS` the server writes a
consistent snapshot to `DATA_DIR/backups/` with `VACUUM INTO`, which is safe while players are
online. The newest `BACKUP_KEEP` are kept. To restore:
1. Stop the server.
2. Move `celblade.db`, `celblade.db-wal` and `celblade.db-shm` aside.
3. Copy the backup to `DATA_DIR/celblade.db`.
4. Start the server.

**Postgres** (the cluster): the CronJob dumps it nightly to the backups volume. To restore one:
1. Scale the realm StatefulSet and the gateways to 0.
2. Restore:

   ```
   kubectl -n website exec -it portfolio-cel-blade-postgres-0 -- \
     pg_restore -U celblade -d celblade --clean --if-exists /path/to/celblade-<date>.dump
   ```

   Copy the dump into the pod first, or mount the backups volume there.
3. Scale everything back up.

Copy backups off the machine too: a backup on the same disk doesn't survive the disk.

What isn't saved: loot lying on the ground (it expires after a few minutes anyway), camp respawn
timers and parties. Parties survive a layer's rolling restart, but not a crash.

## Monitoring

- **`GET /healthz`**: `{"role":…,"ok":true,"uptime":…,"players":…,"enemies":…,"tickMs":…}`, with
  more for the role. It answers 503 while a layer is closing, so the cluster stops sending
  players to it.
- **`GET /metrics`** (or on `METRICS_PORT`): Prometheus text. It includes:
  - players, enemies, parties, loaded colliders and chunks (layers)
  - connections and layers seen (gateways)
  - tick time (p50, p95 and max over the last 200 ticks)
  - messages in and out, and bus messages
  - bytes out, as JSON and on the wire after compression
  - hits, kills, trades and logins
  - slow clients dropped and snapshots skipped
  - processor time, heap and resident memory
- **Logs**: start and stop, players joining and leaving (with their layer), admin actions, trades,
  backups and errors. An exception in one message handler is logged and the realm carries on.

Watch the tick time. A layer ticks every 50 ms. A p95 creeping towards 50 ms means the layer is
full: enemies start to lag behind. Lower the caps or add a layer.

Slow connections are handled so they can't hold anything up:
- A connection with more than 1 MB of unsent data has its snapshots skipped until it catches up.
- A connection with more than 8 MB unsent is dropped.

## Capacity

Measured with `tools/bot.mjs` on an Intel i5-14400F (Node 22). The bots run, shoot and swing.
Around them each layer keeps its camps awake and three roaming packs per player.

One process, 80 players (60 spread over 640 m, 20 crowded at the hub), ~850 enemies:

| | |
|---|---|
| Tick time | 13.3 ms median, 17 ms p95 (budget 50 ms) |
| Memory | ~700 MB resident |
| Per player | ~8 KB/s alone in the wild, ~20 KB/s in a crowd of ~40 visible players |

The cluster, 300 players through one gateway onto three layers (spread over 600 m):

| | Layer of 135 | Layers of 82–83 | Gateway (300 players) |
|---|---|---|---|
| Tick time | 34 ms median, 43 ms p95 | 17–18 ms, ~25 ms p95 | — |
| Processor | 0.66 cores | 0.39 cores | 1.08 cores |
| Memory | 720 MB | 300–460 MB | 170 MB |

Wire traffic averaged ~34 KB/s per player. The 135-player layer was near its budget, hence the soft
cap of 110 and hard cap of 150 in the manifests.

Sizing from those numbers (layers at ~110 players, about 0.55 cores and 600 MB each; a gateway
core per ~280 players):

| Players | Layers | Gateways | Processor | Memory | Bandwidth out |
|---|---|---|---|---|---|
| 300 | 3 | 1–2 | ~3 cores | ~2.5 GB | ~80 Mbit/s |
| 1,000 | 10 | 4 | ~10 cores | ~7.5 GB | ~270 Mbit/s |
| 3,000 | 28 | 11 | ~28 cores | ~20 GB | ~800 Mbit/s |

Past a few hundred players that's more than one node. The layers and gateways spread over a
multi-node cluster as they are. The database at those sizes wants PgBouncer in front of it (see
below).

To measure it yourself:

```
node tools/bot.mjs Spread http://localhost:8080 150 600   # 150 bots spread over 600 m
```

Run it against a throwaway realm started with `AUTH_LIMIT=1000`.

Costs grow with:
- **Enemies.** Every camp near a player is awake and every player brings roaming packs, so players
  spread across the map cost more than players together.
- **Players in sight of each other.** A crowd of *n* sends about *n²* player states.

What keeps them in hand:
- Interest management. Players are sent other players within 160 m and enemies within 110 m,
  found through a spatial grid.
- Enemies are sent only when they've changed.
- Other players further than 50 m are updated at half rate, and past 100 m at a third.
- Every state is encoded once per tick, however many players it goes to.
- Snapshots are compressed (permessage-deflate, about 4–5× smaller).
- Terrain heights the simulation asks for are cached.

## Further (not built)

- **Binary snapshots.** Bandwidth is the biggest cost per player, and the gateway's compression is
  its main work. A binary encoding of the enemy and player state arrays (fixed-point positions,
  quantised angles) would roughly halve the wire size and cut that compression work.
- **PgBouncer.** Each process keeps a few connections and each layer one listening connection;
  Postgres is set to 300. Much past 30 layers, put PgBouncer in front (session mode for the
  layers' listeners).
- **Regions within a layer.** A layer simulates its whole world on one core. Busy layers could hand
  regions of the world (Voronoi regions of ~240 m, as it's generated) to `worker_threads`. Nothing
  in `src/sim/` would need to change: it already runs headless and sends everything out as
  events.
- **Phasing by friends.** Today players land on the fullest layer with room, or on their party's.
  Letting them join a friend's or guildmate's layer from the social tab would make layers matter
  less.
