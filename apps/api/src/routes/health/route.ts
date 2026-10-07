import { logFailure } from "../../http/log";
import { sql } from "drizzle-orm";
import { getDb } from "../../lib/db";


export async function GET() {
  const startedAt = performance.now();

  try {
    const db = getDb();
    await db.execute(sql`select 1`);

    return Response.json({
      ok: true,
      database: "connected",
      responseTimeMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    logFailure("Database health check failed", error);

    return Response.json(
      {
        ok: false,
        database: "unavailable",
      },
      { status: 503 },
    );
  }
}