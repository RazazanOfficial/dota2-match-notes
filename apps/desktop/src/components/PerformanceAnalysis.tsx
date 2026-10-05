import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, Clock, Info, MapPinned, UsersRound } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { calculatePerformanceDomains, calculatePerformanceScoreOrNull, performanceTone } from "@/lib/dota/performance-score";
import { benchmarkMetricTotal, formatBenchmarkMetricTotal } from "@/lib/dota/performance-presentation";
import { buildPositionSwapUpdates } from "@/lib/dota/analysis-position-overrides";
import { DOTA_741_LANDMARKS, DOTA_MAP_LAYER_ICONS, DOTA_MAP_LAYER_LABELS, type DotaMapLayer } from "@/lib/dota/map-landmarks";
import type { MatchAnalysis, MatchBenchmarkMetric, MatchMinuteSnapshot, MatchPlayerAnalysis } from "@/lib/types";
import { durationText, roles } from "../history";
import type { Messages } from "../i18n";
import { Position, Score } from "./Workspace";
const num = (v: unknown) => v == null ? "—" : typeof v === "number" ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v) : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
const label = (key: string) => ({ gold: "Net Worth", xp: "XP", lastHits: "Last Hits", heroDamage: "Hero DMG", heroHealing: "Heal", goldDelta: "NW gained", xpDelta: "XP gained", lastHitDelta: "LH gained", deniesAt10: "Denies @10", netWorthAt10: "Net Worth @10", xpAt10: "XP @10", lastHitsAt10: "Last Hits @10", killsAt10: "Kills @10", deathsAt10: "Deaths @10", resourcePurchasesAt10: "Lane resources @10", observerPlacementsAt10: "Observers @10", sentryPlacementsAt10: "Sentries @10", opponentPlayerSlot: "Opponent slot", roleGroup: "Role group", laneRole: "Lane position", laneEfficiency: "Lane Efficiency", samples: "Samples", covered: "Covered weight", subtotal: "Subtotal", bonus: "Bonus", referenceMonth: "Reference month", referenceVersion: "Reference version", preparedBeforeThreat: "Detection ready before threat", productiveSentriesEstimate: "Productive sentries (estimate)", deathCost: "Estimated death cost", emptyTravelMinutes: "Empty travel", sourceMix: "Farm source mix", averageConversionDelaySeconds: "Average fight → objective delay", heroPositionWeight: "Hero / position reference weight", benchmarkApplicability: "Benchmark applicability", snapshotFetchedAt: "Reference snapshot", rankTier: "Rank tier", effectiveSampleSize: "Effective samples", scoreWeight: "Scoring weight", scoreOnly: "Scoring only", highlightEligible: "Eligible for highlights", source: "Source", weight: "Weight", confidence: "Confidence", timelineSource: "Timeline source", benchmarkSource: "Benchmark source", metaSource: "Meta source" } as Record<string, string>)[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, x => x.toUpperCase());
export function scoreFor(player: MatchPlayerAnalysis, duration: number) { return player.performanceScore ?? calculatePerformanceScoreOrNull((player.scoreMetrics ?? player.benchmarks).filter(m => m.source !== "match"), duration, player.position); }
function laneContextScore(player: MatchPlayerAnalysis) { const lane = player.laneImpact; if (!lane)
    return null; const base = lane.assessment === "ahead" ? 74 : lane.assessment === "even" ? 55 : lane.assessment === "behind" ? 34 : null; if (base === null)
    return null; const confidence = lane.confidence === "high" ? 1 : lane.confidence === "medium" ? .92 : .82; return Math.round(50 + (base - 50) * confidence); }
