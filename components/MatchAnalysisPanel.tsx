"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowDown, ArrowRightLeft, ArrowUp, BarChart3, Check, ChevronLeft, ChevronRight, CircleGauge, Clock3, Crosshair, Database, Eye, EyeOff, Info, Lightbulb, MapPinned, Minus, RefreshCw, Sparkles, TrendingUp, UsersRound } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { calculatePerformanceDomains, calculatePerformanceScore, performanceTone } from "@/lib/dota/performance-score";
import type { DotaTeam, Match, MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis, PerformanceTone } from "@/lib/types";
import AppLogo from "./AppLogo";
import MatchMapEngine from "./MatchMapEngine";

type View = "summary" | "timeline" | "timing" | "map" | "players";
type TimelineMetric = "gold" | "xp" | "lastHits";
type TimelineScope = "solo" | "role" | "all";
type RequestState = "idle" | "loading" | "ready" | "empty" | "error";
type Trend = "positive" | "steady" | "negative";

const fa = new Intl.NumberFormat("fa-IR");
const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const SERIES_COLORS = ["#f3bd57", "#57d8b1", "#58c9f3", "#f06d65", "#b08bf0", "#f29a62", "#80d36b", "#ef7fb8", "#72a7ff", "#d9d7cf"];
const analysisCache=new Map<string,MatchAnalysis|null>();
const METRICS: Record<string, { label: string; description: string; direction: "higher" | "lower" | "contextual" }> = {
  gold_per_min: { label: "GPM", description: "میزان Gold به‌دست‌آمده در هر دقیقه", direction: "higher" },
  xp_per_min: { label: "XPM", description: "میزان XP به‌دست‌آمده در هر دقیقه", direction: "higher" },
  kills_per_min: { label: "Kills / min", description: "میانگین Kill در هر دقیقه", direction: "higher" },
  deaths_per_min: { label: "Deaths / min", description: "میانگین Death در هر دقیقه؛ مقدار کمتر بهتر است", direction: "lower" },
  assists_per_min: { label: "Assists / min", description: "میانگین Assist در هر دقیقه", direction: "higher" },
  fight_participation: { label: "Fight Participation", description: "درصد مشارکت در Killهای تیم", direction: "higher" },
  lane_efficiency_pct: { label: "Lane Efficiency", description: "بازده اقتصادی Laning Stage", direction: "higher" },
  last_hits_per_min: { label: "LH / min", description: "میانگین Last Hit در هر دقیقه", direction: "higher" },
  denies_at_10: { label: "Denies @10", description: "تعداد Deny تا دقیقه ۱۰", direction: "higher" },
  hero_damage_per_min: { label: "Hero DMG / min", description: "میانگین Damage واردشده به Heroها در هر دقیقه", direction: "higher" },
  hero_healing_per_min: { label: "Heal / min", description: "میانگین Heal ثبت‌شده در هر دقیقه", direction: "contextual" },
  tower_damage: { label: "Tower DMG", description: "مجموع Damage واردشده به Tower و ساختمان‌ها", direction: "higher" },
};
const TIMELINE: Record<TimelineMetric, { label: string; description: string; className: string }> = {
  gold: { label: "Net Worth", description: "روند Gold بازیکن", className: "is-gold" },
  xp: { label: "XP", description: "روند XP بازیکن", className: "is-xp" },
  lastHits: { label: "Last Hits", description: "روند Last Hit بازیکن", className: "is-last-hits" },
};

