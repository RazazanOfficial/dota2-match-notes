"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, ChevronLeft, ChevronRight, CircleGauge, Crosshair, Eye, EyeOff, Info, Lightbulb, Minus, RefreshCw, Sparkles, TrendingUp, UsersRound } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { calculatePerformanceScore, performanceTone } from "@/lib/dota/performance-score";
import type { DotaTeam, Match, MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis, PerformanceTone } from "@/lib/types";
import AppLogo from "./AppLogo";

type View = "summary" | "timeline" | "players";
type TimelineMetric = "gold" | "xp" | "lastHits";
type TimelineScope = "solo" | "role" | "all";
type RequestState = "idle" | "loading" | "ready" | "empty" | "error";
type Trend = "positive" | "steady" | "negative";

const fa = new Intl.NumberFormat("fa-IR");
const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const SERIES_COLORS = ["#f3bd57", "#57d8b1", "#58c9f3", "#f06d65", "#b08bf0", "#f29a62", "#80d36b", "#ef7fb8", "#72a7ff", "#d9d7cf"];
const METRICS: Record<string, { label: string; description: string; direction: "higher" | "lower" | "contextual" }> = {
  gold_per_min: { label: "GPM", description: "میزان Gold به‌دست‌آمده در هر دقیقه", direction: "higher" },
  xp_per_min: { label: "XPM", description: "میزان XP به‌دست‌آمده در هر دقیقه", direction: "higher" },
  kills_per_min: { label: "Kills / min", description: "میانگین Kill در هر دقیقه", direction: "higher" },
  deaths_per_min: { label: "Deaths / min", description: "میانگین Death در هر دقیقه؛ مقدار کمتر بهتر است", direction: "lower" },
  assists_per_min: { label: "Assists / min", description: "میانگین Assist در هر دقیقه", direction: "higher" },
  last_hits_per_min: { label: "LH / min", description: "میانگین Last Hit در هر دقیقه", direction: "higher" },
  denies_per_min: { label: "Denies / min", description: "میانگین Deny در هر دقیقه", direction: "higher" },
  hero_damage_per_min: { label: "Hero DMG / min", description: "میانگین Damage واردشده به Heroها در هر دقیقه", direction: "higher" },
  hero_healing_per_min: { label: "Heal / min", description: "میانگین Heal ثبت‌شده در هر دقیقه", direction: "contextual" },
  tower_damage: { label: "Tower DMG", description: "مجموع Damage واردشده به Tower و ساختمان‌ها", direction: "higher" },
};
const TIMELINE: Record<TimelineMetric, { label: string; description: string; className: string }> = {
  gold: { label: "Net Worth", description: "روند Gold بازیکن", className: "is-gold" },
  xp: { label: "XP", description: "روند XP بازیکن", className: "is-xp" },
  lastHits: { label: "Last Hits", description: "روند Last Hit بازیکن", className: "is-last-hits" },
};

