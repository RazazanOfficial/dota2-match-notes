// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PeriodControls } from "../src/components/DashboardControls";
import { HeroPositionDistribution } from "../src/components/HeroPositionDistribution";
import { Stats } from "../src/components/DashboardStats";
import { historyPeriodKey, useHistoryPeriod } from "../src/hooks/useHistoryPeriod";
import { distributionPercent, ringIconLayouts } from "../src/distributionGeometry";
import { filterHistory, SAMPLE_DATE, sampleHistory, summarize } from "../src/history";
import { messages } from "../src/i18n";
import { previewProfile } from "../src/components/Shared";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const session = { username: "dashboard-controls", steamId: "76561190000000001" };
function PeriodHarness({ account = session }: { account?: typeof session }) {
    const [period,setPeriod] = useHistoryPeriod(account);
    return <button onClick={() => setPeriod(period === "week" ? "month" : "week")}>{period}</button>;
}
describe("shared dashboard range", () => {
    it("keeps the chosen period after remounting for the same account", () => {
        const view = render(<PeriodHarness/>); fireEvent.click(screen.getByRole("button"));
        expect(localStorage.getItem(historyPeriodKey(session))).toBe("month"); view.unmount();
        render(<PeriodHarness/>); expect(screen.getByRole("button").textContent).toBe("month");
    });
    it("isolates preferences between accounts", () => {
        const view = render(<PeriodHarness/>); fireEvent.click(screen.getByRole("button"));
        view.rerender(<PeriodHarness account={{ username:"another",steamId:"76561190000000002" }}/>);
        expect(screen.getByRole("button").textContent).toBe("week");
    });
    it("updates mounted consumers together and accepts cross-window storage events", () => {
        render(<><PeriodHarness/><PeriodHarness/></>); fireEvent.click(screen.getAllByRole("button")[0]);
        expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["month","month"]);
        act(() => { localStorage.setItem(historyPeriodKey(session),"week"); window.dispatchEvent(new StorageEvent("storage",{key:historyPeriodKey(session)})); });
        expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["week","week"]);
    });
    it("continues in memory when local storage cannot be written", () => {
        vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => { throw new Error("quota"); });
        render(<PeriodHarness account={{username:"fallback-test",steamId:"fallback"}}/>); fireEvent.click(screen.getByRole("button"));
        expect(screen.getByRole("button").textContent).toBe("month");
    });
    it("offers direct month and week selection and closes after selecting a week", () => {
        const choose = vi.fn(); const view = render(<PeriodControls period="week" setPeriod={vi.fn()} anchor={SAMPLE_DATE} setAnchor={choose} t={messages.en} registration="2026-09-15"/>);
        expect(view.container.querySelector('input[type="date"]')).toBeNull();
        fireEvent.click(screen.getByRole("button",{name:messages.en.selectedDate}));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getAllByRole("button").filter(button=>button.textContent?.includes("Week"))).toHaveLength(5);
        expect(within(dialog).getByRole("button",{name:messages.en.nextYear})).toHaveProperty("disabled",true);
        fireEvent.click(within(dialog).getByRole("button",{name:/Week 2:/}));
        expect(choose).toHaveBeenCalledWith("2026-09-26"); expect(screen.queryByRole("dialog")).toBeNull();
        expect(view.container.querySelector(".period-range")).toBeNull();
    });
    it("returns focus to the range trigger when Escape closes the calendar", () => {
        render(<PeriodControls period="month" setPeriod={vi.fn()} anchor={SAMPLE_DATE} setAnchor={vi.fn()} t={messages.fa}/>);
        const trigger=screen.getByRole("button",{name:messages.fa.selectedDate}); fireEvent.click(trigger);
        expect(screen.getByRole("dialog")).toBeTruthy(); fireEvent.keyDown(window,{key:"Escape"});
        expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
    });
});
describe("distribution and scoped statistics", () => {
    it("uses the supplied summary without another period switch or data source", () => {
        const summary = summarize(sampleHistory.slice(0,7)); const view=render(<HeroPositionDistribution summary={summary} t={messages.en} period="month" onFilter={vi.fn()} onReset={vi.fn()}/>);
        expect(view.container.querySelector(".ring-center strong")?.textContent).toBe("7");
        expect(screen.queryByRole("button",{name:messages.en.monthly,exact:true})).toBeNull();
        expect(screen.queryByRole("button",{name:messages.en.selectedDate})).toBeNull();
    });
    it("filters positions using the keyboard-accessible legend and retains the hero filter", () => {
        const select=vi.fn(), reset=vi.fn(); render(<HeroPositionDistribution summary={summarize(sampleHistory.slice(0,7))} t={messages.en} period="week" hero="8" onFilter={select} onReset={reset}/>);
        fireEvent.click(screen.getByRole("button",{name:"Filter by position: Carry"})); expect(select).toHaveBeenCalledWith("8","1");
        fireEvent.click(screen.getByRole("button",{name:messages.en.resetFilters})); expect(reset).toHaveBeenCalledOnce();
    });
    it("keeps every small icon unmasked on the ring with no background badges", () => {
        const summary = {...summarize([sampleHistory[0]]),total:100,heroes:[{id:8,count:98,wins:50,losses:48},{id:1,count:1,wins:1,losses:0},{id:2,count:1,wins:0,losses:1}],positions:[{id:1,count:100,wins:51,losses:49}]};
        const select=vi.fn(),view=render(<HeroPositionDistribution summary={summary} t={messages.en} period="week" onFilter={select} onReset={vi.fn()}/>);
        expect(view.container.querySelectorAll(".hero-segment")).toHaveLength(3); expect(view.container.querySelectorAll(".segment-icon image")).toHaveLength(4);
        expect(view.container.querySelector("clipPath, .segment-icon-backplate, .small-hero-shares")).toBeNull();
        expect(view.container.querySelectorAll("radialGradient")).toHaveLength(4);
        fireEvent.click(view.container.querySelectorAll(".segment-icon")[2]); expect(select).toHaveBeenCalledWith("1","all");
        const counts=[40,25,15,...Array(20).fill(1)];
        const layout=ringIconLayouts(counts,100,104,150);
        expect(layout.every(icon=>icon.size>=8)).toBe(true);
        for(const icon of layout) for(const dx of [-1,1]) for(const dy of [-1,1]) {
            const radius=Math.hypot(icon.x-160+dx*icon.size/2,icon.y-160+dy*icon.size/2);
            expect(radius).toBeLessThan(150); expect(radius).toBeGreaterThan(104);
        }
    });
    it("displays positive fractional shares without rounding them to zero", () => {
        expect(distributionPercent(.01,messages.en)).toBe("0.01%");
        expect(distributionPercent(.01,messages.fa)).not.toBe("۰٪");
    });
    it("labels the mean as filtered for hero, position, or other filters", () => {
        const summary=summarize(filterHistory("week",SAMPLE_DATE)),view=render(<Stats summary={summary} t={messages.en}/>);
        expect(screen.getByText(messages.en.periodAverageImpact)).toBeTruthy();
        for (const scope of [{hero:"8"},{position:"1"},{filtered:true}]) { view.rerender(<Stats summary={summary} t={messages.en} {...scope}/>); expect(screen.getByText(messages.en.filteredAverageImpact)).toBeTruthy(); }
    });
    it("applies combined hero and position filters to preview totals too", () => {
        const full=filterHistory("month",SAMPLE_DATE),hero=String(full[0].heroId),position=String(full[0].position);
        const filtered=filterHistory("month",SAMPLE_DATE,"","all",position,hero);
        expect(filtered.length).toBeGreaterThan(0); expect(filtered.every(row=>String(row.heroId)===hero && String(row.position)===position)).toBe(true);
        expect(summarize(filtered).heroes).toHaveLength(1);
    });
});
