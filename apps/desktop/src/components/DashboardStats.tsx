import { Activity, Sparkles, Swords, Trophy } from "lucide-react";
import { heroById } from "@/data/heroes";
import type { Summary } from "../history";
import { distributionPercent, distributionPositionLabel } from "../distributionGeometry";
import { isPersian, type Messages } from "../i18n";

export function Stats({ summary, t, hero = "all", position = "all", filtered = false }: { summary: Summary; t: Messages; hero?: string; position?: string; filtered?: boolean }) {
    const number = (value: number, decimals = 0) => new Intl.NumberFormat(isPersian(t) ? "fa-IR" : "en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
    const scoped = filtered || hero !== "all" || position !== "all";
    const caption = [hero !== "all" ? heroById(Number(hero))?.name : "", position !== "all" ? distributionPositionLabel(Number(position), t) : ""].filter(Boolean).join(" · ") || (scoped ? t.filteredMatches : t.selectedPeriod);
    return <div className="stat-grid dashboard-stat-grid" aria-label={t.periodStatistics}>
        <section className="panel dashboard-stat stat-total"><div className="stat-heading"><span className="stat-symbol"><Swords size={18}/></span><span>{t.totalMatches}</span></div><div className="stat-value"><strong>{number(summary.total)}</strong><span className="stat-mini-bars" aria-hidden="true">{[24,40,28,52,36,60,44].map((height,index) => <i key={index} style={{ height: `${height}%` }}/>)}</span></div><small>{number(summary.heroes.length)} {t.distinctHeroes}</small></section>
        <section className="panel dashboard-stat stat-rate"><div className="stat-heading"><span className="stat-symbol"><Trophy size={18}/></span><span>{t.winRate}</span></div><div className="stat-value"><strong>{distributionPercent(summary.winRate,t,1)}</strong><svg className="stat-win-ring" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="17"/><circle cx="21" cy="21" r="17" pathLength="100" strokeDasharray={`${summary.winRate} 100`} transform="rotate(-90 21 21)"/></svg></div><small>{t.winsFromMatches.replace("{wins}",number(summary.wins)).replace("{total}",number(summary.total))}</small></section>
        <section className="panel dashboard-stat stat-results"><div className="stat-heading"><span className="stat-symbol"><Activity size={18}/></span><span>{t.matchRecord}</span></div><div className="stat-value stat-wl"><div><strong className="good">{number(summary.wins)}</strong><small>{t.wins}</small></div><span aria-hidden="true">/</span><div><strong className="bad">{number(summary.losses)}</strong><small>{t.losses}</small></div></div><div className="stat-results-bar" aria-hidden="true"><i style={{ width: `${summary.winRate}%` }}/></div></section>
        <section className="panel dashboard-stat stat-impact"><div className="stat-heading"><span className="stat-symbol"><Sparkles size={18}/></span><span>{scoped ? t.filteredAverageImpact : t.periodAverageImpact}</span></div><div className="stat-value"><strong>{summary.score === null ? "—" : number(summary.score,1)}</strong><span className="stat-impact-unit">IMP <small>/ 100</small></span></div><small title={t.scoredMatchesOnly}>{caption}</small></section>
    </div>;
}
