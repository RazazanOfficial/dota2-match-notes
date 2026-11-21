import { useId, useState } from "react";
import { Eye, Footprints, MapPinned, Sprout, Target } from "lucide-react";
import { DOTA_741_LANDMARKS, DOTA_MAP_LAYER_ICONS, DOTA_MAP_LAYER_LABELS, type DotaMapLayer } from "@/lib/dota/map-landmarks";
import type { MatchPlayerAnalysis } from "@/lib/types";
import { isPersian, type Messages } from "../i18n";
import { MatchMotion } from "./MatchMotion";
import { matchTime } from "./MatchBuildTimeline";

const n = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
export function MatchMapWorkspace({ player, duration, t }: { player: MatchPlayerAnalysis; duration: number; t: Messages }) {
  const fa = isPersian(t), map = player.map;
  const [type, setType] = useState("movement"), [start, setStart] = useState(0), [end, setEnd] = useState(duration);
  const [layers, setLayers] = useState(new Set<DotaMapLayer>(["towers", "camps", "roshan"]));
  const filterId = useId().replaceAll(":", ""), timed = map?.coordinateSource === "timed";
  // Aggregate cells have no timestamps. They remain a whole-match view, never a fabricated replay.
  const points = (map?.points ?? []).filter(p => p.type === type && (!timed || (p.minute != null && p.minute >= start && p.minute <= end))).slice(0, 500);
  const events = (player.events ?? []).filter(e => e.second >= start * 60 && e.second <= end * 60 && (type === "movement" || (type === "vision" ? ["ward", "sentry", "smoke", "dust"].includes(e.type) : type === "objective" ? e.type === "objective" : type === "combat" ? ["kill", "death"].includes(e.type) : false)));
  const controls = [{ key: "movement", name: "Movement", icon: Footprints }, { key: "vision", name: "Vision", icon: Eye }, { key: "farm", name: "Farm", icon: Sprout }, { key: "combat", name: "Combat", icon: Target }, { key: "objective", name: "Objectives", icon: MapPinned }];
  return <MatchMotion className="match-map-workspace" identity={`map:${player.playerSlot}:${type}`}>
    <header className="workspace-heading" data-reveal><div><small>SPATIAL ANALYSIS · 7.41</small><h2>{fa ? "بازی روی نقشه" : "The match, on the map"}</h2></div><MapPinned size={24}/></header>
    <div className="match-map-columns">
      <section className="crafted-surface spatial-panel" data-reveal>
        <div className="workspace-scope-controls" role="group" aria-label={fa ? "لایهٔ داده" : "Data layer"}>{controls.map(({ key, name, icon: Icon }) => <button type="button" key={key} aria-pressed={type === key} onClick={() => setType(key)}><Icon size={15}/>{name}</button>)}</div>
        <div className="spatial-canvas"><img src="/maps/dota-7.41.webp" alt="Dota 2 · 7.41"/><svg viewBox="0 0 100 100" role="img" aria-label={`${player.heroName} · ${type}`}>
          <defs><filter id={filterId} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
          {DOTA_741_LANDMARKS.filter(l => layers.has(l.layer)).map(l => <image key={l.id} href={DOTA_MAP_LAYER_ICONS[l.layer]} x={l.x - 1.5} y={l.y - 1.5} width={3} height={3}><title>{l.label}</title></image>)}
          {points.map((p, i) => <g key={i}>{type === "movement" && <circle cx={p.x} cy={p.y} r={Math.min(5, 1.5 + Math.sqrt(Math.max(0, p.weight)) * .2)} fill="#e6ae5b" opacity=".24" filter={`url(#${filterId})`}/>}<circle className={`spatial-point ${p.type}`} cx={p.x} cy={p.y} r={Math.min(2.4, .45 + Math.sqrt(Math.max(0, p.weight)) * .13)}><title>{p.label ?? type}{p.minute == null ? "" : ` · ${matchTime(p.minute * 60)}`}</title></circle></g>)}
        </svg>{!points.length && <div className="spatial-empty"><MapPinned size={28}/><strong>{fa ? "مختصاتی برای این نما موجود نیست" : "No coordinates for this view"}</strong><p>{fa ? "محل رویدادها تخمین زده نمی‌شود." : "Event locations are not estimated."}</p></div>}
        <div className="spatial-caption">{timed ? `${matchTime(start * 60)} – ${matchTime(end * 60)}` : fa ? "تراکم کل مچ · بدون تفکیک زمانی" : "Whole-match density · no time resolution"}</div></div>
        <fieldset className="spatial-interval" disabled={!timed}><legend>{fa ? "بازهٔ زمانی نقشه" : "Map time interval"}</legend><label>{fa ? "شروع" : "Start"}<time>{matchTime(start * 60)}</time><input aria-label={fa ? "شروع بازه" : "Interval start"} type="range" min={0} max={duration} step={.5} value={start} onChange={e => setStart(Math.min(end, Number(e.target.value)))}/></label><label>{fa ? "پایان" : "End"}<time>{matchTime(end * 60)}</time><input aria-label={fa ? "پایان بازه" : "Interval end"} type="range" min={0} max={duration} step={.5} value={end} onChange={e => setEnd(Math.max(start, Number(e.target.value)))}/></label></fieldset>
        {!timed && <p className="workspace-note">{fa ? "فیلتر زمان به مختصات زمان‌دار نیاز دارد؛ نقاط تجمیعی فقط برای کل مچ نمایش داده می‌شوند." : "Time filtering requires timestamped coordinates. Aggregate points represent the whole match."}</p>}
        <div className="spatial-landmarks" role="group" aria-label={fa ? "نشانه‌های نقشه" : "Map landmarks"}>{(Object.keys(DOTA_MAP_LAYER_LABELS) as DotaMapLayer[]).map(key => <button type="button" key={key} aria-pressed={layers.has(key)} onClick={() => setLayers(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })}><img src={DOTA_MAP_LAYER_ICONS[key]} alt=""/>{DOTA_MAP_LAYER_LABELS[key].en}</button>)}</div>
      </section>
      <aside className="spatial-sidebar"><section className="crafted-surface" data-reveal><header><Footprints size={18}/><h3>{fa ? "خلاصهٔ کل مچ" : "Whole-match context"}</h3></header><dl className="spatial-facts">{[[fa ? "داخل قلمرو امن" : "Safe territory", map?.movement.safeTerritoryPercent, "%"], [fa ? "داخل قلمرو حریف" : "Enemy territory", map?.movement.enemyTerritoryPercent, "%"], ["Observer", map?.utility.observersPlaced, ""], ["Deward", map?.utility.observersDestroyed, ""], ["Tower damage", map?.objectives.towerDamage, ""]].map(([label, value, suffix]) => <div key={String(label)}><dt>{label}</dt><dd>{n(value as number | undefined)}{value == null ? "" : suffix}</dd></div>)}</dl><p className="workspace-note">{map?.movement.note}</p></section>
      <section className="crafted-surface spatial-events" data-reveal><header><ClockIcon/><h3>{fa ? "رویدادهای بازه" : "Events in range"}</h3></header>{events.length ? <ol>{events.map(e => <li key={e.id}><time>{matchTime(e.second)}</time><div><strong>{e.label}</strong><p>{e.detail}</p></div></li>)}</ol> : <p className="workspace-empty">{fa ? "رویدادی برای این فیلتر ثبت نشده است." : "No events recorded for this filter."}</p>}</section></aside>
    </div>
    <details className="workspace-advanced crafted-surface"><summary>{fa ? "جزئیات فارم، دید و اهداف" : "Farm, vision & objective details"}</summary><div className="spatial-detail-grid">{[{ title: "Farm", data: map?.farm }, { title: "Vision", data: map?.utility }, { title: "Objectives", data: map?.objectives }].map(({ title, data }) => <section key={title}><h3>{title}</h3><dl className="spatial-facts">{Object.entries(data ?? {}).filter(([, value]) => typeof value === "number").map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{n(value as number)}</dd></div>)}</dl><p className="workspace-note">{data?.note}</p></section>)}</div>
    {!!map?.farm.windows.length && <div className="lane-table-scroll"><table className="lane-table"><caption>Farm windows</caption><thead><tr>{["Window", "LH", "Net Worth", "XP", "Farm gain", "Deaths", "State"].map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{map.farm.windows.map((w,i) => <tr key={i}><td>{w.from}–{w.to}m</td><td>{n(w.lastHits)}</td><td>{n(w.netWorth)}</td><td>{n(w.xp)}</td><td>{n(w.farmGain)}</td><td>{w.deaths}</td><td>{w.state}<small>{w.note}</small></td></tr>)}</tbody></table></div>}
    {!!map?.objectives.events.length && <ol className="objective-events">{map.objectives.events.map((e,i) => <li key={i}><time>{matchTime(e.minute*60)}</time><strong>{e.label}</strong><small>{fa ? "حضور بازیکن" : "Player present"}: {e.playerPresent == null ? "—" : e.playerPresent ? "Yes" : "No"} · {fa ? "تبدیل درگیری به هدف" : "Fight converted"}: {e.convertedFromFight == null ? "—" : e.convertedFromFight ? "Yes" : "No"}</small></li>)}</ol>}
    </details>
  </MatchMotion>;
}
function ClockIcon() { return <Target size={18}/>; }