export default function MatchAnalysisPanel({ match, active }: { match: Match; active: boolean }) {
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(match.analysis || null);
  const [requestState, setRequestState] = useState<RequestState>(match.analysis ? "ready" : "idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [slot, setSlot] = useState<number | null>(initialSlot(match.analysis));
  const [minute, setMinute] = useState(match.analysis?.durationMinutes || 0);
  const [retryToken, setRetryToken] = useState(0);
  const currentMatchId = useRef(match.id);

  useEffect(() => {
    currentMatchId.current = match.id;
    const next = match.analysis || null;
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
  const retry = () => { setAnalysis(null); setRequestState("idle"); setError(""); setRetryToken((current) => current + 1); };
  if (!match.dotaMatchId) return null;
  if (requestState === "loading") return <section className="analysis-loading"><AppLogo size={48} alt="" /><div><strong>در حال آماده‌سازی Match Analysis</strong><p>Benchmark و Timeline هر ۱۰ بازیکن در حال پردازش است.</p></div></section>;
  if (requestState === "error") return <Empty icon={<AlertTriangle />} title="تحلیل مچ آماده نشد" text={error} actionLabel="تلاش دوباره" onAction={retry} />;
  if (active && !analysis) return <Empty icon={<CircleGauge />} title="داده کافی برای تحلیل نیست" text="پس از آماده‌شدن Replay، تحلیل کامل این مچ نمایش داده می‌شود." actionLabel="بررسی دوباره" onAction={retry} />;
  if (!analysis || !player) return null;

  return <section className="match-analysis">
    <header className="analysis-hero"><div><span><Activity /></span><div><p>PERFORMANCE PULSE · MATCH ANALYSIS</p><h3>مرور عملکرد مچ</h3><small>{analysis.status === "ready" ? "Benchmark و Timeline کامل" : "تحلیل داده‌های در دسترس"}</small></div></div><b>{fa.format(analysis.coverage.benchmarkPlayers)}<small> / {fa.format(analysis.coverage.totalPlayers)} بازیکن</small></b></header>
    <nav className="analysis-nav" aria-label="نماهای تحلیل"><Nav active={view === "summary"} icon={<Sparkles />} label="Overview" secondary="جمع‌بندی" click={() => setView("summary")} /><Nav active={view === "timeline"} icon={<Activity />} label="Timeline" secondary="روند بازی" click={() => setView("timeline")} /><Nav active={view === "players"} icon={<UsersRound />} label="10 Players" secondary="مقایسه بازیکنان" click={() => setView("players")} /></nav>
    <div className="analysis-player-dock"><PlayerStrip players={analysis.players} selected={player.playerSlot} select={setSlot} /></div>
    {view === "summary" && <Summary player={player} />}
    {view === "timeline" && <TimelineView analysis={analysis} player={player} minute={minute} setMinute={setMinute} />}
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

function Summary({ player }: { player: MatchPlayerAnalysis }) {
  const strengths = highlights(player).filter((entry) => entry.qualityPercentile >= 80).slice(0, 3);
  const weaknesses = [...highlights(player)].reverse().filter((entry) => entry.qualityPercentile < 40).slice(0, 3);
  const finding = primaryFinding(strengths[0], weaknesses[0]);
  return <div className="analysis-summary"><div className="analysis-overview-grid">
    <section className="benchmark-board"><SectionHeading icon={<BarChart3 />} title="Benchmark Spectrum" detail={player.benchmarkSource === "hero" ? "مقایسه با بازی‌های اخیر همین Hero" : player.benchmarkSource === "match" ? "مقایسه داخلی بین بازیکنان همین Match" : "داده کافی نیست"} />{player.benchmarks.length ? <div className="benchmark-grid">{player.benchmarks.map((entry) => <MetricCard entry={entry} key={entry.key} />)}</div> : <p>Replay این Match، داده Benchmark کامل ندارد.</p>}</section>
    <aside className="analysis-insights-column"><Verdict good title="نقاط قوت" englishTitle="STRENGTHS" metrics={strengths} /><Verdict title="فرصت‌های بهبود" englishTitle="WATCHLIST" metrics={weaknesses} /><section className="analysis-finding-panel"><SectionHeading icon={<Lightbulb />} title="Primary Finding" detail="مهم‌ترین مسیر پیشنهادی برای Replay review" /><article className="analysis-primary-finding"><h5 lang="en" dir="ltr">{finding.title}</h5><p>{finding.copy}</p></article></section></aside>
  </div></div>;
}

function SectionHeading({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) { return <header className="analysis-section-heading"><div>{icon}<strong lang="en" dir="ltr">{title}</strong></div>{detail && <span>{detail}</span>}</header>; }
function display(value: number | null | undefined) { return value === null || value === undefined ? "—" : en.format(value); }
function presentation(entry: MatchBenchmarkMetric) { const fallback = METRICS[entry.key]; return { label: entry.shortLabel || fallback?.label || entry.label, description: entry.description || fallback?.description || entry.label, direction: entry.direction || fallback?.direction || "higher" }; }
function tone(entry?: MatchBenchmarkMetric): PerformanceTone | null { return entry ? performanceTone(entry.qualityPercentile) : null; }
function highlights(player: MatchPlayerAnalysis) { return [...player.benchmarks].filter((entry) => entry.highlightEligible !== false).sort((a, b) => b.qualityPercentile - a.qualityPercentile); }
function primaryFinding(strength?: MatchBenchmarkMetric, weakness?: MatchBenchmarkMetric) {
  if (!strength && !weakness) return { title: "REPLAY REVIEW", copy: "برای این بازیکن هنوز داده کافی برای نتیجه‌گیری قابل اتکا وجود ندارد." };
  const strong = strength ? presentation(strength).label : "Impact"; const weak = weakness ? presentation(weakness).label : "Decision Making";
  const farm = new Set(["gold_per_min", "xp_per_min", "last_hits_per_min"]); const objective = new Set(["tower_damage", "hero_damage_per_min", "kills_per_min"]);
  if (strength && weakness && farm.has(strength.key) && objective.has(weakness.key)) return { title: "FARM → OBJECTIVE CONVERSION", copy: `${strong} سیگنال مثبت این عملکرد بوده، اما ${weak} پایین مانده است؛ در Replay بررسی کن برتری Farm کجا باید به Fight یا Objective تبدیل می‌شد.` };
  return { title: `${strong.toUpperCase()} → ${weak.toUpperCase()}`, copy: `${strong} بهترین سیگنال این عملکرد است. برای Replay review، ابتدا لحظه‌هایی را بررسی کن که روی ${weak} اثر گذاشته‌اند.` };
}

function Verdict({ good = false, title, englishTitle, metrics }: { good?: boolean; title: string; englishTitle: string; metrics: MatchBenchmarkMetric[] }) {
  return <section className={`analysis-verdict-group is-${good ? "good" : "bad"}`}><SectionHeading icon={good ? <TrendingUp /> : <Crosshair />} title={englishTitle} detail={title} /><article className="analysis-verdict">{metrics.length ? metrics.map((entry) => <div key={entry.key}><span><b lang="en" dir="ltr">{presentation(entry).label}</b><small>{presentation(entry).description}</small></span><strong className={`is-${tone(entry)}`} lang="en" dir="ltr">P{entry.qualityPercentile}</strong></div>) : <p>{good ? "نقطه قوت معناداری ثبت نشده است." : "افت معناداری ثبت نشده است."}</p>}</article></section>;
}

function MetricCard({ entry }: { entry: MatchBenchmarkMetric }) {
  const info = presentation(entry); const context = entry.source === "hero" ? "همان Hero" : "همین Match"; const direction = info.direction === "lower" ? "کمتر بهتر است" : info.direction === "contextual" ? "وابسته به Hero" : "بیشتر بهتر است";
  return <article className={`benchmark-cell is-${tone(entry)}`}><header><span className="benchmark-label" lang="en" dir="ltr">{info.label}<span className="analysis-metric-help" tabIndex={0} aria-label={info.description}><Info /><span role="tooltip">{info.description}</span></span></span></header><strong className="benchmark-raw" lang="en" dir="ltr">{entry.formattedValue}</strong><p>{info.description}</p><div className="benchmark-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.qualityPercentile}><span style={{ width: `${entry.qualityPercentile}%` }} /></div><footer><b>بهتر از {fa.format(entry.qualityPercentile)}٪</b><small>{context} · {direction}</small></footer></article>;
}

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
    {legend.length > 0 && <div className="timeline-series-legend" dir="ltr">{legend.map((entry) => { const visible = scope !== "all" || visibleSlots.has(entry.playerSlot); return <button type="button" key={entry.playerSlot} className={visible ? "is-visible" : ""} onClick={() => scope === "all" && toggle(entry.playerSlot)} aria-pressed={visible} disabled={scope !== "all"}><span style={{ background: colors.get(entry.playerSlot) }} /><img src={portrait(entry)} alt="" /><b>{entry.heroName}</b><small>Pos {entry.position || "?"}</small>{scope === "all" && (visible ? <Eye /> : <EyeOff />)}</button>; })}</div>}
    <div className={`timeline-chart-layout${seriesPlayers.length > 1 ? " has-comparison" : ""}`}>
      <section className="timeline-chart-shell" dir="ltr">{chart ? <svg viewBox="0 0 760 282" role="img" aria-label={`${info.label} برای ${seriesPlayers.map((entry) => entry.heroName).join(" و ")}`}><defs><linearGradient id={`analysis-fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--timeline-accent)" stopOpacity=".3" /><stop offset="1" stopColor="var(--timeline-accent)" stopOpacity="0" /></linearGradient></defs>{[50, 100, 150, 200, 250].map((y) => <line className="timeline-grid-line" x1="38" x2="742" y1={y} y2={y} key={y} />)}{scope === "solo" && chart.series[0] && <path className="timeline-area" style={{ fill: `url(#analysis-fill-${metricKey})` }} d={chart.series[0].area} />}{chart.series.map((series) => <path className="timeline-line" style={{ stroke: colors.get(series.player.playerSlot) }} d={series.line} key={series.player.playerSlot} />)}<line className="timeline-cursor-line" x1={chart.minuteX(minute)} x2={chart.minuteX(minute)} y1="28" y2="250" />{chart.series.map((series) => { const point = closest(series.player.timeline, minute); const value = point?.[metricKey] ?? null; return value === null ? null : <circle className="timeline-cursor-dot" style={{ stroke: colors.get(series.player.playerSlot) }} cx={chart.minuteX(minute)} cy={chart.valueY(value)} r="6" key={series.player.playerSlot} />; })}<text className="timeline-axis-label" x="38" y="274">0</text><text className="timeline-axis-label" x="214" y="274">{Math.round(analysis.durationMinutes * .25)}m</text><text className="timeline-axis-label" x="390" y="274">{Math.round(analysis.durationMinutes * .5)}m</text><text className="timeline-axis-label" x="566" y="274">{Math.round(analysis.durationMinutes * .75)}m</text><text className="timeline-axis-label" x="714" y="274">{analysis.durationMinutes}m</text></svg> : <p className="timeline-empty">برای انتخاب فعلی Timeline آماده نیست.</p>}</section>
      {seriesPlayers.length > 1 && <TimelineComparison players={seriesPlayers} metricKey={metricKey} minute={minute} colors={colors} />}
    </div>
    <header className="timeline-control" dir="ltr"><button type="button" onClick={() => setMinute(Math.max(0, minute - 1))}><ChevronLeft /></button><div dir="rtl"><span>دقیقه</span><b>{fa.format(minute)}</b></div><input type="range" min="0" max={analysis.durationMinutes} value={minute} onChange={(event) => setMinute(Number(event.target.value))} aria-label="دقیقه Timeline" /><button type="button" onClick={() => setMinute(Math.min(analysis.durationMinutes, minute + 1))}><ChevronRight /></button></header>
    {seriesPlayers.length === 1 && <div className="timeline-status-grid"><TimelineStat label="Net Worth" description="Gold فعلی" value={snapshot?.gold} trend={snapshotTrend(player.timeline, snapshot, "goldDelta")} /><TimelineStat label="XP" description="XP فعلی" value={snapshot?.xp} trend={snapshotTrend(player.timeline, snapshot, "xpDelta")} /><TimelineStat label="Last Hits" description="Last Hit فعلی" value={snapshot?.lastHits} trend={snapshotTrend(player.timeline, snapshot, "lastHitDelta")} /><TimelineStat label="Momentum" description="وضعیت این دقیقه" value={snapshot?.label || "—"} trend={stateTrend(snapshot)} /></div>}
    {team && <div className="team-advantage"><span>برتری Gold <b className={(team.radiantGoldAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantGoldAdvantage)}</b></span><span>برتری XP <b className={(team.radiantXpAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantXpAdvantage)}</b></span></div>}
  </div>;
}

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
function playerScore(player: MatchPlayerAnalysis, duration: number) { return player.performanceScore ?? calculatePerformanceScore(player.benchmarks, duration); }

function Roster({ analysis, selected, inspect }: { analysis: MatchAnalysis; selected: number; inspect: (slot: number) => void }) {
  const players = [...analysis.players].sort((a, b) => playerScore(b, analysis.durationMinutes) - playerScore(a, analysis.durationMinutes));
  return <div className="analysis-roster-view"><SectionHeading icon={<UsersRound />} title="10 Players Comparison" detail="رتبه‌بندی بر اساس Score وزنی؛ Heal و Tower Damage کم‌حجم اثر کمتری در امتیاز دارند." /><div className="analysis-roster-table-wrap"><table className="analysis-roster-table"><thead><tr><th>Player / Hero</th><th>Score</th><th>K / D / A</th><th title="میزان Gold در دقیقه">GPM</th><th title="میزان XP در دقیقه">XPM</th><th title="Last Hit در دقیقه">LH / min</th><th title="Death در دقیقه؛ کمتر بهتر است">Deaths / min</th><th title="Damage به Hero در دقیقه">Hero DMG / min</th><th title="Damage به Towerها">Tower DMG</th></tr></thead><tbody>{players.map((entry) => <tr className={`analysis-roster-row is-${entry.team}`} data-selected={entry.playerSlot === selected} key={entry.playerSlot}><td><button type="button" onClick={() => inspect(entry.playerSlot)}><img src={portrait(entry)} alt="" /><span><b>{entry.personName}</b><small lang="en" dir="ltr">{entry.heroName} · {entry.positionLabel}</small></span></button></td><td><ScoreRing score={playerScore(entry, analysis.durationMinutes)} /></td><RosterKda player={entry} /><RosterMetric entry={metric(entry, "gold_per_min")} /><RosterMetric entry={metric(entry, "xp_per_min")} /><RosterMetric entry={metric(entry, "last_hits_per_min")} /><RosterMetric entry={metric(entry, "deaths_per_min")} /><RosterMetric entry={metric(entry, "hero_damage_per_min")} /><RosterMetric entry={metric(entry, "tower_damage")} /></tr>)}</tbody></table></div></div>;
}
function ScoreRing({ score }: { score: number }) { const color = performanceTone(score); return <div className={`analysis-score-ring is-${color}`} style={{ "--score": `${score * 3.6}deg` } as CSSProperties}><span><b>{score}</b><small>/100</small></span></div>; }
function RosterMetric({ entry }: { entry?: MatchBenchmarkMetric }) { const color = tone(entry); return <td className={color ? `is-${color}` : ""} lang="en" dir="ltr"><b>{entry?.formattedValue || "—"}</b>{entry && <small>({entry.qualityPercentile}%)</small>}</td>; }
function RosterKda({ player }: { player: MatchPlayerAnalysis }) {
  const kills = metric(player, "kills_per_min"); const deaths = metric(player, "deaths_per_min"); const assists = metric(player, "assists_per_min");
  return <td className="analysis-roster-kda" lang="en" dir="ltr"><b>{display(player.kills)} / {display(player.deaths)} / {display(player.assists)}</b><small>(<span className={`is-${tone(kills)}`}>{kills?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(deaths)}`}>{deaths?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(assists)}`}>{assists?.qualityPercentile ?? "—"}%</span>)</small></td>;
}
