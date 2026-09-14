import type { DotaTeam, MatchItemOwnershipEvent } from "../types";

type Raw=Record<string,unknown>;
type TrackedItem={item:MatchItemOwnershipEvent["item"];id:number;purchaseKeys:string[]};

const ITEMS:TrackedItem[]=[
  {item:"gem",id:30,purchaseKeys:["gem"]},
  {item:"divine_rapier",id:133,purchaseKeys:["rapier"]},
];
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
const record=(value:unknown):Raw|null=>value&&typeof value==="object"&&!Array.isArray(value)?value as Raw:null;
const records=(value:unknown)=>Array.isArray(value)?value.map(record).filter((entry):entry is Raw=>Boolean(entry)):[];
const slotOf=(player:Raw)=>num(player.player_slot);
const teamOfSlot=(slot:number|null):DotaTeam|null=>slot===null?null:slot<128?"radiant":"dire";
const purchaseKey=(entry:Raw)=>typeof entry.key==="string"?entry.key.replace(/^item_/,""):"";
const purchaseSecond=(entry:Raw)=>num(entry.time)??num(entry.timestamp);
const finalItems=(player:Raw)=>[0,1,2,3,4,5].map((index)=>num(player[`item_${index}`])).concat([0,1,2].map((index)=>num(player[`backpack_${index}`])));

export function buildItemOwnershipAnalysis(players:Raw[]):MatchItemOwnershipEvent[]{
  return ITEMS.flatMap((tracked):MatchItemOwnershipEvent[]=>{
    const purchases=players.flatMap((player)=>records(player.purchase_log).filter((entry)=>tracked.purchaseKeys.includes(purchaseKey(entry))).map((entry)=>({slot:slotOf(player),second:purchaseSecond(entry)})));
    const holders=players.filter((player)=>finalItems(player).includes(tracked.id)).map((player)=>slotOf(player)).filter((slot):slot is number=>slot!==null);
    if(!purchases.length&&!holders.length)return[];
    const purchaserSlots=[...new Set(purchases.map((entry)=>entry.slot).filter((slot):slot is number=>slot!==null))];
    const purchaser=purchaserSlots.length===1?purchaserSlots[0]:null;
    const holder=holders.length===1?holders[0]:null;
    const purchasedAt=purchaser===null?null:Math.min(...purchases.filter((entry)=>entry.slot===purchaser).map((entry)=>entry.second??Number.POSITIVE_INFINITY));
    const purchasedAtSecond=Number.isFinite(purchasedAt)?purchasedAt:null;
    const transfer=purchaser===null||holder===null?"unknown":purchaser===holder?"none":teamOfSlot(purchaser)===teamOfSlot(holder)?"ally":"enemy";
    const evidence:string[]=[];
    if(purchaser!==null)evidence.push(`Purchase log بازیکن ${purchaser} خرید را ثبت کرده است.`);
    else if(purchases.length)evidence.push("بیش از یک خریدار ثبت شده و خریدار یکتا نیست.");
    if(holder!==null)evidence.push(`Inventory نهایی بازیکن ${holder} آیتم را نشان می‌دهد.`);
    else if(holders.length)evidence.push("آیتم در Inventory نهایی بیش از یک بازیکن دیده می‌شود.");
    if(transfer==="enemy")evidence.push("خریدار و دارنده نهایی در دو تیم متفاوت هستند.");
    if(transfer==="ally")evidence.push("خریدار و دارنده نهایی هم‌تیمی هستند.");
    const confidence:MatchItemOwnershipEvent["confidence"]=purchaser!==null&&holder!==null?"high":purchaser!==null||holder!==null?"medium":"low";
    return[{item:tracked.item,purchaserPlayerSlot:purchaser,holderPlayerSlot:holder,purchasedAtSecond,transferAtSecond:null,transfer,confidence,evidence,limitation:"OpenDota زمان جابه‌جایی Inventory مربوط به Gem/Rapier را ثبت نمی‌کند؛ بنابراین مالک نهایی قابل اثبات است اما لحظه انتقال و اثر پس از انتقال تخمین زده نمی‌شود."}];
  });
}
