import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: {
    main: "src/main.ts",
    worker: "scripts/worker.ts",
    migrate: "scripts/migrate.ts",
    "check-database": "scripts/check-database.ts",
    preflight: "scripts/preflight.ts",
  },
  outdir: "dist", bundle: true, platform: "node", format: "esm", packages: "external",
  target: "node22", logLevel: "info",
});
