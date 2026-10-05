"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import ReplayProgressView from "./ReplayProgressView";
import type { ReplayProgress } from "@/lib/replay/progress";

export default function ReplayDownloadAction({ matchId, previewMode = false }: { matchId: string; previewMode?: boolean }) {
  const [state, setState] = useState<"checking" | "ready" | "idle" | "pending" | "failed">(previewMode ? "idle" : "checking");
  const [progress, setProgress] = useState<ReplayProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setState(previewMode ? "idle" : "checking");
    setProgress(null); setError("");
  }, [matchId, previewMode]);
  const check = useCallback(async (signal?: AbortSignal) => {
    if (previewMode) return;
    try {
      const response = await fetch(`/api/replays/${matchId}`, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const body = await response.json() as { progress?: ReplayProgress | null; archived?: boolean; status?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "وضعیت Replay دریافت نشد");
      if (signal?.aborted) return;
      setProgress(body.progress || null);
      setState(body.archived ? "ready" : body.status === "pending" || body.status === "processing" ? "pending" : body.status === "failed" ? "failed" : "idle");
      setError("");
    } catch (reason) { if (signal?.aborted) return; setError(reason instanceof Error ? reason.message : "بررسی Replay ممکن نیست"); }
  }, [matchId, previewMode]);
  useEffect(() => {
    if (previewMode) return;
    const controller = new AbortController(); let timer: number;
    const poll = async () => {
      if (document.visibilityState === "visible") await check(controller.signal);
      if (!controller.signal.aborted) timer = window.setTimeout(() => void poll(), state === "pending" ? 5000 : 30000);
    };
    if (["ready", "idle", "failed"].includes(state)) return;
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [check, state, previewMode]);
  async function request() {
    if (previewMode) { setState("ready"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/replays/${matchId}`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "download" }) });
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
    {state !== "ready" && <ReplayProgressView progress={progress} />}
    {error && <small role="alert">{error}</small>}
  </div>;
}
