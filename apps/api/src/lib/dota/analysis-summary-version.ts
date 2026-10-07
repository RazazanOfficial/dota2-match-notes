import { sql } from "drizzle-orm";
import { monthlyReferenceVersions } from "../db/schema";
// Bump when inference/scoring changes so previously projected histories refresh.
export const ANALYSIS_SUMMARY_VERSION = 2;
// Active snapshots are immutable. A promotion/rebuild invalidates compact history projections.
export const referenceRevisionSql = sql<string>`coalesce((select string_agg(
    ${monthlyReferenceVersions.id}::text || ':' || coalesce(${monthlyReferenceVersions.completedAt}::text, ''), ',' order by ${monthlyReferenceVersions.id})
    from ${monthlyReferenceVersions} where ${monthlyReferenceVersions.status} = 'active'), '')`;
