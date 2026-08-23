import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  dotaMatches,
  journalMatches,
  matchBans,
  matchImageJobs,
  stratzEnrichmentJobs,
  users,
} from "../db/schema";
import type { StratzConfig } from "./config";
import { StratzError } from "./errors";
import type { StratzMatch } from "./validation";

export interface ClaimedStratzJob {
  id: string;
  matchId: string;
  attempts: number;
  lockedAt: Date;
}

export async function enqueueStratzBackfillForUser(userId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const matches = await tx
      .select({ matchId: journalMatches.id })
      .from(journalMatches)
      .where(
        and(
          eq(journalMatches.userId, userId),
          isNotNull(journalMatches.dotaMatchId),
        ),
      );
    if (!matches.length) return 0;
    const matchIds = matches.map((match) => match.matchId);
    const now = new Date();

    await tx
      .update(journalMatches)
      .set({ role: null, roleSource: null, updatedAt: now })
      .where(
        and(
          eq(journalMatches.userId, userId),
          eq(journalMatches.roleSource, "opendota"),
        ),
      );
    await tx
      .delete(matchBans)
      .where(
        and(
          inArray(matchBans.matchId, matchIds),
          eq(matchBans.source, "opendota"),
        ),
      );

    const queued = await tx
      .insert(stratzEnrichmentJobs)
      .values(matches)
      .onConflictDoUpdate({
        target: stratzEnrichmentJobs.matchId,
        set: {
          status: "pending",
          attempts: 0,
          runAfter: now,
          lockedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
        setWhere: eq(stratzEnrichmentJobs.status, "failed"),
      })
      .returning({ id: stratzEnrichmentJobs.id });
    return queued.length;
  });
}

export async function recoverStaleStratzJobs(config: StratzConfig) {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - config.staleLockSeconds * 1_000);

  return db.transaction(async (tx) => {
    const staleJobs = await tx
      .select({
        id: stratzEnrichmentJobs.id,
        attempts: stratzEnrichmentJobs.attempts,
      })
      .from(stratzEnrichmentJobs)
      .where(
        and(
          eq(stratzEnrichmentJobs.status, "processing"),
          isNotNull(stratzEnrichmentJobs.lockedAt),
          lte(stratzEnrichmentJobs.lockedAt, staleBefore),
        ),
      )
      .orderBy(asc(stratzEnrichmentJobs.lockedAt))
      .limit(100)
      .for("update", { skipLocked: true });
    let recovered = 0;
    let failed = 0;

    for (const job of staleJobs) {
      if (job.attempts >= config.jobMaxAttempts) {
        await tx
          .update(stratzEnrichmentJobs)
          .set({
            status: "failed",
            lockedAt: null,
            finishedAt: now,
            errorCode: "stratz_job_stale_lock",
            errorMessage: "maximum attempts reached after a stale lock",
            updatedAt: now,
          })
          .where(eq(stratzEnrichmentJobs.id, job.id));
        failed += 1;
      } else {
        await tx
          .update(stratzEnrichmentJobs)
          .set({
            status: "pending",
            lockedAt: null,
            runAfter: now,
            errorCode: "stratz_job_stale_lock",
            errorMessage: "stale lock recovered",
            updatedAt: now,
          })
          .where(eq(stratzEnrichmentJobs.id, job.id));
        recovered += 1;
      }
    }

    return { recovered, failed };
  });
}

export async function claimNextStratzJob(userId?: string) {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: stratzEnrichmentJobs.id,
        matchId: stratzEnrichmentJobs.matchId,
        attempts: stratzEnrichmentJobs.attempts,
      })
      .from(stratzEnrichmentJobs)
      .innerJoin(
        journalMatches,
        eq(stratzEnrichmentJobs.matchId, journalMatches.id),
      )
      .where(
        and(
          eq(stratzEnrichmentJobs.status, "pending"),
          lte(stratzEnrichmentJobs.runAfter, now),
          userId ? eq(journalMatches.userId, userId) : undefined,
        ),
      )
      .orderBy(
        asc(stratzEnrichmentJobs.runAfter),
        asc(stratzEnrichmentJobs.createdAt),
        asc(stratzEnrichmentJobs.id),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const [claimed] = await tx
      .update(stratzEnrichmentJobs)
      .set({
        status: "processing",
        attempts: sql`${stratzEnrichmentJobs.attempts} + 1`,
        lockedAt: now,
        finishedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(stratzEnrichmentJobs.id, candidate.id),
          eq(stratzEnrichmentJobs.status, "pending"),
        ),
      )
      .returning({
        attempts: stratzEnrichmentJobs.attempts,
        lockedAt: stratzEnrichmentJobs.lockedAt,
      });
    if (!claimed?.lockedAt) return null;

    return {
      ...candidate,
      attempts: claimed.attempts,
      lockedAt: claimed.lockedAt,
    } satisfies ClaimedStratzJob;
  });
}

export async function getStratzJobSource(matchId: string) {
  const [source] = await getDb()
    .select({
      journalMatchId: journalMatches.id,
      dotaMatchId: journalMatches.dotaMatchId,
      steamAccountId: users.steamAccountId,
      heroId: journalMatches.heroId,
      heroPoolEligible: journalMatches.heroPoolEligible,
    })
    .from(journalMatches)
    .innerJoin(users, eq(journalMatches.userId, users.id))
    .where(eq(journalMatches.id, matchId))
    .limit(1);
  return source || null;
}

