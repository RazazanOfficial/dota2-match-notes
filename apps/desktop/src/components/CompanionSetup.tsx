import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { apiRequest } from "../api";
import { isPersian, type Messages } from "../i18n";
import { CopyValue } from "./Shared";
export function CompanionGuide({ t }: { t: Messages }) {
  const fa = isPersian(t);
  return (
    <div className="companion-guide">
      <p>
        {fa
          ? "برای دریافت مچ با پنجره بسته، این گزینه باید یک بار در Steam ← Library ← Dota 2 ← Properties ← Launch Options اضافه شود. گزینه های قبلی خودت را نگه دار و سپس بازی را دوباره اجرا کن."
          : "To track matches while this window is closed, add this once in Steam → Library → Dota 2 → Properties → Launch Options. Keep your existing options, then restart the game."}
      </p>
      <CopyValue value="-gamestateintegration" t={t} />
      <small>
        {fa
          ? "دکمه اجرای Dota در این برنامه، این گزینه را برای همان اجرا ارسال می کند."
          : "The launch button in this app supplies this option for that launch."}
      </small>
    </div>
  );
}
export function CompanionSetup({ owner, t }: { owner: string; t: Messages }) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(
    () => localStorage.getItem(`dota-notes.companion-guide.${owner}`) === "1",
  );
  const fa = isPersian(t);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void (async () => {
      try {
        const deviceId = await invoke<string | null>("companion_status");
        if (!active) return;
        const grant = await apiRequest<{
          deviceId: string;
          steamId: string;
          token: string | null;
        }>("/api/sync/companion", {
          method: "POST",
          body: JSON.stringify(deviceId ? { deviceId } : {}),
        });
        if (!active) return;
        await invoke("configure_companion", grant);
        const health = await invoke<{
          steamId: string;
          lastSeenAt: number;
        } | null>("companion_health");
        if (active) {
          setReady(true);
          if (
            health?.steamId === owner &&
            Date.now() - health.lastSeenAt < 600000
          )
            setAcknowledged(true);
        }
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [owner, attempt]);
  if (!failed && (!ready || acknowledged)) return null;
  return (
    <section className="companion-notice" role="status">
      {failed ? (
        <>
          <span>
            {fa
              ? "راه اندازی دریافت خودکار کامل نشد. دریافت دستی همچنان در دسترس است."
              : "Automatic match tracking could not start. Manual sync remains available."}
          </span>
          <button
            className="secondary-button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {fa ? "تلاش مجدد" : "Retry"}
          </button>
        </>
      ) : (
        <>
          <CompanionGuide t={t} />
          <button
            aria-label={t.close}
            onClick={() => {
              localStorage.setItem(`dota-notes.companion-guide.${owner}`, "1");
              setAcknowledged(true);
            }}
          >
            <X size={16} />
          </button>
        </>
      )}
    </section>
  );
}
