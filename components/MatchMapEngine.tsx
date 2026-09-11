"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Castle, Eye, Info, Layers3, MapPinned, ShieldCheck, Wheat } from "lucide-react";
import { heroById, heroIcon } from "@/data/heroes";
import { DOTA_741_LANDMARKS, DOTA_MAP_LAYER_ICONS, DOTA_MAP_LAYER_LABELS, type DotaMapLayer } from "@/lib/dota/map-landmarks";
import type { MatchMapPoint, MatchPlayerAnalysis } from "@/lib/types";

type MapView = "farm" | "objectives" | "utility";
const VIEWS: Array<{ key: MapView; en: string; fa: string; icon: ReactNode }> = [
  { key: "farm", en: "Farm & Presence", fa: "فارم و پوشش کل مچ", icon: <Wheat /> },
  { key: "objectives", en: "Objectives", fa: "اهداف ثبت‌شده", icon: <Castle /> },
  { key: "utility", en: "Vision & Utility", fa: "دید و ابزار تیمی", icon: <Eye /> },
];

export default function MatchMapEngine({ player }: { player: MatchPlayerAnalysis; players: MatchPlayerAnalysis[]; duration: number }) {
  const [view, setView] = useState<MapView>("farm");
  const [layers, setLayers] = useState(new Set<DotaMapLayer>(["towers", "camps", "roshan"]));
  const map = player.map;
  const hero = heroById(player.heroId);
  const points = useMemo(() => {
    if (!map) return [];
    return map.points.filter((point) => view === "utility" ? point.type === "vision" : point.type === "movement");
  }, [map, view]);
  const toggle = (layer: DotaMapLayer) => setLayers((current) => {
    const next = new Set(current);
    next.has(layer) ? next.delete(layer) : next.add(layer);
    return next;
  });

  return (
    <section className={`map-analysis-workbench is-${view}`}>
      <header className="map-analysis-heading">
        <div><span><MapPinned /></span>{hero&&<img className="map-analysis-hero-icon" src={heroIcon(hero)} alt=""/>}<div><p>MATCH MAP · 7.41</p><h4>تحلیل مکانی <b lang="en">{player.heroName}</b></h4><small>Farm، Objective و ابزارهای تیمی در یک نمای متمرکز</small></div></div>
        <DataBadge source={map?.coordinateSource} />
      </header>
      <nav className="map-analysis-tabs">
        {VIEWS.map((item) => <button key={item.key} className={view === item.key ? "is-active" : ""} type="button" onClick={() => setView(item.key)}>{item.icon}<span lang="en">{item.en}</span><small>{item.fa}</small></button>)}
      </nav>
      {view === "objectives" ? <ObjectiveView player={player} /> : (
        <div className="map-analysis-layout">
          <div className="dota-map-column">
            <div className="map-layer-toolbar"><span><Layers3 />لایه‌های مپ</span><div>{(Object.keys(DOTA_MAP_LAYER_LABELS) as DotaMapLayer[]).map((layer) => <button key={layer} type="button" className={layers.has(layer) ? "is-active" : ""} onClick={() => toggle(layer)}><img src={DOTA_MAP_LAYER_ICONS[layer]} alt=""/>{DOTA_MAP_LAYER_LABELS[layer].en}</button>)}</div></div>
            {points.length ? <MapStage points={points} layers={layers} view={view} /> : <MapUnavailable view={view} />}
          </div>
          {view === "farm" ? <FarmFacts player={player} /> : <UtilityFacts player={player} />}
        </div>
      )}
    </section>
  );
}

function DataBadge({ source }: { source?: "timed" | "aggregate" | "unavailable" }) {
  return <span className={`map-data-status is-${source === "unavailable" || !source ? "unavailable" : "partial"}`}><Info /><b>{source === "aggregate" ? "پوشش کل Match" : source === "timed" ? "ردیابی زمان‌دار" : "مختصات موجود نیست"}</b><small>{source === "aggregate" ? "نمای تجمعی" : source === "timed" ? "Timeline آماده" : "فقط آمار قطعی نمایش داده می‌شود"}</small></span>;
}

function MapStage({ points, layers, view }: { points: MatchMapPoint[]; layers: Set<DotaMapLayer>; view: MapView }) {
  const max = Math.max(1, ...points.map((point) => point.weight));
  return <div className={`dota-map-stage is-${view}`}>
    <img src="/maps/dota-7.41.webp" alt="نقشه Dota 2 نسخه 7.41" />
    <div className="dota-map-vignette" />
    {DOTA_741_LANDMARKS.filter((item) => layers.has(item.layer)).map((item) => <span key={item.id} className={`map-landmark is-${item.layer} is-${item.side || "neutral"} is-${item.size || "default"}`} style={{ left:`${item.x}%`, top:`${item.y}%` }} title={item.label}><img src={DOTA_MAP_LAYER_ICONS[item.layer]} alt=""/></span>)}
    <div className="map-heat-layer">{points.slice(0, 500).map((point, index) => { const ratio = point.weight / max; const level = ratio > .72 ? 4 : ratio > .42 ? 3 : ratio > .18 ? 2 : 1; return <span key={`${point.x}-${point.y}-${index}`} className={`map-heat-point is-${point.type} level-${level}`} style={{ left:`${point.x}%`, top:`${point.y}%`, "--heat-scale": .72 + ratio * 1.7 } as CSSProperties} title={point.label} />; })}</div>
    <div className="map-series-key"><span><i />{view === "utility" ? "Ward / Sentry ثبت‌شده" : "پوشش تجمعی کل Match"}</span></div>
  </div>;
}

