import { heroById } from "../../data/heroes";
import type { DotaTeam, MatchAnalysisEvent, MatchFarmWindow, MatchMapAnalysis, MatchMapPoint, MatchMinuteSnapshot, MatchObjectiveEvent, TimelineState } from "../types";

type Raw = Record<string, unknown>;

const INVIS_HEROES = new Map<number, string>([[9,"Mirana"],[16,"Sand King"],[32,"Riki"],[46,"Templar Assassin"],[56,"Clinkz"],[62,"Bounty Hunter"],[63,"Weaver"],[74,"Invoker"],[83,"Treant Protector"],[88,"Nyx Assassin"],[93,"Slark"]]);
const NATURAL_REVEAL = new Map<number, string>([[22,"Zeus"],[28,"Slardar"]]);
const record = (value: unknown): Raw | null => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : null;
const records = (value: unknown) => Array.isArray(value) ? value.map(record).filter((item): item is Raw => Boolean(item)) : [];
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const eventTime = (entry: Raw) => num(entry.time) ?? num(entry.timestamp) ?? 0;
const percentage = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : null;

/** OpenDota positions use the Dota grid (roughly 64..192), not a 0..255 canvas. */
export function dotaCoordinate(value: number) { return Math.max(0, Math.min(100, (value - 64) / 128 * 100)); }
function mapPoint(x: number, y: number) { return { x: dotaCoordinate(x), y: 100 - dotaCoordinate(y) }; }

function purchaseEntries(player: Raw) {
  return records(player.purchase_log).flatMap((entry) => {
    const key = (str(entry.key) || "").replace(/^item_/, "");
    const second = Math.max(0, eventTime(entry));
    return key ? [{ key, second, minute: Math.floor(second / 60) }] : [];
  });
}
function countPurchase(player: Raw, ...keys: string[]) {
  const purchases = record(player.purchase);
  const count = keys.reduce((sum, key) => sum + (num(player[`purchase_${key}`]) ?? num(purchases?.[key]) ?? 0), 0);
  return count || purchaseEntries(player).filter((entry) => keys.includes(entry.key)).length;
}
function firstPurchaseSecond(player: Raw, ...keys: string[]) {
  const values = purchaseEntries(player).filter((entry) => keys.includes(entry.key)).map((entry) => entry.second);
  return values.length ? Math.min(...values) : null;
}
function levelSixMinute(player: Raw) {
  const xp = Array.isArray(player.xp_t) ? player.xp_t.map(num) : [];
  const minute = xp.findIndex((value) => value !== null && value >= 2_400);
  return minute >= 0 ? minute : null;
}
function teamOf(player: Raw): DotaTeam | null { const slot = num(player.player_slot); return slot === null ? null : slot < 128 ? "radiant" : "dire"; }

interface WardLife { start: number; end: number; seconds: number; }
function wardLives(player: Raw) {
  const removed = new Map(records(player.obs_left_log).flatMap((entry) => num(entry.ehandle) === null || num(entry.time) === null ? [] : [[num(entry.ehandle) as number, num(entry.time) as number] as const]));
  return records(player.obs_log).flatMap((entry): WardLife[] => {
    const handle = num(entry.ehandle), start = num(entry.time), end = handle === null ? null : removed.get(handle) ?? null;
    return start === null || end === null || end < start ? [] : [{ start, end, seconds: end - start }];
  });
}

