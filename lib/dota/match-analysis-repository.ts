import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dotaMatches, journalMatches, users } from "@/lib/db/schema";
import { buildMatchAnalysis } from "./match-analysis";

export async function loadPublicMatchAnalysis(journalMatchId: string) {
  const [source] = await getDb().select({ dotaMatchId: journalMatches.dotaMatchId, profileHeroId: journalMatches.heroId, profileAccountId: users.steamAccountId, rawData: dotaMatches.rawData, stratzRawData: dotaMatches.stratzRawData }).from(journalMatches).innerJoin(users, eq(journalMatches.userId, users.id)).leftJoin(dotaMatches, eq(journalMatches.dotaMatchId, dotaMatches.matchId)).where(eq(journalMatches.id, journalMatchId)).limit(1);
  if (!source) return { found: false as const, analysis: null };
  if (!source.dotaMatchId || !source.rawData) return { found: true as const, analysis: null };
  return { found: true as const, analysis: buildMatchAnalysis({ rawData: source.rawData, stratzRawData: source.stratzRawData, profileAccountId: source.profileAccountId, profileHeroId: source.profileHeroId }) };
}
