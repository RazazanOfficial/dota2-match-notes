export type AccessMode = "player" | "coach";
export type MatchResult = "win" | "loss";
export type MatchSource = "manual" | "steam" | "opendota";
export type MatchRole =
  | "safe_lane"
  | "mid_lane"
  | "off_lane"
  | "soft_support"
  | "hard_support";
export type QueueType = "role_selected" | "earn_role_queue";

export interface Hero {
  id: number;
  slug: string;
  name: string;
}

export interface Match {
  id: string;
  number: number;
  heroId: number | null;
  heroName: string;
  bans: Hero[];
  legacyBans?: string;
  role: MatchRole | "";
  queueType: QueueType | "";
  notes: string;
  result: MatchResult;
  createdAt: string;
  updatedAt?: string;
  source?: MatchSource;
  dotaMatchId?: string | null;
  startedAt?: string | null;
  durationSeconds?: number | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  goldPerMinute?: number | null;
  xpPerMinute?: number | null;
  netWorth?: number | null;
  heroDamage?: number | null;
  towerDamage?: number | null;
  gameModeId?: number | null;
  gameModeName?: string | null;
  lobbyTypeId?: number | null;
  lobbyTypeName?: string | null;
}

export interface Day {
  completed: boolean;
  matches: Match[];
}

export interface Profile {
  username: string;
  createdAt?: string;
  updatedAt?: string;
  days: Record<string, Day>;
}

export interface Session {
  mode: AccessMode;
  username: string;
}

export interface Summary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}
