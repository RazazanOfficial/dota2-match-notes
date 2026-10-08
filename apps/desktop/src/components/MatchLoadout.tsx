import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { itemById, itemImage } from "@/data/items.generated";
import { heroById, heroIcon } from "@/data/heroes";
import type { MatchBuff } from "@/lib/types";
import type { HistoryMatch } from "../history";
import { isPersian, type Messages } from "../i18n";
import { permanentBuffs } from "@/lib/dota/match-loadout";
import { Hint } from "./Hint";
export function MatchLoadout({ match, t }: { match: HistoryMatch; t: Messages }) {
    const items=Array.from({length:6},(_,index)=>match.itemIds?.[index] || null);
    const normalized = (match.buffs || []).map(buff=>normalizeBuff(buff,t));
    const text = (buff: MatchBuff) => `${buff.label}${buff.stacks == null ? "" : `: ${buff.stacks}`}${buff.beneficiaries?.map(row=>` · ${heroById(row.heroId)?.name || row.playerSlot}: ${row.gold} Gold`).join("") || ""}`;
    return <span className="row-loadout" dir="ltr"><span className="row-items">{items.map((id,index)=><span className={`row-item ${id ? "has-item" : ""}`} key={index} title={id ? itemById(id)?.name || `Item ${id}` : t.emptySlot}>{id && <img src={itemImage(id) || undefined} alt={itemById(id)?.name || `Item ${id}`} loading="lazy"/>}</span>)}</span>
        {!!normalized.length && <span className="row-buffs">{normalized.map(buff=><Hint key={buff.key} label={text(buff)} text={text(buff)}><span className="row-buff"><BuffIcon buff={buff} heroId={match.heroId}/></span></Hint>)}</span>}</span>;
}

const localAbilities = new Set(["silencer_glaives_of_wisdom","pudge_flesh_heap","legion_commander_duel","lion_finger_of_death","slark_essence_shift","abyssal_underlord_atrophy_aura","bounty_hunter_jinada","axe_culling_blade","necrolyte_reapers_scythe","muerta_pierce_the_veil","life_stealer_feast","bounty_hunter_track"]);
const persianBuffs:Record<string,string> = {
    moon_shard:"مون شارد",ultimate_scepter:"آقانیم سپتر",aghanims_shard:"آقانیم شارد",silencer_glaives_of_wisdom:"هوش دزدیده‌شده",pudge_flesh_heap:"قدرت Flesh Heap",legion_commander_duel:"دمیج دوئل",tome_of_knowledge:"کتاب تجربه",lion_finger_of_death:"استک Finger of Death",slark_essence_shift:"چابکی دائمی",abyssal_underlord_atrophy_aura:"دمیج Atrophy Aura",bounty_hunter_jinada:"Jinada",axe_culling_blade:"زره دائمی",necrolyte_reapers_scythe:"استک Reaper’s Scythe",muerta_pierce_the_veil:"تقویت جادو",life_stealer_feast:"سلامتی دائمی",bounty_hunter_track:"طلای Track",
};
export function normalizeBuff(buff:MatchBuff,t:Messages):MatchBuff {
    const match=/^permanent_buff_(\d+)$/.exec(buff.key), known=match?permanentBuffs[Number(match[1])]:null;
    const key=known?.[0] || buff.key;
    const itemIds:Record<string,number>={moon_shard:247,ultimate_scepter:108,aghanims_shard:609,tome_of_knowledge:257};
    return {...buff,key,...(itemIds[key] ? {itemId:itemIds[key]} : {}),label:match && !known ? t.unknownBuff : isPersian(t) ? persianBuffs[key] || known?.[1] || buff.label : known?.[1] || buff.label};
}
function BuffIcon({buff,heroId}:{buff:MatchBuff;heroId:number}) {
    const [failed,setFailed]=useState(false);
    const src=buff.itemId ? itemImage(buff.itemId) : localAbilities.has(buff.key) ? `/buffs/${buff.key}.png` : null;
    useEffect(()=>setFailed(false),[src]);
    const hero=heroById(heroId);
    return <>{src && !failed ? <img src={src} alt={buff.label} loading="lazy" onError={()=>setFailed(true)}/> : hero ? <img src={heroIcon(hero)} alt={buff.label} loading="lazy"/> : <Sparkles size={24}/>} {buff.stacks != null && !buff.itemId && <small>{buff.stacks}</small>}</>;
}
