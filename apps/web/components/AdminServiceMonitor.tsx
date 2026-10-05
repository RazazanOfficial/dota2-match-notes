"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-service-monitor.module.css";

type Unit = { id: string; properties: Record<string, string>; logs: { at: string | null; priority: number; message: string }[]; error: string | null };
type Monitor = { capturedAt: string | null; units: Unit[]; snapshotError: string | null; stale: boolean;
  queues: { source: string; status: string; total: number }[]; failures: { source: string; at: string; detail: string }[] };
const preview: Monitor = { capturedAt: "2026-09-28T09:15:00Z", stale: false, snapshotError: null,
  units: [
    { id: "dota2notes.service", properties: { ActiveState: "active", SubState: "running", Result: "success", ActiveEnterTimestamp: "Mon 2026-09-28 08:00:00 UTC" }, error: null,
      logs: [{ at: "2026-09-28T09:14:02Z", priority: 6, message: "GET /api/health 200" }] },
    { id: "dota2notes-performance-reference.timer", properties: { ActiveState: "active", SubState: "waiting", NextElapseUSecRealtime: "Mon 2026-09-28 09:16:00 UTC" }, error: null, logs: [] },
    { id: "dota2notes-performance-reference.service", properties: { ActiveState: "inactive", SubState: "dead", Result: "success", ExecMainStatus: "0", ExecMainExitTimestamp: "Mon 2026-09-28 09:14:20 UTC" }, error: null,
      logs: [{ at: "2026-09-28T09:14:20Z", priority: 6, message: '{"enabled":true,"processed":1,"cursor":93}' }] },
    { id: "dota2notes-replay.timer", properties: { ActiveState: "active", SubState: "waiting" }, error: null, logs: [] },
    { id: "dota2notes-replay.service", properties: { ActiveState: "inactive", Result: "success", ExecMainExitTimestamp: "Mon 2026-09-28 09:13:00 UTC" }, error: null, logs: [{ at: "2026-09-28T09:13:00Z", priority: 6, message: '{"processed":0}' }] },
    { id: "nginx.service", properties: { ActiveState: "active", SubState: "running" }, error: null, logs: [] },
    { id: "postgresql.service", properties: { ActiveState: "active", SubState: "exited" }, error: null, logs: [] },
  ], queues: [{ source: "replay", status: "pending", total: 2 }, { source: "replay", status: "completed", total: 85 },
    { source: "images", status: "completed", total: 73 }, { source: "opendota_parse", status: "pending", total: 1 }], failures: [] };
const names: Record<string, string> = { replay: "Replay", images: "Match Images", opendota_parse: "OpenDota Parse", sync: "Journal Sync" };
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString("fa-IR") : "—";
function state(unit: Unit) {
  const p = unit.properties;
  if (unit.error || p.LoadState === "not-found" || p.Result === "failed" || p.ActiveState === "failed") return { label: "خطا", tone: "bad" };
  if (p.ActiveState === "active") return { label: unit.id.endsWith(".timer") ? "فعال · منتظر Tick" : "فعال", tone: "good" };
  if (unit.id.endsWith(".service") && unit.id !== "dota2notes.service" && p.ActiveState === "inactive" && p.Result === "success") return { label: "اجرای قبلی موفق", tone: "good" };
  if (p.LoadState === "not-found") return { label: "نصب نشده", tone: "bad" };
  return { label: p.ActiveState === "inactive" ? "غیرفعال" : p.ActiveState || "نامشخص", tone: "muted" };
}

