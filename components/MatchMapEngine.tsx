"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Castle, Eye, Info, Layers3, MapPinned, ShieldCheck, Wheat } from "lucide-react";
import { DOTA_741_LANDMARKS, DOTA_MAP_LAYER_LABELS, type DotaMapLayer } from "@/lib/dota/map-landmarks";
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
        <div><span><MapPinned /></span><div><p>MATCH MAP · 7.41</p><h4>تحلیل مکانی {player.heroName}</h4><small>فقط داده‌ای نمایش داده می‌شود که در Match ثبت شده است.</small></div></div>
        <DataBadge source={map?.coordinateSource} />
      </header>
      <nav className="map-analysis-tabs">
        {VIEWS.map((item) => <button key={item.key} className={view === item.key ? "is-active" : ""} type="button" onClick={() => setView(item.key)}>{item.icon}<span lang="en">{item.en}</span><small>{item.fa}</small></button>)}
      </nav>
      {view === "objectives" ? <ObjectiveView player={player} /> : (
        <div className="map-analysis-layout">
          <div className="dota-map-column">
            <div className="map-layer-toolbar"><span><Layers3 />لایه‌های مپ</span><div>{(Object.keys(DOTA_MAP_LAYER_LABELS) as DotaMapLayer[]).map((layer) => <button key={layer} type="button" className={layers.has(layer) ? "is-active" : ""} onClick={() => toggle(layer)}><i />{DOTA_MAP_LAYER_LABELS[layer].en}</button>)}</div></div>
            {points.length ? <MapStage points={points} layers={layers} view={view} /> : <MapUnavailable view={view} />}
          </div>
          {view === "farm" ? <FarmFacts player={player} /> : <UtilityFacts player={player} />}
        </div>
      )}
    </section>
  );
}

function DataBadge({ source }: { source?: "timed" | "aggregate" | "unavailable" }) {
  return <span className={`map-data-status is-${source === "unavailable" || !source ? "unavailable" : "partial"}`}><Info /><b>{source === "aggregate" ? "پوشش کل Match" : source === "timed" ? "مختصات زمان‌دار" : "بدون مختصات"}</b><small>{source === "aggregate" ? "بدون Time Window" : "No synthetic route"}</small></span>;
}

function MapStage({ points, layers, view }: { points: MatchMapPoint[]; layers: Set<DotaMapLayer>; view: MapView }) {
  const max = Math.max(1, ...points.map((point) => point.weight));
  return <div className={`dota-map-stage is-${view}`}>
    <img src="/maps/dota-7.41.webp" alt="نقشه Dota 2 نسخه 7.41" />
    <div className="dota-map-vignette" />
    {DOTA_741_LANDMARKS.filter((item) => layers.has(item.layer)).map((item) => <span key={item.id} className={`map-landmark is-${item.layer} is-${item.side || "neutral"} is-${item.size || "default"}`} style={{ left:`${item.x}%`, top:`${item.y}%` }} title={item.label}><i /></span>)}
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
    <Title icon={<Wheat />} en="Farm Checkpoints" fa="اعداد واقعی در بازه‌های بازی" />
    <div className="farm-source-mix"><Mix label="Lane" value={data?.sourceMix.lane} /><Mix label="Neutral" value={data?.sourceMix.neutral} /><Mix label="Ancient" value={data?.sourceMix.ancient} /></div>
    <div className="farm-window-list">{data?.windows.map((window) => <article className={`is-${window.state}`} key={`${window.from}-${window.to}`}><span>{window.from}–{window.to}m</span><b>LH +{window.lastHits ?? "—"}</b><small>NW {window.netWorth?.toLocaleString("en-US") ?? "—"} · XP {window.xp?.toLocaleString("en-US") ?? "—"}</small><p>{window.deaths ? `${window.deaths} Death در این بازه` : "بدون Death ثبت‌شده"}</p></article>)}</div>
    <div className="map-fact-grid"><Metric label="Lane Creeps" value={data?.laneCreeps} /><Metric label="Neutral Creeps" value={data?.neutralCreeps} /><Metric label="Ancient Creeps" value={data?.ancientCreeps} /><Metric label="Stacks" value={data?.stackedCamps} /><Metric label="Estimated dead-time cost" value={data?.deathCost} /></div>
    <Note text={data?.note} />
  </aside>;
}

