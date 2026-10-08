import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, RefreshCw, Search } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { sampleHistory } from "../history";
import type { HistoryMatch } from "../history";
import { cachedRead } from "../offlineCache";
import { API_ORIGIN, apiRequest, getBearer } from "../api";
import { isPersian, type Messages } from "../i18n";
import { replayNative, playCommand, validReplayId, type ReplayFile, type ReplaySettings } from "../replays";
import { CopyValue } from "./Shared";
import { ReplaySetupGuide } from "./ReplaySetupGuide";
import { connectionState } from "../connection";
import { Position } from "./Workspace";
import { errorCode, ErrorNotice } from "./ErrorNotice";
export function Replay({ t, live = false }: {
    t: Messages;
    live?: boolean;
}) {
    const end = new Date(), start = new Date(end.getTime()-61*86400000);
    const historyPath = `/api/matches/me?${new URLSearchParams({from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10),page:"1"})}`;
    const [tab, setTab] = useState("find"), [id, setId] = useState(""), [searched, setSearched] = useState(""), [settings, setSettings] = useState<ReplaySettings>({ dotaPath: null, replayPath: null }), [files, setFiles] = useState<ReplayFile[]>([]), [busy, setBusy] = useState(""), [bytes, setBytes] = useState(0), [notice, setNotice] = useState(""), [recent, setRecent] = useState<HistoryMatch[]>(()=>cachedRead<{rows:HistoryMatch[]}>(historyPath)?.rows || []), [queued, setQueued] = useState("");
    const [error, setError] = useState<unknown>(null);
    const native = replayNative.available();
    const transfer = useRef("");
    const mounted = useRef(true);
    useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
    const [historyLoading, setHistoryLoading] = useState(live), [nativeLoading, setNativeLoading] = useState(native);
    useEffect(() => {
        if (!live) return;
        const controller = new AbortController(), to = new Date(), from = new Date(to.getTime() - 61 * 86_400_000);
        const params = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), page: "1" });
        void apiRequest<{ rows: HistoryMatch[] }>(`/api/matches/me?${params}`, { signal: controller.signal })
            .then(result => { if (!controller.signal.aborted) setRecent(result.rows.filter(row => validReplayId(row.id))); })
            .catch(failure => { if (!controller.signal.aborted) setError(failure); }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
        return () => controller.abort();
    }, [live]);
    useEffect(() => {
        if (!native) return;
        let active = true, unlisten: (() => void) | undefined;
        void replayNative.settings().then(async value => {
            if (active) setSettings(value);
            const entries = await replayNative.files();
            if (active) setFiles(entries);
        }).catch(error => { if (active) setError(error); }).finally(() => { if (active) setNativeLoading(false); });
        void replayNative.progress(value => { if (active && value.matchId === transfer.current) setBytes(value.bytes); }).then(stop => { if (active) unlisten = stop; else stop(); }).catch(() => {});
        return () => { active = false; unlisten?.(); };
    }, [native]);
    async function chooseFolder() { setNotice(""); setError(null); setBusy("folder"); try {
        const value = await replayNative.chooseFolder();
        if (value) {
            setSettings(value);
            setFiles(await replayNative.files());
        }
    }
    catch (e) {
        setError(e);
    }
    finally {
        setBusy("");
    } }
    async function refresh() { setBusy("refresh"); try {
        setFiles(await replayNative.files());
        setNotice(""); setError(null);
    }
    catch (e) {
        setError(e);
    }
    finally {
        setBusy("");
    } }
    async function saveArchived(matchId: string) {
        const token = getBearer();
        if (!token) throw {code:"unauthorized"};
        transfer.current=matchId; setBusy(matchId); setBytes(0);
        await replayNative.download(matchId, token, API_ORIGIN);
        const entries=await replayNative.files();
        if (mounted.current) { setFiles(entries); setTab("local"); setNotice(t.downloadedReal); }
    }
    useEffect(() => {
        if (!live || !queued) return;
        let active = true, checking = false;
        const check = async () => {
            if (checking || connectionState()==="offline") return;
            checking = true; let saving = false;
            try {
                const status = await apiRequest<{ archived: boolean; status: string; errorCode?: string }>(`/api/replays/${queued}`);
                if (!active) return;
                if (status.archived) {
                    // Keep the queue lock while the native transfer runs; changing
                    // the folder or starting a second download must stay disabled.
                    saving = true; setError(null);
                    await saveArchived(queued);
                    if (active) setQueued("");
                }
                else if (status.status === "failed") { setQueued(""); setError({ code: status.errorCode }); }
            } catch (failure) { if (active) {
                if (saving || errorCode(failure)==="unauthorized") setQueued("");
                setError(failure);
            } }
            finally { checking = false; if (active) { setBusy(""); transfer.current=""; } }
        };
        void check(); const timer = setInterval(() => void check(), 10_000);
        return () => { active = false; clearInterval(timer); };
    }, [live, queued]);
    async function download(matchId: string) { if (busy || queued)
        return; if (!native) {
        setNotice(t.nativeRequired);
        return;
    } if (!settings.replayPath) {
        setNotice(t.chooseFolder);
        return;
    } if (!live) { setNotice(t.nativeRequired); return; }
    if (connectionState()==="offline") { setError({code:"offline_mode"}); return; }
    transfer.current=matchId; setBusy(matchId); setBytes(0); setNotice(""); setError(null); try {
        await apiRequest("/api/replays/lookup", { method: "POST", body: JSON.stringify({ matchId: Number(matchId) }) });
        await apiRequest(`/api/replays/${matchId}`, { method: "POST", body: JSON.stringify({ intent: "download" }) });
        const state = await apiRequest<{ archived: boolean }>(`/api/replays/${matchId}`);
        if (state.archived) await saveArchived(matchId);
        else { setQueued(matchId); setNotice(isPersian(t) ? "ریپلی در صف پردازش است؛ پس از آماده‌شدن ذخیره می‌شود." : "Replay queued. It will be saved when ready."); }
    }
    catch (e) {
        setError(e);
    }
    finally {
        if (mounted.current) setBusy("");
        transfer.current="";
    } }

    return <div className="screen-stack"><div className="page-heading"><h1>{t.replay}</h1></div>{!!error && <ErrorNotice error={error} t={t}/>}<section className="panel replay-location"><div className="replay-folder-name"><FolderOpen size={20}/><div><strong>{t.dotaFolder}</strong>{settings.dotaPath ? <bdi>{settings.dotaPath}</bdi> : <p className="muted">{t.folderHint}</p>}</div></div><div className="replay-location-actions"><ReplaySetupGuide t={t} onChoose={()=>void chooseFolder()} disabled={!native || !!busy || !!queued}/><button className="secondary-button" disabled={!native || !!busy || !!queued || nativeLoading} onClick={chooseFolder}><FolderOpen size={16}/>{isPersian(t) ? "بازکردن پوشه" : "Open folder"}</button></div>{settings.replayPath && <p className="replay-path"><small>{t.replayFolder}</small><bdi>{settings.replayPath}</bdi></p>}{!native && <small className="muted">{t.nativeRequired}</small>}</section><div className="detail-tabs" role="tablist" aria-label={t.replay}><button id="replay-find-tab" role="tab" aria-selected={tab === "find"} aria-controls="replay-panel" className={tab === "find" ? "active" : ""} onClick={() => setTab("find")}>{t.findReplay}</button><button id="replay-local-tab" role="tab" aria-selected={tab === "local"} aria-controls="replay-panel" className={tab === "local" ? "active" : ""} onClick={() => setTab("local")}>{t.localReplays}<small>{files.length}</small></button></div><div role="tabpanel" id="replay-panel" aria-labelledby={`replay-${tab}-tab`} className="screen-stack">
    {tab === "find" && <><section className="panel replay-search"><form onSubmit={e => { e.preventDefault(); if (validReplayId(id))
        setSearched(id); }}><label className="search-box"><Search size={17}/><input inputMode="numeric" aria-label={t.matchId} placeholder="9026000101" value={id} onChange={e => setId(e.target.value.trim())}/></label><button className="primary-button" disabled={!validReplayId(id)}>{t.replaySearch}</button></form>{searched && <div className="replay-result"><CopyValue value={searched} t={t}/><CopyValue value={playCommand(searched)} label={t.playCommand} t={t}/><button className="secondary-button" disabled={!!busy || !!queued} onClick={() => download(searched)}><Download size={16}/>{t.download}</button></div>}</section><section className="panel replay-list"><div className="section-heading"><h2>{t.selectMatch}</h2>{!live && <small className="muted">{t.demoLabel}</small>}</div>{(live ? recent : sampleHistory.slice(0, 8)).map(m => { const h = heroById(m.heroId); return <div className="replay-choice" key={m.id}>{h && <img src={heroImage(h)} alt={h.name} loading="lazy"/>}<Position value={m.position} title={false} t={t} analyzed={m.analyzed}/><CopyValue value={m.id} t={t}/><small>{m.startedAt.slice(0, 10)}</small><CopyValue value={playCommand(m.id)} label={t.playCommand} t={t}/><button className="secondary-button" disabled={!!busy || !!queued} onClick={() => download(m.id)}><Download size={15}/>{t.download}</button></div>; })}{live && !recent.length && <p className="empty-message">{historyLoading ? t.loading : t.noData}</p>}</section></>}
    {tab === "local" && <section className="panel replay-list"><div className="section-heading"><h2>{t.localReplays}</h2><button className="text-button" disabled={!native || !!busy || !!queued} onClick={refresh}><RefreshCw size={15}/>{t.refresh}</button></div>{files.length ? files.map(file => <article className="local-replay" key={file.matchId}><CopyValue value={file.matchId} t={t}/><span><bdi>{(file.sizeBytes / 1024 / 1024).toFixed(1)} MB · .dem</bdi></span><CopyValue value={playCommand(file.matchId)} label={t.playCommand} t={t}/><small><bdi>{new Date(file.modifiedSeconds * 1000).toLocaleDateString(isPersian(t) ? "fa-IR" : "en-US")}</bdi></small></article>) : <p className="empty-message">{nativeLoading ? t.loading : settings.replayPath ? t.noReplays : t.chooseFolder}</p>}</section>}
  </div>{(busy && !["folder", "refresh"].includes(busy) || queued) && <section className="panel replay-transfer" role="status" aria-live="polite"><i className="signal-dot"/><div><strong>{busy && !["folder","refresh"].includes(busy) ? (isPersian(t) ? "درحال ذخیرهٔ ریپلی" : "Saving replay") : (isPersian(t) ? "آماده‌سازی ریپلی" : "Preparing replay")}</strong><small><bdi>{(bytes / 1024 / 1024).toFixed(1)} MB</bdi> · {isPersian(t) ? "فایل .dem روی سیستم شما" : "Local .dem file"}</small></div><CopyValue value={queued || busy} t={t}/></section>}<p role="status" className="replay-notice">{notice}</p></div>;
}