export default function AdminServiceMonitor({ mock = false }: { mock?: boolean }) {
  const [open, setOpen] = useState(false);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [selected, setSelected] = useState("dota2notes-performance-reference.service");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (mock) { setMonitor(preview); return; }
    const response = await fetch("/api/admin/service-monitor", { cache: "no-store", credentials: "same-origin" });
    const body = await response.json() as { ok?: boolean; monitor?: Monitor; error?: { message?: string } };
    if (!response.ok || !body.ok || !body.monitor) throw new Error(body.error?.message || "گزارش سرویس‌ها دریافت نشد");
    setMonitor(body.monitor); setError("");
  }, [mock]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    void refresh().catch(reason => { if (active) setError(String(reason)); }).finally(() => { if (active) setBusy(false); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh().catch(reason => { if (active) setError(String(reason)); });
    }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open, refresh]);
  const current = monitor?.units.find(unit => unit.id === selected) || monitor?.units[0];
  const logs = current?.logs.filter(log => filter === "all" || (filter === "error" ? log.priority <= 3 : log.priority <= 4)) || [];
  return <section className={`admin-section ${styles.panel}`} aria-label="کنسول وضعیت سرویس‌ها">
    <header className="admin-section-header"><div><p className="week-kicker">SERVICE CONSOLE</p><h2>وضعیت سرویس‌ها و صف‌ها</h2></div>
      <button type="button" className="secondary-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "بستن Console" : "بازکردن Console"}</button></header>
    {!open ? <p>وضعیت و لاگ‌ها پس از بازکردن این بخش بارگذاری می‌شوند.</p> : <div className={styles.console} dir="rtl">
      <div className={styles.toolbar}><span>● DOTA2NOTES / OPS</span><span>آخرین ثبت: {when(monitor?.capturedAt)} {monitor?.stale && <b className={styles.bad}>· گزارش قدیمی</b>}</span>
        <button type="button" disabled={busy} onClick={() => { setBusy(true); void refresh().catch(reason => setError(String(reason))).finally(() => setBusy(false)); }}>{busy ? "در حال دریافت…" : "تازه‌سازی"}</button></div>
      {error && <p role="alert" className={styles.bad}>{error}</p>}
      {monitor?.snapshotError && <p role="alert" className={styles.bad}>{monitor.snapshotError}؛ نصب collector را بررسی کنید.</p>}
      {monitor?.stale && <p className={styles.bad}>اگر بیشتر از ۳ دقیقه از آخرین ثبت گذشته، timer مانیتور را بررسی کنید. اعداد صف‌ها جداگانه از دیتابیس خوانده می‌شوند.</p>}
      {monitor && <><h3>سرویس‌های VPS</h3><div className={styles.grid}>{monitor.units.map(unit => {
        const status = state(unit); return <button type="button" key={unit.id} className={`${styles.card} ${selected === unit.id ? styles.selected : ""}`}
          onClick={() => setSelected(unit.id)} aria-pressed={selected === unit.id}><code dir="ltr">{unit.id}</code><strong className={styles[status.tone]}>{status.label}</strong>
          <small>نتیجه: {unit.properties.Result || "—"} · خروج: {unit.properties.ExecMainStatus || "—"}</small></button>;
      })}</div><h3>صف‌های دیتابیس</h3><div className={styles.queues}>{monitor.queues.map(queue => <span key={`${queue.source}-${queue.status}`}>
        {names[queue.source] || queue.source} <code>{queue.status}</code> <strong>{queue.total.toLocaleString("fa-IR")}</strong></span>)}
        {!monitor.queues.length && <span>کاری در صف‌ها ثبت نشده است.</span>}</div>
        {!!monitor.failures.length && <details><summary>آخرین خطاهای صف</summary><ul>{monitor.failures.map((failure, index) =>
          <li key={index}><b>{names[failure.source] || failure.source}</b> · {when(failure.at)} · <span dir="auto">{failure.detail}</span></li>)}</ul></details>}
        {current && <><div className={styles.logHeader}><h3 dir="ltr">journalctl -u {current.id}</h3><label>نمایش <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">همه</option><option value="warning">Warning + Error</option><option value="error">Error</option></select></label></div>
          <div className={styles.metadata}><span>Active: {current.properties.ActiveState || "—"} / {current.properties.SubState || "—"}</span>
            <span>Last run: {current.properties.ExecMainExitTimestamp || current.properties.ActiveEnterTimestamp || "—"}</span>
            <span>Next tick: {current.properties.NextElapseUSecRealtime || "—"}</span></div>
          {current.error && <p className={styles.bad}>{current.error}</p>}
          <div className={styles.logs} role="log" aria-label={`لاگ ${current.id}`}><div>{logs.length ? logs.map((log, index) =>
            <p key={`${log.at}-${index}`}><time>{when(log.at)}</time> <span className={log.priority <= 3 ? styles.bad : log.priority === 4 ? styles.warn : ""}>[{log.priority <= 3 ? "ERROR" : log.priority === 4 ? "WARN" : "INFO"}]</span> <span dir="auto">{log.message}</span></p>) : <p>برای این سرویس در ۲۴ ساعت اخیر لاگی در گزارش نیست.</p>}</div></div>
          <p className={styles.hint}>حداکثر ۳۵ خط اخیر هر سرویس؛ گزارش هر دقیقه ثبت می‌شود. سرویس‌های one-shot بعد از اجرای موفق به حالت inactive برمی‌گردند. Nginx و PostgreSQL فقط وضعیت دارند.</p></>}
      </>}
    </div>}
  </section>;
}