function contextDomainScore(key: string, player: MatchPlayerAnalysis, duration: number) {
    if (key === "laning") {
        const score = laneContextScore(player);
        return score === null ? null : { score, signals: 1, label: "Lane context · 0–10m" };
    }
    if (key === "utility" && player.map && player.map.utility.availability !== "unavailable") {
        const utility = player.map.utility;
        const support = (player.position ?? 0) >= 4;
        let score = support ? 32 : 45, signals = 0;
        const add = (value: number | null | undefined, weight: number, cap: number) => { if (value === null || value === undefined)
            return; signals += 1; score += Math.min(cap, value * weight); };
        add(utility.observersPlaced, 3, 15);
        add(utility.sentriesPlaced, 1.6, 14);
        add(utility.observersDestroyed, 6, 18);
        add(utility.sentriesDestroyed, 2.5, 10);
        add(utility.campsStacked, 2.5, 10);
        add(utility.smokeUses, 2, 8);
        add(utility.dustUses, 2, 8);
        add(utility.laneResourcePurchases, 1.5, 9);
        const adjusted = score * (support ? 1 : Math.max(.72, 40 / Math.max(40, duration)));
        return signals ? { score: Math.round(Math.max(0, Math.min(95, adjusted))), signals, label: "Vision / utility context" } : null;
    }
    if (key === "objectives" && typeof player.towerDamage === "number")
        return { score: Math.round(Math.min(92, 32 + Math.sqrt(Math.max(0, player.towerDamage) / 5000) * 48)), signals: 1, label: "Building pressure context" };
    return null;
}
function display(key: string, value: unknown) { if (value == null)
    return "—"; if (typeof value === "number" && /Seconds$/.test(key))
    return durationText(Math.round(value)); if (typeof value === "number" && /Percent$|Rate$|Shares$/.test(key))
    return `${num(value)}%`; return num(value); }
