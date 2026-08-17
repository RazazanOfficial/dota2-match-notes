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
export type ImageJobStatus = "pending" | "processing" | "completed" | "failed";

export interface MatchImage {
  id: string;
  publicUrl: string;
  altText: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

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
  images?: MatchImage[];
  imageJobStatus?: ImageJobStatus | null;
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
  displayName?: string;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
}

export interface ImageQueueJob {
  id: string;
  matchId: string;
  dotaMatchId: string | null;
  heroName: string;
  status: ImageJobStatus;
  attempts: number;
  position: number | null;
  imageCount: number;
  runAfter: string;
  finishedAt: string | null;
  errorCode: string | null;
  updatedAt: string;
}

export interface PlayerSyncStatus {
  registeredAt: string;
  trackedThrough: string | null;
  lastSyncAt: string | null;
  nextAllowedAt: string | null;
  imageQueue: {
    counts: Record<ImageJobStatus, number>;
    jobs: ImageQueueJob[];
  };
}

export interface ManualSyncResult {
  checked: number;
  alreadyImported: number;
  dismissedByUser: number;
  imported: Array<{
    journalMatchId: string;
    dotaMatchId: number;
    day: string;
  }>;
  failed: Array<{
    dotaMatchId: number;
    code: string;
    message: string;
    retryAfterSeconds?: number;
  }>;
  deferred: number;
  ignoredOlder: number;
  registeredAt: string;
  trackedFrom: string;
  nextAllowedAt: string;
}

export interface Summary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}
