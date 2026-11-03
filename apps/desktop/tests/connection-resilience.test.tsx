// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionState, recordConnectionSuccess, recordOperationFailure, recordProbeFailure, setConnection, useConnectionMonitor } from "../src/connection";
import { clearConnectionReport, getConnectionReport } from "../src/connectionDiagnostics";
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    setConnection("online"); clearConnectionReport();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("connection evidence thresholds", () => {
    it("one failed operation remains online; three fail, one success recovers", () => {
        recordOperationFailure(); expect(connectionState()).toBe("online");
        recordOperationFailure(); expect(connectionState()).toBe("online");
        recordOperationFailure(); expect(connectionState()).toBe("offline");
        recordConnectionSuccess(); expect(connectionState()).toBe("online");
        recordOperationFailure(); recordOperationFailure(); expect(connectionState()).toBe("online");
    });
    it("discards failed operations outside the rolling 60s window", () => {
        recordOperationFailure(); recordOperationFailure(); vi.advanceTimersByTime(60_001);
        recordOperationFailure(); expect(connectionState()).toBe("online");
    });
    it("a success breaks the consecutive operation-failure streak", () => {
        recordOperationFailure(); recordOperationFailure(); recordConnectionSuccess();
        recordOperationFailure(); expect(connectionState()).toBe("online");
    });
    it("requires both consecutive failed probes and no success in the last 30s", () => {
        recordProbeFailure(); vi.advanceTimersByTime(20_000); recordProbeFailure();
        expect(connectionState()).toBe("online");
        vi.advanceTimersByTime(10_000); recordProbeFailure(); expect(connectionState()).toBe("offline");
        recordConnectionSuccess(); recordProbeFailure(); expect(connectionState()).toBe("online");
    });
    it("one old failed probe cannot take the app offline", () => {
        vi.advanceTimersByTime(31_000); recordProbeFailure(); expect(connectionState()).toBe("online");
    });
});

describe("health probes", () => {
    it("aborts a stalled probe after 5s without immediately going offline", async () => {
        let signal!: AbortSignal;
        const fetcher = vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}); });
        vi.stubGlobal("fetch", fetcher);
        const view = renderHook(() => useConnectionMonitor("https://example.test", true));
        await act(async () => { await vi.advanceTimersByTimeAsync(4_999); }); expect(signal.aborted).toBe(false);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(signal.aborted).toBe(true);
        expect(connectionState()).toBe("online");
        expect(JSON.parse(getConnectionReport()).events.at(-1)).toMatchObject({ path: "/health/live", errorName: "TimeoutError", durationMs: 5_000 });
        view.unmount();
    });
    it("pauses while hidden and ignores visibility/unmount cancellation", async () => {
        let visibility: DocumentVisibilityState = "hidden";
        vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
        const fetcher = vi.fn(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
        const view = renderHook(() => useConnectionMonitor("https://example.test", true));
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(fetcher).not.toHaveBeenCalled();
        visibility = "visible"; await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await flush(); });
        expect(fetcher).toHaveBeenCalledOnce();
        visibility = "hidden"; await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await flush(); });
        expect(connectionState()).toBe("online"); view.unmount();
    });
    it("resets failed-probe evidence when a real request succeeds", async () => {
        const fetcher = vi.fn().mockRejectedValue(new TypeError("network")); vi.stubGlobal("fetch", fetcher);
        renderHook(() => useConnectionMonitor("https://example.test", true)); await act(flush);
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(connectionState()).toBe("online");
        recordConnectionSuccess();
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(connectionState()).toBe("online");
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(connectionState()).toBe("offline");
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(connectionState()).toBe("online");
    });
    it("treats a delivered 4xx as reachability without recording a probe failure", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({}, { status: 404 }))));
        setConnection("offline"); renderHook(() => useConnectionMonitor("https://example.test", true)); await act(flush);
        expect(connectionState()).toBe("online");
    });
    it("browser offline is immediate; online is verified with a probe", async () => {
        vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ ok: true }))));
        renderHook(() => useConnectionMonitor("https://example.test", true)); await act(flush);
        await act(async () => { window.dispatchEvent(new Event("offline")); }); expect(connectionState()).toBe("offline");
        await act(async () => { window.dispatchEvent(new Event("online")); await flush(); }); expect(connectionState()).toBe("online");
    });
});
