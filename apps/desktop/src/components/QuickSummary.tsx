import type { CSSProperties } from "react";
import { ArrowUpRight, Clock, CircleHelp, Info } from "lucide-react";
import { heroById, heroImage, heroIcon } from "@/data/heroes";
import MatchInventory from "@/components/MatchInventory";
import type { Match, MatchParticipant, MatchPlayerAnalysis, MatchSummaryMetricKey } from "@/lib/types";
import { durationText, type HistoryMatch } from "../history";
import type { Messages } from "../i18n";
import { Hint } from "./Hint";
import { ModeIcon, Position, Score } from "./Workspace";

export function VictoryBanner({ match, row, t }: { match: Match; row: HistoryMatch; t: Messages }) {
    return <section className="panel match-banner" dir="ltr" aria-label={t.matchResult}>
        <div className={`team-result radiant ${match.radiantWin === true ? "is-victorious" : ""}`}>
            <img src="/match-details/radiant.webp" alt=""/>
            <div><h1>{t.radiant}</h1>{match.radiantWin === true && <small>{t.victory}</small>}</div>
        </div>
        <div className="final-score"><strong>{match.radiantScore ?? "—"}</strong><span><Clock size={14}/><bdi>{durationText(match.durationSeconds ?? row.duration)}</bdi><small><ModeIcon mode={row.mode} t={t}/></small></span><strong>{match.direScore ?? "—"}</strong></div>
        <div className={`team-result dire ${match.radiantWin === false ? "is-victorious" : ""}`}>
            <div><h1>{t.dire}</h1>{match.radiantWin === false && <small>{t.victory}</small>}</div>
            <img src="/match-details/dire.webp" alt=""/>
        </div>
    </section>;
}

export function QuickSummary({ match, selected, onSelect, onAnalyze, t }: {
    match: Match; selected: number; onSelect: (slot: number) => void; onAnalyze: () => void; t: Messages;
}) {
    const inspected = match.participants?.find(player => player.playerSlot === selected);
    const player = match.analysis?.players.find(player => player.playerSlot === selected);
    return <section className="panel matchup-panel"><div className="section-heading"><h2>{t.matchup}</h2></div>
        <div className="team-rosters" dir="ltr">{(["radiant", "dire"] as const).map(team => <section className={`team-roster ${team}`} key={team} aria-label={team === "radiant" ? t.radiant : t.dire}>
            <header><img src={`/match-details/${team}.webp`} alt={team === "radiant" ? t.radiant : t.dire}/></header>
            <div className="hero-roster">{match.participants?.filter(participant => participant.team === team).map(participant => {
                const hero = heroById(participant.heroId), analysis = match.analysis?.players.find(player => player.playerSlot === participant.playerSlot);
                return <button className={`hero-card ${participant.playerSlot === selected ? "selected" : ""}`} key={participant.playerSlot} aria-pressed={participant.playerSlot === selected} aria-label={`${t.selected}: ${participant.heroName}`} onClick={() => onSelect(participant.playerSlot)}>
                    <img src={hero ? heroImage(hero) : ""} alt={participant.heroName}/>
                    <div><Position value={analysis ? analysis.position : participant.position} title={false} t={t} analyzed={!!match.analysis}/><bdi>{participant.kills ?? "—"} / {participant.deaths ?? "—"} / {participant.assists ?? "—"}</bdi></div>
                    <Score value={analysis?.performanceScore} t={t}/>
                </button>;
            })}</div>
        </section>)}</div>
        {inspected && <SelectedHero participant={inspected} player={player} t={t} onAnalyze={onAnalyze}/>}
    </section>;
}

