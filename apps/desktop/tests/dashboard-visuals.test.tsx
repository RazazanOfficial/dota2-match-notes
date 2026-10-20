// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { HEROES } from "@/data/heroes";
import { messages } from "../src/i18n";
import { periodRange } from "../src/history";
import { periodMonth, periodMonthsInYear, periodWeeksInMonth, persianPeriodParts, shiftPeriodMonth } from "../src/historyPeriodPicker";
import { HERO_RING_PALETTES, POSITION_RING_PALETTES, distributionPalette } from "../src/distributionPalettes";
import { ringIconLayouts } from "../src/distributionGeometry";
import { PeriodControls } from "../src/components/DashboardControls";
import { Stats } from "../src/components/DashboardStats";
import { summarize } from "../src/history";

afterEach(cleanup);
describe("native icon palettes and geometry",()=>{
    it("covers every bundled hero and all positions with a stable local palette",()=>{
        expect(Object.keys(HERO_RING_PALETTES)).toHaveLength(HEROES.length);
        for(const hero of HEROES) expect(HERO_RING_PALETTES[hero.id]).toHaveLength(3);
        expect(Object.keys(POSITION_RING_PALETTES)).toHaveLength(6);
        expect(distributionPalette(8,true)).toBe(HERO_RING_PALETTES[8]);
        expect(distributionPalette(-1,true)).toBe(POSITION_RING_PALETTES[0]);
    });
    it("retains proportional angles and readable icons even for consecutive one-percent shares",()=>{
        const counts=[40,25,15,...Array(20).fill(1)];
        for(const [inner,outer] of [[59,100],[104,150]]) {
            const icons=ringIconLayouts(counts,100,inner,outer);
            expect(icons).toHaveLength(counts.length);
            icons.forEach((icon,index)=>{
                expect((icon.to-icon.from)/(Math.PI*2)).toBeCloseTo(counts[index]/100,8);
                expect(icon.size).toBeGreaterThanOrEqual(8);
                for(const dx of [-1,1]) for(const dy of [-1,1]) {
                    const radius=Math.hypot(icon.x-160+dx*icon.size*1.07/2,icon.y-160+dy*icon.size*1.07/2);
                    expect(radius).toBeGreaterThan(inner); expect(radius).toBeLessThan(outer);
                }
            });
        }
    });
});
describe("month and week explorer",()=>{
    it("navigates arbitrary Persian years including leap Esfand without fixed month dates",()=>{
        for(const date of ["2024-03-19","2025-03-20","2026-12-31","2027-03-21","2030-08-10"]) {
            const parts=persianPeriodParts(date),months=periodMonthsInYear(date);
            expect(months).toHaveLength(12);
            expect(persianPeriodParts(months[0].firstKey)).toEqual({year:parts.year,month:1});
            expect(persianPeriodParts(months[11].firstKey)).toEqual({year:parts.year,month:12});
            expect(persianPeriodParts(shiftPeriodMonth(date,12))).toEqual({year:parts.year+1,month:parts.month});
            expect(shiftPeriodMonth(shiftPeriodMonth(date,-12),12)).toBe(periodMonth(date).firstKey);
        }
    });
    it("clips selectable weeks to the registration week and today while preserving Saturday boundaries",()=>{
        const weeks=periodWeeksInMonth("2026-10-02","2026-09-26","2026-10-02");
        expect(weeks.filter(week=>week.enabled)).toHaveLength(1);
        const week=weeks.find(week=>week.enabled)!;
        expect(week.from).toBe("2026-09-26"); expect(week.to).toBe("2026-10-02");
        expect(periodRange("week",week.anchor)).toEqual({from:week.from,to:week.to});
    });
    it.each([messages.en,messages.fa])("selects a month directly, prevents future months, and restores focus",t=>{
        const choose=vi.fn(); render(<PeriodControls period="month" setPeriod={vi.fn()} anchor="2026-10-02" setAnchor={choose} t={t} registration="2026-04-01" maxDate="2026-10-02"/>);
        const trigger=screen.getByRole("button",{name:t.selectedDate}); fireEvent.click(trigger);
        const panel=screen.getByRole("dialog"),grid=within(panel).getByRole("group",{name:t.chooseMonth});
        const months=within(grid).getAllByRole("button"); expect(months).toHaveLength(12);
        expect(months[7]).toHaveProperty("disabled",true);
        fireEvent.click(months[5]); expect(choose).toHaveBeenCalledWith("2026-08-23");
        expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(trigger);
    });
    it("selects an earlier month and then its full week without resetting to the current month",()=>{
        const choose=vi.fn();render(<PeriodControls period="week" setPeriod={vi.fn()} anchor="2026-10-02" setAnchor={choose} t={messages.en} registration="2026-04-01" maxDate="2026-10-02"/>);
        fireEvent.click(screen.getByRole("button",{name:messages.en.selectedDate}));
        const panel=screen.getByRole("dialog"),grid=within(panel).getByRole("group",{name:messages.en.chooseMonth});
        fireEvent.click(within(grid).getAllByRole("button")[5]); expect(choose).not.toHaveBeenCalled();
        const weeks=within(panel).getByRole("group",{name:messages.en.chooseWeek});
        fireEvent.click(within(weeks).getByRole("button",{name:/Week 1:/}));
        expect(periodRange("week",choose.mock.calls[0][0])).toEqual({from:"2026-08-22",to:"2026-08-28"});
    });
    it("keeps an older selected month visible among the month shortcuts",()=>{
        function Harness(){const [anchor,setAnchor]=useState("2025-06-01");return <PeriodControls period="month" setPeriod={vi.fn()} {...{anchor,setAnchor}} t={messages.en} registration="2024-01-01" maxDate="2026-10-02"/>;}
        render(<Harness/>); const strip=screen.getByRole("group",{name:messages.en.chooseMonth});
        expect(within(strip).getAllByRole("button").filter(button=>button.getAttribute("aria-pressed")==="true")).toHaveLength(1);
    });
});
describe("explicit performance and victory meter",()=>{
    it.each([messages.en,messages.fa])("uses the full performance label and makes the score scale and scope explicit",t=>{
        const view=render(<Stats summary={{...summarize([]),score:82.3}} t={t}/>);
        expect(screen.getByText(t.periodAverageImpact)).toBeTruthy();
        expect(screen.getByText(t.selectedPeriod)).toBeTruthy(); expect(screen.getByText(t.pointsOutOf100)).toBeTruthy();
        expect(view.container.querySelector(".stat-impact")?.textContent).not.toContain("IMP");
        expect(view.container.querySelector(".stat-win-ring")).toBeNull();
    });
    it("renders exact zero and full win rates without a circular gauge",()=>{
        const view=render(<Stats summary={summarize([])} t={messages.en}/>);
        expect([...view.container.querySelectorAll<HTMLElement>(".winrate-meter i")].every(fill=>fill.style.width==="0%")).toBe(true);
        view.rerender(<Stats summary={{...summarize([]),total:5,wins:5,winRate:100}} t={messages.en}/>);
        expect([...view.container.querySelectorAll<HTMLElement>(".winrate-meter i")].every(fill=>fill.style.width==="100%")).toBe(true);
    });
});
