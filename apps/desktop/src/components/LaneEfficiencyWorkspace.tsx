import { useId } from "react";
import { Info, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import type { LaneEfficiencyResult, LaneReason } from "@/lib/dota/lane-efficiency";
import type { MatchPlayerAnalysis } from "@/lib/types";

const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const time = (value: number) => `${value < 0 ? "−" : ""}${Math.floor(Math.abs(value) / 60)}:${String(Math.floor(Math.abs(value) % 60)).padStart(2, "0")}`;
const text = (fa: boolean, en: string, persian: string) => fa ? persian : en;
const REASONS: Record<LaneReason, [string, string]> = {
  "unsupported-mode": ["Ranked All Pick only", "فقط Ranked All Pick پشتیبانی می‌شود"],
  "unknown-position": ["Select a position to calculate", "برای محاسبه، نقش بازیکن را مشخص کنید"],
  "short-match": ["Match ended before 10:00", "مچ پیش از دقیقهٔ ۱۰ پایان یافته"],
  "legacy-events": ["Stored replay needs extraction v2", "Replay ذخیره‌شده به استخراج نسخهٔ جدید نیاز دارد"],
  "missing-replay": ["Local replay data unavailable", "دادهٔ Replay محلی موجود نیست"],
  "missing-snapshot": ["10:00 snapshot unavailable", "شمارندهٔ دقیقهٔ ۱۰ موجود نیست"],
  "missing-events": ["Reliable event data unavailable", "رویداد قابل‌اتکا موجود نیست"],
  "missing-reference": ["Monthly reference unavailable", "مرجع ماهانه موجود نیست"],
  "invalid-reference": ["Reference mean is not usable", "میانگین مرجع قابل استفاده نیست"],
};
function Help({ description, label }: { description: string; label: string }) {
  const id = useId();
  return <span className="lane-help"><button type="button" aria-label={label} aria-describedby={id}><Info size={14}/></button><span id={id} role="tooltip">{description}</span></span>;
}

export function currentLane(player: MatchPlayerAnalysis): LaneEfficiencyResult | undefined {
  const result = player.laneEfficiency;
  return result?.version === 2 && result.windowSeconds === 600 ? result : undefined;
}

export default function LaneEfficiencyWorkspace({ player, players, fa }: { player: MatchPlayerAnalysis; players: MatchPlayerAnalysis[]; fa: boolean }) {
  const lane = currentLane(player);
  const unavailable = text(fa, "Unavailable", "ناموجود");
  if (!lane) return <section className="lane-workspace lane-unavailable"><h2>Lane Efficiency</h2><span className="lane-numeric lane-empty-score">— <small>/ 100</small></span><p>{text(fa, "The stored analysis predates the ten-minute formula, or local replay data is unavailable. Refresh the analysis; older replay events need reprocessing.", "تحلیل ذخیره‌شده مربوط به فرمول جدید ده‌دقیقه‌ای نیست یا دادهٔ Replay محلی موجود نیست. تحلیل را تازه کنید؛ رویدادهای Replay قدیمی به پردازش مجدد نیاز دارند.")}</p></section>;
  const { ward, resources, bonus } = lane.details;
  const reason = (code: LaneReason) => REASONS[code][fa ? 1 : 0];
  const status = lane.status === "ready" ? text(fa, "Complete", "کامل") : lane.status === "partial" ? text(fa, "Partial assessment", "ارزیابی با دادهٔ ناقص") : unavailable;
  const cohort = lane.cohort === "hero-position" ? text(fa, "Hero + Position", "هیرو و نقش") : lane.cohort === "position" ? text(fa, "All heroes · same position", "همهٔ هیروها · نقش یکسان") : unavailable;
  const uniqueReasons = [...new Set(lane.parts.flatMap(p => p.reason ? [p.reason] : []))];
  const summary = [[text(fa, "Earned / covered", "دریافتی / وزن موجود"), `${number(lane.subtotal)} / ${number(lane.covered)}`],
    [text(fa, "Normalized base", "نمرهٔ پایهٔ نسبی"), number(lane.normalized)],
    [text(fa, "Verified bonus", "پاداش تأییدشده"), `+${number(lane.bonus)}`],
    [text(fa, "Final score", "نمرهٔ نهایی"), `${number(lane.score)} / 100`]];
  return <section className="lane-workspace" aria-label="Lane Efficiency">
    <header className="lane-summary">
      <div className="lane-summary-title"><span className="lane-eyebrow">LANING PHASE · 0–10 MIN</span><h2>Lane Efficiency</h2><p>{text(fa, "Eight metrics. Your position. A clear breakdown.", "هشت معیار، متناسب با نقش شما، با محاسبه‌ای شفاف.")}</p><span className={`lane-state ${lane.status}`}>{status}</span></div>
      <div className="lane-total"><div className="lane-numeric"><strong>{number(lane.score)}</strong><span>/ 100</span></div><span>{text(fa, "Data coverage", "پوشش داده")} <bdi className="lane-numeric">{number(lane.covered)} / 100</bdi><Help label={text(fa, "About coverage", "توضیح پوشش داده")} description={text(fa, "Sum of available metric weights, not statistical confidence. Missing metrics are excluded before normalization. This score is not a percentile.", "مجموع وزن معیارهای دارای داده است، نه اطمینان آماری. معیارهای ناموجود پیش از نسبت‌گیری کنار گذاشته می‌شوند. این نمره، صدک آماری نیست.")}/></span><div className="lane-coverage" aria-hidden="true"><i style={{ width: `${lane.covered}%` }}/></div></div>
    </header>
    <dl className="lane-reference-strip"><div><dt>{text(fa, "Window", "بازه")}</dt><dd className="lane-numeric">00:00 – 10:00</dd></div><div><dt>{text(fa, "Reference", "مرجع")}</dt><dd>{cohort}<small className="lane-reference-source">STRATZ · Divine / Immortal</small></dd></div><div><dt>{text(fa, "Month", "ماه")}</dt><dd className="lane-numeric">{lane.referenceMonth?.slice(0, 7) ?? "—"}</dd></div><div><dt>{text(fa, "Samples", "تعداد نمونه")}</dt><dd className="lane-numeric">{number(lane.samples)}</dd></div></dl>
    {uniqueReasons.length > 0 && <div className="lane-notices" role="status">{uniqueReasons.map(code => <p key={code}><Info size={14}/>{reason(code)}</p>)}</div>}
    {lane.referenceMonth && lane.notes.some(note => note.startsWith("مرجع ")) && <p className="lane-notice">{text(fa, "The previous month's reference is not ready; the displayed older reference is used temporarily.", "مرجع ماه قبل هنوز آماده نیست؛ فعلاً از مرجع قدیمی‌ترِ نمایش‌داده‌شده استفاده شده است.")}</p>}
    <div className="lane-table-scroll" tabIndex={0} aria-label={text(fa, "Lane metric breakdown", "جدول معیارهای لین")}>
      <table className="lane-table"><thead><tr>{[text(fa, "Metric", "معیار"), text(fa, "Match", "این مچ"), text(fa, "Reference", "مرجع"), text(fa, "Weight", "وزن"), text(fa, "Points", "امتیاز"), text(fa, "Status", "وضعیت")].map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{lane.parts.map(part => <tr key={part.key} data-lane-part={part.key}>
        <th scope="row"><span>{part.label}</span><Help label={`${part.label} ${text(fa, "formula", "فرمول")}`} description={part.key === "ward" ? text(fa, "Replay placements, survival and verified dewards; raw total capped at 27, scaled to your position weight.", "کاشت، بقای Ward و Deward تأییدشده از Replay؛ سقف خام 27 است و به وزن نقش تبدیل می‌شود.") : part.key === "resources" ? text(fa, "Purchases only: restoration /12, vision /12, smoke /2. Does not establish actual use or gifts.", "فقط خریدها: منابع بازیابی /12، دید /12 و Smoke /2. استفادهٔ واقعی یا هدیه‌دادن را اثبات نمی‌کند.") : part.key === "deaths" ? text(fa, "Weight × clamp(1 − Match / (2 × Mean), 0, 1). Fewer deaths is better.", "وزن × clamp(1 − مقدار مچ / (2 × میانگین)، 0، 1). مرگ کمتر بهتر است.") : text(fa, "Weight × clamp(Match / (2 × Mean), 0, 1). The reference mean earns half the available points.", "وزن × clamp(مقدار مچ / (2 × میانگین)، 0، 1). مقدار برابر میانگین، نصف امتیاز معیار را می‌گیرد.")}/></th>
        <td className="lane-numeric">{number(part.actual)}{part.key === "ward" || part.key === "resources" ? <small> / {part.key === "ward" ? "27" : "26"}</small> : null}</td>
        <td>{part.key === "ward" || part.key === "resources" ? <span className="lane-fixed-rule">{text(fa, "Fixed rule", "قاعدهٔ ثابت")}</span> : <span className="lane-numeric">{number(part.mean)}</span>}</td>
        <td className="lane-numeric">{number(part.maximum)}</td><td><strong className="lane-numeric">{number(part.value)}</strong><div className="lane-point-track" aria-hidden="true"><i style={{ width: `${part.value == null ? 0 : part.value / Math.max(1, part.maximum) * 100}%` }}/></div></td>
        <td><span className={`lane-metric-status ${part.value === null ? "missing" : "verified"}`}>{part.reason ? reason(part.reason) : text(fa, "Calculated", "محاسبه‌شده")}</span></td>
      </tr>)}</tbody></table>
    </div>
    <div className="lane-calculation">{summary.map(([caption, value], index) => <div key={caption} className={index === 3 ? "lane-final" : ""}><span>{caption}</span><strong className="lane-numeric">{value}</strong></div>)}</div>
    <p className="lane-calculation-note">{text(fa, "Base = earned ÷ covered × 100. Bonus is added afterwards; final score is rounded and capped at 100.", "نمرهٔ پایه = دریافتی ÷ وزن موجود × 100. پاداش بعد از نسبت‌گیری اضافه می‌شود؛ نمرهٔ نهایی گرد می‌شود و سقف آن 100 است.")}</p>
    <div className="lane-disclosures">
      <details key={`wards:${player.playerSlot}`}><summary><ShieldCheck size={17}/><b>Ward</b><span className="lane-numeric">{number(ward?.points)} / 27</span></summary><div className="lane-detail-body"><p>{text(fa, "First observer: 4 · first sentry: 3. Extra placements, survival and enemy dewards add points. Early observer loss subtracts points.", "اولین Observer: 4 و اولین Sentry: 3 امتیاز. کاشت اضافه، بقا و Deward امتیاز دارند؛ نابودی زودهنگام Observer امتیاز کم می‌کند.")}</p>{ward ? <><div className="lane-detail-totals"><span>{text(fa, "Dewards", "Deward")} <b className="lane-numeric">{number(ward.dewards)}</b></span><span>{text(fa, "Survival points", "امتیاز بقا")} <b className="lane-numeric">+{number(ward.longevity)}</b></span><span>{text(fa, "Early loss", "نابودی زودهنگام")} <b className="lane-numeric">−{number(ward.earlyPenalty)}</b></span></div>{ward.points === null && <p>{text(fa, "A ward's survival could not be verified. Its metric is excluded from the score.", "بقای یک Ward قابل تأیید نیست؛ این معیار از محاسبه کنار گذاشته شده است.")}</p>}<ul>{ward.placements.map((event, i) => <li key={i}><time className="lane-numeric">{time(event.time)}</time><span>{event.type === "obs" ? "Observer" : "Sentry"}</span><span>{text(fa, "Placed", "کاشته شد")}</span></li>)}</ul>{!ward.placements.length && <p>{text(fa, "No placements recorded in this window.", "در این بازه کاشتی ثبت نشده است.")}</p>}</> : <p>{text(fa, "Reliable ward data unavailable.", "دادهٔ قابل‌اتکای Ward موجود نیست.")}</p>}</div></details>
      <details key={`resources:${player.playerSlot}`}><summary><ShoppingBag size={17}/><b>Resources</b><span className="lane-numeric">{number(resources?.points)} / 26</span></summary><div className="lane-detail-body"><p>{text(fa, "Purchase-based scoring includes pre-game inventory. It does not prove item use or delivery to allies.", "امتیاز بر پایهٔ خرید است و موجودی پیش از بازی را هم شامل می‌شود؛ مصرف یا رساندن آیتم به هم‌تیمی را اثبات نمی‌کند.")}</p>{resources ? <><div className="lane-detail-totals">{[["Restoration", resources.restore, 12], ["Vision", resources.vision, 12], ["Smoke", resources.tools, 2]].map(([name, value, cap]) => <span key={name}>{name}<b className="lane-numeric">{number(Number(value))} / {cap}</b></span>)}</div><ul>{resources.purchases.map((event, i) => <li key={i}><time className="lane-numeric">{time(event.time)}</time><span>{event.item.replace(/^item_/, "").replaceAll("_", " ")}</span>{event.charges !== null && <span className="lane-numeric">×{number(event.charges)}</span>}</li>)}</ul>{!resources.purchases.length && <p>{text(fa, "No eligible purchases recorded.", "خرید مرتبطی ثبت نشده است.")}</p>}</> : <p>{text(fa, "Reliable purchase data unavailable.", "دادهٔ قابل‌اتکای خرید موجود نیست.")}</p>}</div></details>
      <details key={`bonus:${player.playerSlot}`}><summary><Sparkles size={17}/><b>Bonus</b><span className="lane-numeric">+{number(lane.bonus)} / 1.5</span></summary><div className="lane-detail-body"><p>{text(fa, "A kill or assist in another lane earns +0.5 only with alive actor and victim replay positions in the same lane, within 2 seconds and about 2,048 world units. Enemy roles and remote assists do not establish a Join. Dust against innate invisibility earns +0.5; combined cap: 1.5.", "Kill یا Assist در لین دیگر فقط با موقعیت زندهٔ خود بازیکن و حریف در یک لین، با فاصلهٔ زمانی حداکثر دو ثانیه و فاصلهٔ مکانی حدود 2048 واحد، +0.5 دارد. نقش حریف یا Assist از راه دور، Join را اثبات نمی‌کند. خرید Dust مقابل invis ذاتی +0.5 دارد؛ سقف مجموع 1.5 است.")}</p>{bonus.unresolvedAssists > 0 && <p className="lane-notice">{text(fa, "Some assist changes could not be attributed to a single enemy death and earn no bonus.", "بعضی Assistها به یک مرگ مشخص قابل انتساب نیستند و پاداش نمی‌گیرند.")}</p>}<ul>{bonus.events.map((event, i) => <li key={i}><time className="lane-numeric">{time(event.time)}</time><span>{event.kind === "dust" ? "Dust" : `${event.kind === "kill" ? "Kill" : "Assist"} · ${players.find(p => p.playerSlot === event.targetSlot)?.heroName ?? "—"}`}{event.lane && ` · ${event.lane}`}</span><span>{event.reason === "join" ? text(fa, "Verified Join", "Join تأییدشده") : event.reason === "detection-purchase" ? text(fa, "Detection purchase", "خرید Detection") : event.reason === "home-lane" ? text(fa, "Home lane", "لین خود بازیکن") : text(fa, "Location unproven", "موقعیت اثبات‌نشده")}</span><b className="lane-numeric">+{number(event.points)}</b></li>)}</ul>{!bonus.events.length && <p>{lane.context.eligible ? text(fa, "No eligible bonus events. Missing location evidence is never guessed.", "رویداد مرتبطی برای پاداش وجود ندارد. موقعیت ناموجود حدس زده نمی‌شود.") : text(fa, "Reliable bonus data unavailable.", "دادهٔ قابل‌اتکای پاداش موجود نیست.")}</p>}</div></details>
    </div>
  </section>;
}
