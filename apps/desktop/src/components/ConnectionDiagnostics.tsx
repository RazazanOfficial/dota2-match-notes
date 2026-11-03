import { useEffect, useRef, useState } from "react";
import { getConnectionReport } from "../connectionDiagnostics";
import type { Messages } from "../i18n";

async function copyReport(text: string) {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } }
    catch { /* Some WebViews disallow the async clipboard; try a user-gesture copy. */ }
    const previous = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = text; field.readOnly = true; field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(field); field.select();
    try { if (!document.execCommand("copy")) throw new Error("Clipboard unavailable"); }
    finally { field.remove(); previous?.focus(); }
}

export function ConnectionDiagnostics({ t }: { t: Messages }) {
    const [result, setResult] = useState<"copied" | "failed" | null>(null);
    const [copying, setCopying] = useState(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (!result) return;
        const timer = window.setTimeout(() => setResult(null), 5_000);
        return () => window.clearTimeout(timer);
    }, [result]);
    async function copy() {
        setCopying(true); setResult(null);
        try { await copyReport(getConnectionReport()); if (alive.current) setResult("copied"); }
        catch { if (alive.current) setResult("failed"); }
        finally { if (alive.current) setCopying(false); }
    }
    return <section className="panel settings-panel">
        <h2>{t.connectionDiagnostics}</h2>
        <p className="muted">{t.connectionDiagnosticsDetail}</p>
        <button type="button" className="secondary-button" disabled={copying} onClick={() => void copy()}>{t.copyConnectionReport}</button>
        {result && <p role="status">{result === "copied" ? t.connectionReportCopied : t.connectionReportCopyFailed}</p>}
    </section>;
}
