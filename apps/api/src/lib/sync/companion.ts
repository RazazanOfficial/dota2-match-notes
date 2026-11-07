import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { cachedOrFetchMatch } from "../opendota/service";
import {
  findKnownOpenDotaMatchIds,
  saveDiscoveredOpenDotaMatch,
} from "../opendota/repository";
import { OpenDotaError } from "../opendota/errors";
export const companionHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const observationDelay = (attempt: number) =>
  [180, 300, 600, 1200, 1800][Math.min(Math.max(0, attempt - 1), 4)];
export async function registerCompanion(userId: string, deviceId?: string) {
  const token = randomBytes(32).toString("base64url"),
    hash = companionHash(token),
    db = getDb();
  // Device credentials are scoped to reporting match IDs, never general account access.
  // Reopening/closing the UI must not rotate the credential of an already running agent.
  if (deviceId) {
    const existing =
      await db.execute(sql`UPDATE companion_devices SET last_seen_at=now()
      WHERE id=${deviceId}::uuid AND user_id=${userId}::uuid AND revoked_at IS NULL
      AND expires_at>now()+interval '1 day' RETURNING id`);
    if (existing.rows[0])
      return { deviceId: String(existing.rows[0].id), token: null };
  }
  // An expiring device gets a replacement; its old token stays valid during handoff.
  const row = (
    await db.execute(sql`INSERT INTO companion_devices(user_id,token_hash,expires_at)
    VALUES(${userId}::uuid,${hash},now()+interval '180 days') RETURNING id`)
  ).rows[0];
  return { deviceId: String(row.id), token };
}
export async function acceptObservation(
  token: string,
  matchId: number,
  endedAt: Date,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const device = (
      await tx.execute(sql`SELECT d.id,d.user_id FROM companion_devices d
      WHERE d.token_hash=${companionHash(token)} AND d.revoked_at IS NULL AND d.expires_at>now() FOR UPDATE`)
    ).rows[0];
    if (!device)
      throw new OpenDotaError(
        401,
        "companion_unauthorized",
        "Background access expired",
      );
    const existing = (
      await tx.execute(
        sql`SELECT status FROM match_observations WHERE user_id=${device.user_id}::uuid AND match_id=${matchId}`,
      )
    ).rows[0];
    if (existing) return { accepted: true, status: String(existing.status) };
    const count = (
      await tx.execute(
        sql`SELECT count(*)::int AS n FROM match_observations WHERE user_id=${device.user_id}::uuid AND ended_at>now()-interval '1 day'`,
      )
    ).rows[0];
    if (Number(count.n) >= 100)
      throw new OpenDotaError(
        429,
        "companion_daily_limit",
        "Too many match observations",
        3600,
      );
    await tx.execute(sql`INSERT INTO match_observations(user_id,match_id,ended_at,run_after,deadline_at)
      VALUES(${device.user_id}::uuid,${matchId},${endedAt.toISOString()}::timestamptz,
      greatest(now(),${endedAt.toISOString()}::timestamptz+interval '5 minutes'),now()+interval '1 day') ON CONFLICT DO NOTHING`);
    await tx.execute(
      sql`UPDATE companion_devices SET last_seen_at=now() WHERE id=${device.id}::uuid`,
    );
    return { accepted: true, status: "pending" };
  });
}
export async function runObservedMatchTick() {
  const db = getDb();
  await db.execute(sql`UPDATE match_observations SET status='failed',locked_at=NULL,error_code='match_discovery_expired'
    WHERE status IN ('pending','processing') AND deadline_at<=now()`);
  await db.execute(sql`UPDATE match_observations SET status='pending',locked_at=NULL
    WHERE status='processing' AND locked_at<now()-interval '5 minutes' AND deadline_at>now()`);
  const job = await db.transaction(async (tx) => {
    const row = (
      await tx.execute(sql`SELECT o.id,o.user_id,o.match_id,o.attempts,u.steam_account_id
      FROM match_observations o JOIN users u ON u.id=o.user_id
      WHERE o.status='pending' AND o.run_after<=now() AND o.deadline_at>now()
      ORDER BY o.run_after LIMIT 1 FOR UPDATE OF o SKIP LOCKED`)
    ).rows[0];
    if (!row) return null;
    const lease = new Date().toISOString();
    await tx.execute(
      sql`UPDATE match_observations SET status='processing',attempts=attempts+1,locked_at=${lease}::timestamptz WHERE id=${row.id}::uuid`,
    );
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      match_id: Number(row.match_id),
      attempts: Number(row.attempts),
      steam_account_id: Number(row.steam_account_id),
      lease,
    };
  });
  if (!job) return { processed: 0 };
  let status = "completed",
    code: string | null = null,
    delay = 0;
  try {
    const userId = String(job.user_id),
      matchId = Number(job.match_id),
      known = await findKnownOpenDotaMatchIds(userId, [matchId]);
    if (!known.importedIds.has(matchId) && !known.dismissedIds.has(matchId)) {
      const match = await cachedOrFetchMatch(
        matchId,
        undefined,
        Number(job.steam_account_id),
      );
      const player = match.players.find(
        (p) => p.account_id === Number(job.steam_account_id),
      );
      if (!player)
        throw new OpenDotaError(
          422,
          "match_player_unverified",
          "Player identity is not available yet",
        );
      await saveDiscoveredOpenDotaMatch({ userId, match, player });
    }
  } catch (error) {
    code =
      error instanceof OpenDotaError ? error.code : "match_discovery_failed";
    // Missing/new/private provider data can arrive later. Never invent membership.
    status = "pending";
    delay = Math.max(
      observationDelay(Number(job.attempts) + 1),
      error instanceof OpenDotaError ? error.retryAfterSeconds || 0 : 0,
    );
  }
  await db.execute(sql`UPDATE match_observations SET status=${status},error_code=${code},locked_at=NULL,
    run_after=now()+${delay}*interval '1 second' WHERE id=${job.id}::uuid AND status='processing' AND locked_at=${job.lease}::timestamptz`);
  return { processed: 1, status };
}
