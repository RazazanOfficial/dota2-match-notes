import { useCallback, useSyncExternalStore } from "react";
import type { Session } from "@/lib/types";
import type { Period } from "../history";

const changed = "dota-notes:history-period-changed";
const unavailableStorage = new Map<string, Period>();
export function historyPeriodKey(session: Pick<Session, "username" | "steamId">) {
    return `dota-notes.history-period.v1.${encodeURIComponent(session.steamId || session.username)}`;
}
function read(key: string): Period {
    if (unavailableStorage.has(key)) return unavailableStorage.get(key)!;
    try { return localStorage.getItem(key) === "month" ? "month" : "week"; }
    catch { return unavailableStorage.get(key) || "week"; }
}
export function useHistoryPeriod(session: Pick<Session, "username" | "steamId">) {
    const key = historyPeriodKey(session);
    const subscribe = useCallback((notify: () => void) => {
        const storage = (event: StorageEvent) => { if (event.key === null || event.key === key) { unavailableStorage.delete(key); notify(); } };
        const local = (event: Event) => { if ((event as CustomEvent<string>).detail === key) notify(); };
        window.addEventListener("storage", storage); window.addEventListener(changed, local);
        return () => { window.removeEventListener("storage", storage); window.removeEventListener(changed, local); };
    }, [key]);
    const period = useSyncExternalStore(subscribe, () => read(key), () => "week" as Period);
    const setPeriod = useCallback((next: Period) => {
        if (next !== "week" && next !== "month") return;
        try { localStorage.setItem(key, next); unavailableStorage.delete(key); } catch { unavailableStorage.set(key, next); }
        window.dispatchEvent(new CustomEvent(changed, { detail: key }));
    }, [key]);
    return [period, setPeriod] as const;
}
