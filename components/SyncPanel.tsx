"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, CircleGauge, Database, RefreshCw, TriangleAlert, X } from "lucide-react";
import { toast } from "react-toastify";
import { heroById, heroImage } from "@/data/heroes";
import { getPlayerSyncStatus, syncPlayerMatches } from "@/lib/api";
import { faNumber, formatDayDate, formatWeekday, parseDateKey } from "@/lib/date";
import { ANALYSIS_TOKEN_COST, REPLAY_REQUEST_MAX_AGE_DAYS, REPLAY_WARNING_AFTER_DAYS, replayAgeState } from "@/lib/opendota/analysis-policy";
import type { ImageQueueJob, ManualSyncResult, MatchSyncMode, MatchSyncRequest, MatchSyncScope, PlayerSyncStatus } from "@/lib/types";

const faDateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
const DAY_MS = 86_400_000;

function formatTime(value: string | null) { return value ? faDateTime.format(new Date(value)) : "هنوز انجام نشده"; }
function queueLabel(job: ImageQueueJob) { return `نوبت ${faNumber.format(job.position || 1)} در صف`; }
function dateKeys(from: string, to: string) {
  const start = parseDateKey(from).getTime(); const end = parseDateKey(to).getTime();
  return Array.from({ length: Math.max(0, Math.round((end - start) / DAY_MS) + 1) }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}
function dateLabel(key: string) { const date=parseDateKey(key); return `${formatWeekday(date)} ${formatDayDate(date)}`; }

export default function SyncPanel({ rangeFrom, rangeTo, onMatchesImported }: { rangeFrom:string; rangeTo:string; onMatchesImported:(result:ManualSyncResult)=>void }) {
  const [status,setStatus]=useState<PlayerSyncStatus|null>(null);
  const [syncing,setSyncing]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const [open,setOpen]=useState(false);
  const [scope,setScope]=useState<MatchSyncScope>("day");
  const [mode,setMode]=useState<MatchSyncMode>("basic");
  const [selectedDay,setSelectedDay]=useState(()=>new Date().toISOString().slice(0,10));
  const [confirming,setConfirming]=useState(false);
  const days=useMemo(()=>dateKeys(rangeFrom,rangeTo),[rangeFrom,rangeTo]);

  useEffect(()=>{ if(!days.includes(selectedDay))setSelectedDay(days.includes(new Date().toISOString().slice(0,10))?new Date().toISOString().slice(0,10):days[0]||rangeFrom); },[days,rangeFrom,selectedDay]);
  const loadStatus=useCallback(async(notify=false)=>{try{setStatus(await getPlayerSyncStatus());}catch(reason){if(notify)toast.error(reason instanceof Error?reason.message:"وضعیت مچ‌ها دریافت نشد");}},[]);
  useEffect(()=>{void loadStatus(true);},[loadStatus]);
  useEffect(()=>{const active=Boolean(status?.imageQueue.jobs.some((job)=>job.kind==="analysis"&&(job.status==="pending"||job.status==="processing")));const timer=window.setInterval(()=>void loadStatus(),active?3_000:15_000);return()=>window.clearInterval(timer);},[loadStatus,status]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1_000);return()=>window.clearInterval(timer);},[]);

  const cooldownSeconds=status?.nextAllowedAt?Math.max(0,Math.ceil((new Date(status.nextAllowedAt).getTime()-now)/1_000)):0;
  const visibleJobs=useMemo(()=>status?.imageQueue.jobs.filter((job)=>job.kind==="analysis"&&(job.status==="pending"||job.status==="processing")).sort((a,b)=>(a.position||Number.MAX_SAFE_INTEGER)-(b.position||Number.MAX_SAFE_INTEGER))||[],[status]);
  const request:MatchSyncRequest=scope==="day"?{scope,from:selectedDay,to:selectedDay,mode}:{scope,from:rangeFrom,to:rangeTo,mode};
  const requestDays=dateKeys(request.from,request.to);
  const warningDays=requestDays.filter((key)=>replayAgeState(`${key}T12:00:00.000Z`) === "warning");
  const expiredDays=requestDays.filter((key)=>replayAgeState(`${key}T12:00:00.000Z`) === "expired");

  async function handleSync(){setSyncing(true);setConfirming(false);try{const result=await syncPlayerMatches(request);onMatchesImported(result);const messages=[] as string[];messages.push(result.imported.length?`${faNumber.format(result.imported.length)} مچ تازه اضافه شد.`:"مچ تازه‌ای پیدا نشد.");if(mode==="analysis"){if(result.analysis.queued)messages.push(`${faNumber.format(result.analysis.queued)} تحلیل وارد صف شد (${result.analysis.totalTokenCost.toLocaleString("en-US")} Token).`);if(result.analysis.alreadyReady)messages.push(`${faNumber.format(result.analysis.alreadyReady)} تحلیل از قبل آماده بود.`);if(result.analysis.skippedOld)messages.push(`${faNumber.format(result.analysis.skippedOld)} مچ قدیمی Parse نشد.`);}if(result.deferred)messages.push(`${faNumber.format(result.deferred)} مچ به‌دلیل سقف هر دریافت باقی ماند.`);toast.success(messages.join(" "));setOpen(false);await loadStatus();}catch(reason){toast.error(reason instanceof Error?reason.message:"مچ‌ها دریافت نشدند");await loadStatus();}finally{setSyncing(false);}}

  return <section className="sync-panel" aria-labelledby="sync-panel-title">
    <div className="sync-panel-copy"><p className="week-kicker">MATCH IMPORT</p><h2 id="sync-panel-title">دریافت مچ‌ها</h2><p>روز یا هفته را انتخاب کن؛ دریافت ساده هیچ درخواست Parseای ارسال نمی‌کند.</p><div className="sync-meta"><span>آخرین بررسی: <b>{formatTime(status?.lastSyncAt||null)}</b></span></div></div>
    <div className="sync-panel-action"><button className="sync-button" type="button" disabled={syncing||cooldownSeconds>0} onClick={()=>setOpen((value)=>!value)}><span>{syncing?"در حال دریافت":cooldownSeconds?`${faNumber.format(cooldownSeconds)} ثانیه تا دریافت بعدی`:"انتخاب بازه و دریافت"}</span>{syncing?<RefreshCw className="is-spinning"/>:<ChevronDown className={open?"is-open":""}/>}</button></div>
    {open&&<div className="sync-picker">
      <header><div><CalendarDays/><span><strong>چه بازه‌ای دریافت شود؟</strong><small>{dateLabel(rangeFrom)} تا {dateLabel(rangeTo)}</small></span></div><button type="button" onClick={()=>setOpen(false)} aria-label="بستن"><X/></button></header>
      <div className="sync-scope-switch"><button className={scope==="day"?"is-active":""} type="button" onClick={()=>setScope("day")}>یک روز خاص</button><button className={scope==="week"?"is-active":""} type="button" onClick={()=>setScope("week")}>کل هفته باز</button></div>
      {scope==="day"&&<div className="sync-day-grid">{days.map((key)=><button className={selectedDay===key?"is-active":""} type="button" key={key} onClick={()=>setSelectedDay(key)}><span>{formatWeekday(parseDateKey(key))}</span><small>{formatDayDate(parseDateKey(key))}</small></button>)}</div>}
      <div className="sync-mode-grid"><button className={mode==="basic"?"is-active":""} type="button" onClick={()=>setMode("basic")}><Database/><span><b>دریافت ساده</b><small>اطلاعات پایه مچ؛ بدون Parse Replay</small></span>{mode==="basic"&&<Check/>}</button><button className={mode==="analysis"?"is-active":""} type="button" onClick={()=>setMode("analysis")}><CircleGauge/><span><b>دریافت + تحلیل</b><small>هر مچ نیازمند تحلیل: <em lang="en" dir="ltr">{ANALYSIS_TOKEN_COST} Token</em></small></span>{mode==="analysis"&&<Check/>}</button></div>
      {mode==="analysis"&&(warningDays.length>0||expiredDays.length>0)&&<div className="sync-age-warning"><TriangleAlert/><div><strong>احتمال ناقص‌بودن Replay</strong>{warningDays.length>0&&<p>روزهای {warningDays.map(dateLabel).join("، ")} بیش از {REPLAY_WARNING_AFTER_DAYS.toLocaleString("en-US")} روز قدمت دارند و ممکن است Replay در دسترس نباشد.</p>}{expiredDays.length>0&&<p>برای روزهای {expiredDays.map(dateLabel).join("، ")} بیش از {REPLAY_REQUEST_MAX_AGE_DAYS.toLocaleString("en-US")} روز گذشته؛ مچ‌ها دریافت می‌شوند اما Parse جدید برایشان ارسال نمی‌شود.</p>}</div></div>}
      <footer><span>{scope==="day"?dateLabel(selectedDay):`هفته ${dateLabel(rangeFrom)} تا ${dateLabel(rangeTo)}`}</span><button className="primary-button" type="button" onClick={()=>setConfirming(true)}>ادامه</button></footer>
    </div>}
    {visibleJobs.length>0&&<div className="image-queue is-compact" aria-label="صف تحلیل مچ‌ها" aria-live="polite"><div className="image-queue-list">{visibleJobs.map((job)=>{const hero=job.heroId?heroById(job.heroId):undefined;return <article className={`queue-job is-${job.status}`} key={job.id}><span className="queue-job-portrait">{hero?<img src={heroImage(hero)} alt=""/>:<span>?</span>}</span><div className="queue-job-copy"><strong lang="en" dir="ltr">Match #{job.dotaMatchId||"—"}</strong></div><span className="queue-job-position">{queueLabel(job)}</span></article>;})}</div></div>}
    {confirming&&<div className="sync-confirm-backdrop" role="presentation" onMouseDown={()=>setConfirming(false)}><section className="sync-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sync-confirm-title" onMouseDown={(event)=>event.stopPropagation()}><header><span>{mode==="analysis"?<CircleGauge/>:<Database/>}</span><div><small>MATCH IMPORT</small><strong id="sync-confirm-title">تأیید دریافت {scope==="day"?"روز":"هفته"}</strong></div></header><p>{mode==="analysis"?"ابتدا داده پایه مچ‌ها دریافت می‌شود؛ سپس فقط مچ‌های نیازمند تحلیل و مجاز وارد صف Replay می‌شوند.":"فقط اطلاعات پایه ذخیره می‌شود و هیچ Replayای برای Parse درخواست نمی‌شود."}</p>{mode==="analysis"&&<div className="sync-token-note"><span>هزینه هر تحلیل</span><strong lang="en" dir="ltr">10 Token</strong><small>تعداد نهایی پس از شناسایی مچ‌های نیازمند تحلیل مشخص می‌شود؛ فعلاً این عدد صرفاً نمایشی است.</small></div>}<footer><button className="secondary-button" type="button" onClick={()=>setConfirming(false)}>انصراف</button><button className="primary-button" type="button" onClick={handleSync}>تأیید و شروع دریافت</button></footer></section></div>}
  </section>;
}
