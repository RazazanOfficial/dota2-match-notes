import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Check, Settings2 } from "lucide-react";
import { apiRequest } from "../api";
import { isPersian, type Messages } from "../i18n";
import { CopyValue } from "./Shared";

type SteamState = "configured" | "missing" | "steam_running" | "unavailable" | "ambiguous";
type SteamStatus = { state: SteamState };

export function CompanionGuide({ t }: { t: Messages }) {
  const fa = isPersian(t);
  return <div className="companion-guide">
    <p>{fa ? "اگر تنظیم خودکار ممکن نبود، در Steam ← Library ← Dota 2 ← Properties ← Launch Options این گزینه را به انتهای گزینه‌های فعلی اضافه کن:" : "If automatic setup is unavailable, append this option to the existing Steam → Library → Dota 2 → Properties → Launch Options:"}</p>
    <CopyValue value="-gamestateintegration -console" t={t}/>
    <small>{fa ? "بعد از ذخیره، بازی را دوباره اجرا کن. دریافت دستی مچ مستقل و فعال است." : "Restart the game after saving. Manual match fetching remains available."}</small>
  </div>;
}

function setupError(code: string, fa: boolean) {
  if (code === "steam_config_changed") return fa ? "Steam تنظیمات را هم‌زمان تغییر داده است. دوباره بررسی کن." : "Steam changed its settings at the same time. Check again.";
  if (code === "steam_process_check_failed") return fa ? "بسته بودن Steam تأیید نشد. Steam را ببند و دوباره بررسی کن." : "Could not confirm Steam is closed. Close it and check again.";
  if (code === "steam_config_invalid") return fa ? "فایل تنظیمات Steam قابل خواندن نیست؛ تغییری انجام نشد." : "Steam settings could not be read; no change was made.";
  if (code === "steam_config_ambiguous") return fa ? "حساب یا فایل تنظیمات Steam مشخص نیست. حساب فعال Steam را بررسی کن." : "The Steam account or settings file is unclear. Check the active account.";
  return fa ? "تنظیم خودکار کامل نشد. تنظیمات Steam را بررسی کن یا از روش دستی استفاده کن." : "Automatic setup did not finish. Check Steam settings or use the manual option.";
}

