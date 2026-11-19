// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PerformanceAnalysis from "../src/components/PerformanceAnalysis";
import LaneEfficiencyWorkspace from "../src/components/LaneEfficiencyWorkspace";
import { messages } from "../src/i18n";
import { performanceFixture } from "./fixtures/performance-analysis";
import { applyAnalysisPositionOverrides, buildPositionSwapUpdates } from "../../web/lib/dota/analysis-position-overrides";

vi.mock("../src/components/Workspace", () => ({ Position: ({ value }: {value:number}) => <span>Pos {value}</span>, Score: ({ value }: {value:number}) => <span>{value}</span> }));
vi.mock("../src/components/AnimatedContent", () => ({ AnimatedContent: ({ children }: {children:React.ReactNode}) => <div>{children}</div> }));
afterEach(cleanup);

describe("Performance lane workspace", () => {
  it("updates both teammates' Lane tables and score metrics after a role swap", () => {
    const original=performanceFixture(), updates=buildPositionSwapUpdates(original.players,0,4);
    const next=applyAnalysisPositionOverrides(original,updates);
    expect(next.players[0].laneEfficiency?.parts.find(p=>p.key==="ward")?.maximum).toBe(25);
    expect(next.players[3].laneEfficiency?.parts.find(p=>p.key==="ward")?.maximum).toBe(1);
    for (const player of [next.players[0],next.players[3]]) expect(player.scoreMetrics?.find(m=>m.key==="lane_score")?.value).toBe(player.laneEfficiency?.score);
    expect(original.players[0].laneEfficiency?.parts.find(p=>p.key==="ward")?.maximum).toBe(1);
  });
  it("shows actual eight-part calculation and keeps event details collapsed", () => {
    const analysis=performanceFixture(), player=analysis.players[0], lane=player.laneEfficiency!;
    render(<LaneEfficiencyWorkspace player={player} players={analysis.players} fa={false}/>);
    const table=screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(9);
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("00:00 – 10:00")).toBeTruthy();
    expect(screen.getByText(`${lane.score} / 100`)).toBeTruthy();
    expect(document.querySelectorAll("details[open]")).toHaveLength(0);
    const bonus=screen.getByText("Bonus").closest("summary")!;
    fireEvent.click(bonus);
    expect(screen.getByText("Verified Join")).toBeTruthy();
    expect(screen.queryByText("hero-position")).toBeNull();
  });

  it("shows partial coverage and missing metrics instead of presenting a complete assessment", () => {
    const analysis=performanceFixture(), player=analysis.players[0], lane=player.laneEfficiency!;
    player.laneEfficiency={...lane,status:"partial",covered:74,parts:lane.parts.map(part=>part.key==="lh"?{...part,value:null,reason:"missing-reference"}:part)};
    render(<LaneEfficiencyWorkspace player={player} players={analysis.players} fa/>);
    expect(screen.getByText("ارزیابی با دادهٔ ناقص")).toBeTruthy();
    expect(screen.getByText("74 / 100")).toBeTruthy();
    expect(screen.getAllByText("مرجع ماهانه موجود نیست").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-lane-part="lh"]')?.textContent).toContain("—");
  });

  it("rejects legacy cached Lane DTOs", () => {
    const analysis=performanceFixture(), player=analysis.players[0];
    player.laneEfficiency={...player.laneEfficiency!,version:1} as unknown as typeof player.laneEfficiency;
    render(<LaneEfficiencyWorkspace player={player} players={analysis.players} fa={false}/>);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/stored analysis predates/)).toBeTruthy();
  });

  it("groups teams, changes tabs by keyboard and preserves manual position swaps", () => {
    const analysis=performanceFixture(), onSelect=vi.fn(), onPositionOverrides=vi.fn();
    render(<PerformanceAnalysis analysis={analysis} selected={0} onSelect={onSelect} onPositionOverrides={onPositionOverrides} t={messages.en}/>);
    expect(within(screen.getByRole("group",{name:"Radiant"})).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(within(screen.getByRole("group",{name:"Dire"})).getAllByRole("button")[0]);expect(onSelect).toHaveBeenCalledWith(128);
    const initial=screen.getByRole("tab",{name:messages.en.performance});
    fireEvent.keyDown(initial,{key:"ArrowRight"});
    expect(screen.getByRole("tab",{name:messages.en.laneEfficiency}).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("table")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:messages.en.position}));fireEvent.click(within(screen.getByRole("dialog",{name:messages.en.position})).getByRole("button",{name:"Mid"}));
    expect(onPositionOverrides).toHaveBeenCalledWith({"0":2,"1":1});
  });
});