function MapUnavailable({ view }: { view: MapView }) {
  return <div className="map-compact-empty"><AlertTriangle /><div><strong>مختصات قابل اتکا موجود نیست</strong><p>{view === "utility" ? "آمار خرید و تعداد Ward در کنار نقشه باقی می‌ماند؛ نقطه‌ای روی نقشه ساخته نمی‌شود." : "برای Match بدون lane_pos، Heatmap حدسی نمایش داده نمی‌شود."}</p></div></div>;
}

function FarmFacts({ player }: { player: MatchPlayerAnalysis }) {
  const data = player.map?.farm;
  return <aside className="map-insight-panel is-wide">
    <Title icon={<Wheat />} en="Farm Checkpoints" fa="روند فارم در هر بازه؛ اعداد تجمعی و بازه‌ای از هم جدا شده‌اند" />
    <div className="farm-source-mix"><Mix label="Lane" value={data?.sourceMix.lane} /><Mix label="Neutral" value={data?.sourceMix.neutral} /><Mix label="Ancient" value={data?.sourceMix.ancient} /></div>
    <p className="farm-window-help"><Info/> <b>LH</b> فقط Last Hit همان بازه است؛ <b>NW</b> و <b>XP</b> مقدار تجمعی در پایان بازه هستند.</p>
    <div className="farm-window-table-wrap"><table className="farm-window-table" dir="ltr"><thead><tr><th>Period</th><th>LH gained</th><th>End NW</th><th>End XP</th><th>Deaths</th><th>Read</th></tr></thead><tbody>{data?.windows.map((window) => <tr className={`is-${window.state}`} key={`${window.from}-${window.to}`}><td><b>{window.from}–{window.to}m</b></td><td>{formatNumber(window.lastHits)}</td><td>{formatNumber(window.netWorth)}</td><td>{formatNumber(window.xp)}</td><td>{formatNumber(window.deaths)}</td><td><span>{farmStateLabel(window.state)}</span></td></tr>)}</tbody></table></div>
    <div className="map-fact-grid farm-total-grid"><Metric label="Lane Creeps" value={data?.laneCreeps} icon="/map-analysis/camp.png" /><Metric label="Neutral Creeps" value={data?.neutralCreeps} icon="/map-analysis/camp.png" /><Metric label="Ancient Creeps" value={data?.ancientCreeps} icon="/map-analysis/camp.png" /><Metric label="Stacks" value={data?.stackedCamps} icon="/map-analysis/camp.png" /><Metric label="Estimated dead-time cost" value={data?.deathCost} /></div>
    <Note text={data?.note} />
  </aside>;
}

function ObjectiveView({ player }: { player: MatchPlayerAnalysis }) {
  const data = player.map?.objectives;
  return <section className="objective-facts-view">
    <Title icon={<Castle />} en="Objective Impact" fa="آسیب مستقیم Hero و Objectiveهای قطعی تیم در Timeline" />
    <div className="objective-summary"><Metric label="Tower DMG" value={data?.towerDamage} icon="/map-analysis/towers.png" /><Metric label="Tower Events" value={data?.towerKills} icon="/map-analysis/towers.png" /><Metric label="Barracks Events" value={data?.barracksKills} icon="/map-analysis/towers.png" /><Metric label="Roshan Events" value={data?.roshanKills} icon="/map-analysis/roshan.png" /></div>
    <div className="objective-explainer"><Info/><p><b>Tower DMG</b> سهم مستقیم این Hero است. Eventها Objective ثبت‌شده برای تیم‌اند و فقط وقتی Last hit قطعی باشد به خود Hero نسبت داده می‌شوند.</p></div>
    {data?.events.length ? <div className="objective-timeline" dir="ltr">{data.events.map((event,index) => <article key={`${event.minute}-${event.label}-${index}`}><time>{event.minute}m</time><span className={`is-${event.type}`}><img src={objectiveIcon(event.type)} alt=""/></span><div><strong>{objectiveLabel(event.type)}</strong><small>{event.playerPresent === true ? "Selected Hero secured it" : event.playerPresent === false ? "Teammate secured it" : "Team event · actor unavailable"}</small></div></article>)}</div> : <div className="map-compact-empty"><AlertTriangle /><div><strong>Objective Timeline موجود نیست</strong><p>فقط Tower DMG قطعی این Hero نمایش داده می‌شود؛ رویداد حدسی به Timeline اضافه نشده است.</p></div></div>}
    <Note text={data?.note} />
  </section>;
}