export function CompanionSetup({ owner, t, compact = false, silent = false }: { owner: string; t: Messages; compact?: boolean; silent?: boolean }) {
  const fa = isPersian(t);
  const [status, setStatus] = useState<{ owner: string; state: SteamState } | null>(null);
  const state = status?.owner === owner ? status.state : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [companionFailed, setCompanionFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const requestVersion = useRef(0), writingOwner = useRef<string | null>(null), currentOwner = useRef(owner);
  currentOwner.current = owner;
  const refresh = useCallback(async () => {
    if (writingOwner.current === owner) return;
    const version = ++requestVersion.current;
    if (!isTauri()) { setStatus({ owner, state: "unavailable" }); return; }
    try {
      const result = await invoke<SteamStatus>("steam_launch_options_status", { steamId: owner });
      if (version === requestVersion.current && currentOwner.current === owner) setStatus({ owner, state: result.state });
    } catch {
      if (version === requestVersion.current && currentOwner.current === owner) setStatus({ owner, state: "unavailable" });
    }
  }, [owner]);

  useEffect(() => {
    let active = true;
    if (!isTauri()) return;
    void (async () => {
      try {
        const enabled = await invoke<boolean>("companion_background_enabled");
        if (!active) return;
        setDisabled(!enabled);
        if (!enabled) { setCompanionFailed(false); return; }
        const deviceId = await invoke<string | null>("companion_status");
        if (!active) return;
        const grant = await apiRequest<{ deviceId: string; steamId: string; token: string | null }>("/api/sync/companion", { method: "POST", body: JSON.stringify(deviceId ? { deviceId } : {}) });
        if (!active) return;
        await invoke("configure_companion", grant);
        if (active) setCompanionFailed(false);
      } catch { if (active) setCompanionFailed(true); }
    })();
    return () => { active = false; };
  }, [owner, attempt]);

  useEffect(() => {
    requestVersion.current++;
    setError("");
    setBusy(false);
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { requestVersion.current++; window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  async function configure() {
    if (busy || !isTauri()) return;
    setBusy(true); setError("");
    writingOwner.current = owner;
    const version = ++requestVersion.current;
    try {
      const result = await invoke<SteamStatus>("configure_steam_launch_options", { steamId: owner });
      if (version === requestVersion.current && currentOwner.current === owner) setStatus({ owner, state: result.state });
    } catch (failure) {
      if (version === requestVersion.current && currentOwner.current === owner) setError(setupError(typeof failure === "string" ? failure : "", fa));
    } finally {
      if (writingOwner.current === owner) writingOwner.current = null;
      if (currentOwner.current === owner) { setBusy(false); if (version === requestVersion.current) void refresh(); }
    }
  }

  async function enableBackground() {
    try {
      await invoke("set_companion_background_enabled", { enabled: true });
      setDisabled(false);
      setAttempt(value => value + 1);
    } catch { setCompanionFailed(true); }
  }

  const configured = state === "configured";
  const message = disabled ? (fa ? "دریافت خودکار روی این دستگاه خاموش است." : "Automatic tracking is off on this device.")
    : configured ? (fa ? "گزینه‌های اجرای Dota 2 تنظیم شدند. دریافت خودکار پس از اجرای بازی جداگانه بررسی می‌شود." : "Dota 2 launch options are set. Automatic tracking is checked separately when the game runs.")
    : state === "steam_running" ? (fa ? "Steam باز است. پس از بسته شدن آن، گزینه‌های ضروری در پس‌زمینه اعمال می‌شوند." : "Steam is running. Required options will be applied in the background after it closes.")
    : state === "ambiguous" ? (fa ? "حساب فعال Steam با حساب این برنامه هماهنگ نیست یا چند محل تنظیمات پیدا شد." : "The active Steam account does not match this app, or multiple settings locations were found.")
    : state === "unavailable" ? (fa ? "تنظیمات Steam در این سیستم پیدا نشد." : "Steam settings were not found on this PC.")
    : state === null ? (fa ? "در حال بررسی گزینهٔ اجرای Dota 2…" : "Checking Dota 2 launch options…")
    : (fa ? "گزینه‌های ضروری Dota 2 در پس‌زمینه بررسی و اعمال می‌شوند." : "Required Dota 2 options are checked and applied in the background.");

  if (silent) return null;
  return <section className={`companion-setup panel ${compact ? "is-compact" : ""} ${configured ? "is-configured" : ""}`} aria-label={fa ? "تنظیم دریافت خودکار مچ" : "Automatic match tracking setup"}>
    <div className="companion-setup-head"><span className="companion-setup-icon">{configured ? <Check size={18}/> : <Settings2 size={18}/>}</span><div><strong>{fa ? "دریافت خودکار مچ" : "Automatic match tracking"}</strong><p role="status">{message}</p></div></div>
    <div className="companion-setup-actions">
      {disabled ? <button className="secondary-button" onClick={() => void enableBackground()}>{fa ? "فعال‌کردن دریافت خودکار" : "Enable automatic tracking"}</button> : <>
        {state === "missing" && <button className="secondary-button" disabled={busy} onClick={() => void configure()}>{busy ? (fa ? "در حال تنظیم…" : "Setting up…") : (fa ? "اعمال اکنون" : "Apply now")}</button>}
        {(state === "steam_running" || state === "ambiguous" || state === "unavailable") && <button className="secondary-button" onClick={() => void refresh()}>{fa ? "بررسی دوباره" : "Check again"}</button>}
      </>}
    </div>
    {error && <p className="companion-setup-error" role="alert">{error}</p>}
    {companionFailed && <p className="companion-setup-error">{fa ? "راه‌اندازی دریافت خودکار کامل نشد. دریافت دستی فعال است." : "Automatic tracking could not start. Manual fetching is available."} <button className="text-button" onClick={() => setAttempt(value => value + 1)}>{fa ? "تلاش دوباره" : "Retry"}</button></p>}
    {(!compact || state === "ambiguous" || state === "unavailable") && <details className="companion-manual"><summary>{fa ? "روش دستی" : "Manual setup"}</summary><CompanionGuide t={t}/></details>}
  </section>;
}
