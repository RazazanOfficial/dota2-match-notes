import { sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "./schema";
import { getDb } from "./index";

/** Read-only validation of the actual PostgreSQL schema, including new columns. */
export async function verifyDatabaseSchema(db = getDb()) {
  const result = await db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`);
  const actual = new Set(result.rows.map(row => `${row.table_name}.${row.column_name}`));
  const missing: string[] = [];
  let tableCount = 0;
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const table = getTableConfig(value); tableCount++;
    for (const column of table.columns) if (!actual.has(`${table.name}.${column.name}`)) missing.push(`${table.name}.${column.name}`);
  }
  if (missing.length) throw new Error(`Database schema requires migration: ${missing.join(", ")}`);
  return { ok: true, tables: tableCount, columns: actual.size };
}
