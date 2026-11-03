// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, setBearer } from "../src/api";
import { connectionState, setConnection } from "../src/connection";
import { clearConnectionReport, getConnectionReport } from "../src/connectionDiagnostics";
import { cachedRead, cachedWrite, clearOfflineAccount, setCacheOwner } from "../src/offlineCache";

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    localStorage.clear(); clearOfflineAccount(); setCacheOwner("resilience-owner");
    setBearer("secret-bearer-for-tests"); setConnection("online"); clearConnectionReport();
    fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { setBearer(null); clearOfflineAccount(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const events = () => JSON.parse(getConnectionReport()).events;

describe("bounded API attempts", () => {
    it("aborts a stalled GET at 8s and retries with new signals after 0.5s and 1.5s", async () => {
        const signals: AbortSignal[] = [];
        fetcher.mockImplementation((_url, init) => {
            signals.push(init.signal);
            return signals.length < 3 ? new Promise(() => {}) : Promise.resolve(Response.json({ ok: true }));
        });
        const request = apiRequest("/api/tasks");
        await vi.advanceTimersByTimeAsync(7_999); expect(signals[0].aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1); expect(signals[0].aborted).toBe(true);
        expect(connectionState()).toBe("online");
        await vi.advanceTimersByTimeAsync(499); expect(fetcher).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(8_000); expect(signals[1].aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(1_499); expect(fetcher).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1); await expect(request).resolves.toEqual({ ok: true });
        expect(new Set(signals).size).toBe(3);
        expect(events().map((event: any) => [event.attempt, event.errorName])).toEqual([[1, "TimeoutError"], [2, "TimeoutError"], [3, null]]);
    });

    it("bounds a stalled JSON body too", async () => {
        let signal!: AbortSignal;
        fetcher.mockImplementationOnce((_url, init) => {
            signal = init.signal;
            return Promise.resolve({ status: 200, ok: true, json: () => new Promise(() => {}) });
        }).mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
        const result = apiRequest("/api/tasks");
        await vi.advanceTimersByTimeAsync(8_500);
        expect(signal.aborted).toBe(true); await expect(result).resolves.toEqual({ ok: true });
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])("never retries %s and uses a 20s timeout", async method => {
        let signal!: AbortSignal;
        fetcher.mockImplementation((_url, init) => { signal = init.signal; return new Promise(() => {}); });
        const result = apiRequest("/api/profile/me", { method, body: "{}" }).catch(error => error);
        await vi.advanceTimersByTimeAsync(19_999); expect(signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1); expect(signal.aborted).toBe(true);
        expect(await result).toMatchObject({ status: 0, code: "request_timeout" });
        await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledOnce();
        expect(connectionState()).toBe("online");
    });

    it("preserves an explicit long timeout without retrying a mutation", async () => {
        let signal!: AbortSignal;
        fetcher.mockImplementation((_url, init) => { signal = init.signal; return new Promise(() => {}); });
        const result = apiRequest("/api/admin/replay-archive", { method: "POST" }, 180_000).catch(error => error);
        await vi.advanceTimersByTimeAsync(20_000); expect(signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(160_000); expect(await result).toBeInstanceOf(ApiError);
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("uses cached data only after all three failed attempts", async () => {
        cachedWrite("/api/sync/me", { cached: true });
        fetcher.mockRejectedValue(new TypeError("network failed"));
        let settled = false;
        const result = apiRequest("/api/sync/me").then(value => { settled = true; return value; });
        await flush(); expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(500); expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1_500); expect(await result).toEqual({ cached: true });
        expect(fetcher).toHaveBeenCalledTimes(3); expect(connectionState()).toBe("online");
    });

    it("retries GET 5xx but preserves actionable mutation errors", async () => {
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ error: { code: "email_delivery_failed", message: "Delivery failed" } }, { status: 503 })));
        const get = apiRequest("/api/tasks").catch(error => error);
        await vi.advanceTimersByTimeAsync(2_000); expect(await get).toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(3);
        const post = await apiRequest("/api/auth/email/start", { method: "POST", body: "{}" }).catch(error => error);
        expect(post).toMatchObject({ status: 503, code: "email_delivery_failed", message: "Delivery failed" });
        expect(fetcher).toHaveBeenCalledTimes(4); expect(connectionState()).toBe("online");
    });

    it("counts failed operations, not the three attempts of one GET", async () => {
        fetcher.mockRejectedValue(new TypeError("network failed"));
        for (let i = 0; i < 3; i++) {
            const result = apiRequest(`/api/tasks?round=${i}`).catch(error => error);
            await vi.advanceTimersByTimeAsync(2_000); await result;
            expect(connectionState()).toBe(i === 2 ? "offline" : "online");
        }
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
        await apiRequest("/api/tasks"); expect(connectionState()).toBe("online");
    });

    it("does not count a received 4xx even when its body stalls", async () => {
        fetcher.mockImplementation(() => Promise.resolve({ status: 403, ok: false, json: () => new Promise(() => {}) }));
        for (let i = 0; i < 3; i++) {
            const result = apiRequest("/api/tasks").catch(error => error);
            await vi.advanceTimersByTimeAsync(8_000); expect(await result).toMatchObject({ status: 403 });
        }
        expect(fetcher).toHaveBeenCalledTimes(3); expect(connectionState()).toBe("online");
    });

    it("a 4xx is never retried, never falls back to cache, and proves reachability", async () => {
        cachedWrite("/api/sync/me", { cached: true }); setConnection("offline");
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ error: { code: "forbidden" } }, { status: 403 })));
        await expect(apiRequest("/api/sync/me")).rejects.toMatchObject({ status: 403 });
        expect(fetcher).toHaveBeenCalledOnce(); expect(connectionState()).toBe("online");
    });
});

