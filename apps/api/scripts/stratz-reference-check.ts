import "../src/env";
import { closeDatabase } from "../src/lib/db";
import { logFailure } from "../src/http/log";
import { fetchMonthlyMeta, fetchMonthlyPerformance } from "../src/lib/monthly-reference/providers";
import { MonthlyMetaPendingError } from "../src/lib/monthly-reference/availability";
import { MODES, RANKS, performanceJobs, previousMonth } from "../src/lib/monthly-reference/model";
import { getStratzConfig } from "../src/lib/stratz/config";

// Uses the production provider, transport and shared DB quota reservation.
// Does not create/rebuild/advance a snapshot or insert reference rows.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--month" || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(args[1]))) throw new Error("Usage: stratz-reference-check --month YYYY-MM");
const month = args.length ? new Date(`${args[1]}-01T00:00:00Z`) : previousMonth(new Date());
try {
  const config = getStratzConfig();
  const meta = [];
  for (const rank of RANKS) for (const mode of MODES) {
    try {
      const rows = await fetchMonthlyMeta(month, rank, mode);
      meta.push({ rank, mode: mode.name, status: "available", rows: rows.length });
    } catch (error) {
      if (!(error instanceof MonthlyMetaPendingError)) throw error;
      meta.push({ rank, mode: mode.name, status: "waiting-source", availableMonths: error.availableMonths });
    }
  }
  const job = performanceJobs(month)[0];
  if (!job) throw new Error("No performance week in reference month");
  const rows = await fetchMonthlyPerformance(job);
  if (!rows.length) throw new Error("No usable performance rows returned");
  console.info(JSON.stringify({ ok: true, transport: config.transport, referenceMonth: month.toISOString().slice(0, 10),
    referenceDataChanged: false, sharedRateLimitUsed: true, meta,
    performance: { status: "verified", week: new Date(job.week).toISOString(), heroes: job.heroIds,
      rows: rows.length, positions: [...new Set(rows.map(row=>row.position))].sort(),
      minMinute: Math.min(...rows.map(row=>row.minute)), maxMinute: Math.max(...rows.map(row=>row.minute)),
      allMetricsValidated: true } }, null, 2));
} catch (error) {
  logFailure("STRATZ reference verification failed", error);
  process.exitCode = 1;
} finally { await closeDatabase(); }