function SelectedHero({ participant: p, player, t, onAnalyze }: { participant: MatchParticipant; player?: MatchPlayerAnalysis; t: Messages; onAnalyze: () => void }) {
    const hero = heroById(p.heroId);
    const reference = player?.summaryComparison?.heroId === p.heroId && player.summaryComparison.position === player.position
        ? player.summaryComparison : undefined;
    const referenceText = reference ? `${t.summaryReference} · ${reference.referenceMonth.slice(0, 7)} · ${t.summaryMinute} ${reference.minute} · ${reference.sampleCount.toLocaleString("en-US")} ${t.sampleSize}` : t.summaryNoReference;
    const stats: Array<{ label: string; keys: MatchSummaryMetricKey[] }> = [
        { label: t.netWorth, keys: ["netWorth"] }, { label: "GPM", keys: ["goldPerMinute"] },
        { label: "XPM", keys: ["xpPerMinute"] }, { label: "LH / DN", keys: ["lastHits", "denies"] },
        { label: "Hero DMG", keys: ["heroDamage"] }, { label: "Tower DMG", keys: ["towerDamage"] },
        { label: t.summaryHeal, keys: ["heroHealing"] }, { label: t.summaryLevel, keys: ["level"] },
    ];
    return <section className={`selected-hero ${p.team}`} aria-label={p.heroName}>
        <div className="selected-hero-info"><img className="selected-hero-portrait" src={hero ? heroImage(hero) : ""} alt=""/>
            <div className="selected-hero-identity"><h2>{p.heroName}</h2><p><bdi>{p.personName}</bdi><Position value={player ? player.position : p.position} t={t} analyzed={!!player}/></p></div>
            <div className="selected-hero-kda"><small>K / D / A</small><strong>{p.kills ?? "—"} / {p.deaths ?? "—"} / {p.assists ?? "—"}</strong></div>
            <div className="selected-hero-imp"><small>IMP</small><Score value={player?.performanceScore} t={t}/></div>
            <button className="secondary-button" onClick={onAnalyze}>{t.fullAnalysis}<ArrowUpRight size={16}/></button>
        </div>
        <div className="selected-hero-body"><div className="hero-telemetry">
            {stats.map(stat => {
                const values = stat.keys.map(key => ({ key, actual: p[key], average: reference?.averages[key] ?? null }));
                const primary = values[0];
                const difference = primary.actual !== null && primary.average !== null ? primary.actual - primary.average : null;
                const marker = difference !== null && primary.average !== null ? Math.max(10, Math.min(90, 50 + difference / Math.max(1, primary.average) * 40)) : 50;
                const unavailable = stat.keys.some(key => key === "goldPerMinute" || key === "level");
                const explanation = !player ? t.analyzeForScore : unavailable ? t.summaryMetricUnavailable : referenceText;
                return <div className="summary-stat" key={stat.label} data-summary-stat={stat.keys[0]}>
                    <div className="summary-stat-label"><span>{stat.label}</span><Hint label={`${stat.label}: ${t.reference}`} text={explanation}><Info size={12}/></Hint></div>
                    <div className={`summary-stat-values ${values.length > 1 ? "is-pair" : ""}`} dir="ltr">{values.map(({ key, actual, average }, index) => <span key={key}>
                        {index > 0 && <i className="stat-separator">/</i>}<bdi>{formatStat(actual)}</bdi>
                        <span className={`summary-stat-delta ${actual !== null && average !== null ? actual > average ? "above" : actual < average ? "below" : "equal" : "unknown"}`}>
                            ({actual !== null && average !== null ? formatDelta(actual - average) : "?"})
                        </span>
                    </span>)}</div>
                    <div className="summary-average-track" aria-hidden="true" style={{ "--marker-position": `${marker}%` } as CSSProperties}>
                        <i className="average-center"/><span className="average-hero">{hero ? <img src={heroIcon(hero)} alt=""/> : <CircleHelp size={14}/>}</span>
                    </div>
                    <div className="summary-stat-average"><span>{t.summaryAverage}</span><bdi dir="ltr">{values.map(value => formatStat(value.average)).join(" / ")}</bdi></div>
                </div>;
            })}
        </div><div className="selected-inventory"><MatchInventory participant={p}/></div></div>
        {reference && <div className="summary-reference-note"><Info size={12}/><span>{referenceText}</span></div>}
    </section>;
}

function formatStat(value: number | null) { return value === null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("en-US"); }
function formatDelta(value: number) { const rounded = Math.round(value); return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`; }
