import { useState } from "react";
import { Sparkles } from "lucide-react";
import { itemById, itemImage } from "@/data/items.generated";
import { heroById } from "@/data/heroes";
import type { MatchBuff } from "@/lib/types";
import type { HistoryMatch } from "../history";
import type { Messages } from "../i18n";
import { Hint } from "./Hint";
export function MatchLoadout({ match, t }: { match: HistoryMatch; t: Messages }) {
    const items=Array.from({length:6},(_,index)=>match.itemIds?.[index] || null);
    const text = (buff: MatchBuff) => `${buff.label}${buff.stacks == null ? "" : `: ${buff.stacks}`}${buff.beneficiaries?.map(row=>` · ${heroById(row.heroId)?.name || row.playerSlot}: ${row.gold} Gold`).join("") || ""}`;
    return <span className="row-loadout" dir="ltr"><span className="row-items">{items.map((id,index)=><span className={`row-item ${id ? "has-item" : ""}`} key={index} title={id ? itemById(id)?.name || `Item ${id}` : t.emptySlot}>{id && <img src={itemImage(id) || undefined} alt={itemById(id)?.name || `Item ${id}`} loading="lazy"/>}</span>)}</span>
        {!!match.buffs?.length && <span className="row-buffs">{match.buffs.map(buff=><Hint key={buff.key} label={text(buff)} text={text(buff)}><span className="row-buff"><BuffIcon buff={buff}/></span></Hint>)}</span>}</span>;
}

function BuffIcon({buff}:{buff:MatchBuff}) {
    const [failed,setFailed]=useState(false);
    const src=buff.itemId ? itemImage(buff.itemId) : /^[a-z_]+$/.test(buff.key) ? `https://steamcdn-a.akamaihd.net/apps/dota2/images/dota_react/abilities/${buff.key}.png` : null;
    return <>{src && !failed ? <img src={src} alt={buff.label} loading="lazy" onError={()=>setFailed(true)}/> : <Sparkles size={17}/>} {buff.stacks != null && !buff.itemId && <small>{buff.stacks}</small>}</>;
}
