import { StratzError } from "./errors";
import { buildStratzEnrichment } from "./enrichment";
import { fetchStratzMatch } from "./gateway";
import { getStratzConfig } from "./config";
import {
  claimNextStratzJob,
  completeStratzJob,
  getStratzJobSource,
  recoverStaleStratzJobs,
  rescheduleOrFailStratzJob,
  saveStratzEnrichment,
} from "./job-repository";

const PERMANENT_CODES = new Set([
  "stratz_auth_failed",
  "stratz_ip_conflict",
  "stratz_forbidden",
  "stratz_bad_status",
  "stratz_graphql_error",
  "invalid_stratz_json",
  "invalid_stratz_response",
  "stratz_match_mismatch",
  "stratz_player_not_found",
  "stratz_hero_mismatch",
  "stratz_source_not_found",
  "stratz_response_too_large",
]);

export function describeStratzJobError(error: unknown) {
  if (error instanceof StratzError) {
    return {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
      permanent: PERMANENT_CODES.has(error.code),
    };
  }
  console.error("STRATZ enrichment job failed", error);
  return {
    code: "stratz_enrichment_failed",
    message: "STRATZ enrichment failed unexpectedly",
    retryAfterSeconds: undefined,
    permanent: false,
  };
}

export async function runStratzEnrichmentTick(options?: {
  userId?: string;
  processBatchSize?: number;
}) {
  const config = getStratzConfig();
  const processBatchSize = options?.processBatchSize ?? config.processBatchSize;
  const stale = await recoverStaleStratzJobs(config);
  const jobs: Array<Record<string, unknown>> = [];

  for (let index = 0; index < processBatchSize; index += 1) {
    const job = await claimNextStratzJob(options?.userId);
    if (!job) break;

    try {
      const source = await getStratzJobSource(job.matchId);
      if (!source?.dotaMatchId) {
        throw new StratzError(
          422,
          "stratz_source_not_found",
          "مچ معتبر برای تکمیل اطلاعات STRATZ پیدا نشد",
        );
      }
      const result = await fetchStratzMatch(source.dotaMatchId);
      const enrichment = buildStratzEnrichment({
        match: result.match,
        steamAccountId: source.steamAccountId,
        expectedHeroId: source.heroId,
        heroPoolEligible: source.heroPoolEligible,
      });
      if (!result.match) {
        throw new StratzError(
          503,
          "stratz_match_not_ready",
          "اطلاعات این مچ هنوز در STRATZ آماده نیست",
        );
      }
      await saveStratzEnrichment({
        journalMatchId: source.journalMatchId,
        dotaMatchId: source.dotaMatchId,
        match: result.match,
        ...enrichment,
      });
      await completeStratzJob(job);
      jobs.push({
        id: job.id,
        matchId: job.matchId,
        dotaMatchId: String(source.dotaMatchId),
        status: "completed",
        attempts: job.attempts,
        role: enrichment.role,
        banCount: enrichment.bans.length,
      });
    } catch (error) {
      const failure = describeStratzJobError(error);
      const outcome = await rescheduleOrFailStratzJob({
        job,
        config,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryAfterSeconds: failure.retryAfterSeconds,
        permanent: failure.permanent,
      });
      jobs.push({
        id: job.id,
        matchId: job.matchId,
        status: outcome.status,
        attempts: job.attempts,
        errorCode: failure.code,
        runAfter: outcome.runAfter?.toISOString() || null,
      });
    }
  }

  return { stale, processed: jobs.length, jobs };
}
