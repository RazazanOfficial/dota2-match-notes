import { describe, expect, it } from "vitest";
import { applyAnalysisPositionOverrides, buildPositionSwapUpdates } from "../lib/dota/analysis-position-overrides";
import type { MatchAnalysis, MatchPlayerAnalysis } from "../lib/types";

function player(playerSlot:number,position:number):MatchPlayerAnalysis {
  return {
    playerSlot, accountId:null, heroId:playerSlot+1, heroName:`Hero ${playerSlot}`,
    personName:"Player", team:"radiant", position, positionLabel:"", isProfilePlayer:playerSlot===0,
    kills:1,deaths:1,assists:1,performanceScore:0,benchmarks:[{
      key:"gold_per_min",label:"GPM",value:500,formattedValue:"500",percentile:80,
      qualityPercentile:80,tone:"elite",source:"hero",
    }],scoreMetrics:[{
      key:"gold_per_min",label:"GPM",value:500,formattedValue:"500",percentile:80,
      qualityPercentile:80,tone:"elite",source:"hero",
    }],strengths:[],weaknesses:[],timeline:[],timelineSource:"unavailable",
    events:[],benchmarkSource:"hero",
  };
}

function analysis():MatchAnalysis {
  return {status:"ready",dotaMatchId:"1",durationMinutes:40,parsed:true,coverage:{benchmarkPlayers:2,timelinePlayers:0,totalPlayers:2},players:[player(0,3),player(1,4)],teamTimeline:[]};
}

describe("analysis position overrides",()=>{
  it("swaps the occupant instead of creating duplicate positions",()=>{
    expect(buildPositionSwapUpdates(analysis().players,0,4)).toEqual({"0":4,"1":3});
  });

  it("recalculates scores and clears detected swap state",()=>{
    const next=applyAnalysisPositionOverrides(analysis(),{"0":4,"1":3});
    expect(next.players.map((entry)=>entry.position)).toEqual([4,3]);
    expect(next.players.every((entry)=>entry.positionResolution?.source==="manual")).toBe(true);
    expect(next.players.every((entry)=>entry.positionResolution?.roleSwapDetected===false)).toBe(true);
    expect(next.players.every((entry)=>entry.performanceScore===80)).toBe(true);
  });
});
