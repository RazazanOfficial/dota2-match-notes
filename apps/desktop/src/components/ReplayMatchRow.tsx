import { CircleHelp, Download, Film } from "lucide-react";
import { heroById, heroImage } from "@/data/heroes";
import { durationText, type HistoryMatch } from "../history";
import { type Messages } from "../i18n";
import { playCommand, type ReplayFile } from "../replays";
import { CopyValue } from "./Shared";
import { ModeIcon, Position, Score } from "./Workspace";

export interface ReplayMatchInfo {
    matchId: number | string;
    heroId: number | null;
    won: boolean | null;
    position: number | null;
    score: number | null;
    analyzed: boolean;
    mode: string | null;
    duration: number | null;
    startedAt: string | null;
}
export const replayInfoFromHistory = (row: HistoryMatch): ReplayMatchInfo => ({
    matchId: row.id, heroId: row.heroId || null, won: row.won, position: row.position || null,
    score: row.score, analyzed: row.analyzed, mode: row.mode, duration: row.duration, startedAt: row.startedAt,
});
export function ReplayMatchHeader({ t, downloadable }: { t: Messages; downloadable: boolean }) {
    return <div className="replay-match-header" role="row">{[t.heroColumn, t.result, t.posColumn, "IMP", t.mode, t.duration, t.matchId, t.playCommand, ...(downloadable ? [t.download] : [])].map((label,index) => <span key={index} role="columnheader">{label}</span>)}</div>;
}
export function ReplayMatchRow({ matchId, info, file, t, onDownload, disabled }: {
    matchId: string; info?: ReplayMatchInfo; file?: ReplayFile; t: Messages; onDownload?: () => void; disabled?: boolean;
}) {
    const hero = info?.heroId ? heroById(info.heroId) : null;
    return <article className={`replay-match-row ${onDownload ? "with-download" : ""}`} role="row" data-replay-match={matchId}>
        <span role="cell" className="replay-hero">{hero ? <img src={heroImage(hero)} alt={hero.name} width={60} height={34} loading="lazy"/> : <span className="replay-hero-unknown" title={t.unavailable}><Film size={23}/></span>}</span>
        <span role="cell">{info?.won == null ? <CircleHelp size={18} aria-label={t.unavailable}/> : <b className={`result ${info.won ? "good" : "bad"}`} title={info.won ? t.teamWon : t.teamLost}>{info.won ? "W" : "L"}</b>}</span>
        <span role="cell"><Position value={info?.position} title={false} t={t} analyzed={info?.analyzed} reportable={!!info?.heroId}/></span>
        <span role="cell"><Score value={info?.score} t={t}/></span>
        <span role="cell">{info?.mode ? <ModeIcon mode={info.mode} t={t}/> : <span className="muted">—</span>}</span>
        <span role="cell"><bdi>{info?.duration == null ? "—" : durationText(info.duration)}</bdi></span>
        <span role="cell"><CopyValue value={matchId} t={t}/></span>
        <span role="cell" className="replay-command-cell"><CopyValue value={playCommand(matchId)} label={t.playCommand} t={t} className="replay-command-copy"/>{file && <small><bdi>{(file.sizeBytes/1024/1024).toFixed(1)} MB · .dem</bdi></small>}</span>
        {onDownload && <span role="cell"><button className="secondary-button" disabled={disabled} onClick={onDownload}><Download size={15}/>{t.download}</button></span>}
    </article>;
}
