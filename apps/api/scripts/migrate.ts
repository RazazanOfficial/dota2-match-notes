import "../src/env";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
await client.connect();
try {
  // The lock and migrations use the same connection; concurrent deploys cannot race.
  await client.query("SELECT pg_advisory_lock(641730284)");
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.info("Database migrations completed");
} finally {
  await client.query("SELECT pg_advisory_unlock(641730284)").catch(() => undefined);
  await client.end();
}