export default function MatchAnalysisPanel({ match, active, onPositionOverrides }: { match: Match; active: boolean; onPositionOverrides?: (updates:Record<string,number>) => void }) {
  const cached=match.analysis??analysisCache.get(match.id)??null;
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(cached);
  const [requestState, setRequestState] = useState<RequestState>(cached ? "ready" : "idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [slot, setSlot] = useState<number | null>(initialSlot(match.analysis));
  const [minute, setMinute] = useState(match.analysis?.durationMinutes || 0);
  const [retryToken, setRetryToken] = useState(0);
  const currentMatchId = useRef(match.id);

  useEffect(() => {
    currentMatchId.current = match.id;
    const next = match.analysis??analysisCache.get(match.id)??null;
    setAnalysis(next); setRequestState(next ? "ready" : "idle"); setError(""); setView("summary"); setSlot(initialSlot(next)); setMinute(next?.durationMinutes || 0);
  }, [match.analysis, match.id]);

  useEffect(() => {
    if (!active || !match.dotaMatchId || analysis) return;
    const controller = new AbortController(); let timedOut = false; const requestedMatchId = match.id;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    setRequestState("loading"); setError("");
    void fetch(`/api/matches/${match.id}/analysis`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { analysis?: MatchAnalysis | null; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(body?.error?.message || "تحلیل مچ آماده نشد");
        return body?.analysis || null;
      })
      .then((value) => {
        if (controller.signal.aborted || currentMatchId.current !== requestedMatchId) return;
        analysisCache.set(requestedMatchId,value);
        setAnalysis(value); setSlot(initialSlot(value)); setMinute(value?.durationMinutes || 0); setRequestState(value ? "ready" : "empty");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        if (currentMatchId.current !== requestedMatchId) return;
        setError(timedOut ? "دریافت تحلیل بیشتر از حد انتظار طول کشید. دوباره تلاش کنید." : reason instanceof Error ? reason.message : "تحلیل مچ آماده نشد"); setRequestState("error");
      }).finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [active, analysis, match.dotaMatchId, match.id, retryToken]);

  useEffect(() => {
    if (!active || !analysis) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const index = event.key === "0" ? 9 : /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
      const next = analysis.players[index];
      if (next) { event.preventDefault(); setSlot(next.playerSlot); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, analysis]);

  const player = analysis?.players.find((entry) => entry.playerSlot === slot) || analysis?.players.find((entry) => entry.isProfilePlayer) || analysis?.players[0];
  const confirmPositions = (updates:Record<string,number>) => {
    setAnalysis((current) => {
      if (!current) return current;
      const next = { ...current, players: current.players.map((entry) => updates[String(entry.playerSlot)]===undefined ? entry : {
        ...entry,
        position:updates[String(entry.playerSlot)],
        positionLabel: ["", "Carry", "Mid", "Offlane", "Soft Support", "Hard Support"][updates[String(entry.playerSlot)]],
        positionResolution: {
          assignedPosition: entry.positionResolution?.assignedPosition ?? null,
          detectedPosition: updates[String(entry.playerSlot)],
          confirmedPosition: updates[String(entry.playerSlot)],
          confidence: 100,
          source: "manual" as const,
          roleSwapDetected: false,
          swapWithPlayerSlot:null,
          evidence:entry.positionResolution?.evidence,
        },
      }) };
      analysisCache.set(match.id, next);
      return next;
    });
    onPositionOverrides?.(updates);
  };
  const retry = () => { setAnalysis(null); setRequestState("idle"); setError(""); setRetryToken((current) => current + 1); };
  if (!match.dotaMatchId) return null;
  if (requestState === "loading") return <section className="analysis-loading"><AppLogo size={48} alt="" /><div><strong>در حال آماده‌سازی Match Analysis</strong><p>Benchmark و Timeline هر ۱۰ بازیکن در حال پردازش است.</p></div></section>;
  if (requestState === "error") return <Empty icon={<AlertTriangle />} title="تحلیل مچ آماده نشد" text={error} actionLabel="تلاش دوباره" onAction={retry} />;
  if (active && !analysis) return <Empty icon={<CircleGauge />} title="داده کافی برای تحلیل نیست" text="پس از آماده‌شدن Replay، تحلیل کامل این مچ نمایش داده می‌شود." actionLabel="بررسی دوباره" onAction={retry} />;
  if (!analysis || !player) return null;

  return <section className="match-analysis">
    <header className="analysis-hero"><div><span><Activity /></span><div><p>PERFORMANCE PULSE · MATCH ANALYSIS</p><h3>مرور عملکرد مچ</h3><small>{analysis.status === "ready" ? "Benchmark و Timeline کامل" : "تحلیل داده‌های در دسترس"}</small></div></div><b>{fa.format(analysis.coverage.benchmarkPlayers)}<small> / {fa.format(analysis.coverage.totalPlayers)} بازیکن</small></b></header>
    <nav className="analysis-nav" aria-label="نماهای تحلیل"><Nav active={view === "summary"} icon={<Sparkles />} label="Overview" secondary="جمع‌بندی" click={() => setView("summary")} /><Nav active={view === "timeline"} icon={<Activity />} label="Progression" secondary="روند LH / NW / XP" click={() => setView("timeline")} /><Nav active={view === "timing"} icon={<Clock3 />} label="Item Timing" secondary="زمان‌بندی آیتم‌ها" click={() => setView("timing")} /><Nav active={view === "map"} icon={<MapPinned />} label="Map Analysis" secondary="فارم، اهداف و حرکت" click={() => setView("map")} /><Nav active={view === "players"} icon={<UsersRound />} label="10 Players" secondary="مقایسه بازیکنان" click={() => setView("players")} /></nav>
    <div className="analysis-player-dock"><PlayerStrip players={analysis.players} selected={player.playerSlot} select={setSlot} /></div>
    {view === "summary" && <Summary player={player} players={analysis.players} duration={analysis.durationMinutes} confirmPositions={onPositionOverrides ? confirmPositions : undefined} />}
    {view === "timeline" && <TimelineView analysis={analysis} player={player} minute={minute} setMinute={setMinute} />}
    {view === "timing" && <TimingView player={player}/>}
    {view === "map" && <MatchMapEngine player={player} players={analysis.players} duration={analysis.durationMinutes}/>}
    {view === "players" && <Roster analysis={analysis} selected={player.playerSlot} inspect={setSlot} />}
  </section>;
}

function initialSlot(analysis: MatchAnalysis | null | undefined) { return analysis?.players.find((entry) => entry.isProfilePlayer)?.playerSlot ?? analysis?.players[0]?.playerSlot ?? null; }
function Empty({ icon, title, text, actionLabel, onAction }: { icon: ReactNode; title: string; text: string; actionLabel?: string; onAction?: () => void }) { return <section className="analysis-state"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div>{actionLabel && onAction && <button type="button" onClick={onAction}><RefreshCw />{actionLabel}</button>}</section>; }
function Nav({ active, icon, label, secondary, click }: { active: boolean; icon: ReactNode; label: string; secondary: string; click: () => void }) { return <button className={active ? "is-active" : ""} type="button" onClick={click}>{icon}<span lang="en" dir="ltr">{label}</span><small>{secondary}</small></button>; }
function portrait(player: MatchPlayerAnalysis) { const hero = heroById(player.heroId); return hero ? heroImage(hero) : ""; }

function PlayerStrip({ players, selected, select }: { players: MatchPlayerAnalysis[]; selected: number; select: (slot: number) => void }) {
  const order = new Map(players.map((entry, index) => [entry.playerSlot, index + 1]));
  return <div className="analysis-player-strip">{(["radiant", "dire"] as DotaTeam[]).map((team) => <section className={`is-${team}`} key={team}>
    <img className="analysis-team-logo" src={`/match-details/${team}.webp`} alt={team === "radiant" ? "Radiant" : "Dire"} />
    <div>{players.filter((entry) => entry.team === team).map((entry) => {
      const index = order.get(entry.playerSlot) || 0; const shortcut = index === 10 ? "0" : String(index);
      return <button className={`${entry.playerSlot === selected ? "is-selected" : ""}${entry.isProfilePlayer ? " is-profile" : ""}`} type="button" key={entry.playerSlot} onClick={() => select(entry.playerSlot)} aria-pressed={entry.playerSlot === selected} aria-keyshortcuts={shortcut} aria-label={`بازیکن ${index}: ${entry.personName} با ${entry.heroName}`} title={`انتخاب با کلید ${shortcut}`}><img src={portrait(entry)} alt="" /><span lang="en" dir="ltr">{index}</span>{entry.isProfilePlayer && <small lang="en">YOU</small>}</button>;
    })}</div>
  </section>)}</div>;
}

function Summary({ player,players,duration,confirmPositions }: { player: MatchPlayerAnalysis;players:MatchPlayerAnalysis[];duration:number;confirmPositions?: (updates:Record<string,number>)=>void }) {
  const strengths = highlights(player).filter((entry) => entry.qualityPercentile >= 80).slice(0, 3);
  const weaknesses = [...highlights(player)].reverse().filter((entry) => entry.qualityPercentile < 40).slice(0, 3);
  const finding = primaryFinding(strengths[0], weaknesses[0]);
  const swapPartner=players.find((entry)=>entry.playerSlot===player.positionResolution?.swapWithPlayerSlot);
  return <div className="analysis-summary">{player.positionResolution?.roleSwapDetected&&<RoleSwapReview player={player} partner={swapPartner} confirm={confirmPositions}/>} {confirmPositions&&<PositionConfirmation player={player} players={players} confirm={confirmPositions}/>}<CohortContext player={player}/><DomainProfile player={player} duration={duration}/><div className="analysis-overview-grid">
    <section className="benchmark-board"><SectionHeading icon={<BarChart3 />} title="Benchmark Spectrum" detail={player.benchmarkSource === "hero" ? "مقایسه با بازی‌های اخیر همین Hero" : player.benchmarkSource === "match" ? "مقایسه داخلی بین بازیکنان همین Match" : "داده کافی نیست"} />{player.benchmarks.length ? <div className="benchmark-grid">{player.benchmarks.map((entry) => <MetricCard entry={entry} key={entry.key} />)}</div> : <p>Replay این Match، داده Benchmark کامل ندارد.</p>}</section>
    <aside className="analysis-insights-column"><Verdict good title="نقاط قوت" englishTitle="STRENGTHS" metrics={strengths} /><Verdict title="فرصت‌های بهبود" englishTitle="WATCHLIST" metrics={weaknesses} /><section className="analysis-finding-panel"><SectionHeading icon={<Lightbulb />} title="Primary Finding" detail="مهم‌ترین مسیر پیشنهادی برای Replay review" /><article className="analysis-primary-finding"><h5 lang="en" dir="ltr">{finding.title}</h5><p>{finding.copy}</p></article></section></aside>
  </div></div>;
}

function RoleSwapReview({player,partner,confirm}:{player:MatchPlayerAnalysis;partner?:MatchPlayerAnalysis;confirm?: (updates:Record<string,number>)=>void}){const resolution=player.positionResolution;if(!resolution)return null;const accept=()=>{if(!confirm||resolution.detectedPosition===null)return;const updates:Record<string,number>={[String(player.playerSlot)]:resolution.detectedPosition};if(partner&&partner.positionResolution?.detectedPosition)updates[String(partner.playerSlot)]=partner.positionResolution.detectedPosition;confirm(updates);};return <section className="position-resolution-alert"><ArrowRightLeft/><div><strong>Role Swap احتمالی شناسایی شد</strong><p><b>{player.heroName}</b> از Pos {resolution.assignedPosition??"?"} به Pos {resolution.detectedPosition??"?"}{partner?<> و <b>{partner.heroName}</b> به Pos {partner.position??"?"}</>:null} منتقل شده است. این نتیجه از STRATZ و رفتار Lane/Farm ساخته شده است.</p>{confirm&&<button type="button" onClick={accept}><Check/>تأیید این جابه‌جایی</button>}</div><span>{resolution.confidence}% confidence</span></section>}

function CohortContext({player}:{player:MatchPlayerAnalysis}){const cohort=player.cohort;if(!cohort)return <section className="analysis-cohort-context is-limited"><Database/><div><b>مرجع خارجی هنوز آماده نیست</b><p>تا اجرای اولین Snapshot، فقط Benchmark همراه داده OpenDota یا مقایسه ۱۰ بازیکن همین Match نمایش داده می‌شود؛ مچ‌های کاربران سایت وارد Benchmark نمی‌شوند.</p></div></section>;return <section className={`analysis-cohort-context is-${cohort.confidence}`}><Database/><div><b>{cohort.label}</b><p><span>{cohort.heroPositionSamples.toLocaleString("fa-IR")} Match برای Hero + Pos</span><span>{cohort.positionSamples.toLocaleString("fa-IR")} Match در Position</span><span>Role Share: {cohort.positionPickRate===null?"—":`${cohort.positionPickRate.toLocaleString("fa-IR")}%`}</span><span>Meta Pick Rate: {cohort.metaPickRate==null?"—":`${cohort.metaPickRate.toLocaleString("fa-IR")}%`}</span><span>Win Rate: {cohort.winRate==null?"—":`${cohort.winRate.toLocaleString("fa-IR")}%`}</span><span>Confidence Weight: {cohort.heroPositionWeight.toLocaleString("fa-IR")}%</span></p>{cohort.stale&&<em>Snapshot منقضی شده؛ آخرین نسخه سالم نمایش داده می‌شود.</em>}{cohort.limitations.map((item)=><small key={item}>{item}</small>)}</div><strong>{cohort.confidence.toUpperCase()}</strong></section>}

function PositionConfirmation({player,players,confirm}:{player:MatchPlayerAnalysis;players:MatchPlayerAnalysis[];confirm:(updates:Record<string,number>)=>void}){
  const teammates=players.filter((entry)=>entry.team===player.team&&entry.playerSlot!==player.playerSlot&&entry.position!==null);
  const swap=(partner:MatchPlayerAnalysis)=>{if(player.position===null||partner.position===null)return;confirm({[String(player.playerSlot)]:partner.position,[String(partner.playerSlot)]:player.position});};
  return <section className="position-confirmation"><div><ArrowRightLeft/><span><b>Position واقعی این بازیکن</b><small>Position را مستقیم انتخاب کن، یا Role Swap دستی را ثبت کن.</small></span></div><div dir="ltr">{[1,2,3,4,5].map((position)=><button type="button" className={player.position===position?"is-active":""} onClick={()=>confirm({[String(player.playerSlot)]:position})} key={position}>Pos {position}</button>)}</div><details className="manual-role-swap"><summary>Role Swap با…</summary><div>{teammates.map((partner)=><button type="button" onClick={()=>swap(partner)} key={partner.playerSlot}><img src={portrait(partner)} alt=""/><span>{partner.heroName}<small>Pos {partner.position}</small></span></button>)}</div></details>{player.positionResolution?.source==="manual"&&<em>تأیید دستی؛ پس از «ثبت تغییرات» ذخیره می‌شود.</em>}</section>;
}

function DomainProfile({player,duration}:{player:MatchPlayerAnalysis;duration:number}){const domains=calculatePerformanceDomains([...player.benchmarks,...(player.scoreMetrics||[])],duration,player.position);return <section className="performance-domain-profile"><header><div><CircleGauge/><span><b>PERFORMANCE PROFILE</b><small>وزن‌دهی متناسب با Pos {player.position||"?"}</small></span></div><ScoreRing score={playerScore(player,duration)}/></header><div>{domains.map((item)=><article key={item.key} className={`is-${item.score==null?"unavailable":performanceTone(item.score)}`}><span><b>{item.label}</b><small>{item.metricCount?`وزن مؤثر ${Math.round(item.weight)} · ${item.metricCount} معیار`:"داده کافی نیست"}</small></span><strong>{item.score??"—"}</strong><i><em style={{width:`${item.score||0}%`}}/></i></article>)}</div></section>}

function SectionHeading({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) { return <header className="analysis-section-heading"><div>{icon}<strong lang="en" dir="ltr">{title}</strong></div>{detail && <span>{detail}</span>}</header>; }
function display(value: number | null | undefined) { return value === null || value === undefined ? "—" : en.format(value); }
function presentation(entry: MatchBenchmarkMetric) { const fallback = METRICS[entry.key]; return { label: entry.shortLabel || fallback?.label || entry.label, description: entry.description || fallback?.description || entry.label, direction: entry.direction || fallback?.direction || "higher" }; }
function tone(entry?: MatchBenchmarkMetric): PerformanceTone | null { return entry ? performanceTone(entry.qualityPercentile) : null; }
function highlights(player: MatchPlayerAnalysis) { return [...player.benchmarks,...(player.scoreMetrics||[])].filter((entry) => entry.highlightEligible !== false).sort((a, b) => b.qualityPercentile - a.qualityPercentile); }
function primaryFinding(strength?: MatchBenchmarkMetric, weakness?: MatchBenchmarkMetric) {
  if (!strength && !weakness) return { title: "REPLAY REVIEW", copy: "برای این بازیکن هنوز داده کافی برای نتیجه‌گیری قابل اتکا وجود ندارد." };
  const strong = strength ? presentation(strength).label : "Impact"; const weak = weakness ? presentation(weakness).label : "Decision Making";
  const farm = new Set(["gold_per_min", "xp_per_min", "last_hits_per_min"]); const objective = new Set(["tower_damage", "hero_damage_per_min", "kills_per_min"]);
  if (strength && weakness && farm.has(strength.key) && objective.has(weakness.key)) return { title: "FARM → OBJECTIVE CONVERSION", copy: `${strong} سیگنال مثبت این عملکرد بوده، اما ${weak} پایین مانده است؛ در Replay بررسی کن برتری Farm کجا باید به Fight یا Objective تبدیل می‌شد.` };
  return { title: `${strong.toUpperCase()} → ${weak.toUpperCase()}`, copy: `${strong} بهترین سیگنال این عملکرد است. برای Replay review، ابتدا لحظه‌هایی را بررسی کن که روی ${weak} اثر گذاشته‌اند.` };
}

function Verdict({ good = false, title, englishTitle, metrics }: { good?: boolean; title: string; englishTitle: string; metrics: MatchBenchmarkMetric[] }) {
  return <section className={`analysis-verdict-group is-${good ? "good" : "bad"}`}><SectionHeading icon={good ? <TrendingUp /> : <Crosshair />} title={englishTitle} detail={title} /><article className="analysis-verdict">{metrics.length ? metrics.map((entry) => <div key={entry.key}><span><b lang="en" dir="ltr">{presentation(entry).label}</b><small>{presentation(entry).description}</small></span><strong className={`is-${tone(entry)}`}>{entry.scoreOnly?`امتیاز ${fa.format(entry.qualityPercentile)} از ۱۰۰`:`بهتر از ${fa.format(entry.qualityPercentile)}٪`}</strong></div>) : <p>{good ? "نقطه قوت معناداری ثبت نشده است." : "افت معناداری ثبت نشده است."}</p>}</article></section>;
}

function MetricCard({ entry }: { entry: MatchBenchmarkMetric }) {
  const info = presentation(entry); const context = entry.cohortLabel||(entry.source === "hero" ? "همان Hero" : "همین Match"); const direction = info.direction === "lower" ? "کمتر بهتر است" : info.direction === "contextual" ? "وابسته به Hero" : "بیشتر بهتر است";
  return <article className={`benchmark-cell is-${tone(entry)}`}><header><span className="benchmark-label" lang="en" dir="ltr">{info.label}<span className="analysis-metric-help" tabIndex={0} aria-label={info.description}><Info /><span role="tooltip">{info.description}</span></span></span></header><strong className="benchmark-raw" lang="en" dir="ltr">{entry.formattedValue}</strong><p>{info.description}</p><div className="benchmark-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.qualityPercentile}><span style={{ width: `${entry.qualityPercentile}%` }} /></div><footer><b>بهتر از {fa.format(entry.qualityPercentile)}٪</b><small>{context} · {direction}</small></footer></article>;
}

function TimingView({player}:{player:MatchPlayerAnalysis}){const items=player.itemTimings||[];return <section className="item-timing-view"><SectionHeading icon={<Clock3/>} title="ITEM TIMING LAB" detail={`زمان خرید آیتم‌های ${player.heroName} و وضعیت مرجع آماری`}/>{items.length?<><div className="item-timing-summary"><article><span>Early</span><b>{items.filter((item)=>item.relativeToReference==="early").length}</b><small>حداقل ۲ دقیقه زودتر</small></article><article><span>On time</span><b>{items.filter((item)=>item.relativeToReference==="on_time").length}</b><small>در بازه ±۲ دقیقه</small></article><article><span>Late</span><b>{items.filter((item)=>item.relativeToReference==="late").length}</b><small>حداقل ۲ دقیقه دیرتر</small></article><article><span>No reference</span><b>{items.filter((item)=>item.relativeToReference==="unavailable").length}</b><small>Timing ثبت شده؛ دیتاست معتبر موجود نیست</small></article></div><div className="item-timing-track" dir="ltr">{items.map((item)=><article className={`is-${item.relativeToReference}`} key={`${item.key}-${item.second}`} style={{"--timing-position":`${Math.min(100,item.minute/Math.max(1,(player.timeline.at(-1)?.minute??60))*100)}%`} as CSSProperties}><i/><div><span>{item.minute}:{String(Math.round(item.second%60)).padStart(2,"0")}</span><b>{item.label}</b><small>{item.category}</small></div><p dir="rtl">{item.note}</p>{item.referenceMinute!==null&&<em>Median {item.referenceMinute}m</em>}</article>)}</div></>:<Empty icon={<Clock3/>} title="Item Timing آماده نیست" text="Purchase log این Replay وجود ندارد یا آیتم اصلی قابل مقایسه‌ای ثبت نشده است."/>}</section>}

function TimelineView({ analysis, player, minute, setMinute }: { analysis: MatchAnalysis; player: MatchPlayerAnalysis; minute: number; setMinute: (value: number) => void }) {
  const [metricKey, setMetricKey] = useState<TimelineMetric>("gold"); const [scope, setScope] = useState<TimelineScope>("solo");
  const [visibleSlots, setVisibleSlots] = useState<Set<number>>(() => new Set(analysis.players.map((entry) => entry.playerSlot)));
  const info = TIMELINE[metricKey]; const opponent = analysis.players.find((entry) => entry.team !== player.team && player.position !== null && entry.position === player.position);
  useEffect(() => { setVisibleSlots(new Set(analysis.players.map((entry) => entry.playerSlot))); }, [analysis]);
  const seriesPlayers = scope === "solo" ? [player] : scope === "role" ? [player, ...(opponent ? [opponent] : [])] : analysis.players.filter((entry) => visibleSlots.has(entry.playerSlot));
  const colors = new Map(analysis.players.map((entry, index) => [entry.playerSlot, entry.playerSlot === player.playerSlot ? "var(--timeline-accent)" : SERIES_COLORS[index % SERIES_COLORS.length]]));
  const chart = useMemo(() => buildChart(seriesPlayers, metricKey, analysis.durationMinutes), [seriesPlayers, metricKey, analysis.durationMinutes]);
  const snapshot = closest(player.timeline, minute); const team = [...analysis.teamTimeline].reverse().find((point) => point.minute <= minute); const legend = scope === "all" ? analysis.players : scope === "role" ? seriesPlayers : [];
  const toggle = (playerSlot: number) => setVisibleSlots((current) => { const next = new Set(current); if (next.has(playerSlot)) next.delete(playerSlot); else next.add(playerSlot); return next; });
  return <div className={`timeline-view ${info.className}`} dir="rtl">
    <header className="timeline-heading"><div><span lang="en" dir="ltr">PLAYER TIMELINE</span><h4 lang="en" dir="ltr">{player.heroName}</h4><p>{info.description}</p></div><div className="timeline-toolbar"><div className="timeline-metric-switch">{(Object.keys(TIMELINE) as TimelineMetric[]).map((key) => <button className={metricKey === key ? "is-active" : ""} type="button" key={key} onClick={() => setMetricKey(key)} lang="en" dir="ltr">{TIMELINE[key].label}</button>)}</div><div className="timeline-scope-switch"><button className={scope === "solo" ? "is-active" : ""} type="button" onClick={() => setScope("solo")}>فقط این Hero</button><button className={scope === "role" ? "is-active" : ""} type="button" onClick={() => setScope("role")} disabled={!opponent}>مقایسه Position</button><button className={scope === "all" ? "is-active" : ""} type="button" onClick={() => setScope("all")}>هر ۱۰ بازیکن</button></div></div></header>
    <ProgressionMilestones player={player} opponent={scope==="role"?opponent:undefined} metricKey={metricKey} duration={analysis.durationMinutes}/>
    {legend.length > 0 && <div className="timeline-series-legend" dir="ltr">{legend.map((entry) => { const visible = scope !== "all" || visibleSlots.has(entry.playerSlot); return <button type="button" key={entry.playerSlot} className={visible ? "is-visible" : ""} onClick={() => scope === "all" && toggle(entry.playerSlot)} aria-pressed={visible} disabled={scope !== "all"}><span style={{ background: colors.get(entry.playerSlot) }} /><img src={portrait(entry)} alt="" /><b>{entry.heroName}</b><small>Pos {entry.position || "?"}</small>{scope === "all" && (visible ? <Eye /> : <EyeOff />)}</button>; })}</div>}
    <div className={`timeline-chart-layout${seriesPlayers.length > 1 ? " has-comparison" : ""}`}>
      <section className="timeline-chart-shell" dir="ltr">{chart ? <svg viewBox="0 0 760 282" role="img" aria-label={`${info.label} برای ${seriesPlayers.map((entry) => entry.heroName).join(" و ")}`}><defs><linearGradient id={`analysis-fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--timeline-accent)" stopOpacity=".3" /><stop offset="1" stopColor="var(--timeline-accent)" stopOpacity="0" /></linearGradient></defs>{[50, 100, 150, 200, 250].map((y) => <line className="timeline-grid-line" x1="38" x2="742" y1={y} y2={y} key={y} />)}{scope === "solo" && chart.series[0] && <path className="timeline-area" style={{ fill: `url(#analysis-fill-${metricKey})` }} d={chart.series[0].area} />}{chart.series.map((series) => <path className="timeline-line" style={{ stroke: colors.get(series.player.playerSlot) }} d={series.line} key={series.player.playerSlot} />)}<line className="timeline-cursor-line" x1={chart.minuteX(minute)} x2={chart.minuteX(minute)} y1="28" y2="250" />{chart.series.map((series) => { const point = closest(series.player.timeline, minute); const value = point?.[metricKey] ?? null; return value === null ? null : <circle className="timeline-cursor-dot" style={{ stroke: colors.get(series.player.playerSlot) }} cx={chart.minuteX(minute)} cy={chart.valueY(value)} r="6" key={series.player.playerSlot} />; })}<text className="timeline-axis-label" x="38" y="274">0</text><text className="timeline-axis-label" x="214" y="274">{Math.round(analysis.durationMinutes * .25)}m</text><text className="timeline-axis-label" x="390" y="274">{Math.round(analysis.durationMinutes * .5)}m</text><text className="timeline-axis-label" x="566" y="274">{Math.round(analysis.durationMinutes * .75)}m</text><text className="timeline-axis-label" x="714" y="274">{analysis.durationMinutes}m</text></svg> : <p className="timeline-empty">برای انتخاب فعلی Timeline آماده نیست.</p>}</section>
      {seriesPlayers.length > 1 && <TimelineComparison players={seriesPlayers} metricKey={metricKey} minute={minute} colors={colors} />}
    </div>
    <header className="timeline-control" dir="ltr"><button type="button" onClick={() => setMinute(Math.max(0, minute - 1))}><ChevronLeft /></button><div dir="rtl"><span>دقیقه</span><b>{fa.format(minute)}</b></div><input type="range" min="0" max={analysis.durationMinutes} value={minute} onChange={(event) => setMinute(Number(event.target.value))} aria-label="دقیقه Timeline" /><button type="button" onClick={() => setMinute(Math.min(analysis.durationMinutes, minute + 1))}><ChevronRight /></button></header>
    <TimelineEvents player={player} minute={minute}/>
    {seriesPlayers.length === 1 && <div className="timeline-status-grid"><TimelineStat label="Net Worth" description="Gold فعلی" value={snapshot?.gold} trend={snapshotTrend(player.timeline, snapshot, "goldDelta")} /><TimelineStat label="XP" description="XP فعلی" value={snapshot?.xp} trend={snapshotTrend(player.timeline, snapshot, "xpDelta")} /><TimelineStat label="Last Hits" description="Last Hit فعلی" value={snapshot?.lastHits} trend={snapshotTrend(player.timeline, snapshot, "lastHitDelta")} /><TimelineStat label="Momentum" description="وضعیت این دقیقه" value={snapshot?.label || "—"} trend={stateTrend(snapshot)} /></div>}
    {team && <div className="team-advantage"><span>برتری Gold <b className={(team.radiantGoldAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantGoldAdvantage)}</b></span><span>برتری XP <b className={(team.radiantXpAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantXpAdvantage)}</b></span></div>}
  </div>;
}

function TimelineEvents({player,minute}:{player:MatchPlayerAnalysis;minute:number}){
  const events=(player.events||[]).filter((event)=>Math.abs(event.minute-minute)<=1).slice(0,6);
  if(!events.length)return <div className="timeline-event-context"><Info/><span><b>Event Context</b><small>در بازه‌ی یک دقیقه اطراف این نقطه، رخداد ثبت‌شده‌ای در Replay نیست.</small></span></div>;
  return <div className="timeline-event-context has-events"><div><Activity/><span><b>Event Context</b><small>رخدادهای هم‌زمان؛ به‌تنهایی اثبات علت افت یا رشد نیستند.</small></span></div><section>{events.map((event)=><article className={event.positive===false?"is-negative":event.positive===true?"is-positive":"is-neutral"} key={event.id}><span>{event.type}</span><b>{event.label}</b><small>{Math.floor(event.second/60)}:{String(Math.round(event.second%60)).padStart(2,"0")}</small></article>)}</section></div>;
}

const MILESTONES=[5,10,20,30,40,60];
function ProgressionMilestones({player,opponent,metricKey,duration}:{player:MatchPlayerAnalysis;opponent?:MatchPlayerAnalysis;metricKey:TimelineMetric;duration:number}){const field=metricKey==="gold"?"goldDelta":metricKey==="xp"?"xpDelta":"lastHitDelta";return <section className="progression-milestones" dir="ltr"><header><div><Activity/><span><b>{TIMELINE[metricKey].label} MILESTONES</b><small>دقایق ۵، ۱۰، ۲۰، ۳۰، ۴۰ و ۶۰ · مقایسه مستقیم با حریف هم‌Position</small></span></div>{opponent&&<span>VS {opponent.heroName} · Pos {opponent.position}</span>}</header><div>{MILESTONES.map((minute)=>{const point=minute<=duration?closest(player.timeline,minute):undefined,rival=opponent&&minute<=duration?closest(opponent.timeline,minute):undefined,value=point?.[metricKey]??null,rivalValue=rival?.[metricKey]??null,delta=value!==null&&rivalValue!==null?value-rivalValue:null,cohort=player.cohort?.milestones.find((entry)=>entry.minute===minute),cohortValue=cohort?.[metricKey]??null,cohortDelta=value!==null&&cohortValue!==null?value-cohortValue:null,trend=snapshotTrend(player.timeline,point,field);return <article key={minute} className={`is-${trend}${minute>duration?" is-disabled":""}`}><span>@{minute}</span><strong>{value===null?"—":en.format(value)}</strong>{opponent&&<small>{delta===null?"No rival data":`${delta>0?"+":""}${en.format(delta)} vs rival`}</small>}{cohort&&<small>{cohortDelta===null?"No cohort data":`${cohortDelta>0?"+":""}${en.format(cohortDelta)} vs median · n=${cohort.sampleSize}`}</small>}<TrendIcon trend={trend}/></article>})}</div></section>}

function TimelineComparison({ players, metricKey, minute, colors }: { players: MatchPlayerAnalysis[]; metricKey: TimelineMetric; minute: number; colors: Map<number, string> }) {
  const field = metricKey === "gold" ? "goldDelta" : metricKey === "xp" ? "xpDelta" : "lastHitDelta";
  return <aside className="timeline-live-comparison" dir="ltr">{players.map((entry) => {
    const point = closest(entry.timeline, minute); const value = point?.[metricKey] ?? null; const trend = snapshotTrend(entry.timeline, point, field);
    return <article key={entry.playerSlot} className={`is-${trend}`}><span className="timeline-series-color" style={{ background: colors.get(entry.playerSlot) }} /><img src={portrait(entry)} alt="" /><div><b>{entry.heroName}</b><small>{entry.team} · Pos {entry.position || "?"}</small></div><strong>{value === null ? "—" : en.format(value)}</strong><TrendIcon trend={trend} /></article>;
  })}</aside>;
}

function buildChart(players: MatchPlayerAnalysis[], metricKey: TimelineMetric, duration: number) {
  const values = players.flatMap((player) => player.timeline.flatMap((point) => point[metricKey] === null ? [] : [point[metricKey] as number])); if (values.length < 2) return null;
  const maxValue = Math.max(1, ...values) * 1.08; const x = (value: number) => 38 + (Math.max(0, Math.min(duration, value)) / Math.max(1, duration)) * 704; const y = (value: number | null) => value === null ? 250 : 250 - (value / maxValue) * 212;
  const series = players.flatMap((player) => { const points = player.timeline.flatMap((point) => point[metricKey] === null ? [] : [{ minute: point.minute, value: point[metricKey] as number }]); if (points.length < 2) return []; const list = points.map((point) => `${x(point.minute).toFixed(1)},${y(point.value).toFixed(1)}`); return [{ player, line: `M ${list.join(" L ")}`, area: `M ${list.join(" L ")} L ${x(points.at(-1)!.minute).toFixed(1)},250 L ${x(points[0].minute).toFixed(1)},250 Z` }]; });
  return series.length ? { series, minuteX: x, valueY: y } : null;
}
function stateTrend(snapshot?: MatchMinuteSnapshot): Trend { if (!snapshot) return "steady"; if (snapshot.state === "setback" || snapshot.state === "out") return "negative"; if (snapshot.state === "surge" || snapshot.state === "progress") return "positive"; return "steady"; }
function snapshotTrend(timeline: MatchMinuteSnapshot[], snapshot: MatchMinuteSnapshot | undefined, field: "goldDelta" | "xpDelta" | "lastHitDelta"): Trend { if (!snapshot || snapshot[field] === null) return stateTrend(snapshot); if (snapshot.state === "setback" || snapshot.state === "out") return "negative"; const deltas = timeline.map((point) => point[field]).filter((value): value is number => value !== null && value > 0).sort((a, b) => a - b); const typical = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0; if (!typical) return stateTrend(snapshot); if ((snapshot[field] as number) >= typical * 1.15) return "positive"; if ((snapshot[field] as number) <= typical * .7) return "negative"; return snapshot.state === "progress" || snapshot.state === "surge" ? "positive" : "steady"; }
function TrendIcon({ trend }: { trend: Trend }) { return trend === "positive" ? <ArrowUp /> : trend === "negative" ? <ArrowDown /> : <Minus />; }
function TimelineStat({ label, description, value, trend }: { label: string; description: string; value: string | number | null | undefined; trend: Trend }) { return <article className={`is-${trend}`}><span lang="en" dir="ltr">{label}</span><div><strong>{typeof value === "number" ? en.format(value) : value ?? "—"}</strong><TrendIcon trend={trend} /></div><small>{description}</small></article>; }
function adv(value: number | null) { return value === null ? "—" : `${value >= 0 ? "Radiant" : "Dire"} ${fa.format(Math.abs(Math.round(value)))}`; }
function closest(timeline: MatchMinuteSnapshot[], minute: number) { return [...timeline].reverse().find((point) => point.minute <= minute); }
function metric(player: MatchPlayerAnalysis, key: string) { return player.benchmarks.find((entry) => entry.key === key); }
function playerScore(player: MatchPlayerAnalysis, duration: number) { return player.performanceScore ?? calculatePerformanceScore(player.benchmarks, duration,player.position); }

function Roster({ analysis, selected, inspect }: { analysis: MatchAnalysis; selected: number; inspect: (slot: number) => void }) {
  const players = [...analysis.players].sort((a, b) => playerScore(b, analysis.durationMinutes) - playerScore(a, analysis.durationMinutes));
  return <div className="analysis-roster-view"><SectionHeading icon={<UsersRound />} title="10 Players Comparison" detail="Score وزنی؛ معیارهای کم‌حجم و کم‌ارتباط Confidence پایین‌تری دارند." /><div className="analysis-roster-table-wrap"><table className="analysis-roster-table"><thead><tr><th>Player / Hero</th><th>Score</th><th>K / D / A</th><th>Fight Participation</th><th>Lane Efficiency</th><th>GPM</th><th>XPM</th><th>LH / min</th><th>DN @10</th><th>Hero DMG / min</th><th>Heal / min</th><th>Tower DMG</th></tr></thead><tbody>{players.map((entry) => <tr className={`analysis-roster-row is-${entry.team}`} data-selected={entry.playerSlot === selected} key={entry.playerSlot}><td><button type="button" onClick={() => inspect(entry.playerSlot)}><img src={portrait(entry)} alt="" /><span><b>{entry.personName}</b><small lang="en" dir="ltr">{entry.heroName} · {entry.positionLabel}</small></span></button></td><td><ScoreRing score={playerScore(entry, analysis.durationMinutes)} /></td><RosterKda player={entry} /><RosterMetric entry={metric(entry, "fight_participation")} /><RosterMetric entry={metric(entry, "lane_efficiency_pct")} /><RosterMetric entry={metric(entry, "gold_per_min")} /><RosterMetric entry={metric(entry, "xp_per_min")} /><RosterMetric entry={metric(entry, "last_hits_per_min")} /><RosterMetric entry={metric(entry, "denies_at_10")} /><RosterMetric entry={metric(entry, "hero_damage_per_min")} /><RosterMetric entry={metric(entry, "hero_healing_per_min")} /><RosterMetric entry={metric(entry, "tower_damage")} /></tr>)}</tbody></table></div></div>;
}
function ScoreRing({ score }: { score: number }) { const color = performanceTone(score); return <div className={`analysis-score-ring is-${color}`} style={{ "--score": `${score * 3.6}deg` } as CSSProperties}><span><b>{score}</b><small>/100</small></span></div>; }
function RosterMetric({ entry }: { entry?: MatchBenchmarkMetric }) { const color = tone(entry); return <td className={color ? `is-${color}` : ""} lang="en" dir="ltr"><b>{entry?.formattedValue || "—"}</b>{entry && <small>({entry.qualityPercentile}%)</small>}</td>; }
function RosterKda({ player }: { player: MatchPlayerAnalysis }) {
  const kills = metric(player, "kills_per_min"); const deaths = metric(player, "deaths_per_min"); const assists = metric(player, "assists_per_min");
  return <td className="analysis-roster-kda" lang="en" dir="ltr"><b>{display(player.kills)} / {display(player.deaths)} / {display(player.assists)}</b><small>(<span className={`is-${tone(kills)}`}>{kills?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(deaths)}`}>{deaths?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(assists)}`}>{assists?.qualityPercentile ?? "—"}%</span>)</small></td>;
}
