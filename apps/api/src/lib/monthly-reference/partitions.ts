import { sql } from "drizzle-orm";
import type { getDb } from "../db";
import { monthDate, monthKey } from "./model";

export const REFERENCE_PARENTS = ["monthly_hero_position_meta", "monthly_hero_performance_reference", "monthly_position_performance_reference"] as const;

export class MonthlyReferencePartitionsError extends Error {
  readonly code = "monthly_reference_partitions_missing";
  readonly status = 503;
  constructor(month: string) {
    super(`پارتیشن‌های مرجع ${month} آماده نیستند؛ اسکریپت prepare-monthly-reference-partitions.sql باید با مالک دیتابیس در ایران اجرا شود.`);
    this.name = "MonthlyReferencePartitionsError";
  }
}

// Called under the reference transaction lock. Compute only inspects catalogs;
// partition creation belongs to the DB owner on Iran, never the request runtime.
export async function assertMonthlyReferencePartitions(tx: Pick<ReturnType<typeof getDb>, "execute">, month: Date) {
  const lower = monthDate(month);
  const upper = monthDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)));
  const suffix = monthKey(month);
  await tx.execute(sql`SET LOCAL DateStyle = 'ISO, YMD'`);
  const names = sql.join(REFERENCE_PARENTS.map(parent => sql`(${parent}, ${`${parent}_${suffix}`})`), sql`, `);
  const result = await tx.execute(sql`
    SELECT child.relname FROM (VALUES ${names}) AS expected(parent_name, child_name)
    JOIN pg_catalog.pg_namespace ns ON ns.nspname = 'public'
    JOIN pg_catalog.pg_class parent ON parent.relnamespace = ns.oid AND parent.relname = expected.parent_name AND parent.relkind = 'p'
    JOIN pg_catalog.pg_inherits inheritance ON inheritance.inhparent = parent.oid
    JOIN pg_catalog.pg_class child ON child.oid = inheritance.inhrelid
      AND child.relnamespace = ns.oid AND child.relname = expected.child_name
      AND child.relkind = 'r' AND child.relispartition
    WHERE pg_catalog.pg_get_expr(child.relpartbound, child.oid) =
      pg_catalog.format('FOR VALUES FROM (%L) TO (%L)', ${lower}::date, ${upper}::date)
  `);
  if (result.rows.length !== REFERENCE_PARENTS.length) throw new MonthlyReferencePartitionsError(lower.slice(0, 7));
}
