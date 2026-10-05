// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";
import { preferenceKey } from "@dota-notes/design-tokens";
import { requestRange, trackingStart } from "../src/components/Calendar";
import { replayNative, playCommand, validReplayId } from "../src/replays";
import { previewProfile, profileRegistrationDate } from "../src/components/Shared";
import { messages } from "../src/i18n";
import { Distribution } from "../src/components/Workspace";
import { COOLDOWNS, filterHistory, loadHistoryPage, PAGE_SIZE, SAMPLE_DATE, summarize, periodRange } from "../src/history";
let mediaListener: ((event: {
    matches: boolean;
}) => void) | undefined;
beforeEach(() => { localStorage.clear(); mediaListener = undefined; vi.stubGlobal("scrollTo", vi.fn()); vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: (_type: string, listener: typeof mediaListener) => { mediaListener = listener; }, removeEventListener: vi.fn() })); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("redesigned desktop", () => {
    it("keeps theme in settings, persists language and follows system appearance", () => {
        const app = render(<App session={previewProfile}/> );
        expect(screen.queryByLabelText("Theme")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Settings", exact: true }));
        fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "nebula" } });
        fireEvent.click(screen.getByRole("button", { name: "فارسی", exact: true }));
        expect(document.documentElement.dir).toBe("rtl");
        act(() => mediaListener?.({ matches: true }));
        expect(document.documentElement.style.colorScheme).toBe("dark");
        expect(JSON.parse(localStorage.getItem(preferenceKey)!)).toEqual({ theme: "nebula", language: "fa", appearance: "system" });
        app.unmount();
        render(<App session={previewProfile}/> );
        fireEvent.click(screen.getByRole("button", { name: "تنظیمات", exact: true }));
        expect(screen.getByLabelText("تم")).toHaveProperty("value", "nebula");
        fireEvent.change(screen.getByLabelText("حالت نمایش"), { target: { value: "light" } });
        act(() => mediaListener?.({ matches: true }));
        expect(document.documentElement.style.colorScheme).toBe("light");
    });
    it("paginates history and recalculates charts for filters and periods", async () => {
        const view = render(<App session={previewProfile}/> );
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Matches", exact: true }));
        await waitFor(() => expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(PAGE_SIZE));
        const id = view.container.querySelector('[data-match-row]')!.getAttribute('data-match-row');
        fireEvent.click(within(view.container.querySelector(".pagination") as HTMLElement).getByRole("button", { name: "Next", exact: true }));
        await waitFor(() => expect(view.container.querySelector('[data-match-row]')!.getAttribute('data-match-row')).not.toBe(id));
        fireEvent.change(screen.getByLabelText("Game mode"), { target: { value: "Turbo" } });
        await waitFor(() => expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(5));
        expect(within(view.container.querySelector(".pagination") as HTMLElement).getByRole("button", { name: "Next", exact: true })).toHaveProperty("disabled", true);
        fireEvent.click(within(view.container.querySelector(".history-toolbar") as HTMLElement).getByRole("button", { name: "Monthly", exact: true }));
        await waitFor(() => expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(2));
    });
    it("keeps independent cooldowns across reopening and leaves untouched scopes ready", async () => {
        render(<App session={previewProfile}/> );
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Matches", exact: true }));
        fireEvent.click(screen.getByRole("button", { name: "Fetch matches", exact: true }));
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
        expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain("no server request");
        expect(screen.getByRole("button", { name: /Ready in/ })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "Week", exact: true }));
        expect(screen.getByRole("button", { name: "Preview request" })).toHaveProperty("disabled", false);
        fireEvent.click(screen.getByRole("button", { name: "Month", exact: true }));
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
        const stored = JSON.parse(localStorage.getItem('dota-notes.preview-sync-cooldowns.v1')!);
        expect(stored.week).toBe(0);
        expect(stored.month - stored.day).toBeGreaterThan(7000000);
    });
    it("restores cursor packs and shows reports as coming soon", () => { render(<App session={previewProfile}/> ); fireEvent.click(screen.getByRole("button", { name: "Settings", exact: true })); fireEvent.click(screen.getByRole("button", { name: "The International 2019" })); expect(document.documentElement.dataset.cursorPack).toBe("ti-2019"); expect(localStorage.getItem('dota-notes.cursor-pack.v1')).toBe('ti-2019'); fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Smart reports", exact: true })); expect(screen.getByText('Coming soon')).toBeTruthy(); });
});
describe("history data contract", () => {
    it("separates Saturday weeks and calendar months", () => { expect(periodRange('week', '2026-10-02')).toEqual({ from: '2026-09-26', to: '2026-10-02' }); expect(periodRange('month', '2026-10-02')).toEqual({ from: '2026-10-01', to: '2026-10-31' }); expect(COOLDOWNS).toEqual({ day: 90000, week: 180000, month: 7200000 }); });
    it("returns bounded distinct pages with summary for the whole period", async () => { const query = { period: 'week' as const, anchor: SAMPLE_DATE, query: '', mode: 'all', position: 'all', page: 1 }; const signal = new AbortController().signal; const a = await loadHistoryPage(query, signal), b = await loadHistoryPage({ ...query, page: 2 }, signal); expect(a.rows).toHaveLength(8); expect(a.total).toBe(28); expect(a.summary.positions.reduce((s, x) => s + x.count, 0)).toBe(a.total); expect(a.summary.heroes.reduce((s, x) => s + x.count, 0)).toBe(a.total); expect(new Set([...a.rows, ...b.rows].map(m => m.id)).size).toBe(16); const controller = new AbortController(); controller.abort(); await expect(loadHistoryPage(query, controller.signal)).rejects.toHaveProperty('name', 'AbortError'); });
    it("uses the same filters for list and chart totals, and handles empty periods", () => { const rows = filterHistory('week', SAMPLE_DATE, '', 'Turbo', 'all'); expect(rows.every(r => r.mode === 'Turbo')).toBe(true); expect(summarize(rows).total).toBe(rows.length); expect(summarize([]).winRate).toBe(0); });
});
describe("original match analysis retained", () => {
    it("uses one readable selected inventory and retains every analysis domain", async () => {
        const view = render(<App session={previewProfile}/> );
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Matches", exact: true }));
        await waitFor(() => expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(8));
        fireEvent.click(screen.getAllByRole('button', { name: 'Review analysis' })[0]);
        // Lazy views may need extra transform time on a cold Windows run.
        await waitFor(() => expect(view.container.querySelectorAll('.hero-card')).toHaveLength(10), { timeout: 5000 });
        expect(view.container.querySelectorAll('.match-inventory')).toHaveLength(1);
        fireEvent.click(view.container.querySelectorAll<HTMLButtonElement>(".hero-card")[6]);
        expect(view.container.querySelectorAll(".match-inventory")).toHaveLength(1);
        expect(view.container.querySelectorAll(".match-identity .copy-value")).toHaveLength(1);
        expect(view.container.querySelector(".selected-metrics, .summary-focus")).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'Full analysis' }));
        expect(await screen.findByText('Benchmark Spectrum', {}, { timeout: 5000 })).toBeTruthy();
        expect(view.container.querySelectorAll('[data-lane-part]')).toHaveLength(8);
        expect(screen.getByText('Performance Score')).toBeTruthy();
        expect(view.container.querySelectorAll('.benchmark-cell')).toHaveLength(12);
        fireEvent.click(screen.getByRole('button', { name: /Progression/ }));
        expect(view.container.querySelector('.line-chart')).toBeTruthy();
        expect(screen.getByText('Item timings')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Map analysis/ }));
        expect(view.container.querySelector('.map-stage')).toBeTruthy();
        expect(view.container.querySelector('[data-value-key=individualContribution]')).toBeTruthy();
        expect(view.container.querySelector('[data-value-key=missedConversionCount]')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /10 players/ }));
        expect(view.container.querySelectorAll('tbody tr')).toHaveLength(10);
        fireEvent.click(screen.getByRole('tab', { name: 'Journal', exact: true }));
        expect(screen.getByText('Coming soon')).toBeTruthy();
        expect(view.container.querySelector('textarea')).toBeNull();
    }, 15000);
});
describe("compact dashboard and independent chart", () => {
    it("uses the Steam avatar, removes empty panels and exposes all six shortcuts", () => {
        const view = render(<App session={{ mode: "player", username: "player", displayName: "Player", avatarUrl: "https://avatars.steamstatic.com/player.jpg", registeredDate: "2026-09-15" }}/>);
        expect(view.container.querySelector(".profile-banner .avatar img")).toHaveProperty("src", "https://avatars.steamstatic.com/player.jpg");
        expect(view.container.querySelector(".win-panel, .activity-panel")).toBeNull();
        expect(view.container.querySelectorAll(".shortcut-grid button")).toHaveLength(6);
        expect(within(view.container.querySelector(".profile-banner") as HTMLElement).getByRole("button", { name: "Fetch matches" })).toBeTruthy();
        expect(view.container.querySelectorAll(".row-hero small, .row-hero span, .row-duration small")).toHaveLength(0);
        expect(view.container.querySelectorAll(".match-row:not(.table-head) .copy-value")).toHaveLength(8);
    });
    it("keeps chart dates separate from history and shows W/L on hero and position hover", async () => {
        const view = render(<App session={previewProfile}/> );
        const chart = view.container.querySelector(".distribution") as HTMLElement;
        expect(chart.querySelector(".ring-center strong")?.textContent).toBe("28");
        fireEvent.click(within(chart).getByRole("button", { name: "Monthly", exact: true }));
        expect(chart.querySelector(".ring-center strong")?.textContent).toBe("8");
        expect(view.container.querySelectorAll("[data-match-row]")).toHaveLength(8);
        const segment = chart.querySelector('svg g[aria-label^="Carry:"]')!;
        fireEvent.mouseEnter(segment);
        expect(chart.querySelector(".ring-tooltip")?.textContent).toContain("W");
        expect(chart.querySelector(".ring-tooltip")?.textContent).toContain("L");
        expect(chart.querySelector(".ring-center strong")?.textContent).toContain("%");
        fireEvent.mouseLeave(segment);
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Matches", exact: true }));
        await waitFor(() => expect(view.container.querySelectorAll("[data-match-row]")).toHaveLength(8));
        const newChart = view.container.querySelector(".distribution") as HTMLElement;
        fireEvent.click(within(view.container.querySelector(".history-toolbar") as HTMLElement).getByRole("button", { name: "Monthly", exact: true }));
        await waitFor(() => expect(view.container.querySelectorAll("[data-match-row]")).toHaveLength(8));
        expect(newChart.querySelector(".ring-center strong")?.textContent).toBe("28");
    });
    it("copies the bare match ID without a hash", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        const view = render(<App session={previewProfile}/> );
        fireEvent.click(within(view.container.querySelector('[data-match-row]') as HTMLElement).getByRole("button", { name: "Copy 9026000101" }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("9026000101"));
    });
});
describe("registration calendar", () => {
    it("uses Tehran's registration date when a UTC Friday has already become Saturday", () => {
        const date = profileRegistrationDate({mode:"player",username:"test",createdAt:"2026-09-18T23:30:00Z"});
        expect(date).toBe("2026-09-19");
        expect(trackingStart(date)).toBe("2026-09-19");
    });
    it("allows the registration week and blocks older weeks, including month clipping", () => {
        expect(trackingStart("2026-09-15")).toBe("2026-09-12");
        expect(requestRange("week", "2026-09-12", "2026-09-15", SAMPLE_DATE)).toEqual({ from: "2026-09-12", to: "2026-09-18" });
        expect(requestRange("week", "2026-09-11", "2026-09-15", SAMPLE_DATE)).toBeNull();
        expect(requestRange("month", "2026-09-15", "2026-09-15", SAMPLE_DATE)).toEqual({ from: "2026-09-12", to: "2026-09-30" });
        expect(requestRange("month", SAMPLE_DATE, "2026-09-15", SAMPLE_DATE)?.to).toBe(SAMPLE_DATE);
        expect(requestRange("day", "2026-10-03", "2026-09-15", SAMPLE_DATE)).toBeNull();
    });
    it("uses the previous Persian calendar and disables dates before the tracking week", () => {
        render(<App session={previewProfile}/> );
        fireEvent.click(screen.getByRole("button", { name: "Fetch matches" }));
        const dialog = screen.getByRole("dialog");
        expect(dialog.querySelector('input[type="date"]')).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", { name: "Previous month" }));
        expect(within(dialog).getByRole("button", { name: "2026-09-11", exact: true })).toHaveProperty("disabled", true);
        expect(within(dialog).getByRole("button", { name: "2026-09-12", exact: true })).toHaveProperty("disabled", false);
    });
});
describe("native replay library", () => {
    function mocks() {
        vi.spyOn(replayNative, "available").mockReturnValue(true);
        vi.spyOn(replayNative, "settings").mockResolvedValue({ dotaPath: "C:/Steam/steamapps/common/dota 2 beta", replayPath: "C:/Steam/steamapps/common/dota 2 beta/game/dota/replays" });
        vi.spyOn(replayNative, "files").mockResolvedValue([]);
        vi.spyOn(replayNative, "progress").mockResolvedValue(vi.fn());
    }
    it("lists a replay only after the native download succeeds and builds the copyable command", async () => {
        mocks();
        const file = { matchId: "9026000101", path: "replays/9026000101.dem", sizeBytes: 1048576, modifiedSeconds: 1790000000 };
        const download = vi.spyOn(replayNative, "download").mockResolvedValue(file);
        vi.mocked(replayNative.files).mockResolvedValueOnce([]).mockResolvedValueOnce([file]);
        render(<App session={previewProfile}/> );
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Replay", exact: true }));
        await screen.findByText("C:/Steam/steamapps/common/dota 2 beta/game/dota/replays");
        fireEvent.change(screen.getByRole("textbox", { name: "Match ID" }), { target: { value: file.matchId } });
        fireEvent.click(screen.getByRole("button", { name: messages.en.replaySearch }));
        fireEvent.click(within(document.querySelector(".replay-result") as HTMLElement).getByRole("button", { name: "Download replay" }));
        await waitFor(() => expect(screen.getByRole("tab", { name: /Downloaded replays/ }).getAttribute("aria-selected")).toBe("true"));
        expect(download).toHaveBeenCalledWith(file.matchId);
        expect(screen.getByRole("button", { name: "Copy Play command" })).toBeTruthy();
        expect(screen.getByText(playCommand(file.matchId))).toBeTruthy();
    });
    it("keeps failed downloads out of the local library", async () => {
        mocks();
        vi.spyOn(replayNative, "download").mockRejectedValue(new Error("Replay expired"));
        render(<App session={previewProfile}/> );
        fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Replay", exact: true }));
        await screen.findByText("C:/Steam/steamapps/common/dota 2 beta/game/dota/replays");
        fireEvent.click(screen.getAllByRole("button", { name: "Download replay" })[0]);
        expect(await screen.findByText("Error: Replay expired")).toBeTruthy();
        fireEvent.click(screen.getByRole("tab", { name: /Downloaded replays/ }));
        expect(screen.getByText("No .dem replays in this folder yet.")).toBeTruthy();
    });
    it("validates numeric IDs before IPC and keeps the demo command extension-free", () => {
        expect(validReplayId("9026000101")).toBe(true);
        expect(validReplayId("../9026000101")).toBe(false);
        expect(validReplayId("0000000000")).toBe(false);
        expect(playCommand("9026000101")).toBe("playdemo replays/9026000101");
    });
});
