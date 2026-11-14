import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CheckCircle2, RotateCw } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { ApiError, apiRequest } from "../api";
import catalog from "../../shared/launch-options.json";

type SteamStatus = {
  state: "configured" | "missing" | "steam_running" | "unavailable";
  optional: boolean[];
  desired: boolean[] | null;
};
type CompanionRuntime = {
  configured: boolean;
  taskRegistered: boolean;
  listenerActive: boolean;
  lastGsiAt: number | null;
};

function setupIssue(failure: unknown, fa: boolean) {
  if (failure instanceof ApiError) {
    const detail = `API ${failure.status}${failure.code ? ` · ${failure.code}` : ""}`;
    return fa ? `ثبت دریافت خودکار در سرور انجام نشد (${detail}).` : `Server registration failed (${detail}).`;
  }
  const code = typeof failure === "string" && /^[a-z_]+$/.test(failure) ? failure : "companion_setup_failed";
  return fa ? `راه‌اندازی Companion در ویندوز کامل نشد (${code}).` : `Windows Companion setup failed (${code}).`;
}

const extras = catalog.options;

export function LaunchOptionsPage({ owner, t }: { owner: string; t: Messages }) {
  const fa = isPersian(t);
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [selected, setSelected] = useState<boolean[]>(() => extras.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setupError, setSetupError] = useState("");
  const [backgroundEnabled, setBackgroundEnabled] = useState<boolean | null>(null);
  const [runtime, setRuntime] = useState<CompanionRuntime | null>(null);

  async function refresh() {
    if (!isTauri()) return;
    try {
      const [result, enabled, current] = await Promise.all([
        invoke<SteamStatus>("steam_launch_options_status", { steamId: "" }),
        invoke<boolean>("companion_background_enabled"),
        invoke<CompanionRuntime>("companion_runtime_status"),
      ]);
      setStatus(result);
      setSelected(result.desired || result.optional);
      setBackgroundEnabled(enabled);
      setRuntime(current);
      setError("");
    } catch {
      setError(fa ? "خواندن تنظیمات Steam ممکن نشد." : "Could not read Steam settings.");
    }
  }
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [owner]);

  async function setupBackground() {
    const deviceId = await invoke<string | null>("companion_status");
    const grant = await apiRequest<{ deviceId: string; steamId: string; token: string | null }>(
      "/api/sync/companion", { method: "POST", body: JSON.stringify(deviceId ? { deviceId } : {}) });
    await invoke("configure_companion", grant);
  }

  async function retryBackground() {
    if (busy || !isTauri() || !backgroundEnabled) return;
    setBusy(true); setSetupError("");
    try {
      await setupBackground();
      await refresh();
    } catch (failure) {
      await refresh();
      setSetupError(setupIssue(failure, fa));
    } finally { setBusy(false); }
  }

  function toggle(index: number) {
    setSelected(current => {
      const next = [...current];
      next[index] = !next[index];
      if (next[index]) extras.forEach((option, other) => {
        if (other !== index && (extras[index].conflictsWith.includes(option.id) ||
          option.conflictsWith.includes(extras[index].id))) next[other] = false;
      });
      return next;
    });
  }

  async function apply() {
    if (busy || !isTauri()) return;
    setBusy(true); setError("");
    try {
      const result = await invoke<SteamStatus>("configure_steam_launch_options", {
        steamId: owner, optional: selected,
      });
      setStatus(result);
    } catch {
      setError(fa ? "ذخیرهٔ Launch Options ممکن نشد. تنظیمات Steam را بررسی کن." : "Could not save Launch Options. Check your Steam settings.");
    } finally { setBusy(false); }
  }

  async function toggleBackground() {
    if (busy || backgroundEnabled === null) return;
    setBusy(true); setSetupError("");
    try {
      if (backgroundEnabled) {
        await invoke("set_companion_background_enabled", { enabled: false });
        setBackgroundEnabled(false);
      } else {
        await invoke("set_companion_background_enabled", { enabled: true });
        await setupBackground();
        setBackgroundEnabled(true);
      }
      await refresh();
    } catch (failure) {
      setSetupError(setupIssue(failure, fa));
      setBackgroundEnabled(await invoke<boolean>("companion_background_enabled").catch(() => null));
    } finally { setBusy(false); }
  }

  const pending = status?.state === "steam_running" ||
    status?.desired?.some((enabled, index) => enabled !== status.optional[index]);
  return <div className="screen-stack launch-options-page">
    <div className="page-heading"><div><p className="eyebrow">DOTA 2</p>
      <h1>Launch Options</h1>
      <p>{fa ? "گزینه‌های اجرای Dota 2 برای حساب‌های Steam این دستگاه" : "Dota 2 launch options for Steam accounts on this device"}</p>
    </div></div>
    <section className="panel launch-options-panel">
      <h2>{fa ? "گزینه‌های ضروری" : "Required options"}</h2>
      <p>{fa ? "برنامه این دو گزینه را برای حساب‌های ثبت‌شده به‌صورت خودکار نگه می‌دارد." : "The app keeps these options enabled for registered accounts automatically."}</p>
      <div className="launch-options-grid">
        <div className="launch-option is-required"><CheckCircle2 size={18}/><div><strong>-gamestateintegration</strong><small>{fa ? "دریافت رویداد پایان بازی" : "Receive game completion events"}</small></div></div>
        <div className="launch-option is-required"><CheckCircle2 size={18}/><div><strong>-console</strong><small>{fa ? "کنسول مورد نیاز Replay" : "Console used by Replay"}</small></div></div>
      </div>
    </section>
    <section className="panel launch-options-panel">
      <h2>{fa ? "گزینه‌های دلخواه" : "Optional settings"}</h2>
      <p>{fa ? "گزینه‌های دیگر Steam حفظ می‌شوند. تمام‌صفحه و پنجره‌ای را نمی‌توان هم‌زمان انتخاب کرد." : "Other Steam options stay untouched. Fullscreen and windowed modes are mutually exclusive."}</p>
      <div className="launch-options-grid">{extras.map((item, index) =>
        <label className="launch-option" key={item.flag}>
          <input type="checkbox" checked={selected[index]} onChange={() => toggle(index)}/>
          <div><strong>{item.flag}</strong><small>{fa ? item.fa : item.en}</small></div>
        </label>)}</div>
      <div className="launch-options-actions">
        <button className="primary-button" onClick={() => void apply()} disabled={busy || !isTauri()}>{busy ? (fa ? "در حال اعمال…" : "Applying…") : (fa ? "اعمال گزینه‌ها" : "Apply options")}</button>
        <button className="secondary-button" onClick={() => void refresh()} disabled={busy}><RotateCw size={15}/>{fa ? "بررسی دوباره" : "Check again"}</button>
      </div>
      {pending && <p role="status">{fa ? "تنظیمات ذخیره شد و در اولین فرصت پس از بسته شدن Steam اعمال می‌شود. بازیِ باز قطع نخواهد شد." : "Saved. Options will be applied when Steam closes. A running game will continue."}</p>}
      {status?.state === "unavailable" && <p role="status">{fa ? "فایل تنظیمات Dota 2 در Steam این دستگاه پیدا نشد." : "Dota 2 Steam settings were not found on this device."}</p>}
      {error && <p role="alert" className="companion-setup-error">{error}</p>}
    </section>
    <section className="panel launch-options-panel">
      <h2>{fa ? "دریافت خودکار روی این دستگاه" : "Automatic tracking on this device"}</h2>
      <p>{fa ? "Companion پس از ورود به ویندوز در پس‌زمینه اجرا می‌شود. بستن برنامه یا خروج از حساب آن را متوقف نمی‌کند." : "Companion runs in the background after Windows sign-in. Closing the app or signing out does not stop it."}</p>
      <div className="launch-options-runtime" role="status">
        <span>Task Scheduler: <strong>{runtime === null ? (fa ? "در حال بررسی" : "Checking") : runtime.taskRegistered ? (fa ? "ثبت شده" : "Registered") : (fa ? "ثبت نشده" : "Not registered")}</strong></span>
        <span>{fa ? "دریافت‌کنندهٔ GSI" : "GSI listener"}: <strong>{runtime === null ? (fa ? "در حال بررسی" : "Checking") : runtime.listenerActive ? (fa ? "فعال" : "Active") : (fa ? "اجرا نمی‌شود" : "Not running")}</strong></span>
        <span>{fa ? "گزینه‌های ضروری" : "Required options"}: <strong>{status?.state === "configured" ? (fa ? "در فایل Steam وجود دارند" : "Present in Steam settings") : status?.state === "steam_running" ? (fa ? "پس از بستن Steam بررسی می‌شوند" : "Checked after Steam closes") : (fa ? "تأیید نشده‌اند" : "Not verified")}</strong></span>
        <span>{fa ? "آخرین پیام GSI" : "Last GSI message"}: <strong>{runtime?.lastGsiAt ? new Intl.DateTimeFormat(fa ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(runtime.lastGsiAt) : (fa ? "هنوز ثبت نشده" : "None recorded")}</strong></span>
      </div>
      <p>{fa ? "دو گزینهٔ ضروری هر ۱۰ دقیقه بررسی می‌شوند و وقتی Steam بسته باشد، در صورت نیاز اضافه می‌شوند. ثبت بودن task و فعال بودن دریافت‌کننده، دریافت واقعی پیام از بازی را ثابت نمی‌کند." : "Required options are checked every 10 minutes and added when needed while Steam is closed. A registered task and active listener do not prove the game has sent a message."}</p>
      <div className="launch-options-actions"><button className="secondary-button" disabled={busy || backgroundEnabled === null}
        onClick={() => void toggleBackground()}>{backgroundEnabled ? (fa ? "خاموش‌کردن دریافت خودکار" : "Turn off automatic tracking") : (fa ? "فعال‌کردن دریافت خودکار" : "Turn on automatic tracking")}</button>
        {backgroundEnabled && (!runtime?.taskRegistered || !runtime.listenerActive) && <button className="secondary-button" disabled={busy} onClick={() => void retryBackground()}>{fa ? "تلاش دوباره برای راه‌اندازی" : "Retry setup"}</button>}</div>
      {setupError && <p role="alert" className="companion-setup-error">{setupError}</p>}
    </section>
  </div>;
}
