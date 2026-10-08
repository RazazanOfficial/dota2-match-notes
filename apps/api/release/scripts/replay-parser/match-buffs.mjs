// Only explicitly attributed Track gold is recorded. Generic ability gold or
// proximity to a tracked death is not sufficient to assign credit to a caster.
export function createMatchBuffCollector() {
  const indices = new Map(), heroes = new Map(), payouts = [];
  const heroKey = value => typeof value === "string" ? value.toLowerCase().replace(/^(npc_dota_hero_|cdota_unit_hero_)/,"") : "";
  function accept(event) {
    if (event.type === "player_slot") indices.set(Number(event.key),Number(event.value));
    if (event.type === "interval" && typeof event.unit === "string" && indices.has(event.slot)) heroes.set(heroKey(event.unit),{playerSlot:indices.get(event.slot),heroId:event.hero_id});
    if (event.type !== "DOTA_COMBATLOG_GOLD" || !["bounty_hunter_track","modifier_bounty_hunter_track"].includes(event.inflictor) || event.targetillusion || event.attackerillusion || !Number.isSafeInteger(event.value) || event.value <= 0 || event.value > 10000) return;
    if (payouts.length >= 10000) throw new Error("Excessive Track gold events");
    payouts.push({source:heroKey(event.attackername || event.sourcename),target:heroKey(event.targetname),gold:event.value});
  }
  function finish() {
    const sources = new Map();
    for (const payout of payouts) {
      const source=heroes.get(payout.source),target=heroes.get(payout.target);
      if (!source || !target || (source.playerSlot < 128) !== (target.playerSlot < 128)) continue;
      if (!sources.has(source.playerSlot)) sources.set(source.playerSlot,new Map());
      const recipients=sources.get(source.playerSlot),before=recipients.get(target.playerSlot);
      recipients.set(target.playerSlot,{...target,gold:(before?.gold || 0)+payout.gold});
    }
    return [...sources].map(([sourceSlot,recipients])=>({sourceSlot,beneficiaries:[...recipients.values()]}));
  }
  return {accept,finish};
}
