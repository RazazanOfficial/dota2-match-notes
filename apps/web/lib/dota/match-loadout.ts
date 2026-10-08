// IDs from odota/dotaconstants/build/permanent_buffs.json. Unknown IDs remain visible.
export const permanentBuffs: Record<number, [string, string]> = {
  1:["moon_shard","Moon Shard"],2:["ultimate_scepter","Aghanim's Scepter"],3:["silencer_glaives_of_wisdom","Intelligence stolen"],
  4:["pudge_flesh_heap","Flesh Heap"],5:["legion_commander_duel","Duel damage"],6:["tome_of_knowledge","Tome of Knowledge"],
  7:["lion_finger_of_death","Finger of Death"],8:["slark_essence_shift","Permanent agility"],9:["abyssal_underlord_atrophy_aura","Atrophy Aura"],
  10:["bounty_hunter_jinada","Jinada"],12:["aghanims_shard","Aghanim's Shard"],13:["axe_culling_blade","Culling Blade"],
  14:["necrolyte_reapers_scythe","Reaper's Scythe"],15:["muerta_pierce_the_veil","Pierce the Veil"],
};
export type MatchBuff = { key: string; label: string; stacks: number | null; itemId?: number; sourceSlot?: number; beneficiaries?: Array<{ playerSlot: number; heroId: number; gold: number }> };
const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const itemId = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 100000 ? v : null;
export function extractLoadout(input: unknown, trackInput?: unknown) {
  const player = rec(input), buffs: MatchBuff[] = [];
  const ids = Array.from({ length: 6 }, (_, i) => itemId(player[`item_${i}`]));
  const seen = new Set<string>();
  const add = (buff: MatchBuff) => { if (!seen.has(buff.key)) { seen.add(buff.key); buffs.push(buff); } };
  for (const entry of (Array.isArray(player.permanent_buffs) ? player.permanent_buffs : []).slice(0,32)) {
    const row=rec(entry), id = row.permanent_buff;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || id > 10000) continue;
    const [key,label] = permanentBuffs[id] || [`permanent_buff_${id}`,`Permanent buff ${id}`];
    const stacks = typeof row.stack_count === "number" && Number.isFinite(row.stack_count) && row.stack_count >= 0 ? row.stack_count : null;
    add({ key,label,stacks,...(id === 1 ? {itemId:247} : id === 2 ? {itemId:108} : id === 12 ? {itemId:609} : {}) });
  }
  if (player.aghanims_scepter === true || player.aghanims_scepter === 1) add({key:"ultimate_scepter",label:"Aghanim's Scepter",stacks:null,itemId:108});
  if (player.aghanims_shard === true || player.aghanims_shard === 1) add({key:"aghanims_shard",label:"Aghanim's Shard",stacks:null,itemId:609});
  if (player.moonshard === true || player.moonshard === 1) add({key:"moon_shard",label:"Moon Shard",stacks:null,itemId:247});
  const track = rec(trackInput);
  if (Array.isArray(track.beneficiaries) && typeof track.sourceSlot === "number") {
    const beneficiaries = track.beneficiaries.slice(0,5).flatMap(value => {
      const row=rec(value);
      return typeof row.playerSlot === "number" && typeof row.heroId === "number" && typeof row.gold === "number" && Number.isSafeInteger(row.gold) && row.gold > 0 && row.gold <= 10000000 ? [{playerSlot:row.playerSlot,heroId:row.heroId,gold:row.gold}] : [];
    });
    if (beneficiaries.length) add({key:"bounty_hunter_track",label:"Track gold",stacks:beneficiaries.reduce((s,b)=>s+b.gold,0),sourceSlot:track.sourceSlot,beneficiaries});
  }
  return { itemIds: ids, buffs };
}
