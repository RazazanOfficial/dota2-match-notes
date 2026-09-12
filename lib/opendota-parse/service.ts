import { fetchOpenDotaMatch, requestOpenDotaParse } from "@/lib/opendota/client";
import { getOpenDotaConfig } from "@/lib/opendota/config";
import { OpenDotaError } from "@/lib/opendota/errors";
import { claimOpenDotaRequestQuota, saveOpenDotaMatch } from "@/lib/opendota/repository";
import { hasParsedOpenDotaReplay } from "@/lib/opendota/validation";
import { getOpenDotaParseConfig } from "./config";
import { claimNextOpenDotaParseJob, completeOpenDotaParseJob, failOrRetryOpenDotaParseJob, getOpenDotaParseJobSource, markOpenDotaParseRequested, recoverStaleOpenDotaParseJobs, rescheduleOpenDotaParsePoll } from "./repository";

function quota(units: number) {
  const config = getOpenDotaConfig();
  return claimOpenDotaRequestQuota({ minuteRequestLimit: config.minuteRequestLimit, dailyRequestLimit: config.dailyRequestLimit, units });
}

export async function runOpenDotaParseTick() {
  const config = getOpenDotaParseConfig();
  if (!config.enabled) return { enabled: false, processed: 0, jobs: [] };
  const stale = await recoverStaleOpenDotaParseJobs(config);
  const jobs: Array<Record<string, unknown>> = [];
  for (let index = 0; index < config.processBatchSize; index += 1) {
    const job = await claimNextOpenDotaParseJob();
    if (!job) break;
    let submissionAttempted = false;
    try {
      const source = await getOpenDotaParseJobSource(job);
      if (!source?.dotaMatchId || !source.steamAccountId) throw new OpenDotaError(422, "opendota_parse_source_not_found", "مچ یا بازیکن مربوط به Parse پیدا نشد");
      if (!job.providerJobId) {
        await quota(10);
        submissionAttempted = true;
        const requested = await requestOpenDotaParse(source.dotaMatchId);
        await markOpenDotaParseRequested(job, requested.jobId, config.pollIntervalSeconds);
        jobs.push({ id: job.id, matchId: job.matchId, status: "requested", providerJobId: requested.jobId });
        continue;
      }
      await quota(1);
      const match = await fetchOpenDotaMatch(source.dotaMatchId);
      if (!hasParsedOpenDotaReplay(match)) {
        if (job.pollAttempts + 1 >= config.maxPollAttempts) throw new OpenDotaError(504, "opendota_parse_timeout", "Parse مچ در زمان مورد انتظار کامل نشد");
        await rescheduleOpenDotaParsePoll(job, config.pollIntervalSeconds);
        jobs.push({ id: job.id, matchId: job.matchId, status: "waiting", pollAttempts: job.pollAttempts + 1 });
        continue;
      }
      const player = match.players.find((entry) => entry.account_id === source.steamAccountId);
      if (!player) throw new OpenDotaError(422, "opendota_parse_player_not_found", "بازیکن در اطلاعات Parseشده پیدا نشد");
      await saveOpenDotaMatch({ userId: source.userId, journalMatchId: source.journalMatchId, match, player, queueImages: true });
      await completeOpenDotaParseJob(job);
      jobs.push({ id: job.id, matchId: job.matchId, status: "completed" });
    } catch (error) {
      const known = error instanceof OpenDotaError;
      const permanent = known && (error.code === "opendota_parse_timeout" || (error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 404));
      const status = await failOrRetryOpenDotaParseJob(job, config, known ? error.code : "opendota_parse_failed", known ? error.message : "OpenDota parse worker failed unexpectedly", known ? error.retryAfterSeconds : undefined, permanent, submissionAttempted);
      jobs.push({ id: job.id, matchId: job.matchId, status, errorCode: known ? error.code : "opendota_parse_failed" });
    }
  }
  return { enabled: true, stale, processed: jobs.length, jobs };
}