describe("shared reads and cancellation", () => {
    it("coalesces concurrent reads, with one parsed response", async () => {
        let resolve!: (response: Response) => void;
        fetcher.mockImplementation(() => new Promise(value => { resolve = value; }));
        const first = apiRequest("/api/tasks"), second = apiRequest("/api/tasks");
        expect(fetcher).toHaveBeenCalledOnce(); resolve(Response.json({ tasks: [1] }));
        expect(await Promise.all([first, second])).toEqual([{ tasks: [1] }, { tasks: [1] }]);
        expect(events()).toHaveLength(1);
    });

    it("does not cancel another consumer when one subscriber aborts", async () => {
        let resolve!: (response: Response) => void, transport!: AbortSignal;
        fetcher.mockImplementation((_url, init) => { transport = init.signal; return new Promise(value => { resolve = value; }); });
        const controller = new AbortController();
        const first = apiRequest("/api/tasks", { signal: controller.signal }).catch(error => error);
        const second = apiRequest("/api/tasks"); controller.abort();
        expect(await first).toMatchObject({ name: "AbortError" }); expect(transport.aborted).toBe(false);
        resolve(Response.json({ ok: true })); expect(await second).toEqual({ ok: true });
    });

    it("aborts transport when all consumers leave, without counting or retrying", async () => {
        let transport!: AbortSignal;
        fetcher.mockImplementation((_url, init) => { transport = init.signal; return new Promise(() => {}); });
        for (let i = 0; i < 3; i++) {
            const controller = new AbortController();
            const result = apiRequest(`/api/tasks?request=${i}`, { signal: controller.signal }).catch(error => error);
            controller.abort(); expect(await result).toMatchObject({ name: "AbortError" });
        }
        await vi.advanceTimersByTimeAsync(30_000);
        expect(transport.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(3); expect(connectionState()).toBe("online");
    });

    it("does not retry or count cancellation during backoff", async () => {
        fetcher.mockRejectedValue(new TypeError("network"));
        const controller = new AbortController();
        const result = apiRequest("/api/tasks", { signal: controller.signal }).catch(error => error);
        await flush(); controller.abort(); expect(await result).toMatchObject({ name: "AbortError" });
        await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledOnce(); expect(connectionState()).toBe("online");
    });

    it("aborts an old account immediately and ignores a late 401 without clearing the new cache", async () => {
        let resolve!: (response: Response) => void, transport!: AbortSignal;
        fetcher.mockImplementation((_url, init) => { transport = init.signal; return new Promise(value => { resolve = value; }); });
        const invalid = vi.fn(); window.addEventListener("dota-notes:auth-invalid", invalid);
        try {
            const result = apiRequest("/api/sync/me").catch(error => error);
            setBearer("another-account"); clearOfflineAccount(); setCacheOwner("another-owner"); cachedWrite("/api/sync/me", { owner: "new" });
            expect(transport.aborted).toBe(true); expect(await result).toMatchObject({ name: "AbortError" });
            resolve(Response.json({ error: { code: "unauthorized" } }, { status: 401 })); await flush();
            expect(invalid).not.toHaveBeenCalled(); expect(cachedRead("/api/sync/me")).toEqual({ owner: "new" });
            expect(connectionState()).toBe("online");
        } finally { window.removeEventListener("dota-notes:auth-invalid", invalid); }
    });

    it("rejects an already cancelled caller without fetching", async () => {
        const controller = new AbortController(); controller.abort();
        await expect(apiRequest("/api/tasks", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("starts a replacement read when every previous consumer has cancelled", async () => {
        fetcher.mockImplementationOnce(() => new Promise(() => {})).mockImplementation(() => Promise.resolve(Response.json({ fresh: true })));
        const controller = new AbortController();
        const old = apiRequest("/api/tasks", { signal: controller.signal }).catch(error => error);
        controller.abort();
        const replacement = apiRequest("/api/tasks");
        expect(await old).toMatchObject({ name: "AbortError" }); expect(await replacement).toEqual({ fresh: true });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("keeps different query strings and explicit deadlines separate", async () => {
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
        await Promise.all([apiRequest("/api/tasks?a=1"), apiRequest("/api/tasks?a=2"), apiRequest("/api/tasks?a=1", {}, 2_000)]);
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("counts a coalesced failure once rather than once per caller", async () => {
        fetcher.mockRejectedValue(new TypeError("network"));
        const requests = Array.from({ length: 5 }, () => apiRequest("/api/tasks").catch(error => error));
        await vi.advanceTimersByTimeAsync(2_000); await Promise.all(requests);
        expect(fetcher).toHaveBeenCalledTimes(3); expect(connectionState()).toBe("online");
    });
});

describe("safe diagnostics", () => {
    it("retains 100 attempts without tokens, query values or exception messages", async () => {
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
        for (let i = 0; i < 105; i++) await apiRequest(`/api/tasks?private=secret-query-${i}#secret-fragment`);
        const report = getConnectionReport();
        expect(report).not.toContain("secret-bearer"); expect(report).not.toContain("secret-query"); expect(report).not.toContain("secret-fragment");
        expect(events()).toHaveLength(100); expect(events()[0].path).toBe("/api/tasks");
        fetcher.mockRejectedValue(new TypeError("secret-exception-message"));
        const failed = apiRequest("/api/tasks").catch(error => error);
        await vi.advanceTimersByTimeAsync(2_000); await failed;
        expect(getConnectionReport()).not.toContain("secret-exception-message");
        expect(events().at(-1)).toMatchObject({ method: "GET", errorName: "TypeError", attempt: 3, connectionBefore: "online", connectionAfter: "online" });
    });
});
