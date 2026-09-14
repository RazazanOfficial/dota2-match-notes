"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return Array.from({ length: Math.max(0, Math.round((end - start) / DAY_MS) + 1) }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}
function dateLabel(key: string) { const date=parseDateKey(key); return `${formatWeekday(date)} ${formatDayDate(date)}`; }

export default function SyncPanel({ rangeFrom, rangeTo, registrationDate, onMatchesImported }: { rangeFrom:string; rangeTo:string;registrationDate:string; onMatchesImported:(result:ManualSyncResult)=>void }) {
  const [status,setStatus]=useState<PlayerSyncStatus|null>(null);
  const [syncing,setSyncing]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const [open,setOpen]=useState(false);
  const [scope,setScope]=useState<MatchSyncScope>("day");
  const [mode,setMode]=useState<MatchSyncMode>("basic");
  const [selectedDay,setSelectedDay]=useState(()=>new Date().toISOString().slice(0,10));
  const [confirming,setConfirming]=useState(false);
  const days=useMemo(()=>dateKeys(rangeFrom,rangeTo),[rangeFrom,rangeTo]);
  const today=new Date().toISOString().slice(0,10);
  const selectableDays=useMemo(()=>days.filter((key)=>key>=registrationDate&&key<=today),[days,registrationDate,today]);

  useEffect(()=>{if(!selectableDays.includes(selectedDay))setSelectedDay(selectableDays.includes(today)?today:selectableDays.at(-1)??"");},[selectableDays,selectedDay,today]);
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
  const selectionDisabled=scope==="day"?!selectedDay:rangeFrom>today||rangeTo<registrationDate;

  async function handleSync(){setSyncing(true);setConfirming(false);try{const result=await syncPlayerMatches(request);onMatchesImported(result);const messages=[] as string[];messages.push(result.imported.length?`${faNumber.format(result.imported.length)} مچ تازه اضافه شد.`:"مچ تازه‌ای پیدا نشد.");if(mode==="analysis"){if(result.analysis.queued)messages.push(`${faNumber.format(result.analysis.queued)} تحلیل وارد صف شد (${result.analysis.totalTokenCost.toLocaleString("en-US")} Token).`);if(result.analysis.alreadyReady)messages.push(`${faNumber.format(result.analysis.alreadyReady)} تحلیل از قبل آماده بود.`);if(result.analysis.skippedOld)messages.push(`${faNumber.format(result.analysis.skippedOld)} مچ قدیمی Parse نشد.`);}if(result.deferred)messages.push(`${faNumber.format(result.deferred)} مچ به‌دلیل سقف هر دریافت باقی ماند.`);toast.success(messages.join(" "));setOpen(false);await loadStatus();}catch(reason){toast.error(reason instanceof Error?reason.message:"مچ‌ها دریافت نشدند");await loadStatus();}finally{setSyncing(false);}}

  return <section className="sync-panel" aria-labelledby="sync-panel-title">
    <div className="sync-panel-copy"><p className="week-kicker">MATCH IMPORT</p><h2 id="sync-panel-title">دریافت مچ‌ها</h2><p>روز یا هفته را انتخاب کن؛ دریافت ساده هیچ درخواست Parseای ارسال نمی‌کند.</p><div className="sync-meta"><span>آخرین بررسی: <b>{formatTime(status?.lastSyncAt||null)}</b></span></div></div>
    <div className="sync-panel-action"><button className="sync-button" type="button" disabled={syncing||cooldownSeconds>0} onClick={()=>setOpen((value)=>!value)}><span>{syncing?"در حال دریافت":cooldownSeconds?`${faNumber.format(cooldownSeconds)} ثانیه تا دریافت بعدی`:"انتخاب بازه و دریافت"}</span>{syncing?<RefreshCw className="is-spinning"/>:<ChevronDown className={open?"is-open":""}/>}</button>
    {open&&<div className="sync-picker" role="dialog" aria-label="انتخاب بازه دریافت مچ">
      <header><div><CalendarDays/><span><strong>انتخاب بازه</strong><small>{dateLabel(rangeFrom)} تا {dateLabel(rangeTo)}</small></span></div><button type="button" onClick={()=>setOpen(false)} aria-label="بستن"><X/></button></header>
      <div className="sync-scope-switch"><button className={scope==="day"?"is-active":""} type="button" onClick={()=>setScope("day")}>یک روز</button><button className={scope==="week"?"is-active":""} type="button" onClick={()=>setScope("week")}>کل هفته</button></div>
      {scope==="day"&&<div className="sync-day-grid">{days.map((key)=>{const disabled=key<registrationDate||key>today;return <button className={`${selectedDay===key?"is-active ":""}${key===today?"is-today ":""}${disabled?"is-disabled":""}`} type="button" key={key} disabled={disabled} onClick={()=>setSelectedDay(key)} aria-current={key===today?"date":undefined}><span>{formatWeekday(parseDateKey(key)).slice(0,1)}</span><small>{formatDayDate(parseDateKey(key))}</small></button>})}</div>}
      <div className="sync-mode-grid" aria-label="نوع دریافت"><button className={mode==="basic"?"is-active":""} type="button" onClick={()=>setMode("basic")}><Database/><b>دریافت ساده</b>{mode==="basic"&&<Check/>}</button><button className={mode==="analysis"?"is-active":""} type="button" onClick={()=>setMode("analysis")}><CircleGauge/><b>دریافت + تحلیل</b>{mode==="analysis"&&<Check/>}</button></div>
      {mode==="analysis"&&(warningDays.length>0||expiredDays.length>0)&&<div className="sync-age-warning"><TriangleAlert/><div><strong>احتمال ناقص‌بودن Replay</strong>{warningDays.length>0&&<p>روزهای {warningDays.map(dateLabel).join("، ")} بیش از {REPLAY_WARNING_AFTER_DAYS.toLocaleString("en-US")} روز قدمت دارند و ممکن است Replay در دسترس نباشد.</p>}{expiredDays.length>0&&<p>برای روزهای {expiredDays.map(dateLabel).join("، ")} بیش از {REPLAY_REQUEST_MAX_AGE_DAYS.toLocaleString("en-US")} روز گذشته؛ مچ‌ها دریافت می‌شوند اما Parse جدید برایشان ارسال نمی‌شود.</p>}</div></div>}
      <footer><span>{scope==="day"?(selectedDay?dateLabel(selectedDay):"روز قابل دریافت نیست"):`کل هفته انتخاب شد`}</span><button className="primary-button" type="button" disabled={selectionDisabled} onClick={()=>mode==="analysis"?setConfirming(true):void handleSync()}>{mode==="analysis"?"ادامه":"دریافت"}</button></footer>
    </div>}</div>
    {visibleJobs.length>0&&<div className="image-queue is-compact" aria-label="صف تحلیل مچ‌ها" aria-live="polite"><div className="image-queue-list">{visibleJobs.map((job)=>{const hero=job.heroId?heroById(job.heroId):undefined;return <article className={`queue-job is-${job.status}`} key={job.id}><span className="queue-job-portrait">{hero?<img src={heroImage(hero)} alt=""/>:<span>?</span>}</span><div className="queue-job-copy"><strong lang="en" dir="ltr">Match #{job.dotaMatchId||"—"}</strong></div><span className="queue-job-position">{queueLabel(job)}</span></article>;})}</div></div>}
    {confirming&&createPortal(<div className="sync-confirm-backdrop" role="presentation" onMouseDown={()=>setConfirming(false)}><section className="sync-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sync-confirm-title" onMouseDown={(event)=>event.stopPropagation()}><header><span><CircleGauge/></span><div><small>ANALYSIS REQUEST</small><strong id="sync-confirm-title">تأیید دریافت همراه تحلیل</strong></div></header><p>داده پایه دریافت می‌شود و مچ‌های قابل تحلیل وارد صف Replay خواهند شد.</p><div className="sync-token-note"><span>هزینه نمایشی هر مچ</span><strong className="latin-numerals" lang="en" dir="ltr">{ANALYSIS_TOKEN_COST.toLocaleString("en-US")} Token</strong><small>تعداد نهایی بعد از شناسایی مچ‌های نیازمند تحلیل مشخص می‌شود.</small></div><footer><button className="secondary-button" type="button" onClick={()=>setConfirming(false)}>انصراف</button><button className="primary-button" type="button" onClick={handleSync}>تأیید و شروع</button></footer></section></div>,document.body)}
  </section>;
}
