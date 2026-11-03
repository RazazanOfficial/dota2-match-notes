// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusFeed, type SyncStatusResponse } from "../src/syncStatusFeed";
import { setConnection } from "../src/connection";
import { setBearer } from "../src/api";
import { clearOfflineAccount } from "../src/offlineCache";
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const response = (status?: string): SyncStatusResponse => ({ ok: true, status: { nextAllowedAt: null, nextDayAllowedAt: null,
    nextWeekAllowedAt: null, nextMonthAllowedAt: null, manualJob: status ? { id: "job-1", status } : null } });
let feed: SyncStatusFeed, fetcher: ReturnType<typeof vi.fn>, stops: (() => void)[];
beforeEach(() => {
    vi.useFakeTimers(); localStorage.clear(); clearOfflineAccount(); setBearer("poll-account"); setConnection("online");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fetcher = vi.fn().mockImplementation(async () => response()); feed = new SyncStatusFeed(fetcher); stops = [];
});
afterEach(() => { stops.forEach(stop => stop()); setBearer(null); vi.useRealTimers(); vi.restoreAllMocks(); });
const subscribe = () => { const stop = feed.subscribe(vi.fn()); stops.push(stop); return stop; };

describe("single shared sync feed", () => {
    it("shares an idle 30s poll across subscribers and stops after the last unmount", async () => {
        const first = subscribe(), second = subscribe(); await flush(); expect(fetcher).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(29_999); expect(fetcher).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
        first(); await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledTimes(3);
        second(); await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).toHaveBeenCalledTimes(3);
        stops = [];
    });
    it.each(["pending", "processing"])("uses 5s only while a sync job is %s, then returns to 30s", async status => {
        fetcher.mockResolvedValueOnce(response(status)).mockResolvedValue(response("completed"));
        subscribe(); await flush();
        await vi.advanceTimersByTimeAsync(4_999); expect(fetcher).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(29_999); expect(fetcher).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(3);
    });
    it("never overlaps even when focus, subscribers and manual refresh race", async () => {
        let resolve!: (data: SyncStatusResponse) => void;
        fetcher.mockImplementation(() => new Promise(value => { resolve = value; }));
        subscribe(); subscribe(); window.dispatchEvent(new Event("focus")); void feed.refresh();
        await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).toHaveBeenCalledOnce();
        resolve(response()); await flush(); await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it("makes no hidden requests and resumes immediately on visibility return", async () => {
        let visible: DocumentVisibilityState = "hidden";
        vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible);
        subscribe(); await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).not.toHaveBeenCalled();
        visible = "visible"; document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(fetcher).toHaveBeenCalledOnce();
        visible = "hidden"; document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).toHaveBeenCalledOnce();
    });
    it("preserves an accepted job if its optimistic event races an older status response", async () => {
        let resolve!: (data: SyncStatusResponse) => void;
        fetcher.mockImplementationOnce(() => new Promise(value => { resolve = value; })).mockResolvedValue(response("pending"));
        subscribe(); window.dispatchEvent(new CustomEvent("dota-notes:sync-requested", { detail: { id: "accepted", status: "pending" } }));
        expect(feed.snapshot().data?.status.manualJob?.id).toBe("accepted");
        resolve(response()); await flush(); expect(feed.snapshot().data?.status.manualJob?.id).toBe("accepted");
        await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it("clears account data, cancels the previous read and ignores its late result", async () => {
        let resolve!: (data: SyncStatusResponse) => void, signal!: AbortSignal;
        fetcher.mockImplementation((input: AbortSignal) => { signal = input; return new Promise(value => { resolve = value; }); });
        subscribe(); setBearer("new-poll-account"); expect(signal.aborted).toBe(true);
        resolve(response("completed")); await flush(); expect(feed.snapshot().data).toBeNull();
    });
    it("does not fetch while offline and refreshes once on recovery", async () => {
        setConnection("offline"); subscribe(); await vi.advanceTimersByTimeAsync(60_000); expect(fetcher).not.toHaveBeenCalled();
        setConnection("online"); await flush(); expect(fetcher).toHaveBeenCalledOnce();
    });
});
