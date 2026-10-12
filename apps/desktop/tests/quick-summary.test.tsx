// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Analysis } from "../src/components/Analysis";
import { QuickSummary, VictoryBanner } from "../src/components/QuickSummary";
import { detailFor, sampleHistory } from "../src/history";
import { messages } from "../src/i18n";
import { previewProfile } from "../src/components/Shared";
import { cachedRead, cachedWrite, clearOfflineAccount, setCacheOwner } from "../src/offlineCache";
import { setConnection } from "../src/connection";
import { mergeMatchAnalysis } from "../src/useMatchDetails";
import type { Match } from "@/lib/types";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/api", async () => ({ ...await vi.importActual("../src/api"), apiRequest: mocks.api }));
const row = { ...sampleHistory[0], journalId: "00000000-0000-4000-8000-000000000321", analyzed: false };
const pagePath = `/api/journal/matches/${row.journalId}/page?player=${previewProfile.username}`;
const analysisPath = `/api/matches/${row.journalId}/analysis`;
function fixture() {
    const ready = structuredClone(detailFor(row))!;
    ready.id = row.journalId; ready.dotaMatchId = row.id;
    ready.analysis!.dotaMatchId = row.id;
    ready.participants![0].playerSlot = 128;
    ready.participants![5].playerSlot = 0;
    ready.analysis!.players[0].playerSlot = 128;
    ready.analysis!.players[5].playerSlot = 0;
    for (const player of ready.analysis!.players) { player.position = 5; player.performanceScore = 84; }
    ready.analysis!.players[0].netWorth = 15000;
    ready.analysis!.players[0].heroDamage = 12000;
    ready.analysis!.players[0].heroHealing = 0;
    ready.analysis!.players[0].summaryComparison = { heroId: ready.analysis!.players[0].heroId, position: 5, referenceMonth: "2026-09-01", versionId: "reference", minute: 30, sampleCount: 1000,
        averages: { netWorth: 14000, goldPerMinute: null, xpPerMinute: 600, lastHits: 90, denies: 0, heroDamage: 20000, towerDamage: 1000, heroHealing: 0, level: null } };
    const basic = structuredClone(ready); delete basic.analysis;
    basic.participants!.forEach(player => { player.position = null; });
    return { ready, basic };
}
async function flush() { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); }
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); clearOfflineAccount(); setCacheOwner("quick-summary"); setConnection("online");
    document.documentElement.dir = "ltr"; document.documentElement.lang = "en";
});
afterEach(() => { cleanup(); clearOfflineAccount(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Quick Summary data and presentation", () => {
    it.each([messages.en, messages.fa])("keeps both teams, highlights only the real winner, and handles an unknown result", t => {
        const { ready } = fixture();
        const view = render(<VictoryBanner match={{ ...ready, radiantWin: false }} row={row} t={t}/>);
        expect(screen.getByText(t.radiant)).toBeTruthy(); expect(screen.getByText(t.dire)).toBeTruthy();
        expect(view.container.querySelector(".team-result.dire.is-victorious")).toBeTruthy();
        expect(view.container.querySelector(".team-result.radiant.is-victorious")).toBeNull();
        expect(screen.getAllByText(t.victory)).toHaveLength(1);
        view.rerender(<VictoryBanner match={{ ...ready, radiantWin: null }} row={row} t={t}/>);
        expect(view.container.querySelector(".is-victorious")).toBeNull(); expect(screen.queryByText(t.victory)).toBeNull();
        view.rerender(<VictoryBanner match={{ ...ready, radiantWin: true }} row={row} t={t}/>);
        expect(view.container.querySelector(".team-result.radiant.is-victorious")).toBeTruthy();
    });
    it("shows signed differences and zero baselines without inventing missing GPM/Level averages", () => {
        const { ready } = fixture(); const match = mergeMatchAnalysis(ready, ready.analysis!);
        const view = render(<QuickSummary match={match} selected={128} onSelect={vi.fn()} onAnalyze={vi.fn()} t={messages.en}/>);
        const stat = (key: string) => view.container.querySelector(`[data-summary-stat="${key}"]`) as HTMLElement;
        expect(within(stat("netWorth")).getByText("15,000")).toBeTruthy();
        expect(within(stat("netWorth")).getByText("(+1,000)").classList.contains("above")).toBe(true);
        expect(stat("heroDamage").querySelector(".below")).toBeTruthy();
        expect(stat("heroHealing").querySelector(".equal")?.textContent).toBe("(0)");
        expect(stat("heroHealing").querySelector(".summary-stat-average bdi")?.textContent).toBe("0");
        expect(stat("lastHits").textContent).not.toContain("null");
        expect(stat("goldPerMinute").querySelector(".summary-stat-delta")?.textContent).toBe("(?)");
        expect(stat("level").querySelector(".summary-stat-average bdi")?.textContent).toBe("—");
        expect(view.container.querySelectorAll(".summary-stat")).toHaveLength(8);
        expect(view.container.querySelectorAll(".match-inventory")).toHaveLength(1);
        expect(view.container.querySelector(".selected-inventory>small")).toBeNull();
        expect(screen.queryByText(messages.en.detailsHint)).toBeNull();
        expect(view.container.querySelectorAll(".team-roster>header img")).toHaveLength(2);
        match.analysis!.players[0].position = 4;
        view.rerender(<QuickSummary match={match} selected={128} onSelect={vi.fn()} onAnalyze={vi.fn()} t={messages.en}/>);
        expect(stat("netWorth").querySelector(".summary-stat-delta")?.textContent).toBe("(?)");
        const basic = structuredClone(match); delete basic.analysis;
        view.rerender(<QuickSummary match={basic} selected={128} onSelect={vi.fn()} onAnalyze={vi.fn()} t={messages.en}/>);
        expect(view.container.querySelectorAll(".summary-stat-delta.unknown")).toHaveLength(9);
        expect([...view.container.querySelectorAll(".summary-stat-average bdi")].every(node => /^—(?: \/ —)?$/.test(node.textContent || ""))).toBe(true);
    });
    it("uses analysis positions including unknown instead of stale base roles, and rejects another match's analysis", () => {
        const { ready } = fixture(); ready.participants![0].position = 2; ready.analysis!.players[0].position = null;
        expect(mergeMatchAnalysis(ready, ready.analysis!).participants![0].position).toBeNull();
        expect(mergeMatchAnalysis(ready, { ...ready.analysis!, dotaMatchId: "another-match" })).toBe(ready);
    });
    it("loads completed analysis on the summary tab and selects the profile player even on Dire", async () => {
        const { ready } = fixture(); mocks.api.mockResolvedValue({ page: { match: ready } });
        const view = render(<Analysis row={row} t={messages.en} live session={previewProfile} onBack={vi.fn()}/>);
        await flush();
        expect(view.container.querySelector(".hero-card.selected")?.getAttribute("aria-label")).toContain(ready.participants![0].heroName);
        expect(view.container.querySelector(".selected-hero-imp")?.textContent).toContain("84");
        expect(view.container.querySelector(".selected-hero-identity .position-badge")?.textContent).toContain("Hard Support");
        expect(mocks.api).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(60000); }); expect(mocks.api).toHaveBeenCalledTimes(1);
    });
    it("finishes a running analysis without changing tabs, preserves selection and updates the offline page", async () => {
        const { ready, basic } = fixture(); let complete = false;
        mocks.api.mockImplementation(async path => path === pagePath ? { page: { match: basic } }
            : { analysis: complete ? ready.analysis : null, preparation: { replay: "processing" } });
        const view = render(<Analysis row={row} t={messages.en} live session={previewProfile} onBack={vi.fn()}/>); await flush();
        fireEvent.click(view.container.querySelectorAll<HTMLButtonElement>(".hero-card")[1]);
        const selected = view.container.querySelector(".hero-card.selected")?.getAttribute("aria-label");
        complete = true; await act(async () => { await vi.advanceTimersByTimeAsync(3000); }); await flush();
        expect(view.container.querySelector(".hero-card.selected")?.getAttribute("aria-label")).toBe(selected);
        expect(view.container.querySelector(".selected-hero-imp")?.textContent).toContain("84");
        expect(screen.getByRole("tab", { name: messages.en.summary }).getAttribute("aria-selected")).toBe("true");
        expect(cachedRead<{ page: { match: Match } }>(pagePath)?.page.match.analysis?.players[0].position).toBe(5);
        expect(mocks.api).toHaveBeenCalledWith(analysisPath, expect.anything());
    });
    it("keeps the cached summary offline, rechecks on reconnect/focus and cancels polling on unmount", async () => {
        const { ready, basic } = fixture(); cachedWrite(pagePath, { page: { match: basic } });
        setConnection("offline"); mocks.api.mockResolvedValue({ page: { match: ready } });
        const view = render(<Analysis row={row} t={messages.en} live session={previewProfile} onBack={vi.fn()}/>); await flush();
        expect(view.container.querySelectorAll(".hero-card")).toHaveLength(10); expect(mocks.api).not.toHaveBeenCalled();
        await act(async () => { setConnection("online"); }); await flush(); expect(mocks.api).toHaveBeenCalledTimes(1);
        fireEvent.focus(window); await flush(); expect(mocks.api).toHaveBeenCalledTimes(2);
        view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(60000); }); fireEvent.focus(window); expect(mocks.api).toHaveBeenCalledTimes(2);
    });
    it("serializes simultaneous page refresh events", async () => {
        const { ready } = fixture(); let resolve!: (value: unknown) => void;
        mocks.api.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ page: { match: ready } });
        render(<Analysis row={row} t={messages.en} live session={previewProfile} onBack={vi.fn()}/>);
        fireEvent.focus(window); window.dispatchEvent(new Event("dota-notes:matches-updated"));
        expect(mocks.api).toHaveBeenCalledTimes(1);
        await act(async () => { resolve({ page: { match: ready } }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(mocks.api).toHaveBeenCalledTimes(2);
    });
});