export async function saveStratzEnrichment(params: {
  journalMatchId: string;
  dotaMatchId: number;
  role: "safe_lane" | "mid_lane" | "off_lane" | "soft_support" | "hard_support";
  bans: Array<{
    heroId: number;
    heroName: string;
    team: number | null;
    draftOrder: number | null;
  }>;
  match: StratzMatch;
}) {
  const db = getDb();
  const now = new Date();
  const rawData = JSON.parse(JSON.stringify(params.match)) as Record<string, unknown>;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`journal-match:${params.journalMatchId}`}, 0))`,
    );
    const [current] = await tx
      .select({
        dotaMatchId: journalMatches.dotaMatchId,
        role: journalMatches.role,
        roleSource: journalMatches.roleSource,
        heroPoolEligible: journalMatches.heroPoolEligible,
      })
      .from(journalMatches)
      .where(eq(journalMatches.id, params.journalMatchId))
      .limit(1);
    if (!current) throw new Error("STRATZ enrichment target no longer exists");
    if (current.dotaMatchId !== params.dotaMatchId) {
      throw new StratzError(
        409,
        "stratz_source_changed",
        "شناسه مچ هنگام تکمیل اطلاعات STRATZ تغییر کرد؛ کار دوباره اجرا می‌شود",
      );
    }

    await tx
      .update(dotaMatches)
      .set({
        stratzRawData: rawData,
        stratzFetchedAt: now,
        updatedAt: now,
      })
      .where(eq(dotaMatches.matchId, params.dotaMatchId));

    await tx
      .update(journalMatches)
      .set({
        role: current.roleSource === "manual" ? current.role : params.role,
        roleSource: current.roleSource === "manual" ? "manual" : "stratz",
        analyzedAt: now,
        updatedAt: now,
      })
      .where(eq(journalMatches.id, params.journalMatchId));

    if (current.heroPoolEligible) {
      await tx.delete(matchBans).where(eq(matchBans.matchId, params.journalMatchId));
      if (params.bans.length) {
        await tx.insert(matchBans).values(
          params.bans.map((ban, sortOrder) => ({
            matchId: params.journalMatchId,
            heroId: ban.heroId,
            heroName: ban.heroName,
            sortOrder,
            source: "stratz" as const,
            team: ban.team,
            draftOrder: ban.draftOrder,
          })),
        );
      }
    } else {
      await tx
        .delete(matchBans)
        .where(
          and(
            eq(matchBans.matchId, params.journalMatchId),
            inArray(matchBans.source, ["opendota", "stratz"]),
          ),
        );
    }

    await tx
      .insert(matchImageJobs)
      .values({ matchId: params.journalMatchId, runAfter: now, updatedAt: now })
      .onConflictDoUpdate({
        target: matchImageJobs.matchId,
        set: {
          status: "pending",
          attempts: 0,
          runAfter: now,
          lockedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          updatedAt: now,
        },
        setWhere: ne(matchImageJobs.status, "processing"),
      });
  });
}

export async function completeStratzJob(job: ClaimedStratzJob) {
  const finishedAt = new Date();
  const [completed] = await getDb()
    .update(stratzEnrichmentJobs)
    .set({
      status: "completed",
      lockedAt: null,
      finishedAt,
      errorCode: null,
      errorMessage: null,
      updatedAt: finishedAt,
    })
    .where(
      and(
        eq(stratzEnrichmentJobs.id, job.id),
        eq(stratzEnrichmentJobs.status, "processing"),
        eq(stratzEnrichmentJobs.lockedAt, job.lockedAt),
      ),
    )
    .returning({ id: stratzEnrichmentJobs.id });
  if (!completed) throw new Error("STRATZ job lease was lost");
}

export async function rescheduleOrFailStratzJob(params: {
  job: ClaimedStratzJob;
  config: StratzConfig;
  errorCode: string;
  errorMessage: string;
  retryAfterSeconds?: number;
  permanent?: boolean;
}) {
  const { job, config } = params;
  const now = new Date();
  const errorCode = params.errorCode.slice(0, 64);
  const errorMessage = params.errorMessage.slice(0, 1_000);

  if (params.permanent || job.attempts >= config.jobMaxAttempts) {
    const [failed] = await getDb()
      .update(stratzEnrichmentJobs)
      .set({
        status: "failed",
        lockedAt: null,
        finishedAt: now,
        errorCode,
        errorMessage,
        updatedAt: now,
      })
      .where(
        and(
          eq(stratzEnrichmentJobs.id, job.id),
          eq(stratzEnrichmentJobs.status, "processing"),
          eq(stratzEnrichmentJobs.lockedAt, job.lockedAt),
        ),
      )
      .returning({ id: stratzEnrichmentJobs.id });
    if (!failed) throw new Error("STRATZ job lease was lost");
    return { status: "failed" as const, runAfter: null };
  }

  const retrySeconds = Math.min(
    7_200,
    Math.max(
      params.retryAfterSeconds || 0,
      config.jobRetryBaseSeconds * 2 ** Math.max(0, job.attempts - 1),
    ),
  );
  const runAfter = new Date(now.getTime() + retrySeconds * 1_000);
  const [rescheduled] = await getDb()
    .update(stratzEnrichmentJobs)
    .set({
      status: "pending",
      lockedAt: null,
      runAfter,
      errorCode,
      errorMessage,
      updatedAt: now,
    })
    .where(
      and(
        eq(stratzEnrichmentJobs.id, job.id),
        eq(stratzEnrichmentJobs.status, "processing"),
        eq(stratzEnrichmentJobs.lockedAt, job.lockedAt),
      ),
    )
    .returning({ id: stratzEnrichmentJobs.id });
  if (!rescheduled) throw new Error("STRATZ job lease was lost");
  return { status: "pending" as const, runAfter };
}
