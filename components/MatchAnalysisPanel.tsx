"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Activity, AlertTriangle, BarChart3, ChevronLeft, ChevronRight, CircleGauge, Sparkles, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import type { DotaTeam, Match, MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis } from "@/lib/types";
import AppLogo from "./AppLogo";

type View = "summary" | "timeline" | "players";
const fa = new Intl.NumberFormat("fa-IR");

export default function MatchAnalysisPanel({ match, active }: { match: Match; active: boolean }) {
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(match.analysis || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("summary");
  const [slot, setSlot] = useState<number | null>(null);
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    setAnalysis(match.analysis || null);
    if (match.analysis) {
      setSlot(match.analysis.players.find((player) => player.isProfilePlayer)?.playerSlot ?? match.analysis.players[0]?.playerSlot ?? null);
      setMinute(match.analysis.durationMinutes);
    }
  }, [match.analysis, match.id]);
  useEffect(() => {
    if (!active || !match.dotaMatchId || analysis || loading) return;
    let cancelled = false;
    setLoading(true); setError("");
    fetch(`/api/matches/${match.id}/analysis`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { analysis?: MatchAnalysis | null; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(body?.error?.message || "تحلیل مچ آماده نشد");
        return body?.analysis || null;
      })
      .then((value) => { if (!cancelled) { setAnalysis(value); setSlot(value?.players.find((p) => p.isProfilePlayer)?.playerSlot ?? value?.players[0]?.playerSlot ?? null); setMinute(value?.durationMinutes || 0); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "تحلیل مچ آماده نشد"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, analysis, match.dotaMatchId, match.id]);
  const player = analysis?.players.find((p) => p.playerSlot === slot) || analysis?.players.find((p) => p.isProfilePlayer) || analysis?.players[0];
  if (!match.dotaMatchId) return null;
  if (loading) return <section className="analysis-loading"><AppLogo size={44} alt="" /><div><strong>در حال خواندن جریان مچ</strong><p>عملکرد ۱۰ بازیکن کنار هم چیده می‌شود.</p></div></section>;
  if (error) return <Empty icon={<AlertTriangle />} title="تحلیل مچ آماده نشد" text={error} />;
  if (active && !analysis) return <Empty icon={<CircleGauge />} title="داده کافی برای تحلیل نیست" text="پس از آماده‌شدن Replay، تحلیل این مچ کامل می‌شود." />;
  if (!analysis || !player) return null;
  return <section className="match-analysis">
    <header className="analysis-hero"><div><span><Activity /></span><div><p>PERFORMANCE PULSE</p><h3>نبض مچ</h3><small>{analysis.status === "ready" ? "تحلیل کامل ۱۰ بازیکن" : "تحلیل داده‌های آماده"}</small></div></div><b>{fa.format(analysis.coverage.benchmarkPlayers)}<small> از {fa.format(analysis.coverage.totalPlayers)} بازیکن</small></b></header>
    <nav className="analysis-nav"><Nav active={view === "summary"} icon={<Sparkles />} label="جمع‌بندی" click={() => setView("summary")} /><Nav active={view === "timeline"} icon={<Activity />} label="خط زمانی" click={() => setView("timeline")} /><Nav active={view === "players"} icon={<UsersRound />} label="۱۰ بازیکن" click={() => setView("players")} /></nav>
    <PlayerStrip players={analysis.players} selected={player.playerSlot} select={setSlot} />
    {view === "summary" && <Summary player={player} />}
    {view === "timeline" && <Timeline analysis={analysis} minute={minute} setMinute={setMinute} />}
    {view === "players" && <Roster players={analysis.players} selected={player.playerSlot} select={setSlot} />}
  </section>;
}

function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <section className="analysis-state"><span>{icon}</span><div><strong>{title}</strong><p>{text}</p></div></section>; }
function Nav({ active, icon, label, click }: { active: boolean; icon: ReactNode; label: string; click: () => void }) { return <button className={active ? "is-active" : ""} type="button" onClick={click}>{icon}{label}</button>; }
function portrait(player: MatchPlayerAnalysis) { const hero = heroById(player.heroId); return hero ? heroImage(hero) : ""; }
function PlayerStrip({ players, selected, select }: { players: MatchPlayerAnalysis[]; selected: number; select: (slot: number) => void }) {
  return <div className="analysis-player-strip">{(["radiant", "dire"] as DotaTeam[]).map((team) => <section className={`is-${team}`} key={team}><b>{team.toUpperCase()}</b><div>{players.filter((p) => p.team === team).map((p) => <button className={`${p.playerSlot === selected ? "is-selected" : ""}${p.isProfilePlayer ? " is-profile" : ""}`} type="button" key={p.playerSlot} onClick={() => select(p.playerSlot)} title={`${p.personName} · ${p.heroName}`}><img src={portrait(p)} alt={p.heroName} /><span>{p.position || "—"}</span></button>)}</div></section>)}</div>;
}
function Summary({ player }: { player: MatchPlayerAnalysis }) {
  const score = player.benchmarks.length ? Math.round(player.benchmarks.reduce((sum, m) => sum + m.qualityPercentile, 0) / player.benchmarks.length) : 0;
  return <div className="analysis-summary"><article className={`analysis-focus is-${player.team}`}><img src={portrait(player)} alt="" /><div><span>{player.positionLabel}</span><h4>{player.heroName}</h4><p>{player.personName}</p></div><div className="analysis-score" style={{ "--score": `${score * 3.6}deg` } as CSSProperties}><strong>{fa.format(score)}</strong><small>امتیاز ریتم</small></div></article><div className="analysis-verdicts"><Verdict good title="نقاط قوت" metrics={player.strengths} /><Verdict title="فرصت‌های بهبود" metrics={player.weaknesses} /></div><section className="benchmark-board"><header><div><BarChart3 /><strong>Benchmark عملکرد</strong></div><span>{player.benchmarkSource === "hero" ? "در مقایسه با بازی‌های همین هیرو" : player.benchmarkSource === "match" ? "در مقایسه با همین مچ" : "داده کافی نیست"}</span></header>{player.benchmarks.length ? <div>{player.benchmarks.map((m) => <Metric metric={m} key={m.key} />)}</div> : <p>Replay این مچ Benchmark کامل ندارد.</p>}</section></div>;
}
function Verdict({ good = false, title, metrics }: { good?: boolean; title: string; metrics: MatchBenchmarkMetric[] }) { return <article className={`analysis-verdict is-${good ? "good" : "bad"}`}><header>{good ? <TrendingUp /> : <TrendingDown />}<strong>{title}</strong></header>{metrics.length ? metrics.map((m) => <div key={m.key}><span>{m.label}</span><b>{fa.format(m.qualityPercentile)}٪</b></div>) : <p>{good ? "برتری مشخصی ثبت نشده" : "افت مشخصی ثبت نشده"}</p>}</article>; }
function Metric({ metric }: { metric: MatchBenchmarkMetric }) { return <article className={`benchmark-cell is-${metric.tone}`}><div><span>{metric.label}</span><b>{metric.formattedValue}</b></div><i><span style={{ width: `${metric.qualityPercentile}%` }} /></i><footer><b>{fa.format(metric.qualityPercentile)}٪</b><small>{metric.source === "hero" ? "همان هیرو" : "داخل مچ"}</small></footer></article>; }

function Timeline({ analysis, minute, setMinute }: { analysis: MatchAnalysis; minute: number; setMinute: (minute: number) => void }) {
  const team = [...analysis.teamTimeline].reverse().find((p) => p.minute <= minute);
  return <div className="timeline-view"><header className="timeline-control"><button type="button" onClick={() => setMinute(Math.max(0, minute - 1))}><ChevronRight /></button><div><span>دقیقه</span><b>{fa.format(minute)}</b></div><input type="range" min="0" max={analysis.durationMinutes} value={minute} onChange={(e) => setMinute(Number(e.target.value))} /><button type="button" onClick={() => setMinute(Math.min(analysis.durationMinutes, minute + 1))}><ChevronLeft /></button></header>{team && <div className="team-advantage"><span>برتری طلا <b className={(team.radiantGoldAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantGoldAdvantage)}</b></span><span>برتری XP <b className={(team.radiantXpAdvantage || 0) >= 0 ? "is-radiant" : "is-dire"}>{adv(team.radiantXpAdvantage)}</b></span></div>}<div className="timeline-teams">{(["radiant", "dire"] as DotaTeam[]).map((side) => <section className={`is-${side}`} key={side}><header><b>{side.toUpperCase()}</b><span>ریتم بازیکنان</span></header>{analysis.players.filter((p) => p.team === side).map((p) => <TimelineRow player={p} minute={minute} key={p.playerSlot} />)}</section>)}</div></div>;
}
function adv(value: number | null) { if (value === null) return "—"; return `${value >= 0 ? "Radiant" : "Dire"} ${fa.format(Math.abs(Math.round(value)))}`; }
function closest(timeline: MatchMinuteSnapshot[], minute: number) { return [...timeline].reverse().find((p) => p.minute <= minute); }
function delta(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${value >= 0 ? "+" : ""}${fa.format(Math.round(value))}`; }
function TimelineRow({ player, minute }: { player: MatchPlayerAnalysis; minute: number }) { const p = closest(player.timeline, minute); return <article className={`timeline-player is-${p?.state || "steady"}${player.isProfilePlayer ? " is-profile" : ""}`}><img src={portrait(player)} alt="" /><div><b>{player.heroName}</b><span>{p?.label || "داده آماده نیست"}</span></div><small>G <b>{delta(p?.goldDelta)}</b> · XP <b>{delta(p?.xpDelta)}</b> · LH <b>{delta(p?.lastHitDelta)}</b></small></article>; }
function Roster({ players, selected, select }: { players: MatchPlayerAnalysis[]; selected: number; select: (slot: number) => void }) { return <div className="analysis-roster">{players.map((p) => { const sorted = [...p.benchmarks].sort((a, b) => b.qualityPercentile - a.qualityPercentile); return <button className={`is-${p.team}${p.playerSlot === selected ? " is-selected" : ""}`} type="button" key={p.playerSlot} onClick={() => select(p.playerSlot)}><img src={portrait(p)} alt="" /><div><b>{p.heroName}</b><span>{p.positionLabel}</span></div><small className="good"><TrendingUp />{sorted[0] ? `${sorted[0].label} ${fa.format(sorted[0].qualityPercentile)}٪` : "—"}</small><small className="bad"><TrendingDown />{sorted.at(-1) ? `${sorted.at(-1)!.label} ${fa.format(sorted.at(-1)!.qualityPercentile)}٪` : "—"}</small></button>; })}</div>; }
