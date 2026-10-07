import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matchImageJobs, openDotaParseJobs } from "@/lib/db/schema";

type ActiveJob = { id: string; matchId: string; status: "pending" | "processing"; runAfter: Date; createdAt: Date };

function activeOrder(left: ActiveJob, right: ActiveJob) {
  if (left.status !== right.status) return left.status === "processing" ? -1 : 1;
  return left.runAfter.getTime() - right.runAfter.getTime() || left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);
}

function seconds(value: number) {
  return Math.max(10, Math.min(600, Math.round(value)));
}

export async function getMatchPreparationProgress(matchId: string) {
  const db = getDb();
  const [parseRows, imageRows, durations, parseTarget, imageTarget] = await Promise.all([
    db.select({ id: openDotaParseJobs.id, matchId: openDotaParseJobs.matchId, status: openDotaParseJobs.status, runAfter: openDotaParseJobs.runAfter, createdAt: openDotaParseJobs.createdAt }).from(openDotaParseJobs).where(inArray(openDotaParseJobs.status, ["pending", "processing"])),
    db.select({ id: matchImageJobs.id, matchId: matchImageJobs.matchId, status: matchImageJobs.status, runAfter: matchImageJobs.runAfter, createdAt: matchImageJobs.createdAt }).from(matchImageJobs).where(inArray(matchImageJobs.status, ["pending", "processing"])),
    db.select({ startedAt: matchImageJobs.startedAt, finishedAt: matchImageJobs.finishedAt }).from(matchImageJobs).where(and(eq(matchImageJobs.status, "completed"), isNotNull(matchImageJobs.startedAt), isNotNull(matchImageJobs.finishedAt))).orderBy(desc(matchImageJobs.finishedAt)).limit(50),
    db.select().from(openDotaParseJobs).where(eq(openDotaParseJobs.matchId, matchId)).limit(1),
    db.select().from(matchImageJobs).where(eq(matchImageJobs.matchId, matchId)).limit(1),
  ]);
  const parseJob = parseTarget[0]; const imageJob = imageTarget[0];
  const active = (parseJob && (parseJob.status === "pending" || parseJob.status === "processing") ? parseRows : imageRows).map((job) => ({ ...job, status: job.status as "pending" | "processing" })).sort(activeOrder);
  const targetActive = active.find((job) => job.matchId === matchId);
  const samples = durations.flatMap((row) => row.startedAt && row.finishedAt ? [(row.finishedAt.getTime() - row.startedAt.getTime()) / 1_000] : []).filter((value) => value > 0 && value < 1_800).sort((left, right) => left - right);
  const medianImageSeconds = samples.length ? seconds(samples[Math.floor(samples.length / 2)]) : null;
  const position = targetActive ? active.findIndex((job) => job.id === targetActive.id) + 1 : null;
  const elapsed = imageJob?.status === "processing" && imageJob.startedAt ? Math.max(0, (Date.now() - imageJob.startedAt.getTime()) / 1_000) : 0;
  const imageEtaSeconds = imageJob && medianImageSeconds && (imageJob.status === "pending" || imageJob.status === "processing") ? seconds(imageJob.status === "processing" ? medianImageSeconds - elapsed : medianImageSeconds * Math.max(1, position || 1)) : null;
  return {
    status: parseJob?.status === "failed" || imageJob?.status === "failed" ? "failed" as const : parseJob && (parseJob.status === "pending" || parseJob.status === "processing") ? "analysis" as const : imageJob?.status === "completed" ? "ready" as const : imageJob ? "images" as const : "idle" as const,
    position,
    analysis: parseJob ? { status: parseJob.status, pollAttempts: parseJob.pollAttempts, updatedAt: parseJob.updatedAt.toISOString(), errorCode: parseJob.errorCode } : null,
    images: imageJob ? { status: imageJob.status, stage: imageJob.progressStage, currentImage: imageJob.currentImage, completedImages: imageJob.completedImages, expectedImages: imageJob.expectedImages, estimatedSeconds: imageEtaSeconds, sampleSize: samples.length, updatedAt: imageJob.updatedAt.toISOString(), errorCode: imageJob.errorCode } : null,
  };
}
