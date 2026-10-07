import "../src/env";
import { preflight, PREFLIGHT_ROLES, type PreflightRole } from "../src/runtime/preflight";

const args = process.argv.slice(2);
const role = args.find(arg => arg.startsWith("--role="))?.slice(7) || "api";
if (!(PREFLIGHT_ROLES as readonly string[]).includes(role) || args.some(arg => !["--check-db", `--role=${role}`].includes(arg))) {
  throw new Error(`Usage: preflight [--role=${PREFLIGHT_ROLES.join("|")}] [--check-db]`);
}
const result = await preflight(role as PreflightRole);
if (args.includes("--check-db")) {
  // A separate build entry keeps external Drizzle/pg imports out of the
  // config-only process, rather than hoisting them into this bundle.
  const modulePath = import.meta.url.endsWith(".ts") ? "./preflight-database.ts" : "./preflight-database.js";
  const { verifyDatabaseSchema, closeDatabase } = await import(new URL(modulePath, import.meta.url).href);
  try { await verifyDatabaseSchema(); result.checked.push("database_schema"); }
  catch { result.ok = false; result.failures.push("database_connection_or_schema"); }
  finally { await closeDatabase(); }
}
console.info(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
