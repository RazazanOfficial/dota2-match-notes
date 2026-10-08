import { useEffect, useSyncExternalStore } from "react";
type Connection = "online" | "offline";
let status: Connection = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
const listeners = new Set<() => void>();
export function connectionState() { return status; }
export function setConnection(next: Connection) { if (status !== next) { status = next; for (const listener of listeners) listener(); } }
export function useConnection() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, connectionState, () => "online" as Connection); }
export function useConnectionMonitor(origin: string, enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        let active = true, controller: AbortController | null = null;
        const offline = () => setConnection("offline");
        const probe = async () => {
            if (navigator.onLine === false) { offline(); return; }
            controller?.abort(); const request = new AbortController(); controller = request;
            const timeout = window.setTimeout(() => request.abort(), 7000);
            try {
                const response = await fetch(`${origin}/health/live`, { signal: request.signal, cache: "no-store", credentials: "omit" });
                if (active && controller === request) setConnection(response.ok ? "online" : "offline");
            } catch { if (active && controller === request) offline(); } finally { window.clearTimeout(timeout); }
        };
        window.addEventListener("offline", offline); window.addEventListener("online", probe);
        const timer = window.setInterval(probe, 15000); void probe();
        return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener("offline", offline); window.removeEventListener("online", probe); };
    }, [origin, enabled]);
}
