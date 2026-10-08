import {describe,expect,it} from "vitest";
import {extractLoadout} from "../src/lib/dota/match-loadout";
import {createMatchBuffCollector} from "../scripts/replay-parser/match-buffs.mjs";
describe("compact final inventory and buffs",()=>{
 it("keeps all six slots and permanent values, with consumed upgrades only once",()=>{
  const result=extractLoadout({item_0:50,item_1:0,item_2:108,item_3:36,item_4:247,item_5:609,aghanims_scepter:1,aghanims_shard:true,permanent_buffs:[{permanent_buff:2,stack_count:1},{permanent_buff:3,stack_count:20},{permanent_buff:5,stack_count:88},{permanent_buff:8,stack_count:9},{permanent_buff:999,stack_count:2}]});
  expect(result.itemIds).toEqual([50,null,108,36,247,609]);
  expect(result.buffs.filter(b=>b.key==="ultimate_scepter")).toHaveLength(1);
  expect(result.buffs).toEqual(expect.arrayContaining([expect.objectContaining({key:"legion_commander_duel",stacks:88}),expect.objectContaining({key:"slark_essence_shift",stacks:9}),expect.objectContaining({key:"silencer_glaives_of_wisdom",stacks:20}),expect.objectContaining({key:"permanent_buff_999",stacks:2})]));
 });
 it("names Lifestealer's reported permanent buff 16 and retains its actual amount",()=>{
  const result=extractLoadout({permanent_buffs:[{permanent_buff:16,stack_count:312},{permanent_buff:6,stack_count:1}]});
  expect(result.buffs).toEqual([expect.objectContaining({key:"life_stealer_feast",label:"Permanent health",stacks:312}),expect.objectContaining({key:"tome_of_knowledge",itemId:257})]);
 });
 it("rejects malformed IDs/stacks and limits arrays",()=>{
  const result=extractLoadout({item_0:-1,item_1:"50",permanent_buffs:[{permanent_buff:"5",stack_count:40},{permanent_buff:5,stack_count:NaN},...Array.from({length:100},(_,i)=>({permanent_buff:i+100,stack_count:2}))]});
  expect(result.itemIds).toEqual([null,null,null,null,null,null]);expect(result.buffs.length).toBeLessThanOrEqual(32);expect(result.buffs[0].stacks).toBeNull();
 });
 it("credits explicitly logged Track payouts to either caster and each recipient without guessing",()=>{
  const collector=createMatchBuffCollector();
  for(const [index,slot,name,hero] of [[0,0,"bounty_hunter",62],[1,1,"rubick",86],[2,2,"juggernaut",8],[5,128,"axe",2]]){
   collector.accept({type:"player_slot",key:index,value:slot});collector.accept({type:"interval",slot:index,unit:`npc_dota_hero_${name}`,hero_id:hero});
  }
  const payout=(source:string,target:string,value:number,inflictor="bounty_hunter_track")=>collector.accept({type:"DOTA_COMBATLOG_GOLD",attackername:`npc_dota_hero_${source}`,targetname:`npc_dota_hero_${target}`,value,inflictor});
  payout("rubick","juggernaut",120);payout("rubick","juggernaut",140);payout("bounty_hunter","juggernaut",180);payout("rubick","axe",300);payout("rubick","juggernaut",1000,"other_ability");
  expect(collector.finish()).toEqual([{sourceSlot:1,beneficiaries:[{playerSlot:2,heroId:8,gold:260}]},{sourceSlot:0,beneficiaries:[{playerSlot:2,heroId:8,gold:180}]}]);
  expect(extractLoadout({},collector.finish()[0]).buffs[0]).toMatchObject({key:"bounty_hunter_track",stacks:260,sourceSlot:1});
 });
});
