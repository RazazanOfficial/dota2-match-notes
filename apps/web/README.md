# Dota Notes website workspace

This workspace contains the Next.js website and retained legacy modules. The
repository root is the npm installation and operations entry point. Do not deploy
this directory as a separate copy with a second authoritative database.

## Current production role

- Next.js serves the website on the Iran node, loopback port `3000`.
- Nginx routes public `/api/` requests to the Express API on loopback `4100`.
- Shared/legacy modules remain here for compatibility and website rendering;
  their presence does not mean Next.js runs the production replay worker.
- Germany runs the Express private handlers and workers from `apps/api/release`.
- The only authoritative production database is `dota_notes` in Iran.

## Commands from repository root

```bash
npm ci
npm run web:dev
```

```bash
npm run build
npm run test -w @dota-notes/web
```

Next configuration loads environment settings from the repository root. Keep real
`.env.production` private. API migrations in the two-node installation run from
the independent API runtime on Iran, not through an unrelated legacy migration
workflow.

## Documentation

Use the root [index](../../docs/README.md), [deployment guide](../../docs/deployment-ubuntu.md),
[architecture](../../docs/two-vps-architecture.fa.md) and
[environment/service inventory](../../docs/environment-and-services.fa.md).
Files under `apps/web/docs` are pointers to those canonical documents, not
independent instructions to maintain or execute.
