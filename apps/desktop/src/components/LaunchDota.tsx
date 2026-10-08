import { useState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { isPersian, type Messages } from "../i18n";
import { replayNative } from "../replays";
import { ErrorNotice } from "./ErrorNotice";

export function LaunchDota({ t }: { t: Messages }) {
    const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
    const [sent, setSent] = useState(false), fa = isPersian(t);
    async function launch() {
        if (busy) return;
        setBusy(true); setError(null); setSent(false);
        try { await replayNative.launchDota(); setSent(true); }
        catch (failure) { setError(failure); }
        finally { setBusy(false); }
    }
    return <div className="launch-dota-area"><button className="launch-dota" disabled={busy || !replayNative.available()} onClick={()=>void launch()} title={fa ? "اجرای دوتا از طریق استیم" : "Launch Dota through Steam"}><img src="/logo.png" alt=""/><span>{fa ? "اجرای دوتا ۲" : "Launch Dota 2"}</span>{busy ? <LoaderCircle size={16} className="spin"/> : <ArrowUpRight size={16}/>}</button>{sent && <small role="status">{fa ? "درخواست اجرا به استیم ارسال شد." : "Launch request sent to Steam."}</small>}{!!error && <ErrorNotice error={error} t={t}/>}</div>;
}
