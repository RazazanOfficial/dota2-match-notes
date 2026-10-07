"use client";
import { useEffect, useState } from "react";
import type { ReplayMonitorSnapshot } from "@/lib/replay/monitor-types";
import { replayPhaseLabels } from "@/lib/replay/progress";
import styles from "./replay-progress.module.css";
const size = (v: string | number | null) => v === null ? "—" : `${(Number(v) / 1048576).toFixed(1)} MB`;
const when = (v: string | null) => v ? new Date(v).toLocaleString("fa-IR", { hourCycle: "h23" }) : "—";
export const replayMonitorPreview: ReplayMonitorSnapshot = {
  capturedAt: "2026-09-29T06:00:00Z",
  jobs: [{ match_id: "9019098197", status: "processing", intent: "analysis", phase: "downloading", attempts: 2,
    downloaded_bytes: "33554432", total_bytes: "83886080", download_bps: 2097152, transfer_bytes: "35651584", upload_bytes: "0",
    archive_status: "missing", spool_complete: false, error_code: null, error_message: null,
    last_endpoint: "https://relay-backup.example.org", last_address: "188.114.99.0", heartbeat_at: "2026-09-29T06:00:00Z",
    phase_started_at: "2026-09-29T05:59:44Z", run_after: "2026-09-29T05:59:20Z", retry_deadline_at: "2026-09-30T05:00:00Z" }],
  routes: [{ endpoint: "https://relay.example.org", address: "104.21.28.26", failures: 3, open_until: "2026-09-29T06:02:00Z", last_success_at: null, last_error_code: "replay_headers_timeout" },
    { endpoint: "https://relay-backup.example.org", address: "188.114.99.0", failures: 0, open_until: null, last_success_at: "2026-09-29T05:55:00Z", last_error_code: null }],
  events: [{ match_id: "9019098197", phase: "connecting", code: "route_attempt", detail: "Attempt 2; switching to the next relay route", endpoint: "https://relay-backup.example.org", address: "188.114.99.0", created_at: "2026-09-29T05:59:44Z", http_status: null },
    { match_id: "9019098197", phase: "connecting", code: "replay_headers_timeout", detail: "Relay response headers timed out", endpoint: "https://relay.example.org", address: "104.21.28.26", created_at: "2026-09-29T05:59:43Z", http_status: null }],
  totals: [{ status: "completed", count: "86", transfer_bytes: "5127536640", upload_bytes: "5012676608" }, { status: "processing", count: "1", transfer_bytes: "35651584", upload_bytes: "0" }],
};
export default function AdminReplayMonitor({ mock = false }: { mock?: boolean }) {
  const [open, setOpen] = useState(false);
  const [monitor, setMonitor] = useState<ReplayMonitorSnapshot | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!open) return;
    if (mock) { setMonitor(replayMonitorPreview); return; }
    const controller = new AbortController(); let timer: number;
    const poll = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const response = await fetch(`/api/admin/replay-monitor${selected ? `?matchId=${selected}` : ""}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const body = await response.json() as { ok?: boolean; monitor?: ReplayMonitorSnapshot; error?: { message?: string } };
        if (!response.ok || !body.monitor) throw new Error(body.error?.message || "دریافت وضعیت Replay ممکن نیست");
        if (!controller.signal.aborted) { setMonitor(body.monitor); setError(""); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "خطای اتصال"); }
      finally { if (!controller.signal.aborted) timer = window.setTimeout(() => void poll(), 5000); }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, mock, selected, refresh]);
  const current = monitor?.jobs.find(j => j.match_id === selected);
  return <section className={styles.console} dir="rtl" aria-label="کنسول Replay">
    <header className={styles.toolbar}><div><strong>REPLAY / TRANSFER CONSOLE</strong><p className={styles.muted}>مسیر اتصال، پیشرفت دانلود و آخرین تلاش‌ها</p></div>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? "بستن" : "باز کردن کنسول Replay"}</button></header>
    {!open ? <p className={styles.muted}>اطلاعات پس از باز کردن این بخش دریافت می‌شود.</p> : <>
      <div className={styles.toolbar}><span className={styles.muted}>آخرین دریافت: {when(monitor?.capturedAt || null)}</span><button onClick={() => setRefresh(v => v + 1)}>تازه‌سازی</button></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!monitor && !error && <p>در حال دریافت وضعیت…</p>}
      {monitor && <>
        <p className={styles.muted}>{monitor.totals.map(t => `${t.status}: ${t.count}`).join(" · ")}</p>
        <p className={styles.muted}>دریافت ثبت‌شده: <span dir="ltr">{size(monitor.totals.reduce((s,t) => s + Number(t.transfer_bytes), 0))}</span> · آپلود ثبت‌شده: <span dir="ltr">{size(monitor.totals.reduce((s,t) => s + Number(t.upload_bytes), 0))}</span><br />از زمان نصب این پچ؛ شمارش بایت در برنامه است و معادل صورتحساب شرکت VPS نیست.</p>
        <div className={styles.scroll}><table><thead><tr><th>Match</th><th>مرحله</th><th>حجم</th><th>سرعت</th><th>نوبت</th><th>آرشیو</th><th>تلاش بعدی</th></tr></thead><tbody>
          {monitor.jobs.map(j => <tr key={j.match_id}><td><button onClick={() => setSelected(j.match_id)} aria-pressed={selected === j.match_id}>{j.match_id}</button></td>
            <td>{replayPhaseLabels[j.phase] || j.phase}<br /><small>{j.intent} / {j.status}</small></td><td dir="ltr">{size(j.downloaded_bytes)} / {size(j.total_bytes)}</td>
            <td dir="ltr">{j.phase === "downloading" ? `${size(j.download_bps)}/s` : "—"}</td><td>{j.attempts}</td><td>{j.archive_status}</td><td>{j.status === "pending" ? when(j.run_after) : "—"}</td></tr>)}
        </tbody></table></div>
        {current && <p className={styles.muted}>مچ {current.match_id} · آخرین فعالیت: {when(current.heartbeat_at)} · شروع مرحله: {when(current.phase_started_at)}<br />فایل کامل موقت: {current.spool_complete ? "موجود" : "خیر"} · پایان مهلت retry: {when(current.retry_deadline_at)}<br /><code dir="ltr">{current.error_code} {current.error_message}</code></p>}
        <h3>مسیرها</h3>{!monitor.routes.length && <p className={styles.muted}>هنوز نتیجهٔ اتصال ثبت نشده است.</p>}
        {monitor.routes.map(r => <div className={styles.route} key={`${r.endpoint}|${r.address}`}><code dir="ltr">{r.endpoint} → {r.address}</code><span className={styles.muted}>خطاهای متوالی: {r.failures} · توقف تا: {when(r.open_until)} · آخرین موفقیت: {when(r.last_success_at)}</span><code>{r.last_error_code}</code></div>)}
        <div className={styles.toolbar}><h3>آخرین رویدادها {selected && `· ${selected}`}</h3>{selected && <button onClick={() => setSelected("")}>همهٔ مچ‌ها</button>}</div>
        <pre dir="ltr">{monitor.events.length ? monitor.events.map(e => `${e.created_at} #${e.match_id} [${e.phase}] ${e.code || ""}\n${e.detail}${e.address ? ` | ${e.endpoint} @ ${e.address}` : ""}${e.http_status ? ` | HTTP ${e.http_status}` : ""}`).join("\n\n") : "No events recorded."}</pre>
        <p className={styles.muted}>۵۰ کار اخیر و حداکثر ۱۰۰ رویداد؛ رویدادها ۳۰ روز نگهداری می‌شوند. با بستن کنسول یا پنهان شدن صفحه، دریافت وضعیت متوقف می‌شود.</p>
      </>}
    </>}
  </section>;
}
