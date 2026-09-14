import {describe,expect,it} from "vitest";
import {buildCohortAnalysis,classifyHeroPosition,type PerformanceReferenceData} from "../lib/dota/performance-cohort";
import {calculatePerformanceScore,positionMetricRelevance,performanceTone} from "../lib/dota/performance-score";
import {buildLaneImpact} from "../lib/dota/lane-impact-analysis";
import {buildItemOwnershipAnalysis} from "../lib/dota/item-ownership-analysis";
import {buildPlayerMapAnalysis} from "../lib/dota/match-map-analysis";
import type {MatchBenchmarkMetric,MatchMinuteSnapshot} from "../lib/types";

const metric=(key:string,value:number,qualityPercentile:number):MatchBenchmarkMetric=>({key,label:key,value,formattedValue:String(value),percentile:qualityPercentile,qualityPercentile,tone:performanceTone(qualityPercentile),source:"hero",confidence:"high"});
const timeline=(gold:number,xp:number,lastHits:number):MatchMinuteSnapshot[]=>[{minute:0,gold:600,xp:0,lastHits:0,denies:0,heroDamage:null,heroHealing:null,impact:null,goldDelta:null,xpDelta:null,lastHitDelta:null,state:"steady",label:""},{minute:10,gold,xp,lastHits,denies:3,heroDamage:null,heroHealing:null,impact:null,goldDelta:gold-600,xpDelta:xp,lastHitDelta:lastHits,state:"progress",label:""}];

