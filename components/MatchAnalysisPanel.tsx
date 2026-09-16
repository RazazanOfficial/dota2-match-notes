"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, AlertTriangle, ArrowDown, ArrowRightLeft, ArrowUp, BarChart3, Check, ChevronLeft, ChevronRight, CircleGauge, Clock3, Coins, Eye, EyeOff, Info, Lightbulb, MapPinned, Minus, Package, RefreshCw, ShieldAlert, Skull, Sparkles, Target, TrendingUp, UsersRound, X } from "lucide-react";
import { heroById, heroIcon, heroImage } from "@/data/heroes";
import { calculatePerformanceDomains, calculatePerformanceScoreOrNull, performanceTone } from "@/lib/dota/performance-score";
import { benchmarkMetricTotal, formatBenchmarkMetricTotal } from "@/lib/dota/performance-presentation";
import { applyAnalysisPositionOverrides, buildPositionSwapUpdates } from "@/lib/dota/analysis-position-overrides";
import { replayAgeState } from "@/lib/opendota/analysis-policy";
import type { DotaTeam, Match, MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis, PerformanceTone } from "@/lib/types";
import AppLogo from "./AppLogo";
import MatchMapEngine from "./MatchMapEngine";
import ViewportPortal from "./ViewportPortal";

type View = "summary" | "timeline" | "map" | "players";
type TimelineMetric = "gold" | "xp" | "lastHits";
type TimelineScope = "solo" | "role" | "all";
type RequestState = "idle" | "loading" | "needs_request" | "preparing" | "expired" | "ready" | "empty" | "error";
type Trend = "positive" | "steady" | "negative";
type PendingPositionChange = { updates: Record<string, number>; players: MatchPlayerAnalysis[] };

const fa = new Intl.NumberFormat("fa-IR");
const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const SERIES_COLORS = ["#f3bd57", "#57d8b1", "#58c9f3", "#f06d65", "#b08bf0", "#f29a62", "#80d36b", "#ef7fb8", "#72a7ff", "#d9d7cf"];
const analysisCache=new Map<string,MatchAnalysis|null>();
const POSITION_LABELS = ["", "Carry", "Mid", "Offlane", "Soft Support", "Hard Support"];
const POSITION_GROUP_LABELS = ["", "Carries", "Midlaners", "Offlaners", "Soft Supports", "Hard Supports"];
const POSITION_ICONS = ["", "Safelane.png", "MidLane.png", "OffLane.png", "SoftSupport.png", "HardSupport.png"];
function analysisKey(match:Match){const overrides=Object.entries(match.positionOverrides||{}).sort(([left],[right])=>left.localeCompare(right));return `${match.id}:${JSON.stringify(overrides)}`;}
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
  tower_damage: { label: "Tower DMG / min", description: "میانگین Damage واردشده به Tower و ساختمان‌ها در هر دقیقه", direction: "higher" },
};
const TIMELINE: Record<TimelineMetric, { label: string; description: string; className: string }> = {
  gold: { label: "Net Worth", description: "روند NW بازیکن", className: "is-gold" },
  xp: { label: "XP", description: "روند XP بازیکن", className: "is-xp" },
  lastHits: { label: "Last Hits", description: "روند Last Hit بازیکن", className: "is-last-hits" },
};

