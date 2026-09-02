import { describe,expect,it } from "vitest";
import { buildCohortAnalysis,type PerformanceReferenceData } from "../lib/dota/performance-cohort";
import { resolveMatchPositions } from "../lib/dota/position-resolver";
import { buildMatchAnalysis } from "../lib/dota/match-analysis";
import { parseHeroMetaResponse,parseOpenDotaBenchmarks } from "../lib/performance-reference/providers";

const reference:PerformanceReferenceData={snapshot:{id:"test",fetchedAt:"2026-09-02T00:00:00.000Z",expiresAt:"2026-09-05T00:00:00.000Z",windowDays:7,stale:false},meta:[{heroId:85,position:3,rankBracket:"LEGEND",gameMode:22,matchCount:30,winCount:17,positionShare:12.5,metaPickRate:1.8,winRate:56.7,positionSampleCount:20_000}],benchmarks:[{heroId:85,position:0,rankBracket:"ALL",gameMode:0,patch:"",metric:"gold_per_min",provider:"opendota",sampleCount:null,quantiles:[{percentile:.1,value:300},{percentile:.5,value:450},{percentile:.9,value:600}]}]};

describe("performance intelligence",()=>{
  it("uses external STRATZ meta and OpenDota distributions without local match cohorts",()=>{
    const result=buildCohortAnalysis({reference,heroId:85,position:3,rankTier:73,patch:"7.41",gameMode:22,durationMinutes:40,currentValues:{gold_per_min:520},fallbackMetrics:[]});
    expect(result.profile).toMatchObject({heroPositionSamples:30,positionSamples:20_000,heroPositionWeight:13,positionPickRate:12.5,metaPickRate:1.8,winRate:56.7,metaSource:"stratz"});
    expect(result.metrics[0]).toMatchObject({source:"hero",cohortLabel:"همان Hero · OpenDota snapshot · بدون تفکیک Position"});
    expect(result.metrics[0].qualityPercentile).toBeGreaterThan(60);
  });

  it("keeps the favorable OpenDota Death percentile instead of reversing it",()=>{
    const players=Array.from({length:10},(_,index)=>({account_id:100+index,player_slot:index<5?index:128+index-5,hero_id:index+1,kills:2,deaths:5,assists:6,last_hits:80,gold_per_min:400,xp_per_min:500,hero_damage:8_000,hero_healing:0,tower_damage:200,benchmarks:{deaths_per_min:{pct:.8354,raw:.14}}}));
    const analysis=buildMatchAnalysis({rawData:{match_id:1,start_time:1,duration:2_100,radiant_win:true,players}});
    expect(analysis?.players[0].benchmarks.find((metric)=>metric.key==="deaths_per_min")?.qualityPercentile).toBe(84);
  });

  it("normalizes provider responses into stable snapshot rows",()=>{
    const meta=parseHeroMetaResponse({data:{heroStats:{pos1:[{heroId:85,matchCount:10,winCount:6}],pos2:[],pos3:[{heroId:85,matchCount:30,winCount:15}],pos4:[],pos5:[]}}},"LEGEND",22);
    expect(meta.find((row)=>row.position===3)).toMatchObject({positionShare:75,metaPickRate:100,winRate:50});
    const benchmark=parseOpenDotaBenchmarks({hero_id:85,result:{gold_per_min:[{percentile:.1,value:300},{percentile:.5,value:450},{percentile:.9,value:600}],unsupported:[{percentile:.5,value:1}]}},85);
    expect(benchmark).toHaveLength(1);
    expect(benchmark[0].metric).toBe("gold_per_min");
  });

  it("links both players in an inferred Role Swap pair",()=>{
    const players=Array.from({length:10},(_,index)=>({player_slot:index<5?index:128+index-5,hero_id:index+1,gold_per_min:400,last_hits:80,lh_t:[0,5,10,15,20,25,30,35,40,45,50]}));
    const stratzRawData={players:players.map((player,index)=>({playerSlot:player.player_slot,position:`POSITION_${index===0?3:index===3?4:(index%5)+1}`}))};
    const result=resolveMatchPositions({players,stratzRawData,profileSlot:0,profileAssignedPosition:4});
    expect(result.get(0)).toMatchObject({detectedPosition:3,assignedPosition:4,roleSwapDetected:true,swapWithPlayerSlot:3});
    expect(result.get(3)).toMatchObject({detectedPosition:4,assignedPosition:3,roleSwapDetected:true,swapWithPlayerSlot:0});
  });

  it("derives farm windows, objective conversion and contextual invis readiness",()=>{
    const players=Array.from({length:10},(_,index)=>({account_id:1_000+index,player_slot:index<5?index:128+index-5,hero_id:index===5?32:index+1,kills:5,deaths:2,assists:8,last_hits:120,denies:4,gold_per_min:500,xp_per_min:600,net_worth:18_000,hero_damage:20_000,hero_healing:0,tower_damage:1_500,position_est:(index%5)+1,lane_kills:90,neutral_kills:30,ancient_kills:10,life_state_dead:80,times:Array.from({length:21},(_,minute)=>minute*60),gold_t:Array.from({length:21},(_,minute)=>600+minute*450),xp_t:Array.from({length:21},(_,minute)=>minute*500),lh_t:Array.from({length:21},(_,minute)=>minute*6),dn_t:Array.from({length:21},(_,minute)=>Math.floor(minute/3)),kills_log:index===0?[{time:600,key:"npc_dota_hero_riki"},{time:630,key:"npc_dota_hero_riki"}]:[],deaths_log:index===0?[{time:720}]:[],purchase_log:index===0?[{time:280,key:"dust"},{time:900,key:"mekansm"}]:[],obs_placed:index===0?2:0,sen_placed:index===0?2:0,obs_log:index===0?[{time:500,ehandle:1,x:120,y:130}]:[],obs_left_log:index===0?[{time:800,ehandle:1}]:[]}));
    const analysis=buildMatchAnalysis({profileAccountId:1_000,rawData:{match_id:8978303598,start_time:1_787_000_000,duration:1_200,radiant_win:true,radiant_score:25,dire_score:14,objectives:[{time:700,type:"CHAT_MESSAGE_TOWER_KILL",player_slot:0}],players}});
    const profile=analysis?.players[0];
    expect(profile?.map?.farm.windows.length).toBeGreaterThan(2);
    expect(profile?.map?.farm.sourceMix).toEqual({lane:69,neutral:23,ancient:8});
    expect(profile?.map?.objectives.conversionCount).toBe(1);
    expect(profile?.map?.utility).toMatchObject({invisThreat:"active",firstThreatMinute:5,firstDetectionMinute:4,preparedBeforeThreat:true,successfulSmokes:0});
    expect(profile?.map?.movement).toMatchObject({safeTerritoryPercent:null,enemyTerritoryPercent:null});
    expect(profile?.itemTimings?.some((item)=>item.key==="mekansm")).toBe(true);
  });
});
