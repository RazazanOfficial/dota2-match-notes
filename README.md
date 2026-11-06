# Dota Notes

Windows desktop client, Express API and replay processing, in a monorepo with
an existing Next.js website and shared packages.

## Current architecture

| Responsibility | Iran application node | Germany compute node |
| --- | --- | --- |
| Public website/API, sessions, history, task status | Local | Private handlers only |
| Authoritative PostgreSQL | Local | Same database via restricted encrypted SSH |
| Durable queue submission | Local | Claims the same jobs |
| Replay acquisition, Java processing, sync, STRATZ reference and images | Disabled | Enabled |
| Steam/email/provider operations | Explicit selected routes forwarded privately | Executed here |
| Replay downloads | Authorizes a 15-minute object URL | Uploads to ParsPack |
| File bytes to desktop | Direct from ParsPack | Not proxied through Germany |

This is one authoritative database, not two synchronized databases. Standalone
local development remains supported (`DOTA_NODE_ROLE=standalone`). A link outage
can delay background work and upstream-dependent actions; saved Iran data and
local queue submission remain available. It is not global automatic failover.

Read [handoff](docs/HANDOFF.md), [architecture](docs/two-vps-architecture.fa.md),
[deployment](docs/deployment-ubuntu.md), and
[direct replay downloads](docs/direct-replay-download.fa.md).

## Development and checks

Use Node.js 24 and npm 11. Keep private env files outside Git.

```bash
npm ci
npm run api:dev
npm run desktop:dev
```

```bash
npm test
npm run test -w @dota-notes/api
npm run test:desktop
npm run typecheck
npm run api:build
npm run desktop:build
npm run build
npm run test:native-replay
```

Prepare the independent API runtime after an API build:

```bash
npm run release:prepare -w @dota-notes/api
npm ci --prefix apps/api/release --workspaces=false
```

On Windows with Tauri prerequisites installed:

```powershell
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:installer
```

Vite build success is not proof of a successful Windows native build. The manual
Windows workflow checks native tests before building the installer. Native
replay contracts also have a GUI-independent test harness.

## Source map

- `apps/api/src`: authentication, local reads/queue submission, private forwarding.
- `apps/api/scripts/replay-parser`: durable worker, checksummed spool and archive.
- `apps/api/release`: generated production runtime; regenerate instead of editing it.
- `apps/desktop`: frontend and native direct replay transfer.
- `apps/web`: existing website/legacy server source. Public `/api` routes go to Express.
- `deploy`: role-specific examples, private SSH link and systemd configuration.
- `docs`: current guides and explicitly labeled historical references.

A Game Coordinator client, Telegram bot and automatic match detection are future
features, not additions made by this deployment. Match STRATZ enrichment is
retired; STRATZ population/reference processing remains active.