export default function MatchAnalysisPanel({ match, active, canRequestAnalysis = false, selectedPlayerSlot, onSelectPlayer, onPositionOverrides }: { match: Match; active: boolean; canRequestAnalysis?: boolean; selectedPlayerSlot?: number|null; onSelectPlayer?: (slot:number) => void; onPositionOverrides?: (updates:Record<string,number>) => void }) {
  const cacheKey=analysisKey(match);
  const cached=analysisCache.get(cacheKey)??match.analysis??null;
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(cached);
  const [requestState, setRequestState] = useState<RequestState>(cached ? "ready" : "idle");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [slot, setSlot] = useState<number | null>(initialSlot(match.analysis));
  const [minute, setMinute] = useState(match.analysis?.durationMinutes || 0);
  const [retryToken, setRetryToken] = useState(0);
  const [pendingPositionChange, setPendingPositionChange] = useState<PendingPositionChange | null>(null);
  const [analysisConfirmation, setAnalysisConfirmation] = useState(false);
  const currentMatchId = useRef(cacheKey);
  const selectPlayer = (nextSlot:number) => { setSlot(nextSlot); onSelectPlayer?.(nextSlot); };

  useEffect(() => {
    currentMatchId.current = cacheKey;
    const next = analysisCache.get(cacheKey)??match.analysis??null;
    setAnalysis(next); setRequestState(next ? "ready" : "idle"); setError(""); setView("summary"); setSlot(initialSlot(next)); setMinute(next?.durationMinutes || 0);
  }, [cacheKey, match.analysis]);

  useEffect(() => {
    if (selectedPlayerSlot === undefined || selectedPlayerSlot === null || !analysis?.players.some((entry) => entry.playerSlot === selectedPlayerSlot)) return;
    setSlot(selectedPlayerSlot);
  }, [analysis, selectedPlayerSlot]);

  useEffect(() => {
    if (!active || !match.dotaMatchId || analysis) return;
    const controller = new AbortController(); let timedOut = false; const requestedMatchId = cacheKey;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    setRequestState("loading"); setError("");
    void fetch(`/api/matches/${match.id}/analysis`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { analysis?: MatchAnalysis | null; preparation?: { replay?: string; errorCode?: string | null }; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(body?.error?.message || "تحلیل مچ آماده نشد");
        return { analysis: body?.analysis || null, replay: body?.preparation?.replay || "ready" };
      })
      .then(({ analysis: value, replay }) => {
        if (controller.signal.aborted || currentMatchId.current !== requestedMatchId) return;
        if (replay === "pending" || replay === "processing" || replay === "queued") { setRequestState("preparing"); return; }
        if (replay === "expired") { setRequestState("expired"); return; }
        if (replay === "basic" || replay === "failed") { setRequestState("needs_request"); return; }
        analysisCache.set(requestedMatchId,value);
        setAnalysis(value); setSlot(initialSlot(value)); setMinute(value?.durationMinutes || 0); setRequestState(value ? "ready" : "empty");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        if (currentMatchId.current !== requestedMatchId) return;
        setError(timedOut ? "دریافت تحلیل بیشتر از حد انتظار طول کشید. دوباره تلاش کنید." : reason instanceof Error ? reason.message : "تحلیل مچ آماده نشد"); setRequestState("error");
      }).finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [active, analysis, cacheKey, match.dotaMatchId, match.id, retryToken]);

  useEffect(() => {
    if (!active || requestState !== "preparing") return;
    const timer = window.setTimeout(() => setRetryToken((current) => current + 1), 5_000);
    return () => window.clearTimeout(timer);
  }, [active, requestState, retryToken]);

  useEffect(() => {
    if (!active || !analysis) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const index = event.key === "0" ? 9 : /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
      const next = analysis.players[index];
      if (next) { event.preventDefault(); selectPlayer(next.playerSlot); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, analysis, onSelectPlayer]);

  const player = analysis?.players.find((entry) => entry.playerSlot === slot) || analysis?.players.find((entry) => entry.isProfilePlayer) || analysis?.players[0];
  const applyPositions = (updates:Record<string,number>) => {
    const mergedOverrides={...(match.positionOverrides||{}),...updates};
    const nextCacheKey=analysisKey({...match,positionOverrides:mergedOverrides});
    setAnalysis((current) => {
      if (!current) return current;
      const next = applyAnalysisPositionOverrides(current, updates);
      analysisCache.set(nextCacheKey, next);
      return next;
    });
    onPositionOverrides?.(updates);
    setPendingPositionChange(null);
    currentMatchId.current=nextCacheKey;
    void fetch(`/api/matches/${match.id}/analysis?positions=${encodeURIComponent(JSON.stringify(mergedOverrides))}`,{cache:"no-store"})
      .then(async(response)=>response.ok?(await response.json() as {analysis?:MatchAnalysis|null}).analysis:null)
      .then((next)=>{if(!next||currentMatchId.current!==nextCacheKey)return;analysisCache.set(nextCacheKey,next);setAnalysis(next);})
      .catch(()=>undefined);
  };
  const requestPositions = (updates:Record<string,number>) => {
    if (!analysis) return;
    const changed = analysis.players.filter((entry) => updates[String(entry.playerSlot)] !== undefined && updates[String(entry.playerSlot)] !== entry.position);
    if (!changed.length) return;
    setPendingPositionChange({ updates, players: changed });
  };
  const retry = () => { setAnalysis(null); setRequestState("idle"); setError(""); setRetryToken((current) => current + 1); };
  const requestAnalysis = async () => {
    setAnalysisConfirmation(false); setRequestState("loading"); setError("");
    try {
      const response=await fetch(`/api/matches/${match.id}/analysis`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      const body=await response.json().catch(()=>null) as {preparation?:{replay?:string};error?:{message?:string}}|null;
      if(!response.ok)throw new Error(body?.error?.message||"درخواست تحلیل ثبت نشد");
      if(body?.preparation?.replay==="ready")retry();
      else setRequestState("preparing");
    }catch(reason){setError(reason instanceof Error?reason.message:"درخواست تحلیل ثبت نشد");setRequestState("error");}
  };
  if (!match.dotaMatchId) return null;
  if (requestState === "loading" || requestState === "preparing") return <section className="analysis-loading"><AppLogo size={48} alt="" /><div><strong>{requestState === "preparing" ? "Replay در حال تکمیل است" : "در حال آماده‌سازی Match Analysis"}</strong><p>{requestState === "preparing" ? "پس از پایان Parse، تحلیل کامل به‌صورت خودکار نمایش داده می‌شود." : "Benchmark و Timeline هر ۱۰ بازیکن در حال پردازش است."}</p></div></section>;
  if (requestState === "error") return <Empty icon={<AlertTriangle />} title="تحلیل مچ آماده نشد" text={error} actionLabel="بررسی دوباره" onAction={retry} />;
  if (requestState === "expired") return <Empty icon={<AlertTriangle />} title="Replay این مچ قدیمی است" text="بیش از ۲۰ روز از این بازی گذشته و دیتای کامل در سرورهای valve احتمالا دیگر موجود نیست." />;
  if (requestState === "needs_request") return <><Empty icon={<CircleGauge />} title="تحلیل Replay هنوز درخواست نشده" text={canRequestAnalysis ? "داده پایه مچ آماده است. Parse فقط با تأیید شما وارد صف می‌شود." : "صاحب دفتر هنوز تحلیل Replay این مچ را درخواست نکرده است."} actionLabel={canRequestAnalysis ? "درخواست تحلیل · 10 Token" : undefined} onAction={canRequestAnalysis ? ()=>setAnalysisConfirmation(true) : undefined} />{analysisConfirmation&&<AnalysisRequestDialog match={match} aging={replayAgeState(match.startedAt)==="warning"} cancel={()=>setAnalysisConfirmation(false)} confirm={requestAnalysis}/>}</>;
  if (active && !analysis) return <Empty icon={<CircleGauge />} title="داده کافی برای تحلیل نیست" text="Replay آماده است، اما داده کافی برای ساخت این تحلیل وجود ندارد." actionLabel="بررسی دوباره" onAction={retry} />;
  if (!analysis || !player) return null;

  return <section className="match-analysis">
    <header className="analysis-hero"><div><span><Activity /></span><div><p>PERFORMANCE PULSE</p><h3>مرور عملکرد مچ</h3></div></div></header>
    <nav className="analysis-nav" aria-label="نماهای تحلیل"><Nav active={view === "summary"} icon={<Sparkles />} label="Overview" secondary="جمع‌بندی" click={() => setView("summary")} /><Nav active={view === "timeline"} icon={<Activity />} label="Progression" secondary="روند LH / NW / XP" click={() => setView("timeline")} /><Nav active={view === "map"} icon={<MapPinned />} label="Map Analysis" secondary="فارم، اهداف و دید" click={() => setView("map")} /><Nav active={view === "players"} icon={<UsersRound />} label="10 Players" secondary="مقایسه بازیکنان" click={() => setView("players")} /></nav>
    <div className="analysis-player-dock"><PlayerStrip players={analysis.players} selected={player.playerSlot} select={selectPlayer} />{onPositionOverrides&&<PositionSwapMenu player={player} players={analysis.players} request={requestPositions}/>}</div>
    {view === "summary" && <Summary player={player} players={analysis.players} duration={analysis.durationMinutes} confirmPositions={onPositionOverrides ? applyPositions : undefined} />}
    {view === "timeline" && <TimelineView analysis={analysis} player={player} minute={minute} setMinute={setMinute} />}
    {view === "map" && <MatchMapEngine player={player} players={analysis.players} duration={analysis.durationMinutes}/>}
    {view === "players" && <Roster analysis={analysis} selected={player.playerSlot} inspect={selectPlayer} />}
    {pendingPositionChange && <PositionChangeDialog change={pendingPositionChange} onCancel={() => setPendingPositionChange(null)} onConfirm={() => applyPositions(pendingPositionChange.updates)} />}
  </section>;
}

function AnalysisRequestDialog({match,aging,cancel,confirm}:{match:Match;aging:boolean;cancel:()=>void;confirm:()=>void}){return <ViewportPortal><div className="analysis-request-backdrop" role="presentation" onMouseDown={cancel}><section className="analysis-request-dialog" role="alertdialog" aria-modal="true" aria-labelledby="analysis-request-title" onMouseDown={(event)=>event.stopPropagation()}><header><CircleGauge/><div><small>REPLAY ANALYSIS</small><strong id="analysis-request-title">درخواست تحلیل این مچ</strong></div><button type="button" onClick={cancel} aria-label="بستن"><X/></button></header><p>برای آماده‌کردن Timeline، Benchmark و تحلیل ۱۰ بازیکن، Replay مچ <b lang="en" dir="ltr">#{match.dotaMatchId}</b> وارد صف بررسی می‌شود.</p>{aging&&<p className="is-warning"><AlertTriangle/>بیش از ۱۰ روز از مچ گذشته و ممکن است Replay دیگر در دسترس نباشد.</p>}<div><span>هزینه نمایشی</span><strong className="latin-numerals" lang="en" dir="ltr">10 Token</strong></div><footer><button className="secondary-button" type="button" onClick={cancel}>انصراف</button><button className="primary-button" type="button" onClick={confirm}>تأیید و ارسال به صف</button></footer></section></div></ViewportPortal>}

function initialSlot(analysis: MatchAnalysis | null | undefined) { return analysis?.players.find((entry) => entry.isProfilePlayer)?.playerSlot ?? analysis?.players[0]?.playerSlot ?? null; }
function Empty({ icon, title, text, actionLabel, onAction }: { icon: ReactNode; title: string; text: string; actionLabel?: string; onAction?: () => void }) { return <section className="analysis-state"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div>{actionLabel && onAction && <button type="button" onClick={onAction}><RefreshCw />{actionLabel}</button>}</section>; }
function Nav({ active, icon, label, secondary, click }: { active: boolean; icon: ReactNode; label: string; secondary: string; click: () => void }) { return <button className={active ? "is-active" : ""} type="button" onClick={click}>{icon}<span lang="en" dir="ltr">{label}</span><small>{secondary}</small></button>; }
function portrait(player: MatchPlayerAnalysis) { const hero = heroById(player.heroId); return hero ? heroIcon(hero) : ""; }
function widePortrait(player: MatchPlayerAnalysis) { const hero = heroById(player.heroId); return hero ? heroImage(hero) : ""; }
function positionIcon(position: number | null) { return position ? `/positions/${POSITION_ICONS[position]}` : ""; }

function PlayerStrip({ players, selected, select }: { players: MatchPlayerAnalysis[]; selected: number; select: (slot: number) => void }) {
  const order = new Map(players.map((entry, index) => [entry.playerSlot, index + 1]));
  return <div className="analysis-player-strip">{(["radiant", "dire"] as DotaTeam[]).map((team) => <section className={`is-${team}`} key={team}>
    <img className="analysis-team-logo" src={`/match-details/${team}.webp`} alt={team === "radiant" ? "Radiant" : "Dire"} />
    <div>{players.filter((entry) => entry.team === team).map((entry) => {
      const index = order.get(entry.playerSlot) || 0; const shortcut = index === 10 ? "0" : String(index);
      return <button className={`${entry.playerSlot === selected ? "is-selected" : ""}${entry.isProfilePlayer ? " is-profile" : ""}`} type="button" key={entry.playerSlot} onClick={() => select(entry.playerSlot)} aria-pressed={entry.playerSlot === selected} aria-keyshortcuts={shortcut} aria-label={`بازیکن ${index}: ${entry.personName} با ${entry.heroName}`} title={`انتخاب با کلید ${shortcut}`}><img src={widePortrait(entry)} alt="" /><span lang="en" dir="ltr">{index}</span>{entry.isProfilePlayer && <small lang="en">YOU</small>}</button>;
    })}</div>
  </section>)}</div>;
}

function PositionSwapMenu({player,players,request}:{player:MatchPlayerAnalysis;players:MatchPlayerAnalysis[];request:(updates:Record<string,number>)=>void}) {
  const selectPosition=(position:number)=>{
    if(player.position===position)return;
    const updates=buildPositionSwapUpdates(players,player.playerSlot,position);
    request(updates);
  };
  return <details className="analysis-position-menu"><summary><ArrowRightLeft/><img src={positionIcon(player.position)} alt=""/><span>{player.heroName}</span><b>Pos {player.position??"?"}</b></summary><div><p>Position جدید را انتخاب کنید؛ جای دو Hero واقعاً با هم عوض می‌شود.</p><nav dir="ltr">{[1,2,3,4,5].map((position)=><button type="button" className={player.position===position?"is-active":""} onClick={()=>selectPosition(position)} key={position}><img src={positionIcon(position)} alt=""/><span>Pos {position}</span></button>)}</nav></div></details>;
}

function PositionChangeDialog({change,onCancel,onConfirm}:{change:PendingPositionChange;onCancel:()=>void;onConfirm:()=>void}) {
  return <ViewportPortal><div className="position-swap-backdrop" role="presentation" onMouseDown={onCancel}><section className="position-swap-dialog" role="dialog" aria-modal="true" aria-labelledby="position-swap-title" onMouseDown={(event)=>event.stopPropagation()}><header><div><ArrowRightLeft/><span><small>POSITION UPDATE</small><strong id="position-swap-title">تأیید جابه‌جایی Position</strong></span></div><button type="button" onClick={onCancel} aria-label="بستن"><X/></button></header><p>پس از تأیید، Score، وزن معیارها و مقایسه‌های Position برای این Heroها دوباره محاسبه می‌شود.</p><div>{change.players.map((entry)=>{const next=change.updates[String(entry.playerSlot)];return <article key={entry.playerSlot}><img className="position-swap-hero" src={portrait(entry)} alt={entry.heroName}/><b lang="en">{entry.heroName}</b><span><img src={positionIcon(entry.position)} alt=""/>Pos {entry.position??"?"}</span><ArrowRightLeft/><span className="is-next"><img src={positionIcon(next)} alt=""/>Pos {next}</span></article>;})}</div><footer><button type="button" className="secondary-button" onClick={onCancel}>انصراف</button><button type="button" className="primary-button" onClick={onConfirm}><Check/>تأیید و محاسبه مجدد</button></footer></section></div></ViewportPortal>;
}

function Summary({ player,players,duration,confirmPositions }: { player: MatchPlayerAnalysis;players:MatchPlayerAnalysis[];duration:number;confirmPositions?: (updates:Record<string,number>)=>void }) {
  const strengths = highlights(player).filter((entry) => entry.qualityPercentile >= 80).slice(0, 3);
  const weaknesses = [...highlights(player)].reverse().filter((entry) => entry.qualityPercentile < 40).slice(0, 3);
  const finding = primaryFinding(strengths[0], weaknesses[0]);
  const swapPlayers=detectedSwapPlayers(player,players);
  return <div className="analysis-summary">{swapPlayers.length>=2&&<RoleSwapReview players={swapPlayers} confirm={confirmPositions}/>}<DomainProfile player={player} duration={duration}/><LaneImpactPanel player={player} players={players}/><div className="analysis-overview-grid">
    <section className="benchmark-board"><div className="benchmark-board-heading"><SectionHeading icon={<BarChart3 />} title="Benchmark Spectrum" detail="جایگاه هر معیار در مقایسه با عملکردهای مشابه" /></div>{player.benchmarks.length ? <div className="benchmark-grid">{player.benchmarks.map((entry) => <MetricCard entry={entry} player={player} duration={duration} key={entry.key} />)}</div> : <p className="analysis-empty-copy">برای این Match، Benchmark قابل اتکا موجود نیست.</p>}</section>
    <aside className="analysis-insights-column"><Verdict good title="بهترین بخش‌های این عملکرد" englishTitle="STRENGTHS" metrics={strengths} /><Verdict title="مواردی که ارزش بازبینی دارند" englishTitle="WATCHLIST" metrics={weaknesses} /><section className="analysis-finding-panel"><SectionHeading icon={<Lightbulb />} title="Primary Finding" detail="اولین نکته‌ای که در Replay بررسی شود" /><article className="analysis-primary-finding"><span><Lightbulb/></span><div><h5 lang="en" dir="ltr">{finding.title}</h5><p>{finding.copy}</p></div></article></section></aside>
  </div></div>;
}

function LaneImpactPanel({player,players}:{player:MatchPlayerAnalysis;players:MatchPlayerAnalysis[]}){
  const lane=player.laneImpact;if(!lane||lane.availability==="unavailable")return null;
  const opponent=players.find((entry)=>entry.playerSlot===lane.opponentPlayerSlot);
  const label=lane.assessment==="ahead"?"لاین را برده":lane.assessment==="behind"?"لاین را باخته":lane.assessment==="even"?"نتیجه لاین برابر":"نتیجه لاین نامشخص";
  const criteria=lane.roleGroup==="support"
    ? [{icon:<Activity/>,label:"XP"},{icon:<Skull/>,label:"Death"},{icon:<Package/>,label:"Lane resources"},{icon:<Eye/>,label:"Early vision"}]
    : [{icon:<Coins/>,label:"Net Worth"},{icon:<Activity/>,label:"XP"},{icon:<Target/>,label:"LH / Deny"},{icon:<Skull/>,label:"Death"}];
  return <section className={`lane-impact-panel is-${lane.assessment}`}><header><span><Activity/></span><div><small>LANE RESULT · FIRST 10 MINUTES</small><strong>{label}</strong><p>عملکرد ۱۰ دقیقه اول {player.heroName}{opponent?` در مقایسه مستقیم با ${opponent.heroName}`:" بر اساس داده‌های لاین"}</p></div>{opponent&&<aside><img src={portrait(player)} alt={player.heroName}/><b>VS</b><img src={portrait(opponent)} alt={opponent.heroName}/><span lang="en" dir="ltr">{player.heroName} vs {opponent.heroName}</span></aside>}</header><div className="lane-impact-body"><section className="lane-criteria"><b>{lane.roleGroup==="support"?"معیارهای Support":"معیارهای Core"}</b><div>{criteria.map((item)=><span key={item.label}>{item.icon}<i lang="en" dir="ltr">{item.label}</i></span>)}</div>{lane.roleGroup==="support"&&<small>کم‌بودن LH برای Support جریمه نشده است.</small>}</section><section className="lane-evidence-grid"><LaneValue label="Net Worth اختلاف" value={lane.netWorthDelta}/><LaneValue label="XP اختلاف" value={lane.xpDelta}/><LaneValue label="LH اختلاف" value={lane.lastHitDelta}/><LaneValue label="LH / Deny تا دقیقه ۱۰" value={lane.lastHitsAt10===null?null:`${lane.lastHitsAt10} / ${lane.deniesAt10??0}`} neutral/></section></div><footer>اطمینان تحلیل: <b>{lane.confidence==="high"?"بالا":lane.confidence==="medium"?"متوسط":"محدود"}</b> · این نتیجه فقط Context همین لاین است و با Benchmark جهانی اشتباه گرفته نمی‌شود.</footer></section>;
}

function LaneValue({label,value,neutral=false}:{label:string;value:number|string|null;neutral?:boolean}){const numeric=typeof value==="number";return <span className={neutral?"":numeric&&value>0?"is-positive":numeric&&value<0?"is-negative":"is-neutral"}><small>{label}</small><b lang="en" dir="ltr">{value===null?"—":numeric?`${value>0?"+":""}${en.format(value)}`:value}</b></span>}

function detectedSwapPlayers(player:MatchPlayerAnalysis,players:MatchPlayerAnalysis[]){
  if(!player.positionResolution?.roleSwapDetected||player.positionResolution.source==="manual")return[];
  const related=new Set<number>([player.playerSlot]);
  if(player.positionResolution.swapWithPlayerSlot!=null)related.add(player.positionResolution.swapWithPlayerSlot);
  players.filter((entry)=>entry.team===player.team&&entry.positionResolution?.roleSwapDetected&&entry.positionResolution.source!=="manual").forEach((entry)=>related.add(entry.playerSlot));
  return players.filter((entry)=>related.has(entry.playerSlot)&&entry.positionResolution?.detectedPosition!=null&&entry.positionResolution.source!=="manual");
}

function RoleSwapReview({players,confirm}:{players:MatchPlayerAnalysis[];confirm?: (updates:Record<string,number>)=>void}){
  const updates=Object.fromEntries(players.flatMap((entry)=>entry.positionResolution?.detectedPosition?[ [String(entry.playerSlot),entry.positionResolution.detectedPosition] ]:[]));
  return <section className="position-resolution-alert"><header><span><ArrowRightLeft/></span><div><small>ROLE SWAP CHECK</small><strong>احتمال جابه‌جایی Role شناسایی شد</strong><p>اگر این تشخیص با اتفاقات واقعی Match مطابقت دارد، جابه‌جایی را تأیید کنید.</p></div></header><div className="position-resolution-list">{players.map((entry)=>{const resolution=entry.positionResolution;const position=resolution?.detectedPosition??null;const confidence=Math.max(0,Math.min(100,Math.round(resolution?.confidence??0)));return <article key={entry.playerSlot}><p>طبق آنالیز و بررسی، سیستم با احتمال <b className="latin-numerals" lang="en" dir="ltr">{confidence}%</b> حدس می‌زند که هیرو <b lang="en" dir="ltr">{entry.heroName}</b><img className="role-swap-inline-icon" src={portrait(entry)} alt=""/> در Role <b lang="en" dir="ltr">{position?POSITION_LABELS[position]:"Unknown"}</b><img className="role-swap-inline-icon is-position" src={positionIcon(position)} alt=""/> بازی کرده است.</p>{confirm&&<button type="button" onClick={()=>confirm(updates)}><Check/>تأیید جابه‌جایی</button>}</article>;})}</div></section>;
}

function PositionConfirmation({player,players,confirm}:{player:MatchPlayerAnalysis;players:MatchPlayerAnalysis[];confirm:(updates:Record<string,number>)=>void}){
  const teammates=players.filter((entry)=>entry.team===player.team&&entry.playerSlot!==player.playerSlot&&entry.position!==null);
  const swap=(partner:MatchPlayerAnalysis)=>{if(player.position===null||partner.position===null)return;confirm({[String(player.playerSlot)]:partner.position,[String(partner.playerSlot)]:player.position});};
  return <section className="position-confirmation"><div><ArrowRightLeft/><span><b>Position واقعی این بازیکن</b><small>Position را مستقیم انتخاب کن، یا Role Swap دستی را ثبت کن.</small></span></div><div dir="ltr">{[1,2,3,4,5].map((position)=><button type="button" className={player.position===position?"is-active":""} onClick={()=>confirm({[String(player.playerSlot)]:position})} key={position}>Pos {position}</button>)}</div><details className="manual-role-swap"><summary>Role Swap با…</summary><div>{teammates.map((partner)=><button type="button" onClick={()=>swap(partner)} key={partner.playerSlot}><img src={portrait(partner)} alt=""/><span>{partner.heroName}<small>Pos {partner.position}</small></span></button>)}</div></details>{player.positionResolution?.source==="manual"&&<em>تأیید دستی؛ پس از «ثبت تغییرات» ذخیره می‌شود.</em>}</section>;
}

const DOMAIN_COPY:Record<string,{fa:string;detail:string}>={laning:{fa:"مرحله لین",detail:"کنترل Lane و بازده ۱۰ دقیقه اول"},economy:{fa:"اقتصاد",detail:"سرعت ساخت Net Worth و دریافت XP"},fighting:{fa:"درگیری",detail:"Kill، Assist و مشارکت در Fight"},survival:{fa:"بقا",detail:"زنده‌ماندن بیشتر و Death کمتر"},objectives:{fa:"اهداف",detail:"فشار مؤثر روی Tower و ساختمان‌ها"},utility:{fa:"کمک تیمی",detail:"Heal و اثرگذاری متناسب با Hero"}};
function DomainProfile({player,duration}:{player:MatchPlayerAnalysis;duration:number}){const scoreData=globalScoreMetrics(player);const domains=calculatePerformanceDomains(scoreData,duration,player.position).map((item)=>{if(item.score!==null)return item;const context=contextDomainScore(item.key,player,duration);return context?{...item,score:context.score,metricCount:context.signals,contextual:context.label}:item});const score=playerScore(player,duration);const scoreTone=score===null?"unavailable":performanceTone(score);return <section className="performance-domain-profile"><header className="performance-score-hero"><div className="performance-score-title"><CircleGauge/><span><strong lang="en">Performance Score</strong></span></div><div className={`performance-hero-frame is-${scoreTone}`}><img src={widePortrait(player)} alt={player.heroName}/></div><div className="performance-hero-meta"><strong lang="en" dir="ltr">{player.heroName}</strong><hr/><span><img src={positionIcon(player.position)} alt=""/><b lang="en" dir="ltr">Position {player.position??"?"}</b></span></div><ScoreRing score={score}/></header><div className="performance-domain-grid">{domains.map((item)=>{const copy=DOMAIN_COPY[item.key];const contextual="contextual" in item?item.contextual:null;return <article key={item.key} className={`is-${item.score==null?"unavailable":performanceTone(item.score)}`}><header><span><small lang="en">{item.label}</small><b>{copy.fa}</b></span><strong className="latin-numerals" lang="en" dir="ltr"><b>{item.score??"—"}</b><small>/100</small></strong></header><p>{copy.detail}</p><footer><span>{contextual|| (item.metricCount?`${en.format(item.metricCount)} معیار قابل محاسبه`:"داده کافی نیست")}</span><i><em style={{width:`${item.score||0}%`}}/></i></footer></article>})}</div></section>}

function laneContextScore(player:MatchPlayerAnalysis){const lane=player.laneImpact;if(!lane)return null;const base=lane.assessment==="ahead"?74:lane.assessment==="even"?55:lane.assessment==="behind"?34:null;if(base===null)return null;const confidence=lane.confidence==="high"?1:lane.confidence==="medium"?.92:.82;return Math.round(50+(base-50)*confidence)}

function contextDomainScore(key:string,player:MatchPlayerAnalysis,duration:number){
  if(key==="laning"){const score=laneContextScore(player);return score===null?null:{score,signals:1,label:"Context لاین ۱۰ دقیقه"}}
  if(key==="utility"&&player.map&&player.map.utility.availability!=="unavailable"){
    const utility=player.map.utility;const support=(player.position??0)>=4;let score=support?32:45,signals=0;
    const add=(value:number|null|undefined,weight:number,cap:number)=>{if(value===null||value===undefined)return;signals+=1;score+=Math.min(cap,value*weight)};
    add(utility.observersPlaced,3,15);add(utility.sentriesPlaced,1.6,14);add(utility.observersDestroyed,6,18);add(utility.sentriesDestroyed,2.5,10);add(utility.campsStacked,2.5,10);add(utility.smokeUses,2,8);add(utility.dustUses,2,8);add(utility.laneResourcePurchases,1.5,9);
    const adjusted=score*(support?1:Math.max(.72,40/Math.max(40,duration)));
    return signals?{score:Math.round(Math.max(0,Math.min(95,adjusted))),signals,label:"Context Vision و کمک تیمی"}:null;
  }
  if(key==="objectives"&&typeof player.towerDamage==="number")return{score:Math.round(Math.min(92,32+Math.sqrt(Math.max(0,player.towerDamage)/5000)*48)),signals:1,label:"Context فشار روی ساختمان‌ها"};
  return null;
}

function SectionHeading({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) { return <header className="analysis-section-heading"><div>{icon}<strong lang="en" dir="ltr">{title}</strong></div>{detail && <span>{detail}</span>}</header>; }
function display(value: number | null | undefined) { return value === null || value === undefined ? "—" : en.format(value); }
function presentation(entry: MatchBenchmarkMetric) { const fallback = METRICS[entry.key]; return { label: entry.key==="tower_damage"?"Tower DMG / min":entry.shortLabel || fallback?.label || entry.label, description: entry.key==="tower_damage"?fallback.description:entry.description || fallback?.description || entry.label, direction: entry.direction || fallback?.direction || "higher" }; }
function tone(entry?: MatchBenchmarkMetric): PerformanceTone | null { return entry ? performanceTone(entry.qualityPercentile) : null; }
function highlights(player: MatchPlayerAnalysis) { return [...player.benchmarks].filter((entry) => entry.highlightEligible !== false).sort((a, b) => b.qualityPercentile - a.qualityPercentile); }
function primaryFinding(strength?: MatchBenchmarkMetric, weakness?: MatchBenchmarkMetric) {
  if (!strength && !weakness) return { title: "REPLAY REVIEW", copy: "برای این بازیکن هنوز داده کافی برای نتیجه‌گیری قابل اتکا وجود ندارد." };
  const strong = strength ? naturalMetricName(strength.key) : "اثرگذاری کلی"; const weak = weakness ? naturalMetricName(weakness.key) : "تصمیم‌گیری";
  const farm = new Set(["gold_per_min", "xp_per_min", "last_hits_per_min"]); const objective = new Set(["tower_damage", "hero_damage_per_min", "kills_per_min"]);
  if (strength && weakness && farm.has(strength.key) && objective.has(weakness.key)) return { title: "FARM → OBJECTIVE CONVERSION", copy: `${strong} سیگنال مثبت این عملکرد بوده، اما ${weak} پایین مانده است؛ در Replay بررسی کن برتری Farm کجا باید به Fight یا Objective تبدیل می‌شد.` };
  return { title: "نقطه قوت و اولویت بازبینی", copy: `بهترین بخش عملکردت ${strong} بود. در مقابل، ${weak} نسبت به بازیکن‌های هم‌سطح این Hero پایین‌تر ثبت شده؛ هنگام مرور Replay ابتدا موقعیت‌های مرتبط با آن را بررسی کن.` };
}

function naturalMetricName(key:string){return ({gold_per_min:"سرعت ساخت Net Worth",xp_per_min:"سرعت دریافت XP",kills_per_min:"تعداد Kill",deaths_per_min:"کم نگه‌داشتن Death",assists_per_min:"مشارکت در Killها",fight_participation:"حضور در درگیری‌ها",lane_efficiency_pct:"بازده مرحله لاین",last_hits_per_min:"سرعت Last Hit",denies_at_10:"Denyهای ده دقیقه اول",hero_damage_per_min:"Damage واردشده به Heroها",hero_healing_per_min:"Heal تیم",tower_damage:"فشار روی Towerها"} as Record<string,string>)[key]||"اثرگذاری کلی"}

function Verdict({ good = false, title, englishTitle, metrics }: { good?: boolean; title: string; englishTitle: string; metrics: MatchBenchmarkMetric[] }) {
  return <section className={`analysis-verdict-group is-${good ? "good" : "bad"}`}><SectionHeading icon={good ? <TrendingUp /> : <ShieldAlert />} title={englishTitle} detail={title} /><article className="analysis-verdict">{metrics.length ? metrics.map((entry,index) => <div key={entry.key}><i>{index+1}</i><span><b lang="en" dir="ltr">{presentation(entry).label}</b><small>{presentation(entry).description}</small></span><strong className={`is-${tone(entry)}`}>{entry.scoreOnly?`${fa.format(entry.qualityPercentile)} از ۱۰۰`:`بالاتر از ${fa.format(entry.qualityPercentile)}٪`}</strong></div>) : <p>{good ? "در این Match نقطه قوت معناداری ثبت نشده است." : "مورد بحرانی مشخصی برای بازبینی ثبت نشده است."}</p>}</article></section>;
}

function MetricCard({ entry, player, duration }: { entry: MatchBenchmarkMetric; player: MatchPlayerAnalysis; duration:number }) {
  const info = presentation(entry); const total=benchmarkMetricTotal(entry,player,duration);const displayedValue=entry.key==="tower_damage"&&total?en.format(total.value/Math.max(1,duration)):entry.formattedValue;
  return <article className={`benchmark-cell is-${tone(entry)}`} title={info.description}><header><span className="benchmark-label" lang="en" dir="ltr">{info.label}<span className="analysis-metric-help" tabIndex={0} aria-label={info.description}><Info /><span role="tooltip">{info.description}</span></span></span><strong className="benchmark-raw" lang="en" dir="ltr">{displayedValue}{total&&<small>{formatBenchmarkMetricTotal(total)}</small>}</strong></header><p>{info.description}</p><div className="benchmark-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.qualityPercentile}><span style={{ width: `${entry.qualityPercentile}%` }} /></div><footer><b>بالاتر از {fa.format(entry.qualityPercentile)}٪</b></footer></article>;
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
    <header className="timeline-heading"><div className="timeline-player-heading"><img src={portrait(player)} alt=""/><span><small lang="en" dir="ltr">PLAYER PROGRESSION</small><h4 lang="en" dir="ltr">{player.heroName}</h4><p>{info.description} در طول Match</p></span><img className="timeline-position-icon" src={positionIcon(player.position)} alt=""/></div><div className="timeline-toolbar"><section><small>معیار نمودار</small><div className="timeline-metric-switch">{(Object.keys(TIMELINE) as TimelineMetric[]).map((key) => <button className={metricKey === key ? "is-active" : ""} type="button" key={key} onClick={() => setMetricKey(key)} lang="en" dir="ltr">{TIMELINE[key].label}</button>)}</div></section><section><small>دامنه مقایسه</small><div className="timeline-scope-switch"><button className={scope === "solo" ? "is-active" : ""} type="button" onClick={() => setScope("solo")}>فقط این Hero</button><button className={scope === "role" ? "is-active" : ""} type="button" onClick={() => setScope("role")} disabled={!opponent}>هم‌Position</button><button className={scope === "all" ? "is-active" : ""} type="button" onClick={() => setScope("all")}>هر ۱۰ Hero</button></div></section></div></header>
    <ProgressionMilestones player={player} opponent={scope==="role"?opponent:undefined} metricKey={metricKey} duration={analysis.durationMinutes}/>
    {legend.length > 0 && <div className="timeline-series-legend" dir="ltr">{legend.map((entry) => { const visible = scope !== "all" || visibleSlots.has(entry.playerSlot); return <button type="button" key={entry.playerSlot} className={visible ? "is-visible" : ""} onClick={() => scope === "all" && toggle(entry.playerSlot)} aria-pressed={visible} disabled={scope !== "all"}><span style={{ background: colors.get(entry.playerSlot) }} /><img src={portrait(entry)} alt="" /><b>{entry.heroName}</b><img className="timeline-legend-position" src={positionIcon(entry.position)} alt={`Pos ${entry.position||"?"}`}/>{scope === "all" && (visible ? <Eye /> : <EyeOff />)}</button>; })}</div>}
    {seriesPlayers.length === 1 && <div className="timeline-status-grid is-sticky-summary"><TimelineStat label="Net Worth" description="Gold در دقیقه انتخابی" value={snapshot?.gold} trend={snapshotTrend(player.timeline, snapshot, "goldDelta")} /><TimelineStat label="XP" description="XP در دقیقه انتخابی" value={snapshot?.xp} trend={snapshotTrend(player.timeline, snapshot, "xpDelta")} /><TimelineStat label="Last Hits" description="LH در دقیقه انتخابی" value={snapshot?.lastHits} trend={snapshotTrend(player.timeline, snapshot, "lastHitDelta")} /><TimelineStat label="Momentum" description="روند همین بازه" value={snapshot?.label || "—"} trend={stateTrend(snapshot)} /></div>}
    <div className={`timeline-chart-layout${seriesPlayers.length > 1 ? " has-comparison" : ""}`}>
      <section className="timeline-chart-shell" dir="ltr">{chart ? <TimelineChartSvg chart={chart} metricKey={metricKey} scope={scope} minute={minute} duration={analysis.durationMinutes} players={seriesPlayers} colors={colors}/> : <p className="timeline-empty">برای انتخاب فعلی Timeline آماده نیست.</p>}</section>
      {seriesPlayers.length > 1 && <TimelineComparison players={seriesPlayers} metricKey={metricKey} minute={minute} colors={colors} />}
    </div>
    <header className="timeline-control" dir="ltr"><button type="button" onClick={() => setMinute(Math.max(0, minute - 1))}><ChevronLeft /></button><div dir="rtl"><span>دقیقه</span><b>{fa.format(minute)}</b></div><input type="range" min="0" max={analysis.durationMinutes} value={minute} onChange={(event) => setMinute(Number(event.target.value))} aria-label="دقیقه Timeline" /><button type="button" onClick={() => setMinute(Math.min(analysis.durationMinutes, minute + 1))}><ChevronRight /></button></header>
    <TimelineEvents player={player} minute={minute}/>
    {team && <div className="team-advantage"><span>برتری Gold <b className={(team.radiantGoldAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantGoldAdvantage)}</b></span><span>برتری XP <b className={(team.radiantXpAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantXpAdvantage)}</b></span></div>}
  </div>;
}

function TimelineEvents({player,minute}:{player:MatchPlayerAnalysis;minute:number}){
  const events=(player.events||[]).filter((event)=>Math.abs(event.minute-minute)<=1).slice(0,6);
  if(!events.length)return <div className="timeline-event-context"><Info/><span><b>در این بازه چه اتفاقی افتاد؟</b><small>در فاصله یک دقیقه قبل و بعد، Kill، Death، Objective یا خرید مهمی ثبت نشده؛ تغییر نمودار احتمالاً نتیجه Farm و جابه‌جایی عادی بوده است.</small></span></div>;
  const negative=events.filter((event)=>event.positive===false).length,positive=events.filter((event)=>event.positive===true).length;
  return <div className="timeline-event-context has-events"><div><Activity/><span><b>اتفاق‌های مؤثر اطراف دقیقه {fa.format(minute)}</b><small>{positive>negative?"نشانه‌های مثبت این بازه بیشتر است؛ رشد نمودار را با رخدادهای زیر تطبیق بده.":negative>positive?"رخدادهای منفی غالب‌اند و می‌توانند افت یا توقف رشد را توضیح دهند.":"ترکیبی از رخدادهای مثبت و منفی ثبت شده؛ ترتیب زمانی آن‌ها را در Replay بررسی کن."}</small></span></div><section>{events.map((event)=><article className={event.positive===false?"is-negative":event.positive===true?"is-positive":"is-neutral"} key={event.id}><span>{eventTypeLabel(event.type)}</span><b>{event.detail||event.label}</b><small>{Math.floor(event.second/60)}:{String(Math.round(event.second%60)).padStart(2,"0")}</small></article>)}</section></div>;
}

function eventTypeLabel(type:string){return ({kill:"Kill",death:"Death",item:"Item",objective:"Objective",buyback:"Buyback",ward:"Ward",sentry:"Sentry",smoke:"Smoke",dust:"Dust"} as Record<string,string>)[type]||type}

function TimelineChartSvg({chart,metricKey,scope,minute,duration,players,colors}:{chart:ReturnType<typeof buildChart> extends infer T?Exclude<T,null>:never;metricKey:TimelineMetric;scope:TimelineScope;minute:number;duration:number;players:MatchPlayerAnalysis[];colors:Map<number,string>}){
  const cursorX=chart.minuteX(minute);
  return <svg viewBox="0 28 760 275" role="img" aria-label={`${TIMELINE[metricKey].label} برای ${players.map((entry)=>entry.heroName).join(" و ")}`}><defs><linearGradient id={`analysis-fill-${metricKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--timeline-accent)" stopOpacity=".3"/><stop offset="1" stopColor="var(--timeline-accent)" stopOpacity="0"/></linearGradient></defs>{[50,100,150,200,250].map((y)=><g key={y}><line className="timeline-grid-line" x1="38" x2="660" y1={y} y2={y}/><text className="timeline-grid-value" x="738" y={y+4} textAnchor="end">{compactMetric(chart.gridValue(y),metricKey)}</text></g>)}{scope==="solo"&&chart.series[0]&&<path className="timeline-area" style={{fill:`url(#analysis-fill-${metricKey})`}} d={chart.series[0].area}/>} {chart.series.map((series)=><path className="timeline-line" style={{stroke:colors.get(series.player.playerSlot)}} d={series.line} key={series.player.playerSlot}/>)}<line className="timeline-cursor-line" x1={cursorX} x2={cursorX} y1="40" y2="250"/>{chart.series.map((series)=>{const point=closest(series.player.timeline,minute);const value=point?.[metricKey];if(typeof value!=="number")return null;const color=colors.get(series.player.playerSlot);return <circle className="timeline-cursor-dot" key={series.player.playerSlot} cx={cursorX} cy={chart.valueY(value)} r="7" style={{stroke:color,color}}/>})}<text className="timeline-axis-label" x="38" y="288">0</text><text className="timeline-axis-label" x="194" y="288">{Math.round(duration*.25)}m</text><text className="timeline-axis-label" x="350" y="288">{Math.round(duration*.5)}m</text><text className="timeline-axis-label" x="506" y="288">{Math.round(duration*.75)}m</text><text className="timeline-axis-label" x="640" y="288">{duration}m</text></svg>
}

function compactMetric(value:number,key:TimelineMetric){if(key==="lastHits")return en.format(value);if(value>=1000)return `${(value/1000).toFixed(value>=10000?1:2)}k`;return en.format(value)}

const MILESTONES=[5,10,20,30,40,60];
function ProgressionMilestones({player,opponent,metricKey,duration}:{player:MatchPlayerAnalysis;opponent?:MatchPlayerAnalysis;metricKey:TimelineMetric;duration:number}){
  const field=metricKey==="gold"?"goldDelta":metricKey==="xp"?"xpDelta":"lastHitDelta";
  return <section className="progression-milestones" dir="ltr"><header><div><Activity/><span><b>{TIMELINE[metricKey].label} MILESTONES</b></span></div>{opponent&&<span className="milestone-rival"><img src={portrait(opponent)} alt=""/>VS {opponent.heroName}</span>}</header><div>{MILESTONES.map((milestoneMinute)=>{
    const point=milestoneMinute<=duration?closest(player.timeline,milestoneMinute):undefined;
    const rival=opponent&&milestoneMinute<=duration?closest(opponent.timeline,milestoneMinute):undefined;
    const value=point?.[metricKey]??null,rivalValue=rival?.[metricKey]??null;
    const delta=value!==null&&rivalValue!==null?value-rivalValue:null;
    const cohort=player.cohort?.milestones.find((entry)=>entry.minute===milestoneMinute),cohortValue=cohort?.[metricKey]??null;
    const cohortDelta=value!==null&&cohortValue!==null?value-cohortValue:null;
    const comparison=opponent?delta:cohortDelta;const comparisonLabel=opponent?"نسبت به حریف":"نسبت به میانه";
    const trend=snapshotTrend(player.timeline,point,field);
    return <article key={milestoneMinute} className={`is-${trend}${milestoneMinute>duration?" is-disabled":""}`}><div className="milestone-status"><TrendIcon trend={trend}/><span>{trend==="positive"?"رشد":trend==="negative"?"افت":"خنثی"}</span></div><div className="milestone-details"><header><span>MINUTE</span><b>{milestoneMinute}</b></header><strong>{value===null?"—":en.format(value)}</strong><small className={comparison===null?"is-neutral":comparison>0?"is-positive":comparison<0?"is-negative":"is-neutral"}>{comparison===null?"داده مقایسه موجود نیست":`${comparison>0?"+":""}${en.format(comparison)} ${comparisonLabel}`}</small></div></article>
  })}</div></section>
}

function TimelineComparison({ players, metricKey, minute, colors }: { players: MatchPlayerAnalysis[]; metricKey: TimelineMetric; minute: number; colors: Map<number, string> }) {
  const field = metricKey === "gold" ? "goldDelta" : metricKey === "xp" ? "xpDelta" : "lastHitDelta";
  const groups=[1,2,3,4,5].flatMap((position)=>{const entries=players.filter((entry)=>entry.position===position);return entries.length?[{position,entries}]:[];});
  return <aside className="timeline-live-comparison" dir="ltr">{groups.map((group)=><section key={group.position}><header><img src={positionIcon(group.position)} alt=""/><span><b>{POSITION_GROUP_LABELS[group.position]}</b><small>Pos {group.position}</small></span></header><div>{group.entries.map((entry) => {
    const point = closest(entry.timeline, minute); const value = point?.[metricKey] ?? null; const trend = snapshotTrend(entry.timeline, point, field);
    return <article key={entry.playerSlot} className={`is-${trend}`}><span className="timeline-series-color" style={{ background: colors.get(entry.playerSlot) }} /><img src={portrait(entry)} alt="" /><b>{entry.heroName}</b><strong>{value === null ? "—" : en.format(value)}</strong><TrendIcon trend={trend} /></article>;
  })}</div></section>)}</aside>;
}

function buildChart(players: MatchPlayerAnalysis[], metricKey: TimelineMetric, duration: number) {
  const values = players.flatMap((player) => player.timeline.flatMap((point) => point[metricKey] === null ? [] : [point[metricKey] as number])); if (values.length < 2) return null;
  const maxValue = Math.max(1, ...values) * 1.08; const x = (value: number) => 38 + (Math.max(0, Math.min(duration, value)) / Math.max(1, duration)) * 622; const y = (value: number | null) => value === null ? 250 : 250 - (value / maxValue) * 212;const gridValue=(gridY:number)=>Math.max(0,Math.round((250-gridY)/212*maxValue));
  const series = players.flatMap((player) => { const points = player.timeline.flatMap((point) => point[metricKey] === null ? [] : [{ minute: point.minute, value: point[metricKey] as number }]); if (points.length < 2) return []; const list = points.map((point) => `${x(point.minute).toFixed(1)},${y(point.value).toFixed(1)}`);const end=points.at(-1)!; return [{ player, line: `M ${list.join(" L ")}`, area: `M ${list.join(" L ")} L ${x(end.minute).toFixed(1)},250 L ${x(points[0].minute).toFixed(1)},250 Z` }]; });
  return series.length ? { series, minuteX: x, valueY: y,gridValue } : null;
}
function stateTrend(snapshot?: MatchMinuteSnapshot): Trend { if (!snapshot) return "steady"; if (snapshot.state === "setback" || snapshot.state === "out") return "negative"; if (snapshot.state === "surge" || snapshot.state === "progress") return "positive"; return "steady"; }
function snapshotTrend(timeline: MatchMinuteSnapshot[], snapshot: MatchMinuteSnapshot | undefined, field: "goldDelta" | "xpDelta" | "lastHitDelta"): Trend { if (!snapshot || snapshot[field] === null) return stateTrend(snapshot);const phaseStart=Math.floor(Math.max(0,snapshot.minute-1)/10)*10;const deltas=timeline.filter((point)=>point.minute>phaseStart&&point.minute<=phaseStart+10).map((point)=>point[field]).filter((value):value is number=>value!==null&&value>0).sort((a,b)=>a-b);const typical=deltas.length?deltas[Math.floor(deltas.length/2)]:0;if(!typical)return "steady";if((snapshot[field] as number)>=typical*1.2)return "positive";if((snapshot[field] as number)<=typical*.6)return "negative";return "steady"; }
function TrendIcon({ trend }: { trend: Trend }) { return trend === "positive" ? <ArrowUp /> : trend === "negative" ? <ArrowDown /> : <Minus />; }
function TimelineStat({ label, description, value, trend }: { label: string; description: string; value: string | number | null | undefined; trend: Trend }) { return <article className={`is-${trend}`}><span lang="en" dir="ltr">{label}</span><div><strong>{typeof value === "number" ? en.format(value) : value ?? "—"}</strong><TrendIcon trend={trend} /></div><small>{description}</small></article>; }
function adv(value: number | null) { return value === null ? "—" : `${value >= 0 ? "Radiant" : "Dire"} ${en.format(Math.abs(Math.round(value)))}`; }
function closest(timeline: MatchMinuteSnapshot[], minute: number) { return [...timeline].reverse().find((point) => point.minute <= minute); }
function metric(player: MatchPlayerAnalysis, key: string) { return player.benchmarks.find((entry) => entry.key === key); }
function globalScoreMetrics(player:MatchPlayerAnalysis){return (player.scoreMetrics??player.benchmarks).filter((entry)=>entry.source!=="match");}
function playerScore(player: MatchPlayerAnalysis, duration: number) { return player.performanceScore??calculatePerformanceScoreOrNull(globalScoreMetrics(player),duration,player.position); }

function Roster({ analysis, selected, inspect }: { analysis: MatchAnalysis; selected: number; inspect: (slot: number) => void }) {
  const players = [...analysis.players].sort((a, b) => (playerScore(b, analysis.durationMinutes)??-1) - (playerScore(a, analysis.durationMinutes)??-1));
  return <div className="analysis-roster-view"><SectionHeading icon={<UsersRound />} title="10 Heroes Comparison" detail="رتبه‌بندی عملکرد هر ۱۰ Hero با Score وزن‌دار" /><div className="analysis-roster-table-wrap"><table className="analysis-roster-table"><thead><tr><th>Hero</th><th>Score</th><th>K / D / A</th><th>Fight<br/>Participation</th><th>Lane<br/>Efficiency</th><th>GPM</th><th>XPM</th><th>LH / min</th><th>DN @10</th><th>Hero DMG<br/>/ min</th><th>Heal<br/>/ min</th><th>Tower<br/>DMG</th></tr></thead><tbody>{players.map((entry) => <tr className={`analysis-roster-row is-${entry.team}${entry.isProfilePlayer?" is-profile":""}`} data-selected={entry.playerSlot === selected} key={entry.playerSlot}><td data-label="Hero"><button type="button" onClick={() => inspect(entry.playerSlot)}><img src={portrait(entry)} alt="" /><span><b lang="en">{entry.heroName}</b><small lang="en" dir="ltr">Pos {entry.position??"?"}</small></span></button></td><td data-label="Score"><ScoreRing score={playerScore(entry, analysis.durationMinutes)} /></td><RosterKda player={entry} /><RosterMetric label="Fight Participation" entry={metric(entry, "fight_participation")} /><RosterMetric label="Lane Efficiency" entry={metric(entry, "lane_efficiency_pct")} /><RosterMetric label="GPM" entry={metric(entry, "gold_per_min")} /><RosterMetric label="XPM" entry={metric(entry, "xp_per_min")} /><RosterMetric label="LH / min" entry={metric(entry, "last_hits_per_min")} /><RosterMetric label="DN @10" entry={metric(entry, "denies_at_10")} /><RosterMetric label="Hero DMG / min" entry={metric(entry, "hero_damage_per_min")} /><RosterMetric label="Heal / min" entry={metric(entry, "hero_healing_per_min")} /><RosterMetric label="Tower DMG" entry={metric(entry, "tower_damage")} /></tr>)}</tbody></table></div></div>;
}
function ScoreRing({ score }: { score: number|null }) { const color=score===null?"unavailable":performanceTone(score);return <div className={`analysis-score-ring is-${color}`} style={{ "--score": `${(score??0) * 3.6}deg` } as CSSProperties}><span lang="en" dir="ltr"><b>{score??"—"}</b><small>/100</small></span></div>; }
function RosterMetric({ entry,label }: { entry?: MatchBenchmarkMetric;label:string }) { const color = tone(entry); return <td data-label={label} className={color ? `is-${color}` : ""} lang="en" dir="ltr"><b>{entry?.formattedValue || "—"}</b>{entry && <small>({entry.qualityPercentile}%)</small>}</td>; }
function RosterKda({ player }: { player: MatchPlayerAnalysis }) {
  const kills = metric(player, "kills_per_min"); const deaths = metric(player, "deaths_per_min"); const assists = metric(player, "assists_per_min");
  return <td data-label="K / D / A" className="analysis-roster-kda" lang="en" dir="ltr"><b><span className={`is-${tone(kills)}`}>{display(player.kills)}</span><i>/</i><span className={`is-${tone(deaths)}`}>{display(player.deaths)}</span><i>/</i><span className={`is-${tone(assists)}`}>{display(player.assists)}</span></b><small>(<span className={`is-${tone(kills)}`}>{kills?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(deaths)}`}>{deaths?.qualityPercentile ?? "—"}%</span> / <span className={`is-${tone(assists)}`}>{assists?.qualityPercentile ?? "—"}%</span>)</small></td>;
}
