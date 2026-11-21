import { useState } from "react";
import { Clock3, PackageOpen, TrendingUp } from "lucide-react";
import { DOTA_ITEMS, itemImage } from "@/data/items.generated";
import type { MatchAnalysis, MatchPlayerAnalysis } from "@/lib/types";
import { isPersian, type Messages } from "../i18n";
import { MatchMotion } from "./MatchMotion";
const items = new Map<string, (typeof DOTA_ITEMS)[number]>(DOTA_ITEMS.map(item => [item.slug, item]));
export function ItemVisual({ name, className = "" }: { name: string; className?: string }) {
  const item = items.get(name.replace(/^item_/, ""));
  return item ? <img className={`match-item-image ${className}`} src={itemImage(item.id)!} alt={item.name} title={item.name} loading="lazy"/> : <PackageOpen className={className} size={30} aria-label={name}/>;
}
export function itemName(name: string) { return items.get(name.replace(/^item_/, ""))?.name ?? name.replace(/^item_/, "").replaceAll("_", " "); }
export const matchTime = (seconds: number) => `${seconds < 0 ? "−" : ""}${Math.floor(Math.abs(seconds) / 60)}:${String(Math.floor(Math.abs(seconds) % 60)).padStart(2, "0")}`;
export function MatchBuildTimeline({ player, analysis, t }: { player: MatchPlayerAnalysis; analysis: MatchAnalysis; t: Messages }) {
  const [phase, setPhase] = useState(0), fa = isPersian(t);
  const phases = Array.from({ length: Math.max(1, Math.ceil(analysis.durationMinutes / 10)) }, (_, i) => ({ from: i * 10, to: Math.min((i + 1) * 10, analysis.durationMinutes) }));
  const range = phases[Math.min(phase, phases.length - 1)];
  // Deltas require both actual boundary snapshots; never substitute the final scorecard.
  const before = player.timeline.find(s => s.minute === range.from), after = player.timeline.find(s => s.minute === range.to);
  const delta = (key: "gold" | "xp" | "lastHits" | "denies") => before?.[key] != null && after?.[key] != null ? after[key]! - before[key]! : null;
  const recorded = player.itemTimings ?? [];
  const purchaseEvents = (player.events ?? []).filter(e => ["item", "smoke", "dust"].includes(e.type)).map(e => ({ key: e.label.replace(/^item_/, "").replaceAll(" ", "_"), second: e.second, relativeToReference: "unavailable" as const, deltaMinutes: null }));
  const allPurchases = [...recorded, ...purchaseEvents.filter(e => !recorded.some(r => r.key.replace(/^item_/, "") === e.key && r.second === e.second))].sort((a,b)=>a.second-b.second);
  const inPhase = (second: number) => (range.from === 0 && second < 0) || (second >= range.from * 60 && (second < range.to * 60 || (range.to === analysis.durationMinutes && second === range.to * 60)));
  const timings = allPurchases.filter(e => inPhase(e.second));
  const events = (player.events ?? []).filter(e => !["item", "smoke", "dust"].includes(e.type) && inPhase(e.second));
  return <MatchMotion identity={`phase:${player.playerSlot}:${phase}`} className="match-timeline-view">
    <header className="workspace-heading" data-reveal><div><small>PLAYER DEVELOPMENT</small><h2>{fa ? "Build و روند بازی" : "Builds & Timeline"}</h2></div><Clock3 size={22}/></header>
    <div className="match-phase-controls" role="group" aria-label={fa ? "بازهٔ بازی" : "Match phase"}>{phases.map((p, i) => <button type="button" key={p.from} aria-pressed={phase === i} onClick={() => setPhase(i)}>{matchTime(p.from * 60)} – {matchTime(p.to * 60)}</button>)}</div>
    <section className="match-phase-panel crafted-surface" data-reveal><header><TrendingUp size={19}/><h3>{fa ? "رشد در این بازه" : "Growth in this phase"}</h3><time>{matchTime(range.from * 60)} – {matchTime(range.to * 60)}</time></header><dl className="phase-growth">{([['gold', 'Net Worth Δ'], ['xp', 'XP Δ'], ['lastHits', 'LH Δ'], ['denies', 'Deny Δ']] as const).map(([key, caption]) => <div key={key}><dt>{caption}</dt><dd>{delta(key)?.toLocaleString("en-US") ?? "—"}</dd></div>)}</dl>{(!before || !after) && <p className="workspace-note">{fa ? "اسنپ‌شات دقیق مرز این بازه موجود نیست؛ رشد آن تخمین زده نمی‌شود." : "Exact boundary snapshots are unavailable; phase growth is not estimated."}</p>}</section>
    <section className="crafted-surface build-sequence" data-reveal><header><PackageOpen size={19}/><h3>{fa ? "خریدهای ثبت‌شده" : "Recorded purchases"}</h3></header>{timings.length ? <ol>{timings.map((event, i) => <li key={`${event.key}:${event.second}:${i}`}><figure><ItemVisual name={event.key}/><figcaption>{itemName(event.key)}</figcaption></figure><time>{matchTime(event.second)}</time>{event.relativeToReference !== "unavailable" && <small>{event.deltaMinutes == null ? event.relativeToReference : `${event.deltaMinutes > 0 ? "+" : ""}${event.deltaMinutes.toFixed(1)} min`}</small>}</li>)}</ol> : <p className="workspace-empty">{allPurchases.length ? (fa ? "خریدی برای این بازه ثبت نشده است." : "No purchases recorded in this phase.") : (fa ? "دادهٔ خریدهای این بازیکن موجود نیست." : "Purchase telemetry is unavailable for this player.")}</p>}</section>
    <section className="crafted-surface phase-events" data-reveal><header><Clock3 size={19}/><h3>{fa ? "اتفاق‌های بازیکن" : "Player events"}</h3></header>{events.length ? <ol>{events.map(e => <li key={e.id}><time>{matchTime(e.second)}</time><i className={`event-marker ${e.positive === false ? "negative" : e.positive === true ? "positive" : ""}`}/><div><strong>{e.label}</strong>{e.detail && <p>{e.detail}</p>}</div></li>)}</ol> : <p className="workspace-empty">{fa ? "رویداد قابل‌نمایشی در این بازه موجود نیست." : "No events available in this phase."}</p>}</section>
  </MatchMotion>;
}
