type Connection = "online" | "offline";
export interface ConnectionEvent {
    timestamp: string;
    source: "request" | "probe";
    method: string;
    path: string;
    success: boolean;
    status: number | null;
    errorName: string | null;
    durationMs: number;
    attempt: number;
    connectionBefore: Connection;
    connectionAfter: Connection;
}

const events: ConnectionEvent[] = [];
const errorNames = new Set(["ApiError", "AbortError", "TimeoutError", "TypeError", "SyntaxError", "Error"]);

// Never accept headers, response bodies, exception messages or a complete URL.
export function recordConnectionEvent(event: Omit<ConnectionEvent, "timestamp">) {
    events.push({
        timestamp: new Date().toISOString(),
        source: event.source,
        method: /^[A-Z]+$/.test(event.method) ? event.method : "UNKNOWN",
        path: event.path.split(/[?#]/, 1)[0],
        errorName: event.errorName ? errorNames.has(event.errorName) ? event.errorName : "Error" : null,
        durationMs: Math.max(0, Math.round(event.durationMs)),
        success: event.success,
        status: event.status,
        attempt: event.attempt,
        connectionBefore: event.connectionBefore,
        connectionAfter: event.connectionAfter,
    });
    if (events.length > 100) events.shift();
}

export function getConnectionReport(): string {
    return JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), events }, null, 2);
}

export function clearConnectionReport() { events.length = 0; }
