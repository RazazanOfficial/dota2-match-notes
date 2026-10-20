import { useEffect, useId, useState, type CSSProperties } from "react";
import { CircleHelp, Undo2 } from "lucide-react";
import { heroById, heroIcon } from "@/data/heroes";
import { positionImage } from "@/data/positions";
import type { Period, Summary } from "../history";
import { distributionPercent, distributionPositionLabel, ringArc, segmentIconLayout } from "../distributionGeometry";
import type { Messages } from "../i18n";

const heroColors = ["#e68b72", "#d6b16a", "#65c7ab", "#7ea5e5", "#b58cdb", "#d68db8", "#72bccb", "#aabf67"];
const positionColors = ["#8490a4", "#c98a52", "#426c99", "#528664", "#8261a5", "#b08c4d"];
type Segment = Summary["heroes"][number];
type Hover = Segment & { key: string; label: string; image: string };
export function HeroPositionDistribution({ summary, t, period, hero = "all", position = "all", onFilter, onReset }: {
    summary: Summary | null; t: Messages; period: Period; hero?: string; position?: string;
    onFilter: (hero: string, position: string) => void; onReset: () => void;
}) {
    const prefix = useId().replace(/:/g,""), [hover, setHover] = useState<Hover | null>(null);
    useEffect(() => setHover(null), [summary, hero, position]);
    const selected = hero !== "all" || position !== "all";
    const imageFor = (id: number, isHero: boolean) => isHero ? (heroById(id) ? heroIcon(heroById(id)!) : "") : id ? positionImage(id) : "";
    const labelFor = (id: number, isHero: boolean) => isHero ? heroById(id)?.name || "—" : distributionPositionLabel(id,t);
    const select = (id: number, isHero: boolean) => onFilter(isHero ? hero === String(id) ? "all" : String(id) : hero, isHero ? position : position === String(id) ? "all" : String(id));
    const icon = (image: string, label = "") => image ? <img src={image} alt={label}/> : <CircleHelp size={20} aria-hidden="true"/>;
    const segments = (data: Segment[], inner: number, outer: number, isHero: boolean) => {
        let offset = 0;
        return data.filter(segment => segment.count > 0).map(segment => {
            const from = offset; offset += segment.count / summary!.total * Math.PI * 2;
            const path = ringArc(from,offset,inner,outer), layout = segmentIconLayout(from,offset,inner,outer);
            const image = imageFor(segment.id,isHero), label = labelFor(segment.id,isHero), key = `${isHero ? "hero" : "pos"}-${segment.id}`;
            const clip = `${prefix}-${key}`, badge = `${clip}-badge`;
            const enter = () => setHover({...segment,key,label,image});
            return <g key={key} className="ring-item" role="button" tabIndex={0} aria-pressed={isHero ? hero === String(segment.id) : position === String(segment.id)} aria-label={`${label}: ${segment.count} ${t.matches}, ${distributionPercent(segment.count / summary!.total * 100,t,1)}, ${segment.wins} W, ${segment.losses} L`} style={{"--segment-color": isHero ? heroColors[segment.id % heroColors.length] : positionColors[segment.id] || positionColors[0]} as CSSProperties} onMouseEnter={enter} onMouseLeave={() => setHover(null)} onFocus={enter} onBlur={() => setHover(null)} onClick={() => select(segment.id,isHero)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(segment.id,isHero); } }}>
                <defs><clipPath id={clip}><path d={path}/></clipPath><clipPath id={badge}><circle cx={layout.x} cy={layout.y} r={layout.size/2}/></clipPath></defs><path className={`ring-segment ${isHero ? "hero-segment" : "position-segment"}`} d={path}/>
                <g clipPath={`url(#${clip})`} pointerEvents="none"><circle className="segment-icon-backplate" cx={layout.x} cy={layout.y} r={layout.size/2}/><g clipPath={`url(#${badge})`}><g className="segment-icon" style={{transformOrigin:`${layout.x}px ${layout.y}px`}}>{image ? <image href={image} x={layout.x-layout.size/2} y={layout.y-layout.size/2} width={layout.size} height={layout.size} preserveAspectRatio="xMidYMid meet"/> : <text x={layout.x} y={layout.y+layout.size*.31} textAnchor="middle" fontSize={layout.size*.85} fill="#fff">?</text>}</g></g></g>
            </g>;
        });
    };
    // Tiny slices retain their true share and clipped icon, with a second readable target below.
    let angle = 0;
    const smallHeroes = summary?.heroes.filter(segment => { const from = angle; angle += summary.total ? segment.count/summary.total*Math.PI*2 : 0; return segment.count > 0 && segmentIconLayout(from,angle,104,150).size < 18; }) || [];
    const chosenImage = hover?.image ?? (hero !== "all" ? imageFor(Number(hero),true) : position !== "all" ? imageFor(Number(position),false) : "");
    const chosenLabel = hover?.label || (hero !== "all" ? labelFor(Number(hero),true) : position !== "all" ? labelFor(Number(position),false) : period === "week" ? t.weekly : t.monthly);
    return <section className="panel distribution sticky-distribution shared-distribution" aria-label={t.trend}><div className="section-heading"><div><p className="eyebrow">PLAYSTYLE</p><h2>{t.trend}</h2></div></div>
        {summary?.total ? <><div className="ring-wrapper"><svg viewBox="0 0 320 320" aria-label={t.trend}>{segments(summary.positions,59,100,false)}{segments(summary.heroes,104,150,true)}</svg><div className="ring-center">{selected && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}{(hover || selected) && icon(chosenImage)}<strong>{hover ? distributionPercent(hover.count/summary.total*100,t,1) : selected ? distributionPercent(100,t,1) : summary.total}</strong><small>{hover ? hover.count : summary.total} {t.matches}</small></div></div>
        <div className="ring-tooltip" aria-live="polite"><strong>{chosenLabel}</strong><span><b className="good">{hover?.wins ?? summary.wins} W</b><b className="bad">{hover?.losses ?? summary.losses} L</b><small>{distributionPercent(hover ? hover.wins/hover.count*100 : summary.winRate,t,1)} {t.winRate}</small></span></div>
        <div className="role-legend" role="group" aria-label={t.filterByPosition}>{summary.positions.filter(segment => segment.count > 0).map(segment => <button key={segment.id} aria-label={`${t.filterByPosition}: ${labelFor(segment.id,false)}`} aria-pressed={position === String(segment.id)} title={labelFor(segment.id,false)} onClick={() => select(segment.id,false)}>{icon(imageFor(segment.id,false))}<bdi>{distributionPercent(segment.count/summary.total*100,t)}</bdi></button>)}</div>
        {!!smallHeroes.length && <div className="small-hero-shares" role="group" aria-label={t.smallHeroShares}>{smallHeroes.map(segment => <button key={segment.id} title={`${labelFor(segment.id,true)} · ${segment.count} ${t.matches}`} aria-label={`${t.filterByHero}: ${labelFor(segment.id,true)}`} aria-pressed={hero === String(segment.id)} onClick={() => select(segment.id,true)}>{icon(imageFor(segment.id,true))}<bdi>{distributionPercent(segment.count/summary.total*100,t)}</bdi></button>)}</div>}</> : <>{selected && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}<p className="empty-message" role="status">{summary ? t.noData : t.checking}</p></>}
    </section>;
}
