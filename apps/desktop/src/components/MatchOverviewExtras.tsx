import { useState } from "react";
import { ChartNoAxesCombined, Swords } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import type { Match, MatchPlayerAnalysis } from "@/lib/types";
import { isPersian, type Messages } from "../i18n";
const netWorthAt10 = (p: MatchPlayerAnalysis) => (p.laneEfficiency?.version === 2 && p.laneEfficiency.windowSeconds === 600 ? p.laneEfficiency.parts.find(part => part.key === "networth")?.actual : null) ?? p.timeline.find(s => s.minute === 10)?.gold ?? null;

export function MatchOverviewExtras({ match, t }: { match: Match; t: Messages }) {
  const [metric, setMetric] = useState<"radiantGoldAdvantage" | "radiantXpAdvantage">("radiantGoldAdvantage");
  const fa = isPersian(t), analysis = match.analysis, series = analysis?.teamTimeline ?? [];
  const maximum = Math.max(1, ...series.map(p => Math.abs(p[metric] ?? 0)));
  let path = "", connected = false;
  for (const point of series) {
    if (point[metric] == null) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${30 + point.minute / Math.max(1, analysis?.durationMinutes ?? 1) * 660},${105 - point[metric]! / maximum * 75} `;
    connected = true;
  }
  const lanePlayers = analysis?.players.filter(p => p.team === "radiant" && p.position != null && p.position <= 3) ?? [];
  return <div className="overview-extra-grid">
    <section className="crafted-surface team-advantage-panel" data-reveal><header><ChartNoAxesCombined size={19}/><h3>{fa ? "روند برتری تیم‌ها" : "Team advantage"}</h3><div role="group" aria-label={fa ? "معیار نمودار" : "Chart metric"}>{([["radiantGoldAdvantage", "Gold"], ["radiantXpAdvantage", "XP"]] as const).map(([key, caption]) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{caption}</button>)}</div></header>
      {series.filter(p => p[metric] != null).length > 1 ? <><svg viewBox="0 0 720 220" role="img" aria-label={`${metric === "radiantGoldAdvantage" ? "Gold" : "XP"} · Radiant advantage`}><line x1="30" x2="690" y1="105" y2="105" className="chart-zero"/><path d={path} className="advantage-line"/><text x="30" y="20">Radiant +{Math.round(maximum).toLocaleString("en-US")}</text><text x="30" y="202">Dire −{Math.round(maximum).toLocaleString("en-US")}</text><text x="690" y="202" textAnchor="end">{Math.round(analysis!.durationMinutes)} min</text></svg><p className="workspace-note">{fa ? "مقادیر مثبت به نفع Radiant و منفی به نفع Dire هستند." : "Positive values favour Radiant; negative values favour Dire."}</p></> : <p className="workspace-empty">{fa ? "سری زمانی برتری تیم‌ها موجود نیست." : "Team advantage timeline is unavailable."}</p>}
    </section>
    <section className="crafted-surface lane-matchups-panel" data-reveal><header><Swords size={19}/><h3>{fa ? "تقابل Coreها · دقیقهٔ ۱۰" : "Core matchups · 10:00"}</h3></header>{lanePlayers.length ? <div className="lane-matchup-list">{lanePlayers.map(p => {
      const oppositePosition = p.position === 2 ? 2 : p.position === 1 ? 3 : 1;
      const candidates = analysis?.players.filter(x => x.team !== p.team && x.position === oppositePosition) ?? [];
      const opponent = candidates.length === 1 ? candidates[0] : undefined;
      const hero = heroById(p.heroId), other = opponent && heroById(opponent.heroId);
      const own = netWorthAt10(p), theirs = opponent ? netWorthAt10(opponent) : null;
      const delta = analysis!.durationMinutes >= 10 && own !== null && theirs !== null ? own - theirs : null;
      return <article key={p.playerSlot} data-matchup-player={p.playerSlot}><figure><img src={hero ? heroImage(hero) : ""} alt={p.heroName}/><figcaption>{p.heroName}</figcaption></figure><div><small>{delta == null ? (fa ? "دادهٔ دقیق ناموجود" : "Exact data unavailable") : (fa ? "اختلاف دارایی Radiant" : "Radiant net worth delta")}</small><strong>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")} NW`}</strong></div><figure>{other ? <img src={heroImage(other)} alt={opponent!.heroName}/> : <div className="unknown-opponent">?</div>}<figcaption>{opponent?.heroName ?? "—"}</figcaption></figure></article>;
    })}<p className="workspace-note">{fa ? "مقایسه بر اساس نقش فعلی و دارایی دقیق دقیقهٔ ۱۰ است؛ نتیجهٔ برد و باخت لین نیست." : "Compares current roles and exact 10:00 net worth; this is not a lane win/loss verdict."}</p></div> : <p className="workspace-empty">{fa ? "تقابل قابل‌اتکایی برای لین‌ها موجود نیست." : "Reliable lane matchups are unavailable."}</p>}</section>
  </div>;
}
