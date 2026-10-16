# Technology Stack

**Analysis Date:** 2026-10-16

## Languages

**Primary:**
- JavaScript (ES modules, `"type": "module"` in `package.json`) - both the Node.js server (`server/*.js`) and the browser game client (`src/**/*.js`, `src/main.js` is the client entry)

**Secondary:**
- HTML - `index.html` (client shell, import map, font links)
- CSS - `style.css` (client styles, ~118 KB)
- Python 3 - `serve.py`, a dev-only static file server with caching disabled and a dev frame-capture endpoint (`POST /__shot/<name>`)
- JSON - `package.json`, `package-lock.json`, `manifest.webmanifest`
- YAML - `.github/workflows/deploy.yaml`, `docker-compose.yml`
- Caddyfile - `deploy/Caddyfile`
- SVG - `icon.svg`

## Runtime

**Environment:**
- Node.js `>=22.13` (declared in `package.json` `engines`)
- Pinned to `node:22.18.0-alpine` in `Dockerfile` and `node-version: "22.18.0"` in CI
- Uses the built-in `node:sqlite` module (`DatabaseSync`) in `server/db.js`, which needs Node 22's experimental SQLite support; the start script passes `--disable-warning=ExperimentalWarning`
- Browser: any modern browser with ES module, WebGL and WebSocket support (`src/render/Quality.js` selects render quality; `src/core/Device.js` detects touch devices)

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`); CI and the Docker build use `npm ci`
- Production image installs with `npm ci --omit=dev`

## Frameworks

**Core:**
- None. The server is a hand-written `node:http` server plus the `ws` WebSocket library (`server/main.js`, `server/api.js`). There is no Express or other web framework.
- Client is plain ES modules loaded directly by the browser. No bundler or transpiler is used; `index.html` loads `src/main.js` as a module and resolves bare specifiers through an import map.
- Three.js 0.160.0 - 3D rendering, loaded in the browser from jsDelivr via the import map in `index.html` (`three` and `three/addons/`). It is also listed in `package.json` `dependencies` so the server side can import the same shared code.

**Testing:**
- No test framework. Tests are plain Node scripts run with `node`:
  - `tests/map-regression.test.mjs`, `tests/map-persistence-online.test.mjs`
  - `tools/*check.mjs` (e.g. `tools/hordecheck.mjs`, `tools/campcheck.mjs`, `tools/persistcheck.mjs`), plus `tools/smoke.mjs` and `tools/powercurve.mjs`
- Entry point: `npm test` (chains the checks and the smoke test). `npm run test:cluster` runs `tools/smoke.mjs cluster` against Postgres.

**Build/Dev:**
- No build step. The server fingerprints the shared client source folders at startup (`server/build.js`) instead of bundling them.
- `npm run dev` - `node --watch-path=server server/main.js`, restarts the server on changes under `server/`
- `serve.py` - optional static server for the client alone (port 5173 by default)
- Docker multi-stage is not used; a single-stage `Dockerfile` based on `node:22.18.0-alpine`
- Load tooling: `tools/load/*.mjs` (`npm run load`, `load:http`, `load:players`, `load:auth`)

## Key Dependencies

**Critical (from `package.json`):**
- `three` 0.160.0 - 3D engine for the client; the server imports only shared, non-rendering code
- `ws` 8.21.3 - WebSocket server for `/ws` (`server/main.js`) and the gateway-to-layer relay (`server/gateway.js`)
- `pg` 8.16.3 - PostgreSQL driver, used by `server/db.js` (`PgDb`), `server/bus.js` (`PgBus`) and the cluster roles

**Infrastructure:**
- `node:crypto` (built in) - scrypt password hashing and random session tokens (`server/accounts.js`); per-connection `permessage-deflate` is set up in `server/main.js`
- `node:sqlite` (built in) - the single-process database (`server/db.js`)
- Fonts from Google Fonts (Saira Condensed, Chakra Petch), loaded by `<link>` in `index.html`; not an npm dependency

## Configuration

**Environment (server, read in `server/main.js` and `server/ops.js`):**
- `ROLE` - `all` (default), `gateway` or `realm`
- `PORT` (default 8080), `HOST` (default `0.0.0.0`)
- `NODE_ENV=production` - turns caching on and disables dev endpoints and `tools/` serving
- `DATA_DIR` - SQLite folder (default `data/`); the Docker image sets `/data`
- `DATABASE_URL` - Postgres connection, required for `ROLE=gateway` and `ROLE=realm`
- `TRUST_PROXY=1` - take the client address from `X-Forwarded-For`
- `ADMINS` - account names with admin rights
- `LOG_FORMAT=json`, `METRICS_TOKEN`, `METRICS_PORT`
- `BACKUP_HOURS`, `BACKUP_KEEP` - SQLite backup schedule
- `INTERNAL_KEY` - shared secret between gateways and realm layers
- `LAYER`, `LAYER_URL`, `POD_IP`, `HOSTNAME` - a realm layer's number and address
- `LAYER_SOFT_CAP`, `LAYER_HARD_CAP` - player caps per layer
- `DOMAIN` - used by the Caddy container in `docker-compose.yml`
- Full list and meanings: `docs/DEPLOY.md` (Settings section). The code header in `server/main.js` lists the same variables.

**Build and config files:**
- `package.json` - scripts and dependency pins
- `Dockerfile`, `.dockerignore` - image build; the image copies only `server/`, `src/`, `index.html`, `style.css`, `manifest.webmanifest` and `icon.svg`
- `docker-compose.yml` - `celblade` service plus a `caddy:2.8.4` reverse proxy
- `deploy/Caddyfile` - HTTPS for `{$DOMAIN}`, zstd/gzip encoding, reverse proxy to `celblade:8080`, `/metrics` returns 404 publicly
- `.gitignore` - ignores `node_modules/`, `data/`, `.test-data/`, `.shots/`, `.load-data/`, `.pg-test/`
- `.claude/launch.json` - launch configurations that run `serve.py` on port 5173 (and an alternate on 5176)
- No `.nvmrc` or `.python-version` detected. No ESLint, Prettier or TypeScript configuration detected.

**Secrets:**
- A `.env` file is not present in the tree. Secrets are supplied as environment variables (see `docs/DEPLOY.md`). Their values are not recorded here.

## Platform Requirements

**Development:**
- Node.js 22.13 or newer (22.18.0 matches CI and the image)
- npm, to install `three`, `ws` and `pg`
- A browser with WebGL for the client
- Optional: local PostgreSQL 17 for the cluster tests (CI uses `postgres:17.10-alpine`)
- Optional: Python 3 for `serve.py`

**Production:**
- Container image `node:22.18.0-alpine`, published to GitHub Container Registry (`ghcr.io`) by CI
- Deployed to a Kubernetes cluster as StatefulSet-style realm layers and gateways (see `docs/DEPLOY.md`, "On Kubernetes"); the layer number is taken from the pod name ordinal
- Alternative single-host deployment: `docker compose up -d` with Caddy for TLS (`docker-compose.yml`)
- Postgres 17 for the cluster; SQLite file in `DATA_DIR` for a single process

---

*Stack analysis: 2026-10-16*
