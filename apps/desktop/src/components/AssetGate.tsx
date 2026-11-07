import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, RefreshCw, Check } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
type Progress = {
  bytes: number;
  totalBytes: number;
  complete: number;
  total: number;
};
export function AssetGate({
  children,
  t,
}: {
  children: ReactNode;
  t: Messages;
}) {
  const [ready, setReady] = useState(!isTauri()),
    [progress, setProgress] = useState<Progress | null>(null),
    [failure, setFailure] = useState(false),
    [attempt, setAttempt] = useState(0);
  const fa = isPersian(t);
  const meter = useRef({ at: 0, bytes: 0 });
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let stop: (() => void) | undefined;
    void (async () => {
      try {
        stop = await listen<Progress>("asset-progress", (event) => {
          if (active) {
            const now = Date.now(),
              elapsed = now - meter.current.at;
            if (elapsed >= 500) {
              setSpeed(
                (Math.max(0, event.payload.bytes - meter.current.bytes) *
                  1000) /
                  elapsed,
              );
              meter.current = { at: now, bytes: event.payload.bytes };
            }
            setProgress((previous) => ({
              ...event.payload,
              bytes: Math.max(previous?.bytes || 0, event.payload.bytes),
              complete: Math.max(
                previous?.complete || 0,
                event.payload.complete,
              ),
            }));
          }
        });
        if (!active) {
          stop();
          return;
        }
        const current = await invoke<Progress>("asset_status");
        if (!active) return;
        setProgress(current);
        meter.current = { at: Date.now(), bytes: current.bytes };
        if (current.complete !== current.total) await invoke("prepare_assets");
        if (active) setReady(true);
      } catch {
        if (active) setFailure(true);
      }
    })();
    return () => {
      active = false;
      stop?.();
    };
  }, [attempt]);
  if (ready) return children;
  const percent =
    progress && progress.totalBytes
      ? Math.floor((progress.bytes / progress.totalBytes) * 100)
      : 0;
  return (
    <main className="asset-gate" dir={fa ? "rtl" : "ltr"}>
      <section className="asset-gate-card">
        <img src="/logo.png" alt="Dota Notes" />
        <p className="eyebrow">DOTA NOTES</p>
        <h1>{fa ? "آماده سازی فضای بازی تو" : "Preparing your workspace"}</h1>
        <p>
          {failure
            ? fa
              ? "دریافت فایل ها کامل نشد. فایل های سالم حفظ شده اند؛ می توانی دوباره ادامه بدهی."
              : "The download paused. Verified files are safe; retry to continue."
            : fa
              ? "تصاویر و فایل های برنامه دریافت می شوند. این مرحله فقط برای فایل های مورد نیاز انجام می شود."
              : "Downloading your visual library. Existing verified files are reused."}
        </p>
        <div className="asset-gate-progress">
          <Download size={20} />
          <progress value={progress ? percent : undefined} max={100} />
          <bdi>{percent}%</bdi>
        </div>
        <div className="asset-gate-metrics">
          <bdi>
            {speed > 0 ? `${(speed / 1048576).toFixed(1)} MB/s · ` : ""}
            {((progress?.bytes || 0) / 1048576).toFixed(1)} /{" "}
            {((progress?.totalBytes || 0) / 1048576).toFixed(1)} MB
          </bdi>
          <span>
            <Check size={14} />
            <bdi>
              {progress?.complete || 0} / {progress?.total || 0}
            </bdi>
          </span>
        </div>
        {failure && (
          <button
            className="primary-button"
            onClick={() => {
              setFailure(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RefreshCw size={16} />
            {fa ? "ادامه دریافت" : "Resume download"}
          </button>
        )}
      </section>
    </main>
  );
}
