"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { HEROES } from "@/data/heroes";

type Version = {
  id: string; referenceMonth: string; status: string; sourcePolicy: string;
  metaCursor: number; metaTotal: number; performanceCursor: number; performanceTotal: number; metaRows: number;
  heroRows: number; positionRows: number; startedAt: string; completedAt: string | null;
  metaLastSuccessAt: string | null; performanceLastSuccessAt: string | null;
  metaLastErrorAt: string | null; performanceLastErrorAt: string | null;
  metaLastError: string | null; performanceLastError: string | null;
};
type Event = { id: string; service: string; level: string; message: string; createdAt: string };
type MetaRow = { position: number; rankBracket: string; gameMode: number; matchCount: number;
  winCount: number; positionShare: number; metaPickRate: number; winRate: number };
type PerformanceRow = { position: number; rankGroup: string; minute: number; sampleCount: number; [key: string]: string | number };
type Details = { meta: MetaRow[]; performance: PerformanceRow[]; position: PerformanceRow[] };
type Reply = { ok?: boolean; versions?: Version[]; events?: Event[]; details?: Details;
  result?: { status: string; month: string }; error?: { message?: string } };

const number = new Intl.NumberFormat("fa-IR");
const decimal = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });
const metrics = [
  ["cs", "LH"], ["dn", "Deny"], ["kills", "Kill"], ["deaths", "Death"], ["assists", "Assist"],
  ["networth", "Net Worth"], ["xp", "XP"], ["heroDamage", "Hero Damage"], ["towerDamage", "Tower Damage"],
  ["healingAllies", "Heal"], ["campsStacked", "Stack"], ["neutrals", "Jungle"], ["ancients", "Ancient"],
  ["teamKills", "Team Kill"],
] as const;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("fa-IR") : "هنوز ثبت نشده";
const label = (status: string) => status === "active" ? "آماده" : status === "building" ? "در حال ساخت" : status === "failed" ? "خطا" : "نسخهٔ قبلی";
async function get(url: string): Promise<Reply> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const body = await response.json() as Reply;
  if (!response.ok || !body.ok) throw new Error(body.error?.message || "دریافت وضعیت مرجع ناموفق بود");
  return body;
}

