# External Integrations

**Analysis Date:** 2026-10-16

## APIs & External Services

**Content delivery (browser, loaded at runtime):**
- jsDelivr CDN - serves Three.js 0.160.0 to the browser
  - Loaded via the import map in `index.html`: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` and `.../examples/jsm/`
  - SDK/Client: `three` (also an npm dependency for the server's shared code)
  - Auth: none
- Google Fonts - Saira Condensed and Chakra Petch
  - Loaded by `<link>` tags in `index.html`
  - Auth: none

**No other third-party APIs detected.** The game server does not call any external service at runtime; there are no payment, email, analytics or AI SDKs in `package.json` or `server/`.

## Data Storage

**Databases:**
- SQLite (built-in `node:sqlite`) - single-process mode (`ROLE=all`, the default)
  - File: `${DATA_DIR}/celblade.db` (default `data/celblade.db`), WAL journal mode
  - Implementation: `server/db.js` (`SqliteDb`), wrapped by `server/store.js`
  - Backups: `server/ops.js` `startBackups()`, controlled by `BACKUP_HOURS` / `BACKUP_KEEP`
- PostgreSQL (via `pg` 8.16.3) - cluster mode (`ROLE=gateway` and `ROLE=realm`), and the message bus
  - Connection: `DATABASE_URL` env var (required for non-`all` roles)
  - Implementation: `server/db.js` (`PgDb`), same `Store` interface
  - Numeric types: `pg.types.setTypeParser(20, Number)` in `server/db.js`, so 64-bit ids are JS numbers
  - Schema is created in `server/store.js` (`CREATE TABLE IF NOT EXISTS` for `meta`, `accounts`, `sessions`, `characters`, `friends`, `ignores`, `guilds`, `guild_members`, `mail`, `reports`, `layers`, `presence`, `affinity`)
  - Client: none beyond `pg`; SQL is written once with `?` placeholders and translated per backend

**File Storage:**
- Local filesystem only. The client's own files are served from disk by `server/main.js`; no object storage.
- Character and world saves are rows in the store (`characters` table), not files.

**Caching:**
- None external. Client-side caches are in-browser only (see Browser Storage below). The server sends `Cache-Control` headers in production (`server/main.js`).

**Browser Storage (client):**
- `localStorage` used by `src/core/Save.js` (save data), `src/core/Prefs.js` (preferences), `src/net/Net.js` and `src/dev/DevTools.js`

## Authentication & Identity

**Auth Provider:**
- Custom, built in. No OAuth or external identity provider.
  - Implementation: `server/accounts.js`
  - Passwords: scrypt (`node:crypto`), stored as `scrypt$<salt>$<key>`; checked with `timingSafeEqual`
  - Sessions: 32 random bytes (`randomBytes(32)`, base64url) returned as a bearer token; only a SHA-256 hash is stored (`sha256` in `server/accounts.js`)
  - Client sends `Authorization: Bearer <token>` to `/api/*`, and the first `auth { token, character }` message on the WebSocket
  - Admin rights: account names listed in the `ADMINS` env var
- Inter-process trust (cluster): gateways and realm layers share `INTERNAL_KEY`, sent as header `x-internal-key` on the `/ws` upgrade (`server/main.js`)

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry or similar SDK detected.

**Logs:**
- Custom logger in `server/ops.js` (`log`); JSON lines when `LOG_FORMAT=json`, plain text otherwise
- Metrics: `metrics` registry in `server/ops.js`; exposed at `/metrics`
  - Protected by `METRICS_TOKEN` when set
  - Can be served only on a separate port with `METRICS_PORT`
  - Caddy returns 404 for `/metrics` publicly (`deploy/Caddyfile`)
- Health: `GET /healthz` (used by the Docker `HEALTHCHECK` in `Dockerfile`)

## CI/CD & Deployment

**Source host and CI:**
- GitHub, repository `aidenharwood/portfolio` (`.github/workflows/deploy.yaml`)
- GitHub Actions workflow named `[cel-blade] Test, build and push Docker image`
  - Triggers: push to `main`, pull requests, manual dispatch
  - `test` job: Node 22.18.0, `npm ci`, syntax check of `server/*.js` and `src/**/*.js`, `npm test` (SQLite), then `npm run test:cluster` against a `postgres:17.10-alpine` service container
  - `build_and_push` job (not on PRs): uses `aidenharwood/portfolio-action-docker-build-push@v1` to push to GHCR; credentials from `secrets.GHCR_USERNAME` and `secrets.GHCR_PAT`
  - `update_helm_chart` job: uses `aidenharwood/portfolio-action-helm-update-image@v1` to write the new image reference into `templates/cel-blade/application.portfolio-cel-blade.yaml` in the repo `aidenharwood/portfolio-helm-website`, using `secrets.GH_PAT`

**Container Registry:**
- GitHub Container Registry, `ghcr.io`; image name `aidenharwood/portfolio/cel-blade:<run_id>-<run_number>`

**Hosting:**
- Kubernetes (the "portfolio cluster"), with the image referenced from a Helm chart in `aidenharwood/portfolio-helm-website`. Gateways and realm layers run from the same image, with ROLE set per workload. Details: `docs/DEPLOY.md`.
- Alternative: a single Docker host using `docker-compose.yml`

**Ingress and TLS:**
- Kubernetes ingress in the cluster (implied by `docs/DEPLOY.md`; the ingress manifest itself is not in this repository)
- Caddy 2.8.4 container for single-host deployments; Caddy obtains and renews the TLS certificate for `DOMAIN` automatically (`deploy/Caddyfile`, `docker-compose.yml`)
- Gateways run with `TRUST_PROXY=1` so client addresses come from `X-Forwarded-For`

**Cluster coordination:**
- Postgres `LISTEN/NOTIFY` on channel `celblade` is the message bus between layers (`server/bus.js`, `PgBus`), with a dedicated connection that is re-made on drop
- Layer discovery and placement: `layers`, `presence` and `affinity` tables in Postgres (`server/store.js`, `server/gateway.js`)
- Layer identity: `LAYER`, else the trailing `-<n>` of `HOSTNAME` (StatefulSet ordinal) (`server/main.js` `layerNumber()`); layer address from `LAYER_URL` or `POD_IP`

**CI Pipeline:**
- GitHub Actions (above). No other CI service detected.

## Environment Configuration

**Required env vars (production):**
- `NODE_ENV=production`
- `ADMINS` - admin account names (may be empty)
- `DATABASE_URL` - required for `ROLE=gateway` or `ROLE=realm`
- `INTERNAL_KEY` - required between gateways and realm layers
- `DOMAIN` - Caddy only (single-host deploy)
- `METRICS_TOKEN` - recommended if `/metrics` is reachable

**Optional env vars:**
- `PORT`, `HOST`, `DATA_DIR`, `TRUST_PROXY`, `LOG_FORMAT`, `METRICS_PORT`, `BACKUP_HOURS`, `BACKUP_KEEP`, `LAYER`, `LAYER_URL`, `POD_IP`, `LAYER_SOFT_CAP`, `LAYER_HARD_CAP`

**Secrets location:**
- Supplied as environment variables. In CI, `GHCR_USERNAME`, `GHCR_PAT` and `GH_PAT` are GitHub Actions secrets. No secret files are committed to this repository. The CI Postgres password is set inline in the workflow for the throwaway test service only.
- A `.env` file is not in the repository; `.gitignore` excludes `data/` (which holds the SQLite database and therefore player accounts).

## Webhooks & Callbacks

**Incoming:**
- None. The server accepts HTTP requests and WebSocket upgrades on `/ws` only; no webhook endpoints are defined.
- HTTP routes (`server/api.js`): `GET /api/status`, `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/characters`, `POST /api/characters`, `DELETE /api/characters/:id`
- Other routes (`server/main.js`): `/healthz`, `/metrics`, `/ws`, static client files

**Outgoing:**
- None to third-party services.
- Internal only: gateway-to-layer WebSocket relay (`server/gateway.js` opens `ws` connections to a layer's `url`, sending `x-internal-key`).

---

*Integration audit: 2026-10-16*
