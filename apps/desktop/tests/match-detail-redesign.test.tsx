// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MatchMapWorkspace } from "../src/components/MatchMapWorkspace";
import { MatchBuildTimeline } from "../src/components/MatchBuildTimeline";
import PerformanceAnalysis from "../src/components/PerformanceAnalysis";
import { MatchOverviewExtras } from "../src/components/MatchOverviewExtras";
import { applyAnalysisPositionOverrides, buildPositionSwapUpdates } from "../../web/lib/dota/analysis-position-overrides";
import { performanceFixture } from "./fixtures/performance-analysis";
import { messages } from "../src/i18n";
import type { Match, MatchMapAnalysis, MatchMinuteSnapshot } from "../../web/lib/types";
vi.mock("../src/components/MatchMotion",()=>({MatchMotion:({children}:{children:React.ReactNode})=><div>{children}</div>}));
afterEach(cleanup);
describe("Unified match report",()=>{
  it("embeds player assessment without another header, roster or tablist",()=>{
    const analysis=performanceFixture();
    const view=render(<PerformanceAnalysis analysis={analysis} selected={128} onSelect={vi.fn()} onPositionOverrides={vi.fn()} t={messages.en} workspaceView="performance"/>);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(view.container.querySelector(".performance-player-header")).toBeNull();
    expect(view.container.querySelector(".performance-roster")).toBeNull();
    expect(view.container.querySelectorAll(".lane-metric-card")).toHaveLength(6);
  });
  it("never applies a time interval to aggregate coordinates, and excludes untimed points from timed filtering",()=>{
    const player=performanceFixture().players[0];
    player.map={coordinateSource:"aggregate",points:[{x:20,y:30,type:"movement",minute:null,weight:10}],trail:[],movement:{},utility:{},farm:{windows:[]},objectives:{events:[]}} as unknown as MatchMapAnalysis;
    const view=render(<MatchMapWorkspace player={player} duration={40} t={messages.en}/>);
    expect((screen.getByRole("slider",{name:"Interval start"}) as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
    expect(view.container.querySelectorAll(".spatial-point")).toHaveLength(1);
    player.map={...player.map,coordinateSource:"timed",points:[...player.map.points,{x:50,y:50,type:"movement",minute:12,weight:1},{x:60,y:60,type:"movement",minute:25,weight:1}]};
    view.rerender(<MatchMapWorkspace player={player} duration={40} t={messages.en}/>);
    fireEvent.change(screen.getByRole("slider",{name:"Interval start"}),{target:{value:"10"}});
    fireEvent.change(screen.getByRole("slider",{name:"Interval end"}),{target:{value:"20"}});
    expect(view.container.querySelectorAll(".spatial-point")).toHaveLength(1);
    expect(view.container.querySelector(".spatial-point")?.getAttribute("cx")).toBe("50");
    expect(view.container.querySelector("polyline")).toBeNull();
  });
  it("uses exact phase snapshots, preserves nulls, and assigns boundary purchases to one phase",()=>{
    const analysis=performanceFixture(),player=analysis.players[0];
    player.timeline=[{minute:0,gold:0,xp:0,lastHits:0,denies:0},{minute:10,gold:4200,xp:null,lastHits:50,denies:4}] as MatchMinuteSnapshot[];
    player.itemTimings=[{key:"item_blink",label:"Blink Dagger",second:600,minute:10,category:"core",relativeToReference:"unavailable",deltaMinutes:null,referenceMinute:null,note:""}];
    const view=render(<MatchBuildTimeline player={player} analysis={analysis} t={messages.en}/>);
    expect(view.container.querySelector(".phase-growth")?.textContent).toContain("4,200");
    expect(screen.queryByAltText("Blink Dagger")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"10:00 – 20:00"}));
    expect(screen.getByAltText("Blink Dagger")).toBeTruthy();
    expect(screen.getByText(/Exact boundary snapshots/)).toBeTruthy();
    expect([...view.container.querySelectorAll(".phase-growth dd")].every(node=>node.textContent==="—")).toBe(true);
  });
  it("renders production purchase events even when itemTimings is empty",()=>{
    const analysis=performanceFixture(),player=analysis.players[0];
    player.itemTimings=[];
    player.events=[{id:"item-300",type:"item",label:"magic_wand",minute:5,second:300},{id:"dust-330",type:"dust",label:"dust",minute:5,second:330}];
    render(<MatchBuildTimeline player={player} analysis={analysis} t={messages.en}/>);
    expect(screen.getByAltText("Magic Wand")).toBeTruthy();
    expect(screen.getByText("5:00")).toBeTruthy();
    expect(screen.getByAltText("Dust of Appearance")).toBeTruthy();
  });
  it("rebuilds core opponents after a role swap and rejects short-match snapshots",()=>{
    const analysis=performanceFixture(),match={analysis} as Match;
    const view=render(<MatchOverviewExtras match={match} t={messages.en}/>);
    const row=()=>view.container.querySelector('[data-matchup-player="0"]')!;
    expect(row().querySelectorAll("figcaption")[1].textContent).toBe(analysis.players.find(p=>p.playerSlot===130)!.heroName);
    const next=applyAnalysisPositionOverrides(analysis,buildPositionSwapUpdates(analysis.players,0,2));
    view.rerender(<MatchOverviewExtras match={{...match,analysis:next}} t={messages.en}/>);
    expect(row().querySelectorAll("figcaption")[1].textContent).toBe(next.players.find(p=>p.playerSlot===129)!.heroName);
    expect(row().querySelector("strong")?.textContent).toContain("NW");
    view.rerender(<MatchOverviewExtras match={{...match,analysis:{...next,durationMinutes:8}}} t={messages.en}/>);
    expect(row().querySelector("strong")?.textContent).toBe("—");
    expect(row().textContent).toContain("Exact data unavailable");
  });
});
