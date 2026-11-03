// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ api: vi.fn(), sync: vi.fn(), progress: vi.fn() }));
vi.mock("../src/api", () => ({ API_ORIGIN: "https://example.test", apiRequest: mocks.api, getBearer: () => "test", getSyncStatus: mocks.sync }));
vi.mock("../src/replays", () => ({ validReplayId: () => true, replayNative: { progress: mocks.progress } }));
import { TaskManager } from "../src/taskManager";
import { setConnection } from "../src/connection";
let manager: TaskManager;
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); setConnection("online");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.api.mockResolvedValue({ tasks: [] }); mocks.progress.mockResolvedValue(vi.fn());
    mocks.sync.mockResolvedValue({ ok: true, status: { manualJob: null } }); manager = new TaskManager("poll-owner");
});
afterEach(() => { manager.stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("task polling budget", () => {
    it("polls idle tasks and sync at 30s rather than every 3s", async () => {
        manager.start(); await flush(); expect(mocks.api).toHaveBeenCalledOnce(); expect(mocks.sync).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(29_999); expect(mocks.api).toHaveBeenCalledOnce(); expect(mocks.sync).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); expect(mocks.api).toHaveBeenCalledTimes(2); expect(mocks.sync).toHaveBeenCalledTimes(2);
    });
    it("polls active analyses at 5s without increasing idle sync polling", async () => {
        mocks.api.mockResolvedValue({ tasks: [{ matchId: "9064577470", requestedAt: "now", kind: "analysis", status: "processing", progress: { phase: "parsing" } }] });
        manager.start(); await flush();
        await vi.advanceTimersByTimeAsync(4_999); expect(mocks.api).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); expect(mocks.api).toHaveBeenCalledTimes(2); expect(mocks.sync).toHaveBeenCalledOnce();
    });
    it("announces completion at the new cadence, once, without announcing old history", async () => {
        const task = { matchId: "9064577470", requestedAt: "request-1", kind: "analysis", status: "completed", progress: { phase: "completed" } };
        mocks.api.mockResolvedValue({ tasks: [task] });
        const updated = vi.fn(); window.addEventListener("dota-notes:matches-updated", updated);
        try {
            manager.start(); await flush(); expect(manager.snapshot().toast).toBeNull();
            mocks.api.mockResolvedValue({ tasks: [{ ...task, requestedAt: "request-2", status: "processing", progress: { phase: "parsing" } }] });
            await vi.advanceTimersByTimeAsync(30_000);
            mocks.api.mockResolvedValue({ tasks: [{ ...task, requestedAt: "request-2" }] });
            await vi.advanceTimersByTimeAsync(5_000);
            expect(manager.snapshot().toast?.kind).toBe("analysis"); expect(updated).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(30_000); expect(updated).toHaveBeenCalledOnce();
        } finally { window.removeEventListener("dota-notes:matches-updated", updated); }
    });
    it("does not overlap long-running polls or issue hidden forced requests", async () => {
        let resolve!: (value: unknown) => void;
        mocks.api.mockImplementation(() => new Promise(value => { resolve = value; })); manager.start(); await flush();
        window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(60_000); expect(mocks.api).toHaveBeenCalledOnce();
        let visibility: DocumentVisibilityState = "hidden";
        vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
        document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("dota-notes:matches-updated"));
        resolve({ tasks: [] }); await flush(); await vi.advanceTimersByTimeAsync(60_000); expect(mocks.api).toHaveBeenCalledOnce();
        visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); await flush(); expect(mocks.api).toHaveBeenCalledTimes(2);
    });
});
