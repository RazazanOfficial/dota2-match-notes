"use client";
import { useState } from "react";
import AdminReplayMonitor from "./AdminReplayMonitor";
import ReplayProgressView from "./ReplayProgressView";
import { replayPhaseLabels, type ReplayProgress } from "@/lib/replay/progress";
import styles from "./replay-progress.module.css";
export default function ReplayResilienceMock() {
  const [phase, setPhase] = useState("downloading");
  const [metadataPending, setMetadataPending] = useState(false);
  const progress: ReplayProgress = { phase, bytes: 33554432, totalBytes: 83886080, bytesPerSecond: 2097152, attempts: 2,
    phaseStartedAt: new Date(Date.now() - 25000).toISOString(), heartbeatAt: new Date().toISOString(),
    nextTryAt: new Date(Date.now() + 90000).toISOString(), retryDeadlineAt: new Date(Date.now() + 3600000).toISOString(),
    errorCode: phase === "failed" ? "replay_retry_exhausted" : phase === "retry_wait" ? metadataPending ? "replay_metadata_pending" : "replay_headers_timeout" : null };
  return <main className={styles.mock} dir="rtl"><h1>پیش‌نمایش وضعیت Replay</h1><p>این صفحه دادهٔ نمایشی دارد و هیچ دانلود یا درخواست واقعی ثبت نمی‌کند.</p>
    <div className={styles.console}>{Object.entries(replayPhaseLabels).map(([key,label]) => <button key={key} onClick={() => { setPhase(key); setMetadataPending(false); }} aria-pressed={phase === key && !metadataPending}>{label}</button>)}
      <button onClick={() => { setPhase("retry_wait"); setMetadataPending(true); }} aria-pressed={phase === "retry_wait" && metadataPending}>اطلاعات Replay هنوز آماده نیست</button></div>
    <ReplayProgressView progress={progress} /><AdminReplayMonitor mock /></main>;
}
