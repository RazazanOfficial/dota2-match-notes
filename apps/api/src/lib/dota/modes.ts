const GAME_MODES: Readonly<Record<number, string>> = {
  0: "Unknown",
  1: "All Pick",
  2: "Captains Mode",
  3: "Random Draft",
  4: "Single Draft",
  5: "All Random",
  6: "Intro",
  7: "Diretide",
  8: "Reverse Captains Mode",
  9: "The Greeviling",
  10: "Tutorial",
  11: "Mid Only",
  12: "Least Played",
  13: "New Player Pool",
  14: "Compendium Matchmaking",
  15: "Custom",
  16: "Captains Draft",
  17: "Balanced Draft",
  18: "Ability Draft",
  19: "Event",
  20: "All Random Deathmatch",
  21: "1v1 Mid",
  22: "All Draft",
  23: "Turbo",
  24: "Mutation",
};

const LOBBY_TYPES: Readonly<Record<number, string>> = {
  [-1]: "Invalid",
  0: "Normal",
  1: "Practice",
  2: "Tournament",
  3: "Tutorial",
  4: "Co-op Bots",
  5: "Ranked Team",
  6: "Ranked Solo",
  7: "Ranked",
  8: "1v1 Mid",
  9: "Battle Cup",
  10: "Local Bots",
  11: "Spectator",
  12: "Event",
  13: "Gauntlet",
  14: "New Player",
  15: "Featured",
};

function resolveName(
  values: Readonly<Record<number, string>>,
  id: number | null,
) {
  if (id === null) return null;
  return values[id] || `Unknown (${id})`;
}

export function gameModeName(id: number | null) {
  return resolveName(GAME_MODES, id);
}

export function lobbyTypeName(id: number | null) {
  return resolveName(LOBBY_TYPES, id);
}

export function matchCardGameModeName(
  gameModeId: number | null | undefined,
  lobbyTypeId: number | null | undefined,
  fallback?: string | null,
) {
  if (gameModeId === 23) return "Turbo";
  if (lobbyTypeId !== null && lobbyTypeId !== undefined && [5, 6, 7].includes(lobbyTypeId)) {
    return "Ranked";
  }
  if (gameModeId === 1 || gameModeId === 22) return "All Pick";
  if (gameModeId === 2) return "Captains Mode";
  if (gameModeId === 16) return "Captains Draft";
  return fallback || gameModeName(gameModeId ?? null) || "Unknown";
}
