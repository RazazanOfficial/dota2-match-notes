import { MatchImageError } from "../match-image/errors";
import { buildMatchImageModel } from "../match-image/model";
import { renderGeneratedMatchImages } from "../match-image/renderer";
import { publishGeneratedMatchImages } from "../media/service";
import { parseOpenDotaMatch } from "../opendota/validation";
import { getMatchImageJobConfig } from "./config";
import { describeMatchImageJobError } from "./policy";
import {
  claimNextMatchImageJob,
  completeMatchImageJob,
  getMatchImageJobSource,
  recoverStaleMatchImageJobs,
  rescheduleOrFailMatchImageJob,
} from "./repository";

export async function runMatchImageJobTick() {
  const config = getMatchImageJobConfig();
  const stale = await recoverStaleMatchImageJobs(config);
  const jobs: Array<Record<string, unknown>> = [];

  for (let index = 0; index < config.processBatchSize; index += 1) {
    const job = await claimNextMatchImageJob();
    if (!job) break;

    try {
      const source = await getMatchImageJobSource(job.matchId);
      if (!source?.dotaMatchId || !source.rawData) {
        throw new MatchImageError(
          "image_source_not_found",
          "داده معتبر OpenDota برای تولید تصویر پیدا نشد",
        );
      }
      const match = parseOpenDotaMatch(source.rawData, source.dotaMatchId);
      const model = buildMatchImageModel(match, source.steamAccountId);
      const artifacts = await renderGeneratedMatchImages(model);
      const images = await publishGeneratedMatchImages(job.matchId, artifacts);
      await completeMatchImageJob(job);
      jobs.push({
        id: job.id,
        matchId: job.matchId,
        dotaMatchId: String(source.dotaMatchId),
        status: "completed",
        attempts: job.attempts,
        imageCount: images.length,
      });
    } catch (error) {
      const failure = describeMatchImageJobError(error);
      const outcome = await rescheduleOrFailMatchImageJob({
        job,
        config,
        errorCode: failure.code,
        errorMessage: failure.message,
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