function UtilityFacts({ player }: { player: MatchPlayerAnalysis }) {
  const data = player.map?.utility;
  return <aside className="map-insight-panel is-wide">
    <Title icon={<ShieldCheck />} en="Vision & Utility" fa="خریدها و رخدادهای ثبت‌شده" />
    <div className="map-fact-grid"><Metric label="Observer placed" value={data?.observersPlaced} icon="/items/ward_observer.png" /><Metric label="Sentry placed" value={data?.sentriesPlaced} icon="/items/ward_sentry.png" /><Metric label="Observer deward" value={data?.observersDestroyed} icon="/items/ward_observer.png" /><Metric label="Sentry deward" value={data?.sentriesDestroyed} icon="/items/ward_sentry.png" /><Metric label="Average ward life" value={data?.averageObserverLifetimeSeconds} suffix="s" icon="/items/ward_observer.png" /><Metric label="Dust" value={data?.dustUses} icon="/items/dust.png" /><Metric label="Smoke" value={data?.smokeUses} icon="/items/smoke_of_deceit.png" /><Metric label="Kills under Smoke" value={data?.smokeKillParticipations} icon="/items/smoke_of_deceit.png" /><Metric label="Gem" value={data?.gemPurchases} icon="/items/gem.png" /><Metric label="Stacks" value={data?.campsStacked} icon="/map-analysis/camp.png" /></div>
    <section className={`invis-threat-panel is-${data?.invisThreat || "unknown"}`}><header><span><Eye/></span><div><b>Invis Threat</b><small>{data?.invisThreat === "active" ? `تهدید قطعی از دقیقه ${data.firstThreatMinute ?? "?"}` : data?.invisThreat === "possible" ? "نشانه‌ی ساخت آیتم Invis ثبت شده" : "تهدید قطعی ثبت نشده"}</small></div><strong>{data?.invisThreat === "active" ? "ACTIVE" : data?.invisThreat === "possible" ? "POSSIBLE" : "CLEAR"}</strong></header><div className="invis-response-grid"><Metric label="First threat" value={data?.firstThreatMinute} suffix="m" /><Metric label="First detection" value={data?.firstDetectionMinute} suffix="m" /><Metric label="Prepared before threat" value={data?.preparedBeforeThreat == null ? null : data.preparedBeforeThreat ? "Yes" : "No"} /></div>{Boolean(data?.invisThreats.length)&&<div className="invis-threat-group"><b>تهدیدهای شناسایی‌شده</b><div>{data?.invisThreats.map((item) => <span key={item}>{item}</span>)}</div></div>}{Boolean(data?.naturalReveal.length)&&<div className="invis-threat-group is-reveal"><b>Natural Reveal تیم</b><div>{data?.naturalReveal.map((item) => <span key={item}>{item}</span>)}</div></div>}</section>
    <Note text={data?.note} />
  </aside>;
}

function objectiveLabel(type: "tower" | "roshan" | "barracks" | "other") { return type === "tower" ? "Tower" : type === "barracks" ? "Barracks" : type === "roshan" ? "Roshan" : "Tormentor / Objective"; }
function objectiveIcon(type: "tower" | "roshan" | "barracks" | "other") { return type === "roshan" ? "/map-analysis/roshan.png" : type === "other" ? "/map-analysis/tormentors.png" : "/map-analysis/towers.png"; }
function Title({ icon,en,fa }: { icon:ReactNode;en:string;fa:string }) { return <header><span>{icon}</span><div><h5 lang="en">{en}</h5><p>{fa}</p></div></header>; }
function Metric({ label,value,suffix="",icon }: { label:string;value:string|number|null|undefined;suffix?:string;icon?:string }) { return <div className="map-insight-metric"><span lang="en">{icon&&<img src={icon} alt=""/>}{label}</span><strong lang="en" dir="ltr">{value == null ? "—" : typeof value === "number" ? value.toLocaleString("en-US") : value}{value != null ? suffix : ""}</strong></div>; }
function Mix({ label,value }: { label:string;value:number|null|undefined }) { return <span style={{ "--mix":`${value ?? 0}%` } as CSSProperties}><b lang="en">{label}</b><i><em /></i><strong lang="en" dir="ltr">{value ?? "—"}%</strong></span>; }
function Note({ text }: { text?:string }) { return <p className="map-insight-note">{text || "برای این بخش داده کافی ثبت نشده است."}</p>; }
function formatNumber(value:number|null|undefined){return value == null ? "—" : value.toLocaleString("en-US");}
function farmStateLabel(state:string){return state === "surge" ? "رشد سریع" : state === "progress" ? "روند مناسب" : state === "setback" ? "افت همراه Death" : state === "out" ? "افت محسوس" : "تقریباً ثابت";}
