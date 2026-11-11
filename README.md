# Dota Notes

Windows desktop application, Express API, Next.js website and background replay
processing in one npm monorepo. Start with the [documentation index](docs/README.md).
The runtime contract below matches the source reviewed at `0ab8d82`.

## Production topology

| Responsibility | Iran (`app`) | Germany (`compute`) |
| --- | --- | --- |
| Public HTTPS, website, sessions, history, queue submission | Local | No public application entry point |
| Authoritative PostgreSQL | `dota_notes` on loopback `5432` | Same database through SSH on loopback `15432` |
| Selected Steam, email and provider HTTP handlers | Forward through loopback `14100` | Authenticated private API on `4100` |
| Match sync, replay acquisition, Java parser, archive upload, images | Disabled | Background workers |
| Public desktop media | Publish and serve asset objects | Not required for clients |
| Private replay bytes | Issue short-lived download ticket | Upload to ParsPack |
| Client replay download | Direct from ParsPack to the desktop | Not streamed through Germany |

This is one database with durable jobs, not database replication. A link outage
can delay processing and upstream-dependent actions. Saved data and queue
submission in Iran remain available while the Iran API and database are healthy.
There is no automatic international failover.

Match discovery combines a Windows Companion using Dota GSI, scheduled server
reconciliation and manual Fetch. The Companion runs through Task Scheduler under
the signed-in Windows user, independently of the UI. It is not a Windows Service
and is not a Game Coordinator client. Telegram and a dedicated GC client remain
future work.

## Development

Use Node.js 24, npm 11 and the committed lockfiles. Keep real env files and tokens
outside Git. Run these in separate terminals from the repository root:

```bash
npm ci
npm run api:dev
```

```bash
npm run desktop:dev
```

Local development may use `DOTA_NODE_ROLE=standalone`; production uses explicit
`app` and `compute` roles. See [environment settings](docs/environment-and-services.fa.md).

## Checks and Windows installer

```bash
npm test
npm run test -w @dota-notes/api
npm run test:desktop
npm run typecheck
npm run api:build
npm run desktop:build
npm run test:native-replay
npm run test:companion
```

For a website change also run `npm run build`. On Windows, install the Tauri
prerequisites, Rust stable and MSVC tools, then run:

```powershell
node apps/desktop/scripts/prepare-native.mjs
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:installer
```

Preparation builds the standalone Companion before native tests need its bundled
resource. The installer is under `apps/desktop/src-tauri/target/release/bundle/nsis/`.
A frontend build is not a Windows installer or a live GSI acceptance test.

## Source and operations

- `apps/api/src`: public API, account handling, private forwarding and database jobs.
- `apps/api/scripts`: workers, parser pipeline and diagnostics.
- `apps/api/release`: production runtime; regenerate using `release:prepare`.
- `apps/desktop`: React UI, Tauri, media cache and the standalone Companion crate.
- `apps/web`: Next.js website and retained legacy modules; public `/api` uses Express.
- `deploy`: Nginx examples, role-specific env examples, systemd and SSH restrictions.
- `docs`: current operational guides, technical contracts and labeled history.

[Deployment](docs/deployment-ubuntu.md) follows the existing Windows checkout:
pull, branch, Copy/Replace, checks, commit, merge, then pull/build on both VPSs.
It does not require cloning again or running deployment detached from SSH.