function ObjectiveView({ player }: { player: MatchPlayerAnalysis }) {
  const data = player.map?.objectives;
  return <section className="objective-facts-view">
    <div className="objective-summary"><Metric label="Tower DMG" value={data?.towerDamage} /><Metric label="Towers" value={data?.towerKills} /><Metric label="Barracks" value={data?.barracksKills} /><Metric label="Roshan" value={data?.roshanKills} /></div>
    {data?.events.length ? <div className="objective-timeline" dir="ltr">{data.events.map((event,index) => <article key={`${event.minute}-${event.label}-${index}`}><time>{event.minute}m</time><span className={`is-${event.type}`}><Castle /></span><div><strong>{objectiveLabel(event.type)}</strong><small>{event.playerPresent === true ? "Last hit by selected hero" : "Team objective"}</small></div></article>)}</div> : <div className="map-compact-empty"><AlertTriangle /><div><strong>Objective log موجود نیست</strong><p>Tower DMG نهایی همچنان نمایش داده می‌شود؛ رویداد ساختگی ساخته نشده است.</p></div></div>}
    <Note text={data?.note} />
  </section>;
}

function UtilityFacts({ player }: { player: MatchPlayerAnalysis }) {
  const data = player.map?.utility;
  return <aside className="map-insight-panel is-wide">
    <Title icon={<ShieldCheck />} en="Vision & Utility" fa="خریدها و رخدادهای ثبت‌شده" />
    <div className="map-fact-grid"><Metric label="Observer placed" value={data?.observersPlaced} /><Metric label="Sentry placed" value={data?.sentriesPlaced} /><Metric label="Observer deward" value={data?.observersDestroyed} /><Metric label="Sentry deward" value={data?.sentriesDestroyed} /><Metric label="Average ward life" value={data?.averageObserverLifetimeSeconds} suffix="s" /><Metric label="Dust" value={data?.dustUses} /><Metric label="Smoke" value={data?.smokeUses} /><Metric label="Kills under Smoke" value={data?.smokeKillParticipations} /><Metric label="Gem" value={data?.gemPurchases} /><Metric label="Stacks" value={data?.campsStacked} /></div>
    <div className={`invis-threat is-${data?.invisThreat || "unknown"}`}><Eye /><span><b>Invis Threat</b><small>{data?.invisThreat === "active" ? `تهدید قطعی از حدود دقیقه ${data.firstThreatMinute ?? "?"}` : data?.invisThreat === "possible" ? "Build intent محتمل" : "تهدید قطعی ثبت نشد"}</small></span></div>
    <div className="invis-threat-list">{data?.invisThreats.map((item) => <span key={item}>{item}</span>)}{data?.naturalReveal.map((item) => <span className="is-reveal" key={item}>Natural Reveal: {item}</span>)}</div>
    <Note text={data?.note} />
  </aside>;
}

function objectiveLabel(type: "tower" | "roshan" | "barracks" | "other") { return type === "tower" ? "Tower" : type === "barracks" ? "Barracks" : type === "roshan" ? "Roshan" : "Tormentor / Objective"; }
function Title({ icon,en,fa }: { icon:ReactNode;en:string;fa:string }) { return <header><span>{icon}</span><div><h5 lang="en">{en}</h5><p>{fa}</p></div></header>; }
function Metric({ label,value,suffix="" }: { label:string;value:string|number|null|undefined;suffix?:string }) { return <div className="map-insight-metric"><span lang="en">{label}</span><strong lang="en" dir="ltr">{value == null ? "—" : typeof value === "number" ? value.toLocaleString("en-US") : value}{value != null ? suffix : ""}</strong></div>; }
function Mix({ label,value }: { label:string;value:number|null|undefined }) { return <span style={{ "--mix":`${value ?? 0}%` } as CSSProperties}><b>{label}</b><i><em /></i><strong>{value ?? "—"}%</strong></span>; }
function Note({ text }: { text?:string }) { return <p className="map-insight-note">{text || "برای این بخش داده کافی ثبت نشده است."}</p>; }