export default function AdminMonthlyReferences({ mock = false }: { mock?: boolean }) {
  const [opened, setOpened] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [requestedMonth, setRequestedMonth] = useState("");
  const [versionId, setVersionId] = useState("");
  const [heroId, setHeroId] = useState(50);
  const [minute, setMinute] = useState(11);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [heroOpen, setHeroOpen] = useState(false);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [detailsError, setDetailsError] = useState("");
  const [detailRefresh, setDetailRefresh] = useState(0);

  const refresh = useCallback(async () => {
    const next = mock ? mockVersions : (await get("/api/admin/monthly-references")).versions || [];
    setVersions(next);
    setVersionId(current => next.some(version => version.id === current) ? current : next[0]?.id || "");
    setError("");
  }, [mock]);

  // This component is mounted on the admin page, but no request is issued until opened.
  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    void refresh().catch(reason => { if (active) setError(String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh().catch(reason => { if (active) setError(String(reason)); });
        setDetailRefresh(value => value + 1);
      }
    }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [opened, refresh]);

  useEffect(() => {
    if (!opened || !eventsOpen || !versionId) return;
    let active = true;
    setEvents(null); setEventsError(""); setEventsLoading(true);
    void (mock ? Promise.resolve({ events: mockEvents }) : get(`/api/admin/monthly-references?view=events&versionId=${encodeURIComponent(versionId)}`))
      .then(body => { if (active) setEvents(body.events || []); })
      .catch(reason => { if (active) setEventsError(String(reason)); })
      .finally(() => { if (active) setEventsLoading(false); });
    return () => { active = false; };
  }, [opened, eventsOpen, versionId, mock, detailRefresh]);

  useEffect(() => {
    if (!opened || !heroOpen || !versionId) return;
    let active = true;
    setDetails(null); setDetailsError(""); setDetailsLoading(true);
    void (mock ? Promise.resolve({ details: mockDetails }) : get(`/api/admin/monthly-references?view=hero&versionId=${encodeURIComponent(versionId)}&heroId=${heroId}&minute=${minute}`))
      .then(body => { if (active) setDetails(body.details || null); })
      .catch(reason => { if (active) setDetailsError(String(reason)); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [opened, heroOpen, versionId, heroId, minute, mock, detailRefresh]);

  const selected = useMemo(() => versions.find(version => version.id === versionId), [versions, versionId]);
  const months = useMemo(() => [...new Set(versions.map(version => version.referenceMonth))], [versions]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const month = months.includes(selectedMonth) ? selectedMonth : selected?.referenceMonth || months[0] || "";
  const monthVersions = versions.filter(version => version.referenceMonth === month);

  async function start() {
    if (mock) { toast.info("این صفحه نمونه است؛ درخواست واقعی ارسال نمی‌شود"); return; }
    setStarting(true);
    try {
      const response = await fetch("/api/admin/monthly-references", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestedMonth ? { month: requestedMonth } : {}) });
      const body = await response.json() as Reply;
      if (!response.ok || !body.ok) throw new Error(body.error?.message || "شروع دریافت ناموفق بود");
      toast.success(body.result?.status === "waiting-week" ? "هفتهٔ آخر ماه هنوز کامل نشده است" : `دریافت مرجع ${body.result?.month} در صف است`);
      await refresh();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "شروع دریافت ناموفق بود"); }
    finally { setStarting(false); }
  }

  return <section className="admin-section monthly-reference" aria-label="مرجع آماری ماهانه">
    <header className="admin-section-header">
      <div><p className="week-kicker">MONTHLY REFERENCE</p><h2>مرجع آماری ماهانه</h2></div>
      <button type="button" className="secondary-button" aria-expanded={opened} onClick={() => setOpened(value => !value)}>
        {opened ? "بستن گزارش" : "نمایش وضعیت و آمار ماهانه"}
      </button>
    </header>
    {!opened ? <p className="monthly-reference-hint">جزئیات ماه‌ها، Console و Heroها فقط پس از بازکردن این بخش دریافت می‌شوند.</p> : <>
      <p>Meta برای Ranked All Pick و Turbo جداست. Performance فعلاً با فرض Ranked بودن آمار STRATZ ثبت می‌شود؛ این فرض هنوز با فیلتر رسمی API تأیید نشده است.</p>
      <div className="monthly-reference-controls">
        <label>ماه Fetch دستی <input type="month" value={requestedMonth} onChange={event => setRequestedMonth(event.target.value)} /></label>
        <button type="button" className="secondary-button" onClick={() => void start()} disabled={starting}>{starting ? "در حال ثبت…" : requestedMonth ? "بازخوانی ماه انتخابی" : "پاک‌سازی و بازخوانی ماه قبل"}</button>
        <button type="button" className="secondary-button" onClick={() => {
          void refresh().catch(reason => setError(String(reason)));
          setDetailRefresh(value => value + 1);
        }}>به‌روزرسانی وضعیت</button>
      </div>
      <p className="monthly-reference-hint">بازخوانی آخرین ماه کامل، فقط دادهٔ مرجع همان ماه را پاک می‌کند و از ابتدا می‌گیرد. Tick عادی از پیشرفت ذخیره‌شده ادامه می‌دهد.</p>
      {error && <p role="alert" className="monthly-reference-error">{error}</p>}
      {loading && !versions.length ? <p>در حال دریافت ماه‌ها…</p> : !versions.length ? <p>هنوز هیچ ماهی ثبت نشده است.</p> : <>
        <div className="admin-table-wrap"><table className="admin-users-table"><thead><tr><th>ماه (UTC)</th><th>آخرین نسخه</th><th>تعداد نسخه</th><th>آخرین اجرا</th><th>جزئیات</th></tr></thead><tbody>
          {months.map(value => {
            const latest = versions.find(version => version.referenceMonth === value)!;
            return <tr key={value}><td dir="ltr">{value.slice(0, 7)}</td><td>{label(latest.status)}</td>
              <td>{number.format(versions.filter(version => version.referenceMonth === value).length)}</td>
              <td>{formatDate(latest.startedAt)}</td><td><button type="button" className="secondary-button" onClick={() => {
                setSelectedMonth(value); setVersionId(latest.id);
              }}>بررسی ماه</button></td></tr>;
          })}
        </tbody></table></div>
        <div className="monthly-reference-controls">
          <label>ماه مرجع <select value={month} onChange={event => {
            setSelectedMonth(event.target.value);
            setVersionId(versions.find(version => version.referenceMonth === event.target.value)?.id || "");
          }}>{months.map(value => <option key={value} value={value}>{value.slice(0, 7)}</option>)}</select></label>
          <label>نسخه <select value={versionId} onChange={event => setVersionId(event.target.value)}>
            {monthVersions.map(version => <option key={version.id} value={version.id}>{label(version.status)} · {formatDate(version.startedAt)} · {version.id.slice(0, 8)}</option>)}
          </select></label>
          <span>{number.format(months.length)} ماه · {number.format(versions.length)} نسخه</span>
        </div>
        {selected && <>
          <div className="monthly-reference-overview">
            <ServiceCard name="Meta · Hero / Position" cursor={selected.metaCursor} total={selected.metaTotal} rows={selected.metaRows}
              success={selected.metaLastSuccessAt} error={selected.metaLastError} errorAt={selected.metaLastErrorAt} />
            <ServiceCard name="Performance · دقیقه‌ای" cursor={selected.performanceCursor} total={selected.performanceTotal}
              rows={selected.heroRows} success={selected.performanceLastSuccessAt}
              error={selected.performanceLastError} errorAt={selected.performanceLastErrorAt} />
          </div>
          <p className="monthly-reference-hint">وضعیت نسخه: <strong>{label(selected.status)}</strong> · شروع: {formatDate(selected.startedAt)} · پایان: {formatDate(selected.completedAt)} · ردیف‌های Position: {number.format(selected.positionRows)} · سیاست منبع: <span dir="ltr">{selected.sourcePolicy}</span></p>
          <div className="monthly-reference-disclosure">
            <button type="button" className="secondary-button" aria-expanded={eventsOpen} onClick={() => setEventsOpen(value => !value)}>{eventsOpen ? "بستن Console" : "نمایش Console اجرا"}</button>
            {eventsOpen && <div className="monthly-reference-console" role="log" aria-label="رویدادهای ساخت مرجع">
              {eventsLoading ? "در حال دریافت رویدادها…" : eventsError ? <span role="alert">{eventsError}</span> : !events?.length ? "رویدادی برای این نسخه ثبت نشده است." : events.map(event => <div key={event.id} className={`is-${event.level}`}>
                <time>{formatDate(event.createdAt)}</time><b>{event.service === "meta" ? "META" : event.service === "performance" ? "PERFORMANCE" : "SYSTEM"}</b><span>{event.message}</span>
              </div>)}
            </div>}
          </div>
          <div className="monthly-reference-disclosure">
            <button type="button" className="secondary-button" aria-expanded={heroOpen} onClick={() => setHeroOpen(value => !value)}>{heroOpen ? "بستن آمار Hero" : "نمایش آمار Hero"}</button>
            {heroOpen && <>
              <div className="monthly-reference-controls">
                <label>Hero <select value={heroId} onChange={event => setHeroId(Number(event.target.value))}>{HEROES.map(hero => <option key={hero.id} value={hero.id}>{hero.name}</option>)}</select></label>
                <label>دقیقهٔ مرجع <input type="number" min="0" max="75" value={minute} onChange={event => {
                  const next = Number(event.target.value); if (Number.isInteger(next) && next >= 0 && next <= 75) setMinute(next);
                }} /></label>
                <span>برای Lane @10، مرجع <b dir="ltr">time: 11</b> است.</span>
              </div>
              {detailsLoading ? <p>در حال دریافت آمار Hero…</p> : detailsError ? <p role="alert" className="monthly-reference-error">{detailsError}</p> : details && <>
                <h3>Meta · تعداد مچ و سهم Position</h3>
                <div className="admin-table-wrap"><table className="admin-users-table"><thead><tr><th>Mode</th><th>Rank</th><th>Pos</th><th>مچ</th><th>برد</th><th>سهم Position</th><th>Pick Rate</th><th>Win Rate</th></tr></thead><tbody>
                  {details.meta.map(row => <tr key={`${row.gameMode}-${row.rankBracket}-${row.position}`}><td>{row.gameMode === 22 ? "Ranked All Pick" : row.gameMode === 23 ? "Turbo" : row.gameMode}</td><td>{row.rankBracket}</td><td>{row.position}</td><td>{number.format(row.matchCount)}</td><td>{number.format(row.winCount)}</td><td>{decimal.format(row.positionShare)}٪</td><td>{decimal.format(row.metaPickRate)}٪</td><td>{decimal.format(row.winRate)}٪</td></tr>)}
                </tbody></table></div>
                {!details.meta.length && <p>برای این Hero در نسخهٔ انتخابی Meta ثبت نشده است.</p>}
                <h3>Performance · Hero + Position</h3>
                <PerformanceTable rows={details.performance} empty="ردیف اختصاصی موجود نیست؛ اگر Meta کامل شده، برای ترکیب‌های زیر ۵۰۰ مچ یا زیر ۲۰٪ از مرجع Position استفاده می‌شود." />
                <h3>مرجع جایگزین · همهٔ Heroها در Position</h3>
                <PerformanceTable rows={details.position} empty="مرجع Position هنوز ساخته نشده است." />
              </>}
            </>}
          </div>
        </>}
      </>}
    </>}
  </section>;
}

function ServiceCard({ name, cursor, total, rows, success, error, errorAt }: {
  name: string; cursor: number; total: number; rows: number; success: string | null; error: string | null; errorAt: string | null;
}) {
  const status = error ? "خطا؛ تلاش بعدی در Tick بعد" : cursor >= total && total > 0 ? "کامل" : cursor > 0 ? "در حال دریافت" : "منتظر اجرا";
  const remaining = Math.max(0, total - cursor);
  const percent = total > 0 ? Math.min(100, Math.round(cursor / total * 100)) : 0;
  return <article className={`monthly-reference-card${error ? " is-error" : ""}`}>
    <h3>{name}</h3><strong>{status}</strong>
    <p>پیشرفت: {number.format(cursor)} / {number.format(total)} ({number.format(percent)}٪) · مانده: {number.format(remaining)} درخواست · ردیف: {number.format(rows)}</p>
    <progress max={total || 1} value={cursor} aria-label={`پیشرفت ${name}`} style={{ width: "100%" }} />
    <p>حداقل زمان با اجرای یک Tick در دقیقه: حدود {number.format(remaining)} دقیقه؛ خطا و محدودیت Stratz زمان را بیشتر می‌کند.</p>
    <p>آخرین موفقیت: {formatDate(success)}</p>
    {errorAt && <p className="monthly-reference-error">آخرین خطا: {formatDate(errorAt)} · {error || "پس از آن بازیابی شده"}</p>}
  </article>;
}

function PerformanceTable({ rows, empty }: { rows: PerformanceRow[]; empty: string }) {
  if (!rows.length) return <p>{empty}</p>;
  return <div className="admin-table-wrap monthly-reference-table"><table className="admin-users-table">
    <thead><tr><th>گروه Rank</th><th>Pos</th><th>نمونه</th>{metrics.map(([key, title]) => <th key={key}>{title}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={`${row.rankGroup}-${row.position}`}>
      <td dir="ltr">{row.rankGroup}</td><td>{row.position}</td><td>{number.format(row.sampleCount)}</td>
      {metrics.map(([key]) => <td key={key} dir="ltr">{typeof row[key] === "number" ? decimal.format(row[key] as number) : "—"}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

const mockVersions: Version[] = [
  { id: "00000000-0000-4000-8000-000000000001", referenceMonth: "2026-08-01", status: "building",
    sourcePolicy: "stratz-ranked-assumed-di-v2", metaCursor: 4, metaTotal: 4, performanceCursor: 93, performanceTotal: 128, metaRows: 3200, heroRows: 0, positionRows: 0,
    startedAt: "2026-09-06T10:00:00Z", completedAt: null, metaLastSuccessAt: "2026-09-06T10:16:00Z", performanceLastSuccessAt: "2026-09-06T12:05:00Z",
    metaLastErrorAt: null, performanceLastErrorAt: "2026-09-06T11:50:00Z", metaLastError: null, performanceLastError: null },
  { id: "00000000-0000-4000-8000-000000000002", referenceMonth: "2026-07-01", status: "active",
    sourcePolicy: "stratz-ranked-assumed-di-v2", metaCursor: 4, metaTotal: 4, performanceCursor: 128, performanceTotal: 128, metaRows: 3000, heroRows: 15000, positionRows: 375,
    startedAt: "2026-08-07T08:00:00Z", completedAt: "2026-08-07T15:00:00Z", metaLastSuccessAt: "2026-08-07T08:16:00Z", performanceLastSuccessAt: "2026-08-07T15:00:00Z",
    metaLastErrorAt: null, performanceLastErrorAt: null, metaLastError: null, performanceLastError: null },
  { id: "00000000-0000-4000-8000-000000000003", referenceMonth: "2026-07-01", status: "retired",
    sourcePolicy: "stratz-ranked-assumed", metaCursor: 16, metaTotal: 16, performanceCursor: 512, performanceTotal: 512, metaRows: 11900, heroRows: 61500, positionRows: 1500,
    startedAt: "2026-08-06T08:00:00Z", completedAt: "2026-08-06T15:00:00Z", metaLastSuccessAt: "2026-08-06T08:16:00Z", performanceLastSuccessAt: "2026-08-06T15:00:00Z",
    metaLastErrorAt: null, performanceLastErrorAt: null, metaLastError: null, performanceLastError: null },
];
const mockEvents: Event[] = [
  { id: "a", service: "performance", level: "success", message: "DIVINE_IMMORTAL / هفتهٔ 2959: 740 ردیف؛ ۹۳ از ۱۲۸", createdAt: "2026-09-06T12:05:00Z" },
  { id: "b", service: "performance", level: "error", message: "STRATZ rate limit؛ Retry در اجرای بعد", createdAt: "2026-09-06T11:50:00Z" },
  { id: "c", service: "meta", level: "success", message: "IMMORTAL / TURBO: ۷۰۰ ردیف؛ Meta کامل شد", createdAt: "2026-09-06T10:16:00Z" },
];
const exampleMeans = { cs: 7.56, dn: 2.2, kills: 1.47, deaths: 2.23, assists: 3.04, networth: 2057.29, xp: 2400,
  heroDamage: 3600, towerDamage: 10, healingAllies: 400, campsStacked: 0.5, neutrals: 1, ancients: 0, teamKills: 5 };
const mockDetails: Details = {
  meta: [{ position: 5, rankBracket: "DIVINE", gameMode: 22, matchCount: 7823, winCount: 3970,
    positionShare: 73.2, metaPickRate: 4.8, winRate: 50.7 },
  { position: 5, rankBracket: "DIVINE", gameMode: 23, matchCount: 2413, winCount: 1250,
    positionShare: 68.2, metaPickRate: 3.8, winRate: 51.8 }],
  performance: [{ position: 5, rankGroup: "DIVINE_IMMORTAL", minute: 11, sampleCount: 7823, ...exampleMeans }],
  position: [{ position: 5, rankGroup: "DIVINE_IMMORTAL", minute: 11, sampleCount: 208201, ...exampleMeans }],
};