describe("performance intelligence phase 2",()=>{
  it("classifies main, sub and rare positions from external hero meta",()=>{
    const rows=[
      {heroId:36,position:3,rankBracket:"LEGEND",gameMode:22,matchCount:700,winCount:350,positionShare:70,metaPickRate:2,winRate:50,positionSampleCount:20_000},
      {heroId:36,position:2,rankBracket:"LEGEND",gameMode:22,matchCount:220,winCount:110,positionShare:22,metaPickRate:1,winRate:50,positionSampleCount:20_000},
      {heroId:36,position:5,rankBracket:"LEGEND",gameMode:22,matchCount:80,winCount:40,positionShare:8,metaPickRate:.2,winRate:50,positionSampleCount:20_000},
    ];
    expect(classifyHeroPosition(rows,3)).toMatchObject({tier:"main",mainPosition:3});
    expect(classifyHeroPosition(rows,2)).toMatchObject({tier:"sub",mainPosition:3});
    expect(classifyHeroPosition(rows,5)).toMatchObject({tier:"rare",mainPosition:3});
  });

  it("pulls hero-level extremes toward neutral for a rare position without changing the raw percentile",()=>{
    const reference:PerformanceReferenceData={snapshot:{id:"x",fetchedAt:null,expiresAt:null,windowDays:7,stale:false},meta:[
      {heroId:36,position:3,rankBracket:"LEGEND",gameMode:22,matchCount:990,winCount:500,positionShare:99,metaPickRate:2,winRate:50.5,positionSampleCount:40_000},
      {heroId:36,position:5,rankBracket:"LEGEND",gameMode:22,matchCount:10,winCount:4,positionShare:1,metaPickRate:.02,winRate:40,positionSampleCount:40_000},
    ],benchmarks:[]};
    const result=buildCohortAnalysis({reference,heroId:36,position:5,rankTier:53,patch:"7.41",gameMode:22,durationMinutes:40,currentValues:{gold_per_min:700},fallbackMetrics:[metric("gold_per_min",700,90)]});
    expect(result.profile).toMatchObject({positionTier:"rare",mainPosition:3,heroPositionSamples:10});
    expect(result.metrics[0].percentile).toBe(90);
    expect(result.metrics[0].qualityPercentile).toBeGreaterThan(50);
    expect(result.metrics[0].qualityPercentile).toBeLessThan(75);
  });

  it("uses different metric relevance for carry and hard support",()=>{
    expect(positionMetricRelevance("last_hits_per_min",1)).toBeGreaterThan(positionMetricRelevance("last_hits_per_min",5));
    expect(positionMetricRelevance("assists_per_min",5)).toBeGreaterThan(positionMetricRelevance("assists_per_min",1));
    const metrics=[metric("gold_per_min",700,90),metric("last_hits_per_min",8,90),metric("assists_per_min",.7,20),metric("fight_participation",70,25)];
    expect(calculatePerformanceScore(metrics,40,1)).toBeGreaterThan(calculatePerformanceScore(metrics,40,5));
  });

  it("evaluates support lane impact without punishing low last hits",()=>{
    const support={player_slot:4,hero_id:3,lane_role:1,lh_t:[0,0,0,0,0,1,1,1,2,2,3],xp_t:[0,300,600,900,1200,1500,1800,2100,2350,2550,2761],gold_t:[600,750,900,1050,1200,1350,1450,1550,1650,1750,1804],purchase_log:[{time:0,key:"tango"},{time:25,key:"flask"},{time:110,key:"enchanted_mango"},{time:150,key:"ward_sentry"}],obs_log:[{time:90,ehandle:1}],sen_log:[{time:160,ehandle:2}]};
    const opponent={player_slot:132,hero_id:5,lane_role:3,lh_t:[0,0,0,0,1,1,2,2,2,3,3],xp_t:[0,250,500,750,1000,1250,1500,1750,2000,2200,2400],gold_t:[600,730,860,990,1120,1250,1380,1510,1640,1770,1900]};
    const result=buildLaneImpact({player:support,playerPosition:5,players:[support,opponent],positions:new Map([[4,5],[132,4]]),timeline:timeline(1804,2761,3),events:[{id:"kill",minute:4,second:263,type:"kill",label:"Kill",positive:true}]});
    expect(result).toMatchObject({roleGroup:"support",resourcePurchasesAt10:3,observerPlacementsAt10:1,sentryPlacementsAt10:1,lastHitsAt10:3});
    expect(result.assessment).not.toBe("behind");
    expect(result.note).toContain("LH");
  });

  it("does not treat Sentry as mobile invis detection and tracks ward lifetimes separately",()=>{
    const player={player_slot:0,hero_id:1,purchase_log:[{time:60,key:"ward_sentry"},{time:500,key:"dust"}],item_uses:{dust:2},obs_placed:1,sen_placed:1,obs_log:[{time:100,ehandle:10}],obs_left_log:[{time:400,ehandle:10}],sen_log:[{time:100,ehandle:20}],sen_left_log:[{time:520,ehandle:20}]};
    const riki={player_slot:128,hero_id:32,xp_t:[0,300,700,1100,1500,1900,2400]};
    const map=buildPlayerMapAnalysis({player,allPlayers:[player,riki],rawMatch:{duration:1800},timeline:timeline(4000,5000,50),events:[],team:"radiant",position:3});
    expect(map.utility).toMatchObject({firstThreatMinute:6,firstDetectionMinute:8,preparedBeforeThreat:false,dustUses:2,averageObserverLifetimeSeconds:300,averageSentryLifetimeSeconds:420,observersLastingAtLeast300Seconds:1,sentriesLastingAtLeast360Seconds:1});
  });

  it("infers Gem and Divine final ownership only from a unique purchase-to-holder chain",()=>{
    const players=[
      {player_slot:0,purchase_log:[{time:900,key:"gem"},{time:1200,key:"rapier"}],item_0:1,item_1:2},
      {player_slot:128,purchase_log:[],item_0:30,item_1:133},
    ];
    const events=buildItemOwnershipAnalysis(players);
    expect(events).toHaveLength(2);
    expect(events.every((event)=>event.transfer==="enemy"&&event.confidence==="high"&&event.transferAtSecond===null)).toBe(true);
    expect(events[0].limitation).toContain("زمان");
  });

  it("keeps the three reviewed matches as named regression scenarios",()=>{
    const necro=calculatePerformanceScore([metric("gold_per_min",676,74),metric("xp_per_min",949,72),metric("kills_per_min",.28,59),metric("deaths_per_min",.17,58),metric("assists_per_min",.69,99),metric("hero_damage_per_min",827,53),metric("hero_healing_per_min",116,46),metric("tower_damage",1831,57)],36.4,3);
    const phoenix=calculatePerformanceScore([metric("gold_per_min",521,80),metric("xp_per_min",683,64),metric("kills_per_min",.41,93),metric("deaths_per_min",.16,73),metric("assists_per_min",.3,28),metric("hero_damage_per_min",980,82),metric("hero_healing_per_min",40,49),metric("tower_damage",158,33)],36.4,3);
    const darkSeer=calculatePerformanceScore([metric("gold_per_min",501,48),metric("xp_per_min",790,71),metric("kills_per_min",.17,64),metric("deaths_per_min",.28,20),metric("assists_per_min",.52,70),metric("hero_damage_per_min",606,45),metric("hero_healing_per_min",75,84),metric("tower_damage",893,50)],46,3);
    // 8993503674: Phoenix can lead on combat, but cannot gain a fake lead from same-match ranking.
    expect(Math.abs(necro-phoenix)).toBeLessThan(20);
    // 8996016011: a high-heal Dark Seer signal cannot erase a poor death percentile.
    expect(darkSeer).toBeGreaterThan(35);expect(darkSeer).toBeLessThan(75);
    // 8993295425 Bane's lane behavior is covered by the support-specific lane test above.
  });
});
