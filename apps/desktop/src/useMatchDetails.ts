import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { Match, MatchAnalysis, MatchParticipant, Session } from "@/lib/types";
import type { ReplayProgress } from "@/lib/replay/progress";
import { apiRequest } from "./api";
import { connectionState, useConnection } from "./connection";
import { cachedRead, cachedWrite } from "./offlineCache";
import { detailFor, type HistoryMatch } from "./history";

export type AnalysisPreparation = { replay: string; progress?: ReplayProgress | null; errorCode?: string | null };
type PageResponse = { page: { match: Match } };
type AnalysisResponse = { analysis: MatchAnalysis | null; preparation?: AnalysisPreparation };

export function mergeMatchAnalysis(match: Match, analysis: MatchAnalysis): Match {
    if (analysis.dotaMatchId !== (match.dotaMatchId || match.id)) return match;
    const players = new Map(analysis.players.map(player => [player.playerSlot, player]));
    const fields = ["kills", "deaths", "assists", "lastHits", "denies", "netWorth", "goldPerMinute", "xpPerMinute", "heroDamage", "towerDamage", "heroHealing", "level"] as const;
    return { ...match, analysis, analysisStatus: "ready", participants: match.participants?.map(participant => {
        const player = players.get(participant.playerSlot);
        if (!player || player.heroId !== participant.heroId) return participant;
        const next: MatchParticipant = { ...participant, position: player.position };
        for (const key of fields) if (player[key] !== undefined) next[key] = player[key] ?? null;
        return next;
    }) };
}

// Load the page once, then poll only incomplete analysis. Refresh on focus,
// reconnect or match updates without replacing the visible summary with a loader.
export function useMatchDetails(row: HistoryMatch, live: boolean, session?: Session) {
    const connection = useConnection();
    const pagePath = `/api/journal/matches/${encodeURIComponent(row.journalId || row.id)}/page?player=${encodeURIComponent(session?.username || "")}`;
    const initial = useMemo(() => {
        if (!live) return detailFor(row);
        const match = cachedRead<PageResponse>(pagePath)?.page.match || null;
        const analysis = match && cachedRead<AnalysisResponse>(`/api/matches/${encodeURIComponent(match.id)}/analysis`)?.analysis;
        return match && analysis ? mergeMatchAnalysis(match, analysis) : match;
    }, [pagePath, live]);
    const [match, setMatch] = useState<Match | null>(initial);
    const latest = useRef(match);
    const [preparation, setPreparation] = useState<AnalysisPreparation | null>(null);
    const [error, setError] = useState<unknown>(null), [checking, setChecking] = useState(false);
    function updateMatch(update: SetStateAction<Match | null>) {
        const next = typeof update === "function" ? update(latest.current) : update;
        latest.current = next; setMatch(next);
    }
    useEffect(() => {
        if (!live || !session) return;
        const controller = new AbortController();
        let timer = 0, inFlight = false, refreshAgain = false, notifying = false;
        const save = (item: Match) => {
            const merged = item.analysis ? mergeMatchAnalysis(item, item.analysis) : item;
            latest.current = merged; setMatch(merged);
            const cached = cachedRead<PageResponse>(pagePath);
            cachedWrite(pagePath, { ...cached, page: { ...cached?.page, match: merged } });
        };
        const load = async (page = false) => {
            if (controller.signal.aborted || connectionState() === "offline") return;
            if (inFlight) { refreshAgain = true; return; }
            inFlight = true; window.clearTimeout(timer); setChecking(true);
            let delay = 30_000;
            try {
                const wasReady = Boolean(latest.current?.analysis);
                if (page || !latest.current) {
                    const response = await apiRequest<PageResponse>(pagePath, { signal: controller.signal });
                    if (controller.signal.aborted) return;
                    save(response.page.match);
                }
                const current = latest.current;
                if (current && !current.analysis) {
                    const result = await apiRequest<AnalysisResponse>(`/api/matches/${encodeURIComponent(current.id)}/analysis`, { signal: controller.signal });
                    if (controller.signal.aborted) return;
                    if (result.analysis) {
                        save(mergeMatchAnalysis(current, result.analysis)); setPreparation(null);
                        // Also refresh inventory and all final values from the replay page.
                        const response = await apiRequest<PageResponse>(pagePath, { signal: controller.signal });
                        if (controller.signal.aborted) return;
                        save(mergeMatchAnalysis(response.page.match, result.analysis));
                    } else {
                        setPreparation(result.preparation || null);
                        delay = ["pending", "queued", "processing"].includes(result.preparation?.replay || "") ? 3_000 : 30_000;
                    }
                }
                if (latest.current?.analysis) setPreparation(null);
                if (!wasReady && latest.current?.analysis) {
                    notifying = true; window.dispatchEvent(new Event("dota-notes:matches-updated")); notifying = false;
                }
                setError(null);
            } catch (failure) {
                if (!controller.signal.aborted && connectionState() !== "offline") setError(failure);
                delay = 10_000;
            } finally {
                inFlight = false;
                if (!controller.signal.aborted) {
                    setChecking(false);
                    if (connectionState() !== "offline" && (refreshAgain || !latest.current?.analysis)) {
                        const refresh = refreshAgain; refreshAgain = false;
                        timer = window.setTimeout(() => void load(refresh), refresh ? 0 : delay);
                    }
                }
            }
        };
        const refresh = () => { if (!notifying) void load(true); };
        const visible = () => { if (document.visibilityState === "visible") refresh(); };
        window.addEventListener("dota-notes:matches-updated", refresh);
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", visible);
        void load(true);
        return () => {
            controller.abort(); window.clearTimeout(timer);
            window.removeEventListener("dota-notes:matches-updated", refresh);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", visible);
        };
    }, [live, pagePath, connection]);
    return { match, updateMatch, preparation, setPreparation, error, setError, checking };
}