export function playerEvents(player: Raw, allPlayers: Raw[], heroId: number, team: DotaTeam): MatchAnalysisEvent[] {
  const events: MatchAnalysisEvent[] = [];
  const add = (source: unknown, type: MatchAnalysisEvent["type"], label: string, positive: boolean | null) => records(source).forEach((entry, index) => {
    const second = Math.max(0, eventTime(entry)), key = str(entry.key) || label;
    events.push({ id:`${type}-${second}-${index}-${key}`, minute:Math.floor(second/60), second, type, label:key.replace(/^item_/, "").replaceAll("_", " "), x:num(entry.x), y:num(entry.y), positive });
  });
  add(player.kills_log,"kill","Kill",true); add(player.deaths_log,"death","Death",false); add(player.buyback_log,"buyback","Buyback",null); add(player.obs_log,"ward","Observer Ward",true); add(player.sen_log,"sentry","Sentry Ward",true);
  purchaseEntries(player).forEach((entry,index) => { const type = entry.key.includes("smoke") ? "smoke" : entry.key.includes("dust") ? "dust" : "item"; events.push({ id:`${type}-${entry.second}-${index}`, minute:entry.minute, second:entry.second, type, label:entry.key.replaceAll("_", " ") }); });
  if (!events.some((entry) => entry.type === "death")) {
    const slug = heroById(heroId)?.slug.replaceAll("-", "_").toLowerCase();
    if (slug) allPlayers.forEach((opponent, opponentIndex) => {
      if (teamOf(opponent) === team) return;
      records(opponent.kills_log).forEach((entry,index) => {
        const victim = (str(entry.key) || "").toLowerCase();
        if (!victim.endsWith(slug) && !victim.includes(`hero_${slug}`)) return;
        const second = Math.max(0,eventTime(entry));
        events.push({ id:`death-${opponentIndex}-${second}-${index}`, minute:Math.floor(second/60), second, type:"death", label:"Death", detail:"از Kill log تیم حریف استخراج شد", positive:false });
      });
    });
  }
  return events.sort((left,right) => left.second-right.second);
}

function lanePoints(player: Raw): MatchMapPoint[] {
  const lane = record(player.lane_pos); if (!lane) return [];
  return Object.entries(lane).flatMap(([xKey,value]) => {
    const nested = record(value);
    if (nested) return Object.entries(nested).flatMap(([yKey,weight]) => !Number.isFinite(Number(xKey)) || !Number.isFinite(Number(yKey)) || num(weight) === null ? [] : [{ ...mapPoint(Number(xKey),Number(yKey)), minute:null, weight:num(weight) as number, type:"movement" as const }]);
    const match = /(-?\d+(?:\.\d+)?)[,|:](-?\d+(?:\.\d+)?)/.exec(xKey);
    return match && num(value) !== null ? [{ ...mapPoint(Number(match[1]),Number(match[2])), minute:null, weight:num(value) as number, type:"movement" as const }] : [];
  });
}
function closest(timeline: MatchMinuteSnapshot[], minute: number) { return [...timeline].reverse().find((point) => point.minute <= minute); }
function windowState(gain:number|null, previous:number|null, deaths:number):TimelineState { if(gain===null||previous===null||previous<=0)return "steady";const ratio=gain/previous;if(deaths&&ratio<.7)return "setback";if(ratio>=1.3)return "surge";if(ratio>=.85)return "progress";if(ratio<.55)return "out";return "steady"; }
function farmWindows(timeline: MatchMinuteSnapshot[], events: MatchAnalysisEvent[], duration: number): MatchFarmWindow[] {
  const borders=[0,5,10,20,30,40,60].filter((minute)=>minute<duration);if(borders.at(-1)!==duration)borders.push(duration);let previous:number|null=null;
  return borders.slice(0,-1).map((from,index)=>{const to=borders[index+1],start=closest(timeline,from),end=closest(timeline,to);const delta=(key:"lastHits"|"gold")=>end?.[key]==null?null:start?.[key]!=null?end[key]-start[key]:from===0?end[key]:null;const farmGain=delta("gold"),perMinute=farmGain===null?null:farmGain/Math.max(1,to-from),deaths=events.filter((event)=>event.type==="death"&&event.minute>=from&&event.minute<to).length,state=windowState(perMinute,previous,deaths);if(perMinute!==null)previous=perMinute;return{from,to,lastHits:delta("lastHits"),netWorth:end?.gold??null,xp:end?.xp??null,farmGain,deaths,state,note:deaths?`${deaths.toLocaleString("fa-IR")} Death در این بازه ثبت شده؛ ارتباط مستقیم با افت Farm فقط با Replay قابل اثبات است.`:"اعداد این بازه از Timeline موجود استخراج شده‌اند؛ علت تغییر نیازمند Replay است."};});
}

