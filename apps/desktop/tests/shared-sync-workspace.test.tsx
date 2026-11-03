// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ api: vi.fn(), sync: vi.fn(), list: vi.fn() }));
vi.mock("../src/api", async () => ({ ...await vi.importActual("../src/api"), apiRequest: mocks.api, getSyncStatus: mocks.sync, listMatches: mocks.list }));
vi.mock("../src/replays", () => ({ validReplayId: () => true, replayNative: { progress: async () => () => {} } }));
import { TaskProvider } from "../src/components/TaskCenter";
import { LiveDashboard } from "../src/components/LiveWorkspace";
import { messages } from "../src/i18n";
import { previewProfile } from "../src/components/Shared";
import { setConnection } from "../src/connection";
import { clearOfflineAccount } from "../src/offlineCache";
import { summarize } from "../src/history";
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); clearOfflineAccount(); setConnection("online");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.api.mockResolvedValue({ tasks: [] });
    mocks.list.mockResolvedValue({ rows: [], total: 0, summary: summarize([]) });
    mocks.sync.mockResolvedValue({ ok: true, status: { nextAllowedAt: null, nextDayAllowedAt: null, nextWeekAllowedAt: null, nextMonthAllowedAt: null, manualJob: null } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("the task dock, dashboard and open Fetch dialog share one status poll", async () => {
    render(<TaskProvider owner="shared-owner" live t={messages.en}><LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/></TaskProvider>);
    await act(flush); expect(mocks.sync).toHaveBeenCalledOnce();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: messages.en.fetchMatches })); await flush(); });
    expect(screen.getByRole("dialog")).toBeTruthy(); expect(mocks.sync).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); }); expect(mocks.sync).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(mocks.sync).toHaveBeenCalledTimes(2);
});
