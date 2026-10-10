import { useState } from "react";
import { Activity, Archive, Database, Film, Newspaper, RefreshCw, ShieldCheck, Users, Gauge } from "lucide-react";
import type { Session } from "@/lib/types";
import type { Messages } from "../i18n";
import { adminDate, adminNumber, adminText, useAccountRead, type AdminOverview } from "../admin";
import { AdminReadState } from "./AdminShared";
import { ErrorNotice } from "./ErrorNotice";
import { AdminUsers } from "./AdminUsers";
import { AdminServices, AdminReplayMonitor } from "./AdminMonitoring";
import { AdminReferences, AdminArchive, AdminReleases } from "./AdminResources";
import { CopyValue } from "./Shared";

type Tab = "overview" | "users" | "services" | "replay" | "references" | "releases" | "archive";
export function Admin({ session, t, live }: { session: Session; t: Messages; live: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  if (!session.isSuperAdmin) return <ErrorNotice code="super_admin_required" t={t}/>;
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id:"overview", label:t.overview, icon:Gauge }, { id:"users", label:adminText(t,"کاربران","Users"), icon:Users },
    { id:"services", label:adminText(t,"سرویس‌ها","Services"), icon:Activity }, { id:"replay", label:adminText(t,"صف ریپلی","Replay queue"), icon:Film },
    { id:"references", label:adminText(t,"مرجع آماری","References"), icon:Database }, { id:"releases", label:adminText(t,"انتشارها","Releases"), icon:Newspaper },
    { id:"archive", label:adminText(t,"آرشیو","Archive"), icon:Archive },
  ];
  return <div className="screen-stack admin-screen"><div className="page-heading"><div className="admin-title"><ShieldCheck size={25}/><h1>{t.admin}</h1></div><span className="account-access">Super Admin</span></div>
    <div className="admin-tabs" role="tablist" aria-label={t.admin}>{tabs.map(({ id,label,icon:Icon })=><button key={id} role="tab" id={`admin-tab-${id}`} aria-controls={`admin-panel-${id}`} aria-selected={tab === id} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>
    <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`}>
    {!live ? <section className="panel account-section"><p>{t.offlineAction}</p></section> : <>
      {tab === "overview" && <AdminSummary t={t}/>}{tab === "users" && <AdminUsers t={t}/>}
      {tab === "services" && <AdminServices t={t}/>}{tab === "replay" && <AdminReplayMonitor t={t}/>}
      {tab === "references" && <AdminReferences t={t}/>}{tab === "releases" && <AdminReleases t={t}/>}{tab === "archive" && <AdminArchive t={t}/>}
    </>}</div>
  </div>;
}
function AdminSummary({ t }: { t: Messages }) {
  const [range,setRange] = useState(30);
  const read = useAccountRead<{ overview: AdminOverview }>(`/api/admin/overview?range=${range}`, true, 30000);
  const o = read.data?.overview;
  return <div className="screen-stack"><div className="admin-toolbar"><div className="segmented">{[7,30,90].map(days=><button key={days} aria-pressed={range === days} className={range === days ? "active" : ""} onClick={()=>setRange(days)}>{adminNumber(days,t)} {t.day}</button>)}</div><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button></div>
    <AdminReadState error={read.error} busy={read.busy} hasData={!!o} t={t}/>
    {o && <><div className="admin-metrics">{[
      [adminText(t,"کاربران","Users"),o.counts.users], [adminText(t,"نشست‌های فعال","Active sessions"),o.counts.activeSessions],
      [t.matches,o.counts.journalMatches], [adminText(t,"مچ‌های کش‌شده","Cached matches"),o.counts.cachedDotaMatches],
      [adminText(t,"کاربران امروز","New users today"),o.counts.newUsersToday], [adminText(t,"تحلیل‌های امروز","Analyses today"),o.counts.analyzedMatchesToday],
      [adminText(t,"کاربران واردشده","Users with sign-in"),o.counts.usersWithLogin], [adminText(t,"ادمین‌های دیتابیس","Database admins"),o.counts.databaseAdmins],
      [t.images,o.counts.generatedImages], [adminText(t,"حجم تصاویر / MB","Image storage / MB"),o.counts.generatedImageBytes / 1048576],
      [adminText(t,"رویدادهای مدیریتی","Audit records"),o.counts.adminAuditLogs],
    ].map(([label,value])=><article className="panel" key={String(label)}><span>{label}</span><strong>{adminNumber(Number(value),t)}</strong></article>)}</div>
    <section className="panel account-section"><h2>{adminText(t,"روند فعالیت","Activity trends")}</h2><div className="admin-trends">{([
      ["newUsers",adminText(t,"ثبت‌نام‌ها","Sign-ups")], ["analyzedMatches",t.analysis], ["openDotaRequests","OpenDota"],
    ] as const).map(([field,label])=>{
      const max = Math.max(1,...o.analytics.daily.map(d=>d[field]));
      return <article key={field}><header><strong>{label}</strong><span>{adminNumber(o.analytics.daily.reduce((sum,d)=>sum+d[field],0),t)}</span></header><div className="admin-bars" role="img" aria-label={label}>{o.analytics.daily.map(day=><span key={day.day} style={{height:`${Math.max(2,day[field]/max*100)}%`}} title={`${day.day}: ${day[field]}`}/>)}</div><small className="muted"><bdi>{o.analytics.daily[0]?.day} — {o.analytics.daily.at(-1)?.day}</bdi></small></article>;
    })}</div></section>
    <section className="panel account-section"><h2>{adminText(t,"سهمیه OpenDota","OpenDota capacity")}</h2><div className="admin-quota-grid">{o.openDotaUsage.map(q=><article key={q.key}><strong>{q.key.endsWith("minute") ? adminText(t,"دقیقه‌ای","Per minute") : adminText(t,"روزانه","Per day")}</strong><bdi>{q.used} / {q.limit}</bdi><progress value={q.percent} max={100}/><small>{adminText(t,"باقی‌مانده","Remaining")}: {adminNumber(q.remaining,t)} · {adminDate(q.resetAt,t)}</small></article>)}</div></section>
    <section className="panel account-section"><h2>{adminText(t,"صف‌ها","Queues")}</h2><div className="admin-queue-grid">{[[t.images,o.imageJobs],[adminText(t,"دریافت مچ","Match sync"),o.syncJobs]].map(([label,jobs])=><div key={String(label)}><h3>{String(label)}</h3>{Object.entries(jobs as Record<string,number>).map(([status,count])=><div className="queue-count" key={status}><span>{status}</span><strong>{adminNumber(count,t)}</strong></div>)}</div>)}</div></section>
    <section className="panel account-section"><h2>{adminText(t,"آخرین کارهای تصویر","Recent image jobs")}</h2><div className="admin-table-scroll"><table className="admin-data-table"><thead><tr><th>{t.matchId}</th><th>{t.player}</th><th>{adminText(t,"وضعیت","Status")}</th><th>{adminText(t,"تلاش","Attempts")}</th><th>{adminText(t,"خطا","Error")}</th><th>{t.date}</th></tr></thead><tbody>{o.recentImageJobs.map(job=><tr key={job.id}><td>{job.dotaMatchId && <CopyValue value={job.dotaMatchId} t={t}/>}</td><td>{job.userHandle} · {job.heroName}</td><td>{job.status}</td><td>{job.attempts}</td><td><code>{job.errorCode || "—"}</code></td><td>{adminDate(job.updatedAt,t)}</td></tr>)}</tbody></table></div></section>
    <section className="panel account-section"><h2>{adminText(t,"آخرین فعالیت‌های مدیریت","Recent administration activity")}</h2><div className="admin-event-list">{o.recentAuditLogs.map(log=><div key={log.id}><time>{adminDate(log.createdAt,t)}</time><code>{log.action}</code>{log.actorUserId && <CopyValue value={log.actorUserId} label={adminText(t,"مدیر","Actor")} t={t}/>} {log.targetUserId && <CopyValue value={log.targetUserId} label={adminText(t,"کاربر","User")} t={t}/>}<details><summary>{t.details}</summary><pre>{JSON.stringify(log.metadata,null,2)}</pre></details></div>)}</div></section>
    </>}
  </div>;
}
