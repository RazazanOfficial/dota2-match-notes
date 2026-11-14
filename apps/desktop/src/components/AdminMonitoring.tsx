import { useEffect, useState } from "react";
import { RefreshCw, CircleAlert, Server, ChevronDown, CircleHelp, Clock3, Copy, Check } from "lucide-react";
import type { ReplayMonitorSnapshot } from "@/lib/replay/monitor-types";
import type { Messages } from "../i18n";
import { adminBytes, adminDate, adminNumber, adminStatus, adminText, unitState, useAccountRead, type ServiceMonitor, type MonitorHost, type MonitorUnit, type MonitorState } from "../admin";
import { CopyValue } from "./Shared";
import { AdminReadState } from "./AdminShared";

const serviceInfo: Record<string, { title: string; description: [string, string] }> = {
  "dota2notes.service": { title: "Website", description: ["صفحات وب و صفحهٔ دانلود Dota Notes را روی ایران اجرا می‌کند.", "Serves the Dota Notes website and download page in Iran."] },
  "dota2notes-api.service": { title: "API", description: ["درخواست‌های برنامه را دریافت می‌کند؛ حساب، اطلاعات ذخیره‌شده و درخواست کارها را مدیریت می‌کند.", "Handles application requests, accounts, stored data and job submissions."] },
  "dota2notes-link.service": { title: "Private Link", description: ["اتصال خصوصی SSH بین آلمان و ایران برای دیتابیس و درخواست‌های منتخب API.", "Private SSH connection between Germany and Iran for database access and selected API requests."] },
  "dota2notes-sync-daemon.service": { title: "Match Sync", description: ["دریافت و ثبت مچ‌ها از تقویم، گزارش Companion و بررسی دوره‌ای حساب.", "Fetches and saves matches from calendar requests, Companion reports and periodic account checks."] },
  "dota2notes-replay.service": { title: "Replay Processing", description: ["آماده‌سازی فایل، تحلیل با parser و آپلود آرشیو را در بخش‌های مستقل اجرا می‌کند.", "Runs independent replay preparation, local parsing and archive upload workers."] },
  "dota2notes-images.service": { title: "Image Generation", description: ["سه تصویر نمای کلی، جدول بازیکنان و عملکرد را از تحلیل مچ می‌سازد.", "Creates overview, scoreboard and player performance images from match analysis."] },
  "dota2notes-images.timer": { title: "Image Schedule", description: ["زمان اجرای بررسی صف تولید تصاویر مچ را تعیین می‌کند.", "Schedules checks for queued match image jobs."] },
  "dota2notes-performance-reference.service": { title: "Statistical Reference", description: ["آمار عمومی هیروها و پوزیشن‌ها را از STRATZ دریافت و ذخیره می‌کند.", "Collects and stores public hero and position reference statistics from STRATZ."] },
  "dota2notes-performance-reference.timer": { title: "Reference Schedule", description: ["زمان اجرای دستهٔ بعدی دریافت مرجع آماری را تعیین می‌کند؛ خاموشی عمدی خطا نیست.", "Schedules the next reference collection batch. Intentional disabling is not a failure."] },
  "dota2notes-monitor.service": { title: "Service Monitor", description: ["وضعیت سرویس‌ها و لاگ‌های اخیر همین میزبان را برای این صفحه ثبت می‌کند.", "Captures this host's service states and recent logs for this page."] },
  "dota2notes-monitor.timer": { title: "Monitor Schedule", description: ["زمان تازه‌سازی گزارش وضعیت این میزبان را تعیین می‌کند.", "Schedules this host's service snapshot refresh."] },
  "nginx.service": { title: "Nginx", description: ["درخواست‌های دامنه را به وب‌سایت یا API می‌رساند و فایل‌های عمومی را ارائه می‌کند.", "Routes domain requests to the website or API and serves public assets."] },
  "postgresql.service": { title: "PostgreSQL", description: ["دیتابیس اصلی پروژه در ایران؛ روشن بودن unit به‌تنهایی سلامت queryها را ثابت نمی‌کند.", "The primary database in Iran. An active unit alone does not establish query health."] },
};
const stateLabels: Record<MonitorState, string> = { running: "Running", waiting: "Waiting", idle: "Idle", disabled: "Disabled", failed: "Failed", stopped: "Stopped", stale: "Stale", retrying: "Retrying", unknown: "Unknown" };
const stageTitles = { prepare: "File Preparation", parse: "Local Parser", archive: "Archive Upload" };
const hostTitle = (id: MonitorHost["id"]) => id === "iran" ? "Iran VPS" : "Germany VPS";
const snapshotStale = (host: MonitorHost, now: number) => host.stale || !!host.snapshotError || !host.capturedAt || !Number.isFinite(Date.parse(host.capturedAt)) || now - Date.parse(host.capturedAt) > 180_000 || Date.parse(host.capturedAt) > now + 60_000;
function countdown(value: string | undefined, now: number) {
  const next = Date.parse(value || "");
  if (!Number.isFinite(next)) return "—";
  const seconds = Math.max(0, Math.ceil((next - now) / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}` : `${minutes}:${String(seconds % 60).padStart(2,"0")}`;
}
function monitorHosts(monitor: ServiceMonitor): MonitorHost[] {
  const available = monitor.hosts?.length ? monitor.hosts : [{ id: "germany" as const, label: "Germany VPS", capturedAt: monitor.capturedAt, stale: monitor.stale, snapshotError: monitor.snapshotError, units: monitor.units }];
  return (["iran", "germany"] as const).map(id => {
    const host = available.find(item => item.id === id);
    return host || { id, label: hostTitle(id), capturedAt: null, stale: true, snapshotError: null, units: [] };
  });
}
function ServiceLogs({ unit, target, t }: { unit: MonitorUnit; target?: MonitorUnit; t: Messages }) {
  const [filter, setFilter] = useState("all");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const source = unit;
  const execution = unit.id.endsWith(".timer") && target ? target : unit;
  const logs = source.logs.filter(log => filter === "all" || log.priority <= (filter === "error" ? 3 : 4));
  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(logs.map(log => `${log.at || "—"} [${log.priority <= 3 ? "ERROR" : log.priority === 4 ? "WARN" : "INFO"}] ${log.message}`).join("\n"));
      setCopyState("copied");
    } catch { setCopyState("error"); }
  }
  return <div className="service-expanded">
    <div className="service-terminal-heading"><span className="terminal-dots" aria-hidden="true"><i/><i/><i/></span><code dir="ltr">{source.id}</code><div className="service-log-actions"><select aria-label={adminText(t,"فیلتر لاگ","Log filter")} value={filter} onChange={event=>{setFilter(event.target.value);setCopyState("idle");}}><option value="all">{t.all}</option><option value="warning">Warning + Error</option><option value="error">Error</option></select><button className="service-copy" onClick={copyLogs} disabled={!logs.length}>{copyState === "copied" ? <Check size={14}/> : <Copy size={14}/>} {adminText(t,"کپی لاگ","Copy logs")}</button></div></div>
    <p className="sr-only" role="status">{copyState === "copied" ? t.copied : copyState === "error" ? t.copyError : ""}</p>
    <dl className="service-facts"><div><dt>{adminText(t,"آخرین شروع","Last started")}</dt><dd>{adminDate(execution.properties.ExecMainStartTimestamp || execution.properties.ActiveEnterTimestamp,t)}</dd></div><div><dt>{adminText(t,"آخرین پایان","Last finished")}</dt><dd>{adminDate(execution.properties.ExecMainExitTimestamp,t)}</dd></div><div><dt>{adminText(t,"نتیجهٔ آخرین اجرا","Last result")}</dt><dd dir="ltr">{execution.properties.ExecMainExitTimestamp ? `${execution.properties.Result || "Unknown"} · Exit ${execution.properties.ExecMainStatus || "—"}` : "—"}</dd></div><div><dt>{adminText(t,"وضعیت ثبت‌شده","Recorded state")}</dt><dd dir="ltr">{unit.properties.ActiveState || "Unknown"} / {unit.properties.SubState || "Unknown"}</dd></div></dl>
    {(unit.error || source.error) && <p className="service-detail-warning">{unit.error || source.error}</p>}
    <div className="service-terminal" role="log" aria-label={`${adminText(t,"لاگ","Logs")} ${source.id}`}>{logs.length ? logs.map((log,index)=><div key={`${log.at}:${index}`} className={log.priority <= 3 ? "log-error" : log.priority === 4 ? "log-warning" : ""}><time>{adminDate(log.at,t)}</time><b>{log.priority <= 3 ? "ERROR" : log.priority === 4 ? "WARN" : "INFO"}</b><span dir="auto">{log.message}</span></div>) : <p>{adminText(t,"لاگی در این گزارش ثبت نشده است.","No log entries in this snapshot.")}</p>}</div>
  </div>;
}
function ServiceCard({ unit, host, now, t, open, toggle }: { unit: MonitorUnit; host: MonitorHost; now: number; t: Messages; open: boolean; toggle: () => void }) {
  const info = serviceInfo[unit.id], timer = unit.id.endsWith(".timer");
  const target = host.units.find(item => item.id === (unit.properties.TargetUnit || unit.id.replace(/\.timer$/, ".service")));
  const stale = snapshotStale(host,now);
  const state = unitState(unit,{now,stale,target});
  const descriptionId = `help-${host.id}-${unit.id.replaceAll(".","-")}`;
  const detailsId = `details-${host.id}-${unit.id.replaceAll(".","-")}`;
  const next = timer && state !== "disabled" && !stale ? unit.properties.NextRunAt : undefined;
  return <article className={`service-entry monitor-state-${state} ${open ? "is-open" : ""}`}>
    <button className="service-card-trigger" aria-expanded={open} aria-controls={detailsId} onClick={toggle}>
      <span className="service-card-title"><Server size={16}/><strong dir="ltr">{info.title}</strong></span>
      <code className="service-command" dir="ltr">{unit.id}</code>
      <span className="service-card-bottom"><span className="service-status" dir="ltr"><i/>{stateLabels[state]}</span><ChevronDown size={16} className="service-chevron"/></span>
      {timer && <span className="service-timer-summary"><span>{adminText(t,"اجرای بعدی","Next run")} <bdi>{adminDate(next,t)}</bdi></span><strong dir="ltr">{countdown(next,now)}</strong></span>}
    </button>
    <span className="service-help"><button aria-label={adminText(t,`دربارهٔ ${info.title}`,`About ${info.title}`)} aria-describedby={descriptionId}><CircleHelp size={17}/></button><span id={descriptionId} role="tooltip">{adminText(t,...info.description)}</span></span>
    {open && <div id={detailsId} className="service-details">
      {timer && <dl className="service-facts service-schedule-facts"><div><dt>{adminText(t,"برنامهٔ اجرا","Schedule")}</dt><dd dir="ltr">{unit.properties.Schedule || "Unknown"}</dd></div><div><dt>{adminText(t,"آخرین فراخوانی","Last triggered")}</dt><dd>{adminDate(unit.properties.LastTriggerUSec,t)}</dd></div><div><dt>{adminText(t,"اجرای بعدی","Next run")}</dt><dd>{adminDate(next,t)}</dd></div></dl>}
      {(state === "unknown" || state === "stale") && <p className="service-detail-warning">{state === "stale" ? adminText(t,"گزارش تازه نداریم؛ وضعیت فعلی قابل تأیید نیست.","The snapshot is stale; the current state cannot be confirmed.") : adminText(t,"اطلاعات کافی برای تأیید وضعیت یا موعد بعدی موجود نیست.","There is not enough information to confirm the state or next run.")}</p>}
      <ServiceLogs unit={unit} target={target} t={t}/>
    </div>}
  </article>;
}
export function AdminServices({ t }: {t:Messages}) {
  const read = useAccountRead<{monitor:ServiceMonitor}>("/api/admin/service-monitor",true,30000);
  const monitor = read.data?.monitor;
  const [expanded,setExpanded] = useState<string | null>(null), [now,setNow] = useState(Date.now);
  useEffect(()=>{
    const update = () => { if (document.visibilityState !== "hidden") setNow(Date.now()); };
    const timer = window.setInterval(update,1000);
    document.addEventListener("visibilitychange",update);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",update);};
  },[]);
  const hosts = monitor ? monitorHosts(monitor).map(host=>({...host,units:host.units.filter(unit=>serviceInfo[unit.id] && (host.id !== "germany" || !["dota2notes.service","nginx.service","postgresql.service"].includes(unit.id)))})) : [];
  return <div className="screen-stack service-monitor-screen">
    <div className="admin-toolbar"><p className="muted service-monitor-intro">{adminText(t,"وضعیت هر سرور و اجرای واقعی کارها؛ گزارش‌ها هر دقیقه ثبت می‌شوند.","Host status and actual work. Service snapshots refresh every minute.")}</p><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button></div>
    <AdminReadState error={read.error} busy={read.busy} hasData={!!monitor} t={t}/>
    {monitor && <>{(monitor.stale || monitor.snapshotError) && <div className="admin-warning" role="status"><CircleAlert size={18}/><p>{adminText(t,"گزارش وضعیت سرویس‌ها تازه نیست؛ timer مانیتور را بررسی کن. آمار صف‌ها جداگانه از دیتابیس دریافت شده است.","The service snapshot is unavailable or stale. Check the monitor timer. Queue totals were read separately from the database.")}</p></div>}
      {(["services","timers"] as const).map(section=><section key={section} className="panel service-section"><header className="service-section-heading"><h2 dir="ltr">{section === "services" ? <Server size={19}/> : <Clock3 size={19}/>} {section === "services" ? "Services" : "Timers"}</h2></header><div className="service-hosts">{hosts.map(host=>{
        const units = host.units.filter(unit=>unit.id.endsWith(section === "timers" ? ".timer" : ".service"));
        const stale = snapshotStale(host,now);
        return <section key={host.id} className="service-host"><header className="service-host-heading"><h3 dir="ltr">{hostTitle(host.id)}</h3><span className={`service-host-snapshot ${stale ? "is-stale" : ""}`}><i/>{adminText(t,"گزارش","Snapshot")}: {adminDate(host.capturedAt,t)}</span></header>{host.snapshotError && <p className="service-detail-warning" role="status">{host.snapshotError}</p>}{units.length ? <div className="service-card-grid">{units.map(unit=><ServiceCard key={unit.id} unit={unit} host={host} now={now} t={t} open={expanded === `${host.id}:${unit.id}`} toggle={()=>setExpanded(current=>current === `${host.id}:${unit.id}` ? null : `${host.id}:${unit.id}`)}/>)}</div> : <p className="service-empty">{!host.capturedAt ? adminText(t,"گزارش این سرور هنوز در دسترس نیست.","This host's snapshot is not available yet.") : adminText(t,"موردی برای این سرور تعریف نشده است.","No units are assigned to this host.")}</p>}</section>;
      })}</div></section>)}
      {!!monitor.stages?.length && <section className="panel service-section"><h2 dir="ltr">Replay Stages</h2><div className="service-stage-grid">{monitor.stages.map(stage=><div key={stage.id}><strong dir="ltr">{stageTitles[stage.id]}</strong><dl><div><dt>{adminText(t,"در حال اجرا","Active")}</dt><dd>{adminNumber(stage.active,t)}</dd></div><div><dt>{adminText(t,"در صف","Queued")}</dt><dd>{adminNumber(stage.pending,t)}</dd></div><div><dt>{adminText(t,"ناموفق","Failed")}</dt><dd>{stage.failed == null ? "—" : adminNumber(stage.failed,t)}</dd></div></dl></div>)}</div></section>}
      <section className="panel account-section"><h2>{adminText(t,"صف‌های پردازش","Processing queues")}</h2><div className="admin-queue-grid">{monitor.queues.map(q=><div className="queue-count" key={`${q.source}:${q.status}`}><span>{q.source === "replay_archive" ? adminText(t,"آرشیو مستقل ریپلی","Independent replay archive") : q.source} · {adminStatus(q.status,t)}</span><strong>{adminNumber(q.total,t)}</strong></div>)}</div>{!!monitor.failures.length && <details className="admin-disclosure"><summary>{adminText(t,"آخرین خطاهای صف","Recent queue failures")}</summary><div className="admin-event-list">{monitor.failures.map((failure,index)=><div key={index}><b>{failure.source}</b><time>{adminDate(failure.at,t)}</time><code>{failure.detail}</code></div>)}</div></details>}</section>
    </>}
  </div>;
}
export function AdminReplayMonitor({ t }: {t:Messages}) {
  const [query,setQuery] = useState(""), [selected,setSelected] = useState("");
  const read = useAccountRead<{monitor:ReplayMonitorSnapshot}>(`/api/admin/replay-monitor${selected ? `?matchId=${encodeURIComponent(selected)}` : ""}`,true,5000);
  const m = read.data?.monitor;
  return <div className="screen-stack"><div className="admin-toolbar"><form className="admin-inline-form" onSubmit={event=>{event.preventDefault();setSelected(query.trim());}}><input aria-label={t.matchId} inputMode="numeric" pattern="[0-9]+" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t.matchId}/><button className="secondary-button">{t.search}</button>{selected && <button type="button" className="secondary-button" onClick={()=>{setQuery("");setSelected("");}}>{t.all}</button>}</form><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button></div><AdminReadState error={read.error} busy={read.busy} hasData={!!m} t={t}/>
    {m && <><section className="panel account-section"><div className="section-heading"><h2>{adminText(t,"دانلود و پردازش ریپلی","Replay transfer & processing")}</h2><time>{adminDate(m.capturedAt,t)}</time></div><div className="admin-queue-grid">{m.totals.map(total=><div className="queue-count" key={total.status}><span>{adminStatus(total.status,t)}</span><strong>{total.count}</strong></div>)}</div><p className="muted">{adminText(t,"دریافت ثبت‌شده","Recorded transfer")}: <bdi>{adminBytes(m.totals.reduce((n,item)=>n+Number(item.transfer_bytes),0))}</bdi> · {adminText(t,"آپلود ثبت‌شده","Recorded upload")}: <bdi>{adminBytes(m.totals.reduce((n,item)=>n+Number(item.upload_bytes),0))}</bdi></p>
    <div className="admin-table-scroll"><table className="admin-data-table"><thead><tr><th>{t.matchId}</th><th>{adminText(t,"مرحله","Stage")}</th><th>{adminText(t,"پیشرفت","Progress")}</th><th>{adminText(t,"سرعت","Speed")}</th><th>{adminText(t,"تلاش","Attempt")}</th><th>{adminText(t,"آرشیو","Archive")}</th><th>{adminText(t,"تلاش بعدی","Next retry")}</th></tr></thead><tbody>{m.jobs.map(job=><tr key={job.match_id}><td><CopyValue value={job.match_id} t={t}/><button className="secondary-button" onClick={()=>{setQuery(job.match_id);setSelected(job.match_id);}}>{t.details}</button></td><td><span className={`admin-status state-${job.status}`}>{adminStatus(job.phase,t)}</span><small>{job.intent} · {adminStatus(job.status,t)}</small></td><td><progress aria-label={`${t.analysisDownload} ${job.match_id}`} max={Number(job.total_bytes)||1} value={Number(job.total_bytes) ? Number(job.downloaded_bytes) : 0}/><bdi>{adminBytes(job.downloaded_bytes)} / {adminBytes(job.total_bytes)}</bdi></td><td><bdi>{job.phase === "downloading" ? `${adminBytes(job.download_bps)}/s` : "—"}</bdi></td><td>{job.attempts}</td><td>{job.archive_status}</td><td>{job.status === "pending" ? adminDate(job.run_after,t) : "—"}</td></tr>)}</tbody></table></div>
    {m.jobs.map(job=><details className="admin-disclosure" key={job.match_id}><summary>{job.match_id} · {t.details}</summary><dl className="account-facts">{[[adminText(t,"آخرین فعالیت","Heartbeat"),job.heartbeat_at],[adminText(t,"شروع مرحله","Stage started"),job.phase_started_at],[adminText(t,"مهلت تلاش","Retry deadline"),job.retry_deadline_at]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{adminDate(value,t)}</dd></div>)}</dl><p>{adminText(t,"فایل موقت کامل","Complete spool")}: {job.spool_complete ? "✓" : "—"}</p><p><code>{job.error_code} {job.error_message}</code></p><p><bdi>{job.last_endpoint} {job.last_address}</bdi></p></details>)}</section>
    <section className="panel account-section"><h2>{adminText(t,"مسیرهای اتصال","Connection routes")}</h2><div className="admin-event-list">{m.routes.map(route=><div key={`${route.endpoint}:${route.address}`}><bdi>{route.endpoint} · {route.address}</bdi><span>{adminText(t,"خطاها","Failures")}: {route.failures}</span><time>{adminDate(route.last_success_at,t)}</time><code>{route.last_error_code || "—"}</code>{route.open_until && <span>{adminText(t,"توقف تا","Paused until")}: {adminDate(route.open_until,t)}</span>}</div>)}</div></section>
    <section className="panel account-section"><h2>{adminText(t,"رویدادهای اخیر","Recent events")}</h2><div className="admin-log" role="log">{m.events.map((event,index)=><p key={index}><time>{adminDate(event.created_at,t)}</time><CopyValue value={event.match_id} t={t}/><code>{event.phase} · {event.code}</code><span>{event.detail}</span>{event.endpoint && <bdi>{event.endpoint} @ {event.address}</bdi>}{event.http_status && <span>HTTP {event.http_status}</span>}</p>)}</div><small className="muted">{adminText(t,"۵۰ کار اخیر و حداکثر ۱۰۰ رویداد؛ دریافت وضعیت فقط در این تب فعال است.","50 recent jobs and up to 100 events. Polling runs only while this tab is visible.")}</small></section></>}
  </div>;
}