function objectiveKind(name:string):MatchObjectiveEvent["type"] { return name.includes("roshan")?"roshan":name.includes("tower")?"tower":name.includes("barrack")?"barracks":"other"; }
function objectiveTeam(entry:Raw):DotaTeam|null { const slot=num(entry.player_slot)??num(entry.slot);if(slot!==null)return slot<128?"radiant":"dire";const team=num(entry.team);if(team===0||team===2)return "radiant";if(team===1||team===3)return "dire";const key=`${str(entry.key)||""}`.toLowerCase();if(key.includes("goodguys"))return "dire";if(key.includes("badguys"))return "radiant";return null; }
function objectiveAnalysis(rawMatch:Raw,player:Raw,team:DotaTeam){const playerSlot=num(player.player_slot);const parsedEvents=records(rawMatch.objectives).flatMap((entry):MatchObjectiveEvent[]=>{const rawType=`${str(entry.type)||""} ${str(entry.key)||""}`.trim().toLowerCase(),type=objectiveKind(rawType),isReliable=type!=="other"||rawType.includes("miniboss");if(!isReliable||objectiveTeam(entry)!==team)return[];const second=eventTime(entry),actorSlot=num(entry.player_slot)??num(entry.slot);return[{type:rawType.includes("miniboss")?"other":type,minute:Math.floor(second/60),label:rawType.replaceAll("_"," ")||"Objective",playerPresent:actorSlot===null?null:actorSlot===playerSlot,delayAfterFightSeconds:null,convertedFromFight:null}];});const kinds=parsedEvents.map((entry)=>entry.type);return{availability:parsedEvents.length||num(player.tower_damage)!==null?"partial" as const:"unavailable" as const,towerDamage:num(player.tower_damage),roshanKills:parsedEvents.length?kinds.filter((kind)=>kind==="roshan").length:null,towerKills:parsedEvents.length?kinds.filter((kind)=>kind==="tower").length:null,barracksKills:parsedEvents.length?kinds.filter((kind)=>kind==="barracks").length:null,conversionCount:null,missedConversionCount:null,averageConversionDelaySeconds:null,events:parsedEvents,note:parsedEvents.length?"فقط Objectiveهای قطعی ثبت‌شده در داده Match نمایش داده می‌شوند؛ Presence یا Conversion حدس زده نمی‌شود.":"Objective log قابل اتکا برای این Match در دسترس نیست."};}

function rawPosition(player:Raw){const position=num(player.position_est);if(position&&position>=1&&position<=5)return Math.round(position);const lane=num(player.lane_role);return lane&&lane>=1&&lane<=3?Math.round(lane):null;}
function invisThreats(allPlayers:Raw[],team:DotaTeam){return allPlayers.filter((entry)=>teamOf(entry)!==team).flatMap((entry)=>{const heroId=num(entry.hero_id),heroName=heroId===null?"Unknown":heroById(heroId)?.name??`Hero ${heroId}`,position=rawPosition(entry),result:Array<{label:string;second:number;active:boolean;position:number|null}>=[];if(heroId!==null&&INVIS_HEROES.has(heroId))result.push({label:`${heroName} · Ability Invis`,second:(levelSixMinute(entry)??6)*60,active:true,position});const complete=firstPurchaseSecond(entry,"glimmer_cape","shadow_blade","silver_edge");if(complete!==null)result.push({label:`${heroName} · Invis Item`,second:complete,active:true,position});const purchases=purchaseEntries(entry),amulet=purchases.find((item)=>item.key==="shadow_amulet"),secondary=purchases.find((item)=>item.key==="cloak"||item.key==="blitz_knuckles");if(amulet&&complete===null)result.push({label:`${heroName} · Invis build intent${secondary?" (high confidence)":""}`,second:Math.max(amulet.second,secondary?.second??amulet.second),active:false,position});return result;});}
function utilityAnalysis(player:Raw,allPlayers:Raw[],team:DotaTeam){const observers=num(player.obs_placed)??countPurchase(player,"ward_observer"),sentries=num(player.sen_placed)??countPurchase(player,"ward_sentry"),dust=countPurchase(player,"dust"),gem=countPurchase(player,"gem"),smoke=countPurchase(player,"smoke_of_deceit"),lives=wardLives(player),average=lives.length?Math.round(lives.reduce((sum,value)=>sum+value.seconds,0)/lives.length):null,early=lives.length?lives.filter((value)=>value.seconds<120).length:null,teamPlayers=allPlayers.filter((entry)=>teamOf(entry)===team),threats=invisThreats(allPlayers,team),firstThreat=threats.length?Math.floor(Math.min(...threats.map((entry)=>entry.second))/60):null,ownFirst=firstPurchaseSecond(player,"dust","ward_sentry","gem"),natural=teamPlayers.flatMap((entry)=>{const id=num(entry.hero_id);return id!==null&&NATURAL_REVEAL.has(id)?[NATURAL_REVEAL.get(id)!]:[];}),smokeKills=records(player.kills_log).filter((entry)=>entry.smoke===true||num(entry.smoke)===1).length;return{availability:observers+sentries+dust+smoke+gem||threats.length?"partial" as const:"unavailable" as const,observersPlaced:observers,sentriesPlaced:sentries,observersDestroyed:num(player.observer_kills),sentriesDestroyed:num(player.sentry_kills),averageObserverLifetimeSeconds:average,observersDewardedEarly:early,visionValue:null,objectiveWardCoverage:null,campsStacked:num(player.camps_stacked)??num(player.creeps_stacked),smokeUses:smoke,successfulSmokes:null,smokeKillParticipations:smokeKills,dustUses:dust,gemPurchases:gem,invisThreat:threats.some((entry)=>entry.active)?"active" as const:threats.length?"possible" as const:"none" as const,invisThreats:[...new Set(threats.map((entry)=>entry.label))],naturalReveal:[...new Set(natural)],firstThreatMinute:firstThreat,firstDetectionMinute:ownFirst===null?null:Math.floor(ownFirst/60),preparedBeforeThreat:firstThreat===null||ownFirst===null?null:ownFirst<=firstThreat*60,coverageGapMinutes:null,teamDetectionScore:null,individualContribution:null,responsibilityScore:null,note:"خریدها، Wardها و Killهای دارای Smoke مستقیماً از Match ثبت شده‌اند؛ امتیاز تخمینی نمایش داده نمی‌شود."};}

