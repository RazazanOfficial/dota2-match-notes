import { heroById } from "../../data/heroes";
import { gameModeName, lobbyTypeName } from "../dota/modes";
import type {
  OpenDotaMatch,
  OpenDotaPlayer,
} from "../opendota/validation";
import { MatchImageError } from "./errors";

export interface MatchImagePlayer {
  accountId: number | null;
  playerSlot: number;
  isRadiant: boolean;
  heroId: number;
  heroName: string;
  playerName: string;
  level: number | null;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number | null;
  denies: number | null;
  goldPerMinute: number | null;
  xpPerMinute: number | null;
  netWorth: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
}

export interface MatchImageModel {
  matchId: string;
  startedAt: string;
  durationSeconds: number;
  radiantWin: boolean;
  radiantScore: number;
  direScore: number;
  gameModeId: number | null;
  gameModeName: string | null;
  lobbyTypeId: number | null;
  lobbyTypeName: string | null;
  focusResult: "win" | "loss";
  focusPlayer: MatchImagePlayer;
  radiantPlayers: MatchImagePlayer[];
  direPlayers: MatchImagePlayer[];
}

function optionalStat(value: number | null | undefined) {
  return value ?? null;
}

function playerModel(player: OpenDotaPlayer): MatchImagePlayer {
  const hero = heroById(player.hero_id);
  return {
    accountId: player.account_id ?? null,
    playerSlot: player.player_slot,
    isRadiant: player.player_slot < 128,
    heroId: player.hero_id,
    heroName: hero?.name || `Hero ${player.hero_id}`,
    playerName:
      player.personaname?.trim() || hero?.name || `Player ${player.player_slot}`,
    level: optionalStat(player.level),
    kills: player.kills ?? 0,
    deaths: player.deaths ?? 0,
    assists: player.assists ?? 0,
    lastHits: optionalStat(player.last_hits),
    denies: optionalStat(player.denies),
    goldPerMinute: optionalStat(player.gold_per_min),
    xpPerMinute: optionalStat(player.xp_per_min),
    netWorth: optionalStat(player.net_worth),
    heroDamage: optionalStat(player.hero_damage),
    towerDamage: optionalStat(player.tower_damage),
  };
}

function teamScore(players: MatchImagePlayer[]) {
  return players.reduce((total, player) => total + player.kills, 0);
}

export function buildMatchImageModel(
  match: OpenDotaMatch,
  steamAccountId: number,
): MatchImageModel {
  const players = match.players.map(playerModel);
  const focusPlayer = players.find(
    (player) => player.accountId === steamAccountId,
  );
  if (!focusPlayer) {
    throw new MatchImageError(
      "image_player_not_found",
      "بازیکن موردنظر داخل داده مچ پیدا نشد",
    );
  }

  const radiantPlayers = players
    .filter((player) => player.isRadiant)
    .slice(0, 5);
  const direPlayers = players
    .filter((player) => !player.isRadiant)
    .slice(0, 5);
  const focusWon = match.radiant_win === focusPlayer.isRadiant;

  return {
    matchId: String(match.match_id),
    startedAt: new Date(match.start_time * 1_000).toISOString(),
    durationSeconds: match.duration,
    radiantWin: match.radiant_win,
    radiantScore: match.radiant_score ?? teamScore(radiantPlayers),
    direScore: match.dire_score ?? teamScore(direPlayers),
    gameModeId: match.game_mode ?? null,
    gameModeName: gameModeName(match.game_mode ?? null),
    lobbyTypeId: match.lobby_type ?? null,
    lobbyTypeName: lobbyTypeName(match.lobby_type ?? null),
    focusResult: focusWon ? "win" : "loss",
    focusPlayer,
    radiantPlayers,
    direPlayers,
  };
}
