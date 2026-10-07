type RawPlayer = Record<string, unknown>;

// Names in the parser's killed histogram. Keep this list current when camps change.
const ANCIENTS = new Set([
  "ancient_frog", "ancient_frog_mage", "big_thunder_lizard", "small_thunder_lizard",
  "black_dragon", "black_drake", "frostbitten_golem", "ice_shaman",
  "granite_golem", "rock_golem", "prowler_acolyte", "prowler_shaman",
]);

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function classifyFarmKills(player: RawPlayer) {
  const slot = count(player.player_slot);
  const killed = player.killed;
  if (slot !== null && killed && typeof killed === "object" && !Array.isArray(killed)) {
    const enemy = slot < 128 ? "badguys" : "goodguys";
    let lane = 0;
    let neutral = 0;
    let ancient = 0;
    for (const [name, value] of Object.entries(killed)) {
      const amount = count(value);
      if (amount === null) continue;
      if (new RegExp(`^npc_dota_creep_${enemy}_(?:melee|ranged|flagbearer)(?:_|$)`).test(name) ||
        name === `npc_dota_${enemy}_siege` || name.startsWith(`npc_dota_${enemy}_siege_`)) {
        lane += amount;
      } else if (name.startsWith("npc_dota_neutral_")) {
        if (ANCIENTS.has(name.slice("npc_dota_neutral_".length))) ancient += amount;
        else neutral += amount;
      }
    }
    return { lane, neutral, ancient };
  }

  // OpenDota neutral_kills includes ancient_kills. Without a killed histogram,
  // lane_kills also includes denies, so a precise lane count is unavailable.
  const allNeutral = count(player.neutral_kills);
  const ancient = count(player.ancient_kills);
  return { lane: null, neutral: allNeutral !== null && ancient !== null && ancient <= allNeutral ? allNeutral - ancient : null, ancient };
}
