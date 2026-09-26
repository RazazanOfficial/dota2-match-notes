"use client";

import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import type { Match } from "@/lib/types";
import MatchAnalysisPanel from "./MatchAnalysisPanel";
import ReplayDownloadAction from "./ReplayDownloadAction";

type Lookup = { matchId: number; startedAt: string; duration: number; radiantWin: boolean; radiantScore?: number | null; direScore?: number | null; heroId: number | null; heroName: string | null };
export default function ReplayLookup({ previewMode = false }: { previewMode?: boolean }) {
  const [input, setInput] = useState("");
  const [found, setFound] = useState<Lookup | null>(previewMode ? { matchId: 9015934336, startedAt: "2026-09-25T12:00:00Z", duration: 2480, radiantWin: true, radiantScore: 41, direScore: 28, heroId: 85, heroName: "Undying" } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event: FormEvent) {
    event.preventDefault(); setFound(null); setError("");
    const matchId = Number(input.trim());
    if (!/^\d{1,16}$/.test(input.trim()) || !Number.isSafeInteger(matchId) || matchId <= 0) { setError("Match ID معتبر وارد کنید"); return; }
    if (previewMode) { setFound({ matchId, startedAt: "2026-09-25T12:00:00Z", duration: 2480, radiantWin: true, radiantScore: 41, direScore: 28, heroId: 85, heroName: "Undying" }); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/replays/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId }) });
      const body = await response.json() as { match?: Lookup; error?: { message?: string } };
      if (!response.ok || !body.match) throw new Error(body.error?.message || "مچ پیدا نشد");
      setFound(body.match);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "جست‌وجوی مچ ممکن نیست"); }
    finally { setBusy(false); }
  }
  const match: Match | null = found ? {
    id: `replay-${found.matchId}`, dotaMatchId: String(found.matchId), startedAt: found.startedAt,
    durationSeconds: found.duration, number: 1, heroId: found.heroId, heroName: found.heroName || "",
    bans: [], picks: [], role: "", queueType: "", notes: "", positivePoints: [], negativePoints: [],
    result: found.radiantWin ? "win" : "loss", createdAt: found.startedAt,
  } : null;
  return <main className="replay-page app-shell">
    <header className="replay-page-header"><a href="/" className="secondary-button">بازگشت به ژورنال</a><h1>جست‌وجو و دانلود Replay</h1><p>Match ID را وارد کنید؛ سپس Replay را دانلود یا تحلیل بازی را جداگانه درخواست کنید.</p></header>
    <form onSubmit={(event) => void search(event)} className="replay-search-form">
      <label htmlFor="replay-match-id">Match ID</label>
      <input id="replay-match-id" inputMode="numeric" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} placeholder="مثلاً 9015934336" />
      <button type="submit" className="primary-button" disabled={busy}><Search size={18} /> {busy ? "در حال جست‌وجو" : "پیدا کردن مچ"}</button>
    </form>
    {error && <p role="alert" className="replay-page-error">{error}</p>}
    {match && found && <section className="replay-result">
      <h2>Match #{found.matchId}</h2>
      <p>{new Date(found.startedAt).toLocaleString("fa-IR")} · {Math.round(found.duration / 60)} دقیقه · {found.radiantScore ?? "?"} – {found.direScore ?? "?"}</p>
      {found.heroName && <p>Hero شما: {found.heroName}</p>}
      <ReplayDownloadAction key={found.matchId} matchId={String(found.matchId)} previewMode={previewMode} />
      <h2>Performance</h2>
      {previewMode ? <p>در نسخهٔ واقعی، با درخواست «تحلیل مچ»، Parse آغاز می‌شود و Performance اینجا نمایش داده می‌شود.</p>
        : <MatchAnalysisPanel key={found.matchId} match={match} active canRequestAnalysis analysisEndpoint={`/api/replays/${found.matchId}/analysis`} />}
    </section>}
  </main>;
}
