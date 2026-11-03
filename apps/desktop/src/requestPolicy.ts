// Explicit call-site timeouts remain supported (for example archive deletion).
export const REQUEST_POLICY = {
    getTimeoutMs: 8_000,
    mutationTimeoutMs: 20_000,
    getAttempts: 3,
    retryDelaysMs: [500, 1_500],
} as const;

export function cancellation() { return new DOMException("Request cancelled", "AbortError"); }
export function failureName(error: unknown) {
    return error instanceof Error || error instanceof DOMException ? error.name : "Error";
}

// Also bounds transports/body readers that don't promptly reject after abort.
// Both branches have rejection handlers, including a late transport rejection.
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) { void promise.catch(() => {}); return Promise.reject(signal.reason || cancellation()); }
    return new Promise<T>((resolve, reject) => {
        const abort = () => { cleanup(); reject(signal.reason || cancellation()); };
        const cleanup = () => signal.removeEventListener("abort", abort);
        signal.addEventListener("abort", abort, { once: true });
        promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
}

export function retryPause(delay: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(cancellation());
    return new Promise((resolve, reject) => {
        const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener("abort", abort); };
        const abort = () => { cleanup(); reject(cancellation()); };
        const timer = window.setTimeout(() => { cleanup(); resolve(); }, delay);
        signal.addEventListener("abort", abort, { once: true });
    });
}