function Facts({ data, exclude = [] }: {
    data: object | undefined;
    exclude?: string[];
}) { return <dl className="fact-grid">{Object.entries(data || {}).filter(([k, v]) => !["availability", "note", ...exclude].includes(k) && (v == null || ["number", "string", "boolean"].includes(typeof v))).map(([k, v]) => <div key={k} data-value-key={k}><dt>{label(k)}</dt><dd>{["position", "mainPosition", "detectedPosition", "assignedPosition", "confirmedPosition", "laneRole"].includes(k) && typeof v === "number" && v >= 1 && v <= 5 ? <Position value={v}/> : <bdi>{display(k, v)}</bdi>}</dd></div>)}</dl>; }
function Section({ title, children, status }: {
    title: string;
    children: ReactNode;
    status?: string;
}) { return <section className="panel analysis-section"><div className="section-heading"><h2>{title}</h2>{status && <span className="data-status">{status}</span>}</div>{children}</section>; }
function Note({ children }: {
    children?: ReactNode;
}) { return children ? <p className="data-note">{children}</p> : null; }
function Empty({ t }: {
    t: Messages;
}) { return <p className="empty-message">{t.unavailable}</p>; }
function Table({ columns, rows }: {
    columns: string[];
    rows: ReactNode[][];
}) { return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v ?? "—"}</td>)}</tr>)}</tbody></table></div>; }
export default function PerformanceAnalysis({ analysis, selected, onSelect, onPositionOverrides, t }: {
    analysis: MatchAnalysis;
    selected: number;
    onSelect: (slot: number) => void;
    onPositionOverrides: (updates: Record<string, number>) => void;
    t: Messages;
}) {
    const [view, setView] = useState("performance");
    const player = analysis.players.find(p => p.playerSlot === selected) || analysis.players[0];
    if (!player)
        return <Empty t={t}/>;
    const hero = heroById(player.heroId);
    const tabs = [{ key: "performance", label: t.performance, icon: BarChart3 }, { key: "progression", label: t.progression, icon: Clock }, { key: "map", label: t.mapAnalysis, icon: MapPinned }, { key: "players", label: t.allPlayers, icon: UsersRound }];
    return <div className="screen-stack performance-workspace"><section className="panel analysis-controls"><div className="analysis-player-picker" role="group" aria-label={t.players}>{analysis.players.map(p => { const h = heroById(p.heroId); return <button key={p.playerSlot} className={selected === p.playerSlot ? "active" : ""} aria-pressed={selected === p.playerSlot} title={`${p.personName} · ${p.heroName}`} aria-label={`${t.selected}: ${p.heroName}`} onClick={() => onSelect(p.playerSlot)}><img src={h ? heroImage(h) : ""} alt=""/><Position value={p.position} title={false}/></button>; })}</div><div className="analysis-selection"><img src={hero ? heroImage(hero) : ""} alt=""/><div><strong>{player.heroName}</strong><small>{player.personName}</small></div><Position value={player.position}/><small className={player.team === "radiant" ? "good" : "bad"}>{player.team === "radiant" ? "Radiant" : "Dire"}</small><label className="role-select">{t.roleOverride}<select aria-label={t.roleOverride} value={player.position || ""} onChange={e => onPositionOverrides(buildPositionSwapUpdates(analysis.players, player.playerSlot, Number(e.target.value)))}><option value="" disabled>{t.unavailable}</option>{roles.slice(1).map((r, i) => <option value={i + 1} key={r}>{r}</option>)}</select></label><span className="coverage-label">{t.coverage}: {analysis.coverage.benchmarkPlayers}/{analysis.coverage.totalPlayers} · {analysis.status}</span></div><nav className="analysis-tabs" aria-label={t.fullAnalysis}>{tabs.map(({ key, label: caption, icon: Icon }) => <button key={key} className={view === key ? "active" : ""} aria-pressed={view === key} onClick={() => setView(key)}><Icon size={16}/>{caption}</button>)}</nav></section>
    {view === "performance" && <Performance player={player} analysis={analysis} t={t}/>}
    {view === "progression" && <Progression key={player.playerSlot} player={player} analysis={analysis} t={t}/>}
    {view === "map" && <MapAnalysis key={player.playerSlot} player={player} duration={analysis.durationMinutes} t={t}/>}
    {view === "players" && <Section title={t.comparison}><Table columns={["Hero", "Pos", "IMP", "Lane @12", "K / D / A", ...analysis.players[0].benchmarks.map(m => m.shortLabel || m.label)]} rows={analysis.players.map(p => { const h = heroById(p.heroId); return [<button className="roster-player" onClick={() => onSelect(p.playerSlot)}><img src={h ? heroImage(h) : ""} alt=""/>{p.heroName}</button>, <Position value={p.position} title={false}/>, <Score value={scoreFor(p, analysis.durationMinutes)}/>, num(p.laneEfficiency?.score), `${p.kills ?? "—"} / ${p.deaths ?? "—"} / ${p.assists ?? "—"}`, ...analysis.players[0].benchmarks.map(m => { const metric = p.benchmarks.find(x => x.key === m.key); return <span>{metric?.formattedValue || "—"}<small className="muted"> {metric ? `${num(metric.qualityPercentile)}%` : ""}</small></span>; })]; })}/></Section>}
  </div>;
}
function Performance({ player: p, analysis: a, t }: {
    player: MatchPlayerAnalysis;
    analysis: MatchAnalysis;
    t: Messages;
}) {
    const metrics = (p.scoreMetrics ?? p.benchmarks).filter(m => m.source !== "match"), domains = calculatePerformanceDomains(metrics, a.durationMinutes, p.position).map(d => { const context = d.score === null ? contextDomainScore(d.key, p, a.durationMinutes) : null; return { ...d, score: context?.score ?? d.score, metricCount: context?.signals ?? d.metricCount, contextual: context?.label }; }), lane = p.laneEfficiency;
    const eligible = p.benchmarks.filter(m => m.highlightEligible !== false), strengths = [...eligible].filter(m => m.qualityPercentile >= 80).sort((x, y) => y.qualityPercentile - x.qualityPercentile).slice(0, 3), weaknesses = [...eligible].filter(m => m.qualityPercentile < 40).sort((x, y) => x.qualityPercentile - y.qualityPercentile).slice(0, 3);
    return <div className="screen-stack"><Section title={t.performanceScore}><div className="score-overview"><div className="performance-number"><strong>{num(scoreFor(p, a.durationMinutes))}</strong><small>/ 100</small><Position value={p.position}/></div><div className="domain-grid">{domains.map(d => <article key={d.key} className={`tone-${d.score == null ? "unavailable" : performanceTone(d.score)}`}><span>{d.label}</span><strong>{num(d.score)}<small>/100</small></strong><div className="progress-track"><i style={{ width: `${d.score || 0}%` }}/></div><small className="muted">{d.contextual || `${d.metricCount} ${t.metric} · Weight ${num(d.weight)}`}</small></article>)}</div></div></Section><div className="analysis-columns"><Section title={t.benchmarkSpectrum}><div className="benchmark-grid">{p.benchmarks.map(m => <Metric key={m.key} metric={m} player={p} duration={a.durationMinutes} t={t}/>)}</div></Section><aside className="screen-stack insights">{[[t.strengths, strengths], [t.watchlist, weaknesses]].map(([caption, list]) => <Section key={String(caption)} title={String(caption)}>{(list as MatchBenchmarkMetric[]).length ? (list as MatchBenchmarkMetric[]).map(m => <div className="finding" key={m.key}><span>{m.shortLabel || m.label}</span><strong>{num(m.qualityPercentile)}%</strong></div>) : <Note>{t.noData}</Note>}</Section>)}<Section title={t.scoreDetails}><details><summary>{t.scoreDetails}</summary><Table columns={[t.metric, "Value", "Quality %", "Weight", "Source", "Confidence"]} rows={metrics.map(m => [m.shortLabel || m.label, m.formattedValue, num(m.qualityPercentile), num(m.scoreWeight), m.source, m.confidence || "—"])}/></details><Facts data={p.cohort} exclude={["label"]}/><Note>{p.cohort?.label}</Note>{p.cohort?.limitations.map((s, i) => <Note key={i}>{s}</Note>)}{p.cohort?.positionShares && <Table columns={["Position", "Share", "Matches"]} rows={p.cohort.positionShares.map(s => [<Position value={s.position}/>, `${num(s.share)}%`, num(s.matches)])}/>}<Facts data={{ timelineSource: p.timelineSource, benchmarkSource: p.benchmarkSource, parsed: a.parsed, replaySource: a.replaySource, ...a.coverage }}/>{p.positionResolution && <details><summary>{t.roleOverride} · {p.positionResolution.source}</summary><Facts data={p.positionResolution}/><Table columns={["Evidence", "Weight", "Positions"]} rows={(p.positionResolution.evidence || []).map(e => [e.label, num(e.weight), e.supports.join(", ")])}/></details>}</Section></aside></div><div className="analysis-two-columns"><Section title={t.laneParts} status={lane?.score == null ? t.unavailable : t.laneEfficiency}>{lane ? <><div className="lane-score"><strong>{num(lane.score)}<small>/100</small></strong><span>{lane.cohort} · {lane.referenceMonth?.slice(0, 7) || "—"} · {num(lane.samples)} {t.sampleSize}</span></div><div className="lane-parts">{lane.parts.map(part => <article key={part.key} data-lane-part={part.key}><header><b>{part.label}</b><strong>{num(part.value)}<small>/{part.maximum}</small></strong></header><div className="progress-track"><i style={{ width: `${part.value == null ? 0 : part.value / Math.max(1, part.maximum) * 100}%` }}/></div><small>Match {num(part.actual)} · Mean {num(part.mean)}</small><Note>{part.note}</Note></article>)}</div><Facts data={lane} exclude={["score", "cohort", "samples"]}/>{lane.notes.map((note, i) => <Note key={i}>{note}</Note>)}</> : <Empty t={t}/>}</Section><Section title={t.laneImpact} status={p.laneImpact?.availability}>{p.laneImpact && p.laneImpact.availability !== "unavailable" ? <><div className="lane-verdict"><b className={p.laneImpact.assessment === "ahead" ? "good" : p.laneImpact.assessment === "behind" ? "bad" : ""}>{p.laneImpact.assessment.toUpperCase()}</b><span>{a.players.find(x => x.playerSlot === p.laneImpact?.opponentPlayerSlot)?.heroName || "—"} · {p.laneImpact.confidence}</span></div><Facts data={p.laneImpact} exclude={["assessment", "confidence", "opponentPlayerSlot"]}/>{p.laneImpact.evidence.map((e, i) => <Note key={i}>{e}</Note>)}<Note>{p.laneImpact.note}</Note></> : <Empty t={t}/>}</Section></div><Ownership player={p} analysis={a} t={t}/></div>;
}
function Metric({ metric: m, player, duration, t }: {
    metric: MatchBenchmarkMetric;
    player: MatchPlayerAnalysis;
    duration: number;
    t: Messages;
}) {
    const total = benchmarkMetricTotal(m, player, duration);
    return <article className={`benchmark-cell tone-${performanceTone(m.qualityPercentile)}`} data-metric-key={m.key}><header><b>{m.key === "tower_damage" ? "Tower DMG / min" : m.shortLabel || m.label}</b><Info size={13}/></header><div className="benchmark-value"><strong>{m.formattedValue}</strong>{total && <small>{formatBenchmarkMetricTotal(total)}</small>}</div><div className="progress-track"><i style={{ width: `${Math.max(0, Math.min(100, m.qualityPercentile))}%` }}/></div><footer><b>{num(m.qualityPercentile)}%</b><small>{t.quality} · {m.scoreOnly ? "Score" : "Percentile"}</small></footer><details><summary>{t.reference}</summary><Note>{m.description}</Note><Facts data={m} exclude={["key", "label", "shortLabel", "formattedValue", "description", "tone"]}/></details></article>;
}
function Ownership({ player, analysis, t }: {
    player: MatchPlayerAnalysis;
    analysis: MatchAnalysis;
    t: Messages;
}) {
    const events = player.ownershipEvents || analysis.ownershipEvents?.filter(e => e.purchaserPlayerSlot === player.playerSlot || e.holderPlayerSlot === player.playerSlot) || [];
    return <Section title={t.ownership}>{events.length ? <><Table columns={["Item", "Purchaser", "Holder", "Purchased", "Transferred", "Transfer", "Confidence"]} rows={events.map(e => [e.item.replace(/_/g, " "), analysis.players.find(p => p.playerSlot === e.purchaserPlayerSlot)?.heroName || "—", analysis.players.find(p => p.playerSlot === e.holderPlayerSlot)?.heroName || "—", e.purchasedAtSecond == null ? "—" : durationText(e.purchasedAtSecond), e.transferAtSecond == null ? "—" : durationText(e.transferAtSecond), e.transfer, e.confidence])}/>{events.map((e, i) => <Note key={i}>{[...e.evidence, e.limitation].filter(Boolean).join(" · ")}</Note>)}</> : <Empty t={t}/>}</Section>;
}
type TimelineMetric = "gold" | "xp" | "lastHits" | "denies" | "heroDamage" | "heroHealing" | "impact";
const seriesColors = ["#d9b774", "#78d8ae", "#77b9e6", "#e892a2", "#b4a1df", "#d69f73", "#8bc8bc", "#83a5d6", "#bfa587", "#c2bd8a"];
function nearest(p: MatchPlayerAnalysis, minute: number) { return p.timeline.filter(x => x.minute <= minute).at(-1); }
function LineChart({ series, minute, duration, t }: {
    series: {
        label: string;
        values: {
            minute: number;
            value: number | null;
        }[];
        color: string;
    }[];
    minute?: number;
    duration: number;
    t: Messages;
}) {
    const values = series.flatMap(s => s.values.flatMap(p => p.value == null ? [] : [p.value]));
    if (values.length < 2)
        return <Empty t={t}/>;
    const low = Math.min(0, ...values), high = Math.max(1, ...values), span = Math.max(1, high - low), x = (m: number) => 46 + m / Math.max(1, duration) * 710, y = (v: number) => 210 - (v - low) / span * 180;
    return <><svg className="line-chart" viewBox="0 0 800 250" role="img" aria-label={series.map(s => s.label).join(", ")}>{[0, .25, .5, .75, 1].map(r => <g key={r}><line x1="46" x2="756" y1={30 + r * 180} y2={30 + r * 180}/><text x="40" y={34 + r * 180} textAnchor="end">{num(Math.round(high - r * span))}</text><text x={46 + r * 710} y="239" textAnchor="middle">{num(r * duration)}m</text></g>)}<line className="zero-line" x1="46" x2="756" y1={y(0)} y2={y(0)}/>{series.map(s => { let connected = false; const d = s.values.map(p => { if (p.value == null) {
        connected = false;
        return "";
    } const command = connected ? "L" : "M"; connected = true; return `${command}${x(p.minute)},${y(p.value)}`; }).join(" "); return <path key={s.label} d={d} style={{ stroke: s.color }}/>; })}{minute != null && <line className="chart-cursor" x1={x(minute)} x2={x(minute)} y1="25" y2="210"/>}</svg><div className="chart-legend">{series.map(s => <span key={s.label}><i style={{ background: s.color }}/>{s.label}</span>)}</div></>;
}
function Progression({ player: p, analysis: a, t }: {
    player: MatchPlayerAnalysis;
    analysis: MatchAnalysis;
    t: Messages;
}) {
    const [metric, setMetric] = useState<TimelineMetric>("gold"), [scope, setScope] = useState("solo"), [minute, setMinute] = useState(Math.min(a.durationMinutes, p.timeline.at(-1)?.minute ?? 0));
    const opponent = a.players.find(x => x.team !== p.team && x.position === p.position), players = scope === "all" ? a.players : scope === "role" && opponent ? [p, opponent] : [p];
    const point = nearest(p, minute), currentEvents = (p.events || []).filter(e => e.minute <= minute), timings = p.itemTimings || [];
    return <div className="screen-stack"><Section title={t.progression} status={p.timelineSource}><div className="chart-controls"><div className="segmented">{(["gold", "xp", "lastHits", "denies", "heroDamage", "heroHealing", "impact"] as TimelineMetric[]).map(key => <button key={key} aria-pressed={metric === key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{label(key)}</button>)}</div><div className="segmented">{[["solo", t.solo], ["role", t.samePosition], ["all", t.allPlayers]].map(([key, caption]) => <button key={key} disabled={key === "role" && !opponent} className={scope === key ? "active" : ""} aria-pressed={scope === key} onClick={() => setScope(key)}>{caption}</button>)}</div></div><LineChart duration={a.durationMinutes} minute={minute} t={t} series={players.map((x, i) => ({ label: x.heroName, color: seriesColors[i % 10], values: x.timeline.map(point => ({ minute: point.minute, value: point[metric] })) }))}/><label className="minute-slider"><span>{t.minute}: <bdi>{minute}</bdi></span><input type="range" min={0} max={a.durationMinutes} value={minute} onChange={e => setMinute(Number(e.target.value))}/></label><Facts data={point}/>{players.length > 1 && <Table columns={["Hero", label(metric), "Snapshot minute", "NW gained", "XP gained", "LH gained", "State"]} rows={players.map(x => { const s = nearest(x, minute); return [x.heroName, num(s?.[metric]), num(s?.minute), num(s?.goldDelta), num(s?.xpDelta), num(s?.lastHitDelta), s?.state || "—"]; })}/>}</Section><div className="analysis-two-columns"><Section title={t.milestones}><Table columns={["Minute", "NW", "XP", "LH", "Cohort NW", "Cohort XP", "Cohort LH", "Samples"]} rows={(p.cohort?.milestones || [5, 10, 20, 30, 40, 60].map(minute => ({ minute, gold: null, xp: null, lastHits: null, sampleSize: null }))).filter(m => m.minute <= a.durationMinutes).map(m => { const s = nearest(p, m.minute); return [num(m.minute), num(s?.gold), num(s?.xp), num(s?.lastHits), num(m.gold), num(m.xp), num(m.lastHits), num(m.sampleSize)]; })}/></Section><Section title={t.events}>{currentEvents.length ? <div className="event-list">{currentEvents.map(e => <article className={e.positive === true ? "is-positive" : e.positive === false ? "is-negative" : ""} key={e.id}><time>{durationText(e.second)}</time><span><b>{e.label}</b><small>{e.detail}</small></span><small>{e.type}</small></article>)}</div> : <Empty t={t}/>}</Section></div><Section title={t.itemTiming}>{timings.length ? <><div className="timing-summary">{["early", "on_time", "late", "unavailable"].map(status => <span key={status}><b>{timings.filter(i => i.relativeToReference === status).length}</b>{label(status)}</span>)}</div><Table columns={["Item", "Time", "Category", "Reference", "Delta (min)", "Status", "Note"]} rows={timings.map(i => [i.label, durationText(i.second), i.category, num(i.referenceMinute), num(i.deltaMinutes), i.relativeToReference, i.note])}/></> : <Empty t={t}/>}</Section><Section title={t.economyChart}><LineChart duration={a.durationMinutes} t={t} series={[{ label: "Radiant gold advantage", color: seriesColors[0], values: a.teamTimeline.map(x => ({ minute: x.minute, value: x.radiantGoldAdvantage })) }, { label: "Radiant XP advantage", color: seriesColors[1], values: a.teamTimeline.map(x => ({ minute: x.minute, value: x.radiantXpAdvantage })) }]}/></Section></div>;
}
function MapAnalysis({ player: p, duration, t }: {
    player: MatchPlayerAnalysis;
    duration: number;
    t: Messages;
}) {
    const [types, setTypes] = useState(new Set(["movement", "farm", "vision", "combat", "objective"])), [layers, setLayers] = useState(new Set<DotaMapLayer>(["towers", "camps", "roshan"])), [minute, setMinute] = useState(duration);
    const map = p.map, points = useMemo(() => (map?.points || []).filter(point => types.has(point.type) && (map?.coordinateSource !== "timed" || point.minute == null || point.minute <= minute)).slice(0, 500), [map, types, minute]);
    function toggleType(key: string) { setTypes(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; }); }
    const trail = (map?.trail || []).filter(point => point.minute != null && point.minute <= minute);
    return <div className="screen-stack"><Section title={t.mapAnalysis} status={map?.coordinateSource || t.unavailable}><div className="map-layout"><div><div className="map-type-controls segmented">{["movement", "farm", "vision", "combat", "objective"].map(key => <button key={key} aria-pressed={types.has(key)} className={types.has(key) ? "active" : ""} onClick={() => toggleType(key)}>{label(key)}</button>)}</div><div className="map-stage"><img src="/maps/dota-7.41.webp" alt="Dota 2 · 7.41"/><svg viewBox="0 0 100 100" aria-label={t.mapAnalysis}>{DOTA_741_LANDMARKS.filter(l => layers.has(l.layer)).map(l => <image key={l.id} href={DOTA_MAP_LAYER_ICONS[l.layer]} x={l.x - 1.5} y={l.y - 1.5} width={3} height={3}><title>{l.label}</title></image>)}{map?.coordinateSource === "timed" && types.has("movement") && trail.length > 1 && <polyline className="map-trail" points={trail.map(p => `${p.x},${p.y}`).join(" ")}/>} {points.map((point, i) => <circle className={`map-point ${point.type}`} key={i} cx={point.x} cy={point.y} r={Math.min(3, .5 + Math.sqrt(Math.max(0, point.weight)) * .15)}><title>{point.label || label(point.type)}{point.minute != null ? ` · ${point.minute}m` : ""}</title></circle>)}</svg>{!points.length && <span className="map-no-coordinates">{t.unavailable}</span>}</div>{map?.coordinateSource === "timed" && <label className="minute-slider">{t.minute}: {minute}<input type="range" min={0} max={duration} value={minute} onChange={e => setMinute(Number(e.target.value))}/></label>}<div className="map-layer-controls">{(Object.keys(DOTA_MAP_LAYER_LABELS) as DotaMapLayer[]).map(key => <button key={key} className={layers.has(key) ? "active" : ""} aria-pressed={layers.has(key)} onClick={() => setLayers(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })}><img src={DOTA_MAP_LAYER_ICONS[key]} alt=""/>{DOTA_MAP_LAYER_LABELS[key].en}</button>)}</div></div><div className="screen-stack"><h3>{t.movementDetails}</h3><Facts data={map?.movement}/><Note>{map?.movement.note}</Note><h3>{t.farmDetails}</h3><Facts data={map?.farm}/><div className="source-mix">{Object.entries(map?.farm.sourceMix || {}).map(([k, v]) => <span key={k}><small>{label(k)}</small><b>{v == null ? "—" : `${num(v)}%`}</b></span>)}</div><Note>{map?.farm.note}</Note></div></div></Section><Section title={t.farmDetails} status={map?.farm.availability}><Table columns={["Window", "LH gained", "End NW", "End XP", "Farm gain", "Deaths", "State", "Note"]} rows={(map?.farm.windows || []).map(w => [`${w.from}–${w.to}m`, num(w.lastHits), num(w.netWorth), num(w.xp), num(w.farmGain), num(w.deaths), w.state, w.note])}/></Section><div className="analysis-two-columns"><Section title={t.visionDetails} status={map?.utility.availability}><Facts data={map?.utility}/><Note>{map?.utility.invisThreats.length ? `Invisible threats: ${map.utility.invisThreats.join(", ")}` : undefined}</Note><Note>{map?.utility.naturalReveal.length ? `Natural reveal: ${map.utility.naturalReveal.join(", ")}` : undefined}</Note><Note>{map?.utility.note}</Note></Section><Section title={t.objectiveDetails} status={map?.objectives.availability}><Facts data={map?.objectives}/><Table columns={["Objective", "Minute", "Present", "Fight converted", "Delay"]} rows={(map?.objectives.events || []).map(e => [e.label, num(e.minute), num(e.playerPresent), num(e.convertedFromFight), e.delayAfterFightSeconds == null ? "—" : durationText(e.delayAfterFightSeconds)])}/><Note>{map?.objectives.note}</Note></Section></div></div>;
}
