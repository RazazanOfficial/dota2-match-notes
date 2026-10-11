import "../src/env";
import { closeDatabase } from "../src/lib/db";
import { ensureMonthlyReference, listMonthlyReferences } from "../src/lib/monthly-reference/service";
import { monthIsSettled, previousMonth, referenceWindow, REFERENCE_POLICY } from "../src/lib/monthly-reference/model";
import { logFailure } from "../src/http/log";

// Local operator tool: explicit --queue creates new empty versions. Never purges
// active rows, runs providers, or changes user/session/match data.
const args = process.argv.slice(2);
try {
  if ((args.length !== 2 && args.length !== 3) || args[0] !== "--months" ||
    (args.length === 3 && args[2] !== "--queue")) throw new Error("Usage: monthly-reference-rebuild --months YYYY-MM[,YYYY-MM] [--queue]");
  const months = args[1].split(",");
  if (!months.length || months.length > 11 || new Set(months).size !== months.length ||
    months.some(month => !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))) throw new Error("Invalid or duplicate reference months");
  const now = new Date();
  for (const month of months) {
    const date = new Date(`${month}-01T00:00:00Z`);
    const age = (now.getUTCFullYear() - date.getUTCFullYear()) * 12 + now.getUTCMonth() - date.getUTCMonth();
    if (date > previousMonth(now) || age > 11 || !monthIsSettled(date, now)) throw new Error("All months must be completed, settled and within the last 11 months");
  }
  const before = await listMonthlyReferences();
  const versions = [];
  for (const month of months.sort()) {
    const active = before.filter(version => version.referenceMonth === `${month}-01` && version.status === "active");
    const result = args.includes("--queue") ? await ensureMonthlyReference(now, true, month) : { status: "inspection-only" };
    versions.push({ month, result, window: referenceWindow(new Date(`${month}-01T00:00:00Z`)),
      preservedActiveVersionIds: active.map(version=>version.id) });
  }
  console.info(JSON.stringify({ ok: true, queued: args.includes("--queue"), sourcePolicy: REFERENCE_POLICY,
    existingReferenceRowsDeleted: false, versions }, null, 2));
} catch (error) {
  logFailure("Monthly reference rebuild request failed", error);
  process.exitCode = 1;
} finally { await closeDatabase(); }
