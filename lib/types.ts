export type AccessMode = "player" | "coach";
export type MatchResult = "win" | "loss";
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
  token?: string;
  isNew?: boolean;
}

export interface Summary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}
