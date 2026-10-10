import { useState } from "react";
import { RefreshCw, Folder, FileArchive, Trash2 } from "lucide-react";
import { HEROES } from "@/data/heroes";
import type { Messages } from "../i18n";
import { apiRequest } from "../api";
import { adminBytes, adminDate, adminNumber, adminStatus, adminText, useAccountRead } from "../admin";
import { ErrorNotice } from "./ErrorNotice";
import { AdminReadState, SuccessNotice, TelemetryTable, AdminModal as Modal } from "./AdminShared";
export { AdminReleases } from "./AdminReleases";

interface ReferenceVersion {
  id:string;referenceMonth:string;status:string;sourcePolicy:string;metaCursor:number;metaTotal:number;
  performanceCursor:number;performanceTotal:number;metaRows:number;heroRows:number;positionRows:number;
  startedAt:string;completedAt:string|null;metaLastSuccessAt:string|null;performanceLastSuccessAt:string|null;
  metaLastError:string|null;performanceLastError:string|null;metaLastErrorAt:string|null;performanceLastErrorAt:string|null;
}
export function AdminReferences({ t }: {t:Messages}) {
  const read = useAccountRead<{versions:ReferenceVersion[]}>("/api/admin/monthly-references",true,30000);
  const [selectedId,setSelectedId] = useState(""), [month,setMonth] = useState(""), [wanted,setWanted] = useState("");
  const [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null), [notice,setNotice] = useState("");
  const [view,setView] = useState<"none"|"events"|"hero">("none");
  const versions = read.data?.versions || [];
  const months = [...new Set(versions.map(v=>v.referenceMonth))];
  const visible = versions.filter(v=>!month || v.referenceMonth === month);
  const selected = visible.find(v=>v.id === selectedId) || visible[0];
  async function start() {
    setBusy(true);setError(null);setNotice("");
    try {
      const result = await apiRequest<{result:{status:string;month:string}}>("/api/admin/monthly-references",{method:"POST",body:JSON.stringify(wanted ? {month:wanted} : {})});
      setNotice(result.result.status === "waiting-week" ? adminText(t,"هفته آخر ماه هنوز کامل نشده؛ دریافت بعد از آماده‌شدن بازه انجام می‌شود.","The final week has not finished; the reference must wait for its eligible window.") : adminText(t,`درخواست مرجع ${result.result.month} ثبت شد.`,`Reference request recorded for ${result.result.month}.`)); read.refresh();
    } catch(failure) {setError(failure);} finally {setBusy(false);}
  }
  return <div className="screen-stack"><section className="panel account-section"><div className="section-heading"><h2>{adminText(t,"مرجع آماری ماهانه","Monthly references")}</h2><button className="secondary-button" disabled={read.busy} onClick={read.refresh}><RefreshCw size={16}/>{t.refresh}</button></div><form className="admin-inline-form" onSubmit={event=>{event.preventDefault();void start();}}><label>{adminText(t,"ماه میلادی اختیاری","Optional Gregorian month")}<input type="month" value={wanted} onChange={event=>setWanted(event.target.value)}/></label><button className="primary-button" disabled={busy}>{adminText(t,"درخواست مرجع","Request reference")}</button></form>{!!error && <ErrorNotice error={error} t={t}/>}<SuccessNotice text={notice}/><AdminReadState error={read.error} busy={read.busy} hasData={!!read.data} t={t}/>
    {!!versions.length && <><div className="admin-toolbar"><label>{t.month}<select value={month} onChange={event=>{setMonth(event.target.value);setSelectedId("");}}><option value="">{t.all}</option>{months.map(m=><option key={m}>{m}</option>)}</select></label><label>{adminText(t,"نسخه","Version")}<select value={selected?.id || ""} onChange={event=>setSelectedId(event.target.value)}>{visible.map(v=><option key={v.id} value={v.id}>{v.referenceMonth} · {adminStatus(v.status,t)} · {v.id.slice(0,8)}</option>)}</select></label></div>
    {selected && <><div className="section-heading"><strong>{selected.referenceMonth}</strong><span className={`admin-status state-${selected.status}`}>{adminStatus(selected.status,t)}</span></div><div className="admin-reference-grid">{[
      {label:"Meta · Hero / Position",cursor:selected.metaCursor,total:selected.metaTotal,rows:selected.metaRows,success:selected.metaLastSuccessAt,error:selected.metaLastError,errorAt:selected.metaLastErrorAt},
      {label:"Performance",cursor:selected.performanceCursor,total:selected.performanceTotal,rows:selected.heroRows,success:selected.performanceLastSuccessAt,error:selected.performanceLastError,errorAt:selected.performanceLastErrorAt},
    ].map(part=><article key={part.label}><h3>{part.label}</h3><strong>{adminNumber(part.cursor,t)} / {adminNumber(part.total,t)}</strong><progress aria-label={part.label} max={part.total || 1} value={part.cursor}/><p>{adminText(t,"ردیف‌ها","Rows")}: {adminNumber(part.rows,t)} · {adminText(t,"باقی‌مانده","Remaining")}: {adminNumber(Math.max(0,part.total-part.cursor),t)}</p><small>{adminText(t,"آخرین موفقیت","Last success")}: {adminDate(part.success,t)}</small>{part.errorAt && <p className="admin-warning"><time>{adminDate(part.errorAt,t)}</time> · {part.error || adminText(t,"بازیابی شده","Recovered")}</p>}</article>)}</div>
    <dl className="account-facts"><div><dt>{adminText(t,"شروع","Started")}</dt><dd>{adminDate(selected.startedAt,t)}</dd></div><div><dt>{adminText(t,"پایان","Completed")}</dt><dd>{adminDate(selected.completedAt,t)}</dd></div><div><dt>{adminText(t,"ردیف‌های پوزیشن","Position rows")}</dt><dd>{selected.positionRows}</dd></div><div><dt>{adminText(t,"سیاست منبع","Source policy")}</dt><dd><bdi>{selected.sourcePolicy}</bdi></dd></div></dl><div className="segmented"><button className={view === "events" ? "active" : ""} aria-pressed={view === "events"} onClick={()=>setView(v=>v === "events" ? "none" : "events")}>{adminText(t,"رویدادهای اجرا","Build events")}</button><button className={view === "hero" ? "active" : ""} aria-pressed={view === "hero"} onClick={()=>setView(v=>v === "hero" ? "none" : "hero")}>{adminText(t,"آمار هیرو و پوزیشن","Hero & position data")}</button></div>
    {view !== "none" && <ReferenceDetails key={`${selected.id}:${view}`} versionId={selected.id} view={view} t={t}/>}</>}
    </>}{read.data && !versions.length && <p className="empty-message">{t.noData}</p>}</section></div>;
}
function ReferenceDetails({ versionId,view,t }: {versionId:string;view:"events"|"hero";t:Messages}) {
  const [hero,setHero] = useState(50), [minute,setMinute] = useState(13);
  const params = new URLSearchParams({view,versionId,...(view === "hero" ? {heroId:String(hero),minute:String(minute)} : {})});
  const read = useAccountRead<{events?:{id:string;service:string;level:string;message:string;createdAt:string}[];details?:{meta:Record<string,unknown>[];performance:Record<string,unknown>[];position:Record<string,unknown>[]}}>(`/api/admin/monthly-references?${params}`,true,30000);
  return <section className="admin-reference-detail">{view === "hero" && <div className="admin-toolbar"><label>{t.heroColumn}<select value={hero} onChange={event=>setHero(Number(event.target.value))}>{HEROES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{adminText(t,"دقیقه مرجع","Reference minute")}<input type="number" min={0} max={75} value={minute} onChange={event=>{const next=Number(event.target.value);if(Number.isInteger(next)&&next>=0&&next<=75)setMinute(next);}}/></label></div>}<AdminReadState error={read.error} busy={read.busy} hasData={!!read.data} t={t}/>
    {read.data?.events && <div className="admin-log" role="log">{read.data.events.map(event=><p key={event.id} className={event.level === "error" ? "log-error" : ""}><time>{adminDate(event.createdAt,t)}</time><b>{event.service}</b><span>{event.message}</span></p>)}</div>}
    {read.data?.details && <>{(["meta","performance","position"] as const).map(key=><div key={key}><h3>{key === "meta" ? "Meta" : key === "performance" ? "Hero + Position" : adminText(t,"مرجع جایگزین پوزیشن","Position fallback")}</h3><TelemetryTable rows={read.data!.details![key]} t={t}/></div>)}</>}
  </section>;
}
interface Listing { prefix:string;folders:string[];files:{key:string;bytes:number}[];nextToken:string|null }
export function AdminArchive({ t }: {t:Messages}) {
  const [prefix,setPrefix] = useState("replays/"), [extra,setExtra] = useState<Listing|null>(null);
  const read = useAccountRead<Listing>(`/api/admin/replay-archive?${new URLSearchParams({prefix})}`,true);
  const listing = extra?.prefix === prefix ? extra : read.data;
  const [target,setTarget] = useState<{key?:string;prefix?:string}|null>(null), [ack,setAck] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState<unknown>(null), [notice,setNotice] = useState("");
  function navigate(folder:string) {setPrefix(folder);setExtra(null);setError(null);setNotice("");}
  function refresh() {setExtra(null);read.refresh();}
  async function more() {
    if (!listing?.nextToken) return;
    setBusy(true);setError(null);
    try {
      const result = await apiRequest<Listing>(`/api/admin/replay-archive?${new URLSearchParams({prefix,token:listing.nextToken})}`);
      setExtra({...result,folders:[...new Set([...listing.folders,...result.folders])],files:[...listing.files,...result.files]});
    } catch(failure) {setError(failure);} finally {setBusy(false);}
  }
  async function remove() {
    if (!target || !ack) return;
    setBusy(true);setError(null);
    try {
      const result = await apiRequest<{deleted:number}>("/api/admin/replay-archive",{method:"POST",body:JSON.stringify(target)},180000);
      setTarget(null);setAck(false);setNotice(adminText(t,`${result.deleted} فایل حذف شد.`,`${result.deleted} files deleted.`));refresh();
    } catch(failure) {setError(failure);} finally {setBusy(false);}
  }
  const parent = prefix.replace(/\/$/,"").split("/").slice(0,-1).join("/")+"/";
  return <section className="panel account-section"><div className="section-heading"><h2>{adminText(t,"آرشیو ریپلی","Replay archive")}</h2><button className="secondary-button" disabled={read.busy || busy} onClick={refresh}><RefreshCw size={16}/>{t.refresh}</button></div><div className="admin-toolbar"><button className="secondary-button" disabled={prefix === "replays/" || busy} onClick={()=>navigate(parent)}>{adminText(t,"پوشه بالاتر","Parent folder")}</button><bdi className="archive-path">{prefix}</bdi></div><AdminReadState error={read.error} busy={read.busy} hasData={!!listing} t={t}/>{!!error && !target && <ErrorNotice error={error} t={t}/>}<SuccessNotice text={notice}/>
    {listing && <div className="archive-list">{listing.folders.map(folder=><div key={folder}><button className="archive-folder" disabled={busy} onClick={()=>navigate(folder)}><Folder size={19}/><bdi>{folder.slice(prefix.length)}</bdi></button><button className="archive-delete" aria-label={`${adminText(t,"حذف پوشه","Delete folder")} ${folder}`} disabled={busy} onClick={()=>{setTarget({prefix:folder});setAck(false);setError(null);}}><Trash2 size={17}/></button></div>)}{listing.files.map(file=><div key={file.key}><span><FileArchive size={18}/><bdi>{file.key.slice(prefix.length)}</bdi><small>{adminBytes(file.bytes)}</small></span><button className="archive-delete" aria-label={`${adminText(t,"حذف فایل","Delete file")} ${file.key}`} disabled={busy} onClick={()=>{setTarget({key:file.key});setAck(false);setError(null);}}><Trash2 size={17}/></button></div>)}{!listing.files.length && !listing.folders.length && <p>{t.noData}</p>}{listing.nextToken && <button className="secondary-button" disabled={busy} onClick={()=>void more()}>{t.loadMore}</button>}</div>}
    {target && <Modal title={adminText(t,"تأیید حذف آرشیو","Confirm archive deletion")} onClose={()=>{if(!busy)setTarget(null);}} closeLabel={t.close}><p>{adminText(t,"این فایل یا پوشه و ریپلی‌های درون آن از آرشیو حذف می‌شوند.","This file or folder and its replays will be removed from the archive.")}</p><bdi className="archive-path">{target.key || target.prefix}</bdi><label className="admin-check"><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/>{adminText(t,"حذف را تأیید می‌کنم.","I confirm deletion.")}</label>{!!error && <ErrorNotice error={error} t={t}/>}<button className="danger-button" disabled={!ack || busy} onClick={()=>void remove()}>{adminText(t,"حذف","Delete")}</button></Modal>}
  </section>;
}
