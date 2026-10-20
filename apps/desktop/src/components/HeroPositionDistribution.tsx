import { useEffect, useId, useState, type CSSProperties } from "react";
import { CircleHelp, Undo2 } from "lucide-react";
import { heroById, heroIcon } from "@/data/heroes";
import { positionImage } from "@/data/positions";
import type { Period, Summary } from "../history";
import { distributionPercent, distributionPositionLabel, ringArc, ringIconLayouts } from "../distributionGeometry";
import { distributionPalette } from "../distributionPalettes";
import type { Messages } from "../i18n";

type Segment = Summary["heroes"][number];
type Hover = Segment & { key: string; label: string; image: string };
export function HeroPositionDistribution({ summary, t, period, hero = "all", position = "all", onFilter, onReset }: {
    summary: Summary | null; t: Messages; period: Period; hero?: string; position?: string;
    onFilter: (hero: string, position: string) => void; onReset: () => void;
}) {
    const prefix = useId().replace(/[^a-zA-Z0-9_-]/g,""), [hover, setHover] = useState<Hover | null>(null);
    useEffect(() => setHover(null), [summary, hero, position]);
    const selected = hero !== "all" || position !== "all";
    const imageFor = (id: number, isHero: boolean) => isHero ? (heroById(id) ? heroIcon(heroById(id)!) : "") : id ? positionImage(id) : "";
    const labelFor = (id: number, isHero: boolean) => isHero ? heroById(id)?.name || "—" : distributionPositionLabel(id,t);
    const select = (id: number, isHero: boolean) => onFilter(isHero ? hero === String(id) ? "all" : String(id) : hero, isHero ? position : position === String(id) ? "all" : String(id));
    const icon = (image: string) => image ? <img src={image} alt=""/> : <CircleHelp size={20} aria-hidden="true"/>;
    const prepare = (data: Segment[], inner: number, outer: number, isHero: boolean) => {
        const segments = data.filter(segment=>segment.count>0);
        const layouts = ringIconLayouts(segments.map(segment=>segment.count),summary?.total || 0,inner,outer);
        return segments.map((segment,index)=>{
            const layout=layouts[index], key=`${isHero ? "hero" : "pos"}-${segment.id}`;
            return {...segment,...layout,key,isHero,label:labelFor(segment.id,isHero),image:imageFor(segment.id,isHero),path:ringArc(layout.from,layout.to,inner,outer),palette:distributionPalette(segment.id,isHero),pressed:isHero ? hero===String(segment.id) : position===String(segment.id)};
        });
    };
    const segments = summary?.total ? [...prepare(summary.positions,59,100,false),...prepare(summary.heroes,104,150,true)] : [];
    const enter = (segment: typeof segments[number]) => setHover(segment);
    const chosenImage = hover?.image ?? (hero !== "all" ? imageFor(Number(hero),true) : position !== "all" ? imageFor(Number(position),false) : "");
    const chosenLabel = hover?.label || (hero !== "all" ? labelFor(Number(hero),true) : position !== "all" ? labelFor(Number(position),false) : period === "week" ? t.weekly : t.monthly);
    return <section className="panel distribution sticky-distribution shared-distribution" aria-label={t.trend}><div className="section-heading"><div><p className="eyebrow">PLAYSTYLE</p><h2>{t.trend}</h2></div></div>
        {summary?.total ? <><div className="ring-wrapper"><svg viewBox="0 0 320 320" aria-label={t.trend}>
            <defs><linearGradient id={`${prefix}-sheen`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".13"/><stop offset=".4" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".18"/></linearGradient>{segments.map(segment=><radialGradient key={segment.key} id={`${prefix}-${segment.key}`} cx=".25" cy=".18" r="1"><stop stopColor={segment.palette[1]} stopOpacity=".7"/><stop offset=".5" stopColor={segment.palette[0]} stopOpacity=".52"/><stop offset="1" stopColor={segment.palette[2]} stopOpacity=".27"/></radialGradient>)}</defs>
            {segments.map(segment=><g key={segment.key} className={`ring-item ${hover?.key===segment.key ? "is-hovered" : ""}`} role="button" tabIndex={0} aria-pressed={segment.pressed} aria-label={`${segment.label}: ${segment.count} ${t.matches}, ${distributionPercent(segment.count/summary.total*100,t,1)}, ${segment.wins} W, ${segment.losses} L`} style={{"--segment-color":segment.palette[1]} as CSSProperties} onMouseEnter={()=>enter(segment)} onMouseLeave={()=>setHover(null)} onFocus={()=>enter(segment)} onBlur={()=>setHover(null)} onClick={()=>select(segment.id,segment.isHero)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select(segment.id,segment.isHero);}}}><path className={`ring-segment ${segment.isHero ? "hero-segment" : "position-segment"}`} d={segment.path} style={{fill:`url(#${prefix}-${segment.key})`}}/><path className="ring-sheen" d={segment.path} fill={`url(#${prefix}-sheen)`} pointerEvents="none"/></g>)}
            {segments.map(segment=><g key={segment.key} className={`segment-icon ${hover?.key===segment.key ? "is-hovered" : ""}`} aria-hidden="true" style={{transformOrigin:`${segment.x}px ${segment.y}px`}} onMouseEnter={()=>enter(segment)} onMouseLeave={()=>setHover(null)} onClick={()=>select(segment.id,segment.isHero)}>{segment.image ? <image href={segment.image} x={segment.x-segment.size/2} y={segment.y-segment.size/2} width={segment.size} height={segment.size} preserveAspectRatio="xMidYMid meet"/> : <text x={segment.x} y={segment.y+segment.size*.31} textAnchor="middle" fontSize={segment.size*.85} fill="currentColor">?</text>}</g>)}
        </svg><div className="ring-center">{selected && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}{(hover || selected) && icon(chosenImage)}<strong>{hover ? distributionPercent(hover.count/summary.total*100,t,1) : selected ? distributionPercent(100,t,1) : summary.total}</strong><small>{hover ? hover.count : summary.total} {t.matches}</small></div></div>
        <div className="ring-tooltip" aria-live="polite"><strong>{chosenLabel}</strong><span><b className="good">{hover?.wins ?? summary.wins} W</b><b className="bad">{hover?.losses ?? summary.losses} L</b><small>{distributionPercent(hover ? hover.wins/hover.count*100 : summary.winRate,t,1)} {t.winRate}</small></span></div>
        <div className="role-legend" role="group" aria-label={t.filterByPosition}>{summary.positions.filter(segment=>segment.count>0).map(segment=><button key={segment.id} aria-label={`${t.filterByPosition}: ${labelFor(segment.id,false)}`} aria-pressed={position===String(segment.id)} title={labelFor(segment.id,false)} onClick={()=>select(segment.id,false)}>{icon(imageFor(segment.id,false))}<bdi>{distributionPercent(segment.count/summary.total*100,t)}</bdi></button>)}</div></> : <>{selected && <button className="chart-reset" aria-label={t.resetFilters} onClick={onReset}><Undo2 size={19}/></button>}<p className="empty-message" role="status">{summary ? t.noData : t.checking}</p></>}
    </section>;
}
