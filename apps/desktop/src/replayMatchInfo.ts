import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
import { cacheOwner, cachedRead, cachedWrite } from "./offlineCache";
import { connectionState } from "./connection";
import { validReplayId } from "./replays";
import type { HistoryMatch } from "./history";
import { replayInfoFromHistory, type ReplayMatchInfo } from "./components/ReplayMatchRow";
const cacheKey = (id: string) => `replay-match-info:${id}`;

/** Hydrates only visible local files, two requests at a time. Metadata never queues a download. */
export function useReplayMatchInfo(ids: string[], recent: HistoryMatch[], live: boolean, revision: number) {
    const key = [...new Set(ids.filter(validReplayId))].join(",");
    const attempted = useRef(new Set<string>()), lastRevision = useRef(revision);
    const [metadata, setMetadata] = useState<Record<string, ReplayMatchInfo>>({});
    useEffect(() => {
        const known = Object.fromEntries(recent.map(row => [row.id, replayInfoFromHistory(row)]));
        setMetadata(previous => ({ ...previous, ...known }));
        for (const [id, info] of Object.entries(known)) cachedWrite(cacheKey(id), info);
    }, [recent]);
    useEffect(() => {
        const requested = key ? key.split(",") : [];
        const cached = Object.fromEntries(requested.flatMap(id => { const info = cachedRead<ReplayMatchInfo>(cacheKey(id)); return info ? [[id, info]] : []; }));
        setMetadata(previous => ({ ...cached, ...previous }));
        if (!live || connectionState() === "offline") return;
        const controller = new AbortController(), owner = cacheOwner();
        if (revision !== lastRevision.current) { attempted.current.clear(); lastRevision.current = revision; }
        const pending = requested.filter(id => !attempted.current.has(id) && (revision > 0 || !recent.some(row => row.id === id)));
        let index = 0;
        async function worker() {
            while (index < pending.length && !controller.signal.aborted && connectionState() !== "offline") {
                const id = pending[index++];
                try {
                    const result = await apiRequest<{ match: ReplayMatchInfo | null }>(`/api/replays/${id}`, { signal: controller.signal });
                    if (!controller.signal.aborted && cacheOwner() === owner && result.match && String(result.match.matchId) === id) {
                        cachedWrite(cacheKey(id), result.match);
                        setMetadata(previous => ({ ...previous, [id]: result.match! }));
                    }
                } catch { /* Imported local DEMs may not have metadata on the server. Keep the file usable. */ }
                finally { if (!controller.signal.aborted && cacheOwner() === owner) attempted.current.add(id); }
            }
        }
        void Promise.all([worker(), worker()]);
        return () => controller.abort();
    }, [key, recent, live, revision]);
    function remember(info: ReplayMatchInfo) {
        const id = String(info.matchId);
        if (!validReplayId(id)) return;
        cachedWrite(cacheKey(id), info);
        setMetadata(previous => ({ ...previous, [id]: info }));
    }
    return { metadata, remember };
}
