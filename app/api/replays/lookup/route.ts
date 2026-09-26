import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { heroById } from "@/data/heroes";
import { getRequestUser, hasValidRequestOrigin } from "@/lib/auth/request";
import { getDb } from "@/lib/db";
import { dotaMatches } from "@/lib/db/schema";
import { fetchOpenDotaMatch } from "@/lib/opendota/client";
import { getOpenDotaConfig } from "@/lib/opendota/config";
import { OpenDotaError } from "@/lib/opendota/errors";
import { claimManualOpenDotaSync, claimOpenDotaRequestQuota, releaseManualOpenDotaSyncClaim } from "@/lib/opendota/repository";
import { parseOpenDotaMatch } from "@/lib/opendota/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const matchIdSchema = z.number().int().positive().safe();

export async function POST(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) return Response.json({ ok: false, error: { message: "مبدأ درخواست معتبر نیست" } }, { status: 403 });
  const user = await getRequestUser(request);
  if (!user) return Response.json({ ok: false, error: { message: "ابتدا وارد حساب شوید" } }, { status: 401 });
  const input = z.object({ matchId: matchIdSchema }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ ok: false, error: { message: "Match ID معتبر نیست" } }, { status: 400 });
  const matchId = input.data.matchId;
  try {
    const db = getDb();
    const [cached] = await db.select({ rawData: dotaMatches.rawData, startedAt: dotaMatches.startedAt })
      .from(dotaMatches).where(eq(dotaMatches.matchId, matchId)).limit(1);
    let match = cached?.rawData ? parseOpenDotaMatch(cached.rawData, matchId) : null;
    if (!match) {
      const config = getOpenDotaConfig();
      const claimedAt = await claimManualOpenDotaSync(user.id, config.manualSyncCooldownSeconds);
      let completed = false;
      try {
        await claimOpenDotaRequestQuota({ minuteRequestLimit: config.minuteRequestLimit, dailyRequestLimit: config.dailyRequestLimit });
        match = await fetchOpenDotaMatch(matchId);
        const now = new Date();
        await db.insert(dotaMatches).values({
          matchId, startedAt: new Date(match.start_time * 1000), durationSeconds: match.duration,
          radiantWin: match.radiant_win, gameMode: match.game_mode, lobbyType: match.lobby_type,
          rawData: match, fetchedAt: now, updatedAt: now,
        }).onConflictDoNothing();
        completed = true;
      } finally {
        if (!completed) await releaseManualOpenDotaSyncClaim(user.id, claimedAt);
      }
    }
    const player = match.players.find((entry) => entry.account_id === user.steamAccountId);
    return Response.json({ ok: true, match: {
      matchId, startedAt: new Date(match.start_time * 1000).toISOString(), duration: match.duration,
      radiantWin: match.radiant_win, radiantScore: match.radiant_score, direScore: match.dire_score,
      heroId: player?.hero_id || null, heroName: player ? heroById(player.hero_id)?.name || null : null,
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OpenDotaError) return Response.json({ ok: false, error: { message: error.message, code: error.code } }, { status: error.status });
    console.error("Replay lookup failed", { matchId, error });
    return Response.json({ ok: false, error: { message: "جست‌وجوی مچ انجام نشد" } }, { status: 500 });
  }
}
