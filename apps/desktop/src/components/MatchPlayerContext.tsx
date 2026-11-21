import { heroById, heroImage } from "@/data/heroes";
import { buildPositionSwapUpdates } from "@/lib/dota/analysis-position-overrides";
import type { Match } from "@/lib/types";
import { isPersian, type Messages } from "../i18n";
import { HistoryFilters } from "./HistoryFilters";
import { Position } from "./Workspace";
import { MatchMotion } from "./MatchMotion";

export function MatchPlayerContext({ match, selected, onSelect, onPositionOverrides, t }: {
  match: Match; selected: number; onSelect: (slot: number) => void; onPositionOverrides: (updates: Record<string, number>) => void; t: Messages;
}) {
  const player = match.analysis?.players.find(p => p.playerSlot === selected);
  const participant = match.participants?.find(p => p.playerSlot === selected);
  const p = player ?? participant;
  if (!p) return null;
  const hero = heroById(p.heroId), fa = isPersian(t);
  return <MatchMotion identity={`player-context:${selected}`}><section className="match-player-context" aria-label={fa ? "بازیکن انتخاب‌شده" : "Selected player"} data-reveal>
    <figure className="context-portrait"><img src={hero ? heroImage(hero) : ""} alt=""/><figcaption>{fa ? "بازیکن انتخاب‌شده" : "SELECTED PLAYER"}</figcaption></figure>
    <div className="context-identity"><h2>{p.heroName}</h2><p dir="auto">{p.personName}</p><Position value={p.position} t={t} analyzed={!!player}/></div>
    <dl className="context-match-stats"><div><dt>K / D / A</dt><dd>{p.kills ?? "—"} / {p.deaths ?? "—"} / {p.assists ?? "—"}</dd></div><div><dt>{fa ? "دارایی نهایی" : "Final net worth"}</dt><dd>{p.netWorth?.toLocaleString("en-US") ?? "—"}</dd></div></dl>
    <div className="context-rosters" dir="ltr">{(["radiant", "dire"] as const).map(team => <div key={team} className={`context-team ${team}`} role="group" aria-label={team === "radiant" ? "Radiant" : "Dire"}>
      <img className="context-team-mark" src={`/match-details/${team}.webp`} alt={team}/>
      {(match.participants ?? match.analysis?.players ?? []).filter(p => p.team === team).map(p => { const h = heroById(p.heroId); return <button key={p.playerSlot} type="button" title={`${p.heroName} · ${p.personName}`} aria-label={`${p.heroName} · ${p.personName}`} aria-pressed={selected === p.playerSlot} className={selected === p.playerSlot ? "active" : ""} onClick={() => onSelect(p.playerSlot)}><img src={h ? heroImage(h) : ""} alt=""/></button>; })}
    </div>)}</div>
    {player && match.analysis && <div className="context-role"><small>{t.roleOverride}</small><HistoryFilters positionsOnly t={t} mode="all" setMode={() => {}} position={String(player.position ?? 0)} setPosition={value => { if (Number(value) > 0) onPositionOverrides(buildPositionSwapUpdates(match.analysis!.players, player.playerSlot, Number(value))); }}/></div>}
  </section></MatchMotion>;
}
