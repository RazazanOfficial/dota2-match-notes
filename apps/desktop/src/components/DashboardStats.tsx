import { useMemo } from "react";
import { Activity, Sparkles, Swords, Trophy } from "lucide-react";
import { heroById } from "@/data/heroes";
import type { Summary } from "../history";
import { distributionPercent, distributionPositionLabel } from "../distributionGeometry";
import { isPersian, type Messages } from "../i18n";

export function Stats({ summary, t, hero = "all", position = "all", filtered = false }: { summary: Summary; t: Messages; hero?: string; position?: string; filtered?: boolean }) {
    const formats = useMemo(()=>[0,1].map(decimals=>new Intl.NumberFormat(isPersian(t)?"fa-IR":"en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals})),[t]);
    const number = (value:number,decimals=0) => formats[decimals].format(value);
    const scoped = filtered || hero !== "all" || position !== "all";
    const caption = [hero !== "all" ? heroById(Number(hero))?.name : "", position !== "all" ? distributionPositionLabel(Number(position), t) : ""].filter(Boolean).join(" · ") || (scoped ? t.filteredMatches : t.selectedPeriod);
    return <div className="stat-grid dashboard-stat-grid" aria-label={t.periodStatistics}>
        <section className="panel dashboard-stat stat-total"><div className="stat-heading"><span className="stat-symbol"><Swords size={18}/></span><span>{t.totalMatches}</span></div><div className="stat-value"><strong>{number(summary.total)}</strong><span className="stat-mini-bars" aria-hidden="true">{[24,40,28,52,36,60,44].map((height,index) => <i key={index} style={{ height: `${height}%` }}/>)}</span></div><small>{number(summary.heroes.length)} {t.distinctHeroes}</small></section>
        <section className="panel dashboard-stat stat-rate"><div className="stat-heading"><span className="stat-symbol"><Trophy size={18}/></span><span>{t.winRate}</span></div><div className="stat-value"><strong>{distributionPercent(summary.winRate,t,1)}</strong><span className="winrate-emblem" aria-hidden="true"><Trophy size={27}/></span></div><div className="winrate-meter" aria-hidden="true">{Array.from({length:20},(_,index)=><span key={index}><i style={{width:`${Math.max(0,Math.min(100,summary.winRate*20-index*100))}%`}}/></span>)}</div><small>{t.winsFromMatches.replace("{wins}",number(summary.wins)).replace("{total}",number(summary.total))}</small></section>
        <section className="panel dashboard-stat stat-results"><div className="stat-heading"><span className="stat-symbol"><Activity size={18}/></span><span>{t.matchRecord}</span></div><div className="stat-value stat-wl"><div><strong className="good">{number(summary.wins)}</strong><small>{t.wins}</small></div><span aria-hidden="true">/</span><div><strong className="bad">{number(summary.losses)}</strong><small>{t.losses}</small></div></div><div className="stat-results-bar" aria-hidden="true"><i style={{ width: `${summary.winRate}%` }}/></div></section>
        <section className="panel dashboard-stat stat-impact"><div className="stat-heading"><span className="stat-symbol"><Sparkles size={18}/></span><span>{scoped ? t.filteredAverageImpact : t.periodAverageImpact}</span></div><div className="stat-value"><strong>{summary.score === null ? "—" : number(summary.score,1)}</strong><span className="stat-impact-unit">{t.pointsOutOf100}</span></div><small className="impact-scope">{caption}</small><small className="impact-note">{t.scoredMatchesOnly}</small></section>
    </div>;
}
