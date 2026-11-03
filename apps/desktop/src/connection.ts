import { useEffect, useSyncExternalStore } from "react";
import { recordConnectionEvent } from "./connectionDiagnostics";
import { abortable, cancellation, failureName } from "./requestPolicy";

type Connection = "online" | "offline";
export const CONNECTION_POLICY = {
    failureWindowMs: 60_000,
    operationFailures: 3,
    probeFailures: 2,
    successGraceMs: 30_000,
    probeTimeoutMs: 5_000,
    probeIntervalMs: 15_000,
} as const;
let status: Connection = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
let failures: number[] = [], failedProbes = 0, lastSuccessAt = Date.now();
const listeners = new Set<() => void>();
const browserOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
function publish(next: Connection) {
    if (status !== next) { status = next; for (const listener of listeners) listener(); }
}
export function connectionState() { return status; }
export function subscribeConnection(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function resetConnectionFailures() { failures = []; failedProbes = 0; }
export function setConnection(next: Connection) {
    if (next === "online") { resetConnectionFailures(); lastSuccessAt = Date.now(); }
    publish(next);
}
export function recordConnectionSuccess() { setConnection(browserOffline() ? "offline" : "online"); }
// Count a logical operation once, after all of its attempts have failed.
export function recordOperationFailure() {
    const now = Date.now();
    failures = failures.filter(time => now - time < CONNECTION_POLICY.failureWindowMs);
    failures.push(now);
    if (browserOffline() || failures.length >= CONNECTION_POLICY.operationFailures) publish("offline");
}
export function recordProbeFailure() {
    failedProbes++;
    if (browserOffline() || failedProbes >= CONNECTION_POLICY.probeFailures && Date.now() - lastSuccessAt >= CONNECTION_POLICY.successGraceMs) publish("offline");
}
export function useConnection() { return useSyncExternalStore(subscribeConnection, connectionState, () => "online" as Connection); }

export function useConnectionMonitor(origin: string, enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        let active = true, controller: AbortController | null = null;
        const offline = () => { controller?.abort(cancellation()); setConnection("offline"); };
        const probe = async () => {
            if (!active || document.visibilityState === "hidden" || controller) return;
            if (browserOffline()) { offline(); return; }
            const request = new AbortController(); controller = request;
            const before = connectionState(), started = Date.now();
            let statusCode: number | null = null, success = false, errorName: string | null = null;
            const timeout = window.setTimeout(() => request.abort(new DOMException("Probe timed out", "TimeoutError")), CONNECTION_POLICY.probeTimeoutMs);
            try {
                const response = await abortable(fetch(`${origin}/health/live`, { signal: request.signal, cache: "no-store", credentials: "omit" }), request.signal);
                statusCode = response.status;
                // Verify delivery of the body too, not only headers.
                try { await abortable(response.text(), request.signal); }
                catch (error) { if (!(response.status >= 400 && response.status < 500)) throw error; }
                if (!active) return;
                if (request.signal.aborted && request.signal.reason?.name === "AbortError") return;
                success = response.ok;
                if (response.ok || response.status >= 400 && response.status < 500) recordConnectionSuccess();
                else recordProbeFailure();
                if (!response.ok) errorName = "ApiError";
            } catch (error) {
                errorName = failureName(error);
                if (active && !(request.signal.aborted && request.signal.reason?.name === "AbortError")) recordProbeFailure();
            } finally {
                window.clearTimeout(timeout);
                if (active) recordConnectionEvent({ source: "probe", method: "GET", path: "/health/live", success, status: statusCode, errorName,
                    durationMs: Date.now() - started, attempt: 1, connectionBefore: before, connectionAfter: connectionState() });
                if (controller === request) controller = null;
            }
        };
        const visible = () => { if (document.visibilityState === "hidden") controller?.abort(cancellation()); else void probe(); };
        window.addEventListener("offline", offline); window.addEventListener("online", probe);
        document.addEventListener("visibilitychange", visible);
        const timer = window.setInterval(() => void probe(), CONNECTION_POLICY.probeIntervalMs); void probe();
        return () => {
            active = false; controller?.abort(cancellation()); window.clearInterval(timer);
            window.removeEventListener("offline", offline); window.removeEventListener("online", probe);
            document.removeEventListener("visibilitychange", visible);
        };
    }, [origin, enabled]);
}
