import { logFailure } from "../../http/log";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type DatabaseState = {
  pool?: Pool;
  db?: ReturnType<typeof drizzle>;
};

const databaseState = globalThis as typeof globalThis & {
  __dotaNotesDatabase?: DatabaseState;
};

export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const state = (databaseState.__dotaNotesDatabase ??= {});

  if (!state.pool) {
    state.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    state.pool.on("error", () => logFailure("Database pool connection error"));
  }

  if (!state.db) {
    state.db = drizzle(state.pool);
  }

  return state.db;
}

export async function closeDatabase() {
  const state = databaseState.__dotaNotesDatabase;
  databaseState.__dotaNotesDatabase = undefined;
  if (state?.pool) await state.pool.end();
}
