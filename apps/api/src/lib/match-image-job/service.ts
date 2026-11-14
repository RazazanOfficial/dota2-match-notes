import { MatchImageError } from "../match-image/errors";
import { buildLocalReplayImageModel } from "../match-image/model";
import { renderGeneratedMatchImages } from "../match-image/renderer";
import { publishGeneratedMatchImages } from "../media/service";
import { getMatchImageJobConfig } from "./config";
import { describeMatchImageJobError } from "./policy";
import {
  claimNextMatchImageJob,
  completeMatchImageJob,
  deferMatchImageJobUntilReplayParsed,
  getMatchImageJobSource,
  recoverStaleMatchImageJobs,
  rescheduleOrFailMatchImageJob,
  updateMatchImageJobProgress,
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
          "اطلاعات اولیه مچ برای تولید تصویر پیدا نشد",
        );
      }
      let model;
      try {
        model = buildLocalReplayImageModel(source.rawData, source.localReplayData, source.steamAccountId);
      } catch (error) {
        if (error instanceof MatchImageError && error.code === "image_local_analysis_not_ready" &&
          (source.replayJobStatus === "pending" || source.replayJobStatus === "processing")) {
          await deferMatchImageJobUntilReplayParsed(job);
          jobs.push({ id: job.id, matchId: job.matchId, dotaMatchId: String(source.dotaMatchId), status: "waiting_for_parse", attempts: job.attempts });
          continue;
        }
        throw error;
      }
      const artifacts = await renderGeneratedMatchImages(model, { onProgress: (progress) => updateMatchImageJobProgress(job, { stage: "rendering", ...progress }) });
      await updateMatchImageJobProgress(job, { stage: "uploading", currentImage: 1, completedImages: 0 });
      const images = await publishGeneratedMatchImages(job.matchId, artifacts, (progress) => updateMatchImageJobProgress(job, { stage: "uploading", ...progress }));
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
