"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RotateCcw } from "lucide-react";

export default function ReplayDownloadAction({ matchId, previewMode = false }: { matchId: string; previewMode?: boolean }) {
  const [state, setState] = useState<"checking" | "ready" | "idle" | "pending" | "failed">(previewMode ? "idle" : "checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    if (previewMode) return;
    try {
      const response = await fetch(`/api/replays/${matchId}`, { cache: "no-store" });
      const body = await response.json() as { archived?: boolean; status?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "وضعیت Replay دریافت نشد");
      setState(body.archived ? "ready" : body.status === "pending" || body.status === "processing" ? "pending" : body.status === "failed" ? "failed" : "idle");
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "بررسی Replay ممکن نیست"); setState("failed"); }
  }, [matchId, previewMode]);
  useEffect(() => { void check(); }, [check]);
  useEffect(() => {
    if (state !== "pending") return;
    const timer = window.setInterval(() => void check(), 5_000);
    return () => window.clearInterval(timer);
  }, [state, check]);
  async function request() {
    if (previewMode) { setState("ready"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/replays/${matchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "download" }) });
      const body = await response.json() as { status?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "درخواست Replay ثبت نشد");
      setState(body.status === "ready" ? "ready" : "pending");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "درخواست Replay ثبت نشد"); setState("failed"); }
    finally { setBusy(false); }
  }
  return <div className="replay-download-action">
    {state === "ready" ? previewMode ? <button className="secondary-button" type="button" onClick={() => setState("idle")}><Download size={18} /> دانلود Replay · #{matchId} (پیش‌نمایش)</button>
      : <a className="secondary-button" href={`/api/replays/${matchId}/file`}><Download size={18} /> دانلود Replay · #{matchId}</a>
      : <button className="secondary-button" type="button" disabled={busy || state === "pending" || state === "checking"} onClick={() => void request()}>
        {state === "pending" || state === "checking" ? <RotateCcw size={18} /> : <Download size={18} />}
        {state === "pending" ? "Replay در صف دانلود است" : state === "checking" ? "بررسی Replay" : busy ? "ثبت درخواست..." : "دریافت Replay"}
      </button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