export function buildPlayerMapAnalysis({player,allPlayers,rawMatch,timeline,events,team}:{player:Raw;allPlayers:Raw[];rawMatch:Raw;timeline:MatchMinuteSnapshot[];events:MatchAnalysisEvent[];team:DotaTeam;position:number|null}):MatchMapAnalysis{
  const aggregate=lanePoints(player),vision=events.flatMap((event):MatchMapPoint[]=>(event.type!=="ward"&&event.type!=="sentry")||event.x==null||event.y==null?[]:[{...mapPoint(event.x,event.y),minute:event.minute,weight:1,type:"vision",label:event.label}]),points=[...aggregate,...vision];
  const lane=num(player.lane_kills),neutral=num(player.neutral_kills),ancient=num(player.ancient_kills),stacked=num(player.camps_stacked)??num(player.creeps_stacked),total=(lane??0)+(neutral??0)+(ancient??0),farmKnown=[lane,neutral,ancient,stacked].some((value)=>value!==null)||timeline.length>1,deadSeconds=num(player.life_state_dead),deathCost=deadSeconds===null||num(player.gold_per_min)===null?null:Math.round(deadSeconds/60*(num(player.gold_per_min) as number));
  const farm={availability:farmKnown?"partial" as const:"unavailable" as const,laneCreeps:lane,neutralCreeps:neutral,ancientCreeps:ancient,stackedCamps:stacked,farmUptimePercent:null,recoveryRate:null,deathCost,emptyTravelMinutes:null,farmToImpact:null,sourceMix:{lane:percentage(lane??0,total),neutral:percentage(neutral??0,total),ancient:percentage(ancient??0,total)},windows:farmWindows(timeline,events,Math.max(1,timeline.at(-1)?.minute??1)),note:"LH، NW/Gold، XP، Death و منبع Creep از داده واقعی نمایش داده می‌شوند؛ Farm Route و Uptime بدون Replay نتیجه‌گیری نمی‌شوند."},objectives=objectiveAnalysis(rawMatch,player,team),utility=utilityAnalysis(player,allPlayers,team),movement={availability:aggregate.length?"partial" as const:"unavailable" as const,safeTerritoryPercent:null,enemyTerritoryPercent:null,combatPoints:0,objectivePoints:0,timedTrailPoints:0,note:aggregate.length?"این Heatmap پوشش تجمعی کل Match است و مسیر یا بازه زمانی حرکت را نشان نمی‌دهد.":"مختصات تجمعی قابل اتکا برای این Match در دسترس نیست."};
  return{availability:points.length||farmKnown||objectives.availability!=="unavailable"||utility.availability!=="unavailable"?"partial":"unavailable",coordinateSource:aggregate.length?"aggregate":vision.length?"timed":"unavailable",points,trail:[],farm,objectives,utility,movement};
}
