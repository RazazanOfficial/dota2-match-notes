import { useEffect, useState } from "react";
import { Download, FolderOpen, RefreshCw, Search } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { sampleHistory } from "../history";
import type { HistoryMatch } from "../history";
import { API_ORIGIN, apiRequest, getBearer } from "../api";
import { isPersian, type Messages } from "../i18n";
import { replayNative, playCommand, validReplayId, type ReplayFile, type ReplaySettings } from "../replays";
import { CopyValue } from "./Shared";
import { LoadingView } from "./LoadingView";
import { Position } from "./Workspace";
export function Replay({ t, live = false }: {
    t: Messages;
    live?: boolean;
}) {
    const [tab, setTab] = useState("find"), [id, setId] = useState(""), [searched, setSearched] = useState(""), [settings, setSettings] = useState<ReplaySettings>({ dotaPath: null, replayPath: null }), [files, setFiles] = useState<ReplayFile[]>([]), [busy, setBusy] = useState(""), [bytes, setBytes] = useState(0), [notice, setNotice] = useState(""), [recent, setRecent] = useState<HistoryMatch[]>([]), [queued, setQueued] = useState("");
    const native = replayNative.available();
    const [historyLoading, setHistoryLoading] = useState(live), [nativeLoading, setNativeLoading] = useState(native);
    useEffect(() => {
        if (!live) return;
        const controller = new AbortController(), to = new Date(), from = new Date(to.getTime() - 61 * 86_400_000);
        const params = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), page: "1" });
        void apiRequest<{ rows: HistoryMatch[] }>(`/api/matches/me?${params}`, { signal: controller.signal })
            .then(result => { if (!controller.signal.aborted) setRecent(result.rows.filter(row => validReplayId(row.id))); })
            .catch(failure => { if (!controller.signal.aborted) setNotice(String(failure)); }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
        return () => controller.abort();
    }, [live]);
    useEffect(() => {
        if (!native) return;
        let active = true, unlisten: (() => void) | undefined;
        void Promise.all([replayNative.settings(), replayNative.files()]).then(([value, entries]) => {
            if (active) { setSettings(value); setFiles(entries); }
        }).catch(error => { if (active) setNotice(String(error)); }).finally(() => { if (active) setNativeLoading(false); });
        void replayNative.progress(value => { if (active) setBytes(value.bytes); }).then(stop => { if (active) unlisten = stop; else stop(); }).catch(() => {});
        return () => { active = false; unlisten?.(); };
    }, [native]);
    async function chooseFolder() { setNotice(""); setBusy("folder"); try {
        const value = await replayNative.chooseFolder();
        if (value) {
            setSettings(value);
            setFiles(await replayNative.files());
        }
    }
    catch (e) {
        setNotice(String(e));
    }
    finally {
        setBusy("");
    } }
    async function refresh() { setBusy("refresh"); try {
        setFiles(await replayNative.files());
        setNotice("");
    }
    catch (e) {
        setNotice(String(e));
    }
    finally {
        setBusy("");
    } }
    async function saveArchived(matchId: string) {
        const token = getBearer();
        if (!token) throw new Error("Desktop session expired");
        await replayNative.download(matchId, token, API_ORIGIN);
        setFiles(await replayNative.files());
        setTab("local"); setNotice(t.downloadedReal);
    }
    useEffect(() => {
        if (!live || !queued) return;
        let active = true, checking = false;
        const check = async () => {
            if (checking) return;
            checking = true;
            try {
                const status = await apiRequest<{ archived: boolean; status: string; errorCode?: string }>(`/api/replays/${queued}`);
                if (!active) return;
                if (status.archived) { setQueued(""); await saveArchived(queued); }
                else if (status.status === "failed") { setQueued(""); setNotice(status.errorCode || "Replay processing failed"); }
            } catch (failure) { if (active) { setQueued(""); setNotice(String(failure)); } }
            finally { checking = false; }
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
    } setBusy(matchId); setBytes(0); setNotice(""); try {
        if (live) {
            await apiRequest("/api/replays/lookup", { method: "POST", body: JSON.stringify({ matchId: Number(matchId) }) });
            await apiRequest(`/api/replays/${matchId}`, { method: "POST", body: JSON.stringify({ intent: "download" }) });
            const state = await apiRequest<{ archived: boolean }>(`/api/replays/${matchId}`);
            if (state.archived) await saveArchived(matchId);
            else { setQueued(matchId); setNotice(isPersian(t) ? "ریپلی در صف پردازش است؛ پس از آماده‌شدن ذخیره می‌شود." : "Replay queued. It will be saved when ready."); }
        } else {
            await replayNative.download(matchId);
            setFiles(await replayNative.files());
            setTab("local"); setNotice(t.downloadedReal);
        }
    }
    catch (e) {
        setNotice(String(e));
    }
    finally {
        setBusy("");
    } }
    if (historyLoading || nativeLoading) return <LoadingView t={t}/>;
    return <div className="screen-stack"><div className="page-heading"><h1>{t.replay}</h1></div><section className="panel replay-location"><div><FolderOpen size={20}/><div><strong>{t.dotaFolder}</strong><p className="muted">{settings.dotaPath || t.folderHint}</p></div></div><button className="secondary-button" disabled={!native || !!busy} onClick={chooseFolder}><FolderOpen size={16}/>{t.chooseFolder}</button>{settings.replayPath && <p className="replay-path"><small>{t.replayFolder}</small><bdi>{settings.replayPath}</bdi></p>}{!native && <small className="muted">{t.nativeRequired}</small>}</section><div className="detail-tabs" role="tablist" aria-label={t.replay}><button id="replay-find-tab" role="tab" aria-selected={tab === "find"} aria-controls="replay-panel" className={tab === "find" ? "active" : ""} onClick={() => setTab("find")}>{t.findReplay}</button><button id="replay-local-tab" role="tab" aria-selected={tab === "local"} aria-controls="replay-panel" className={tab === "local" ? "active" : ""} onClick={() => setTab("local")}>{t.localReplays}<small>{files.length}</small></button></div><div role="tabpanel" id="replay-panel" aria-labelledby={`replay-${tab}-tab`} className="screen-stack">
    {tab === "find" && <><section className="panel replay-search"><form onSubmit={e => { e.preventDefault(); if (validReplayId(id))
        setSearched(id); }}><label className="search-box"><Search size={17}/><input inputMode="numeric" aria-label={t.matchId} placeholder="9026000101" value={id} onChange={e => setId(e.target.value.trim())}/></label><button className="primary-button" disabled={!validReplayId(id)}>{t.replaySearch}</button></form>{searched && <div className="replay-result"><CopyValue value={searched} t={t}/><CopyValue value={playCommand(searched)} label={t.playCommand} t={t}/><button className="secondary-button" disabled={!!busy || !!queued} onClick={() => download(searched)}><Download size={16}/>{t.download}</button></div>}</section><section className="panel replay-list"><div className="section-heading"><h2>{t.selectMatch}</h2>{!live && <small className="muted">{t.demoLabel}</small>}</div>{(live ? recent : sampleHistory.slice(0, 8)).map(m => { const h = heroById(m.heroId); return <div className="replay-choice" key={m.id}>{h && <img src={heroImage(h)} alt={h.name} loading="lazy"/>}<Position value={m.position} title={false} t={t}/><CopyValue value={m.id} t={t}/><small>{m.startedAt.slice(0, 10)}</small><CopyValue value={playCommand(m.id)} label={t.playCommand} t={t}/><button className="secondary-button" disabled={!!busy || !!queued} onClick={() => download(m.id)}><Download size={15}/>{t.download}</button></div>; })}{live && !recent.length && <p className="empty-message">{t.noData}</p>}</section></>}
    {tab === "local" && <section className="panel replay-list"><div className="section-heading"><h2>{t.localReplays}</h2><button className="text-button" disabled={!native || !!busy} onClick={refresh}><RefreshCw size={15}/>{t.refresh}</button></div>{files.length ? files.map(file => <article className="local-replay" key={file.matchId}><CopyValue value={file.matchId} t={t}/><span><bdi>{(file.sizeBytes / 1024 / 1024).toFixed(1)} MB · .dem</bdi></span><CopyValue value={playCommand(file.matchId)} label={t.playCommand} t={t}/><small><bdi>{new Date(file.modifiedSeconds * 1000).toLocaleDateString(isPersian(t) ? "fa-IR" : "en-US")}</bdi></small></article>) : <p className="empty-message">{settings.replayPath ? t.noReplays : t.chooseFolder}</p>}</section>}
  </div>{(busy && !["folder", "refresh"].includes(busy) || queued) && <p className="download-progress" aria-live="polite"><Download size={16}/><CopyValue value={queued || busy} t={t}/> · {(bytes / 1024 / 1024).toFixed(1)} MB</p>}<p role="status" className="replay-notice">{notice}</p></div>;
}
