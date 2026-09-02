export type AccessMode = "player" | "coach";
export type MatchResult = "win" | "loss";
export type MatchSource = "manual" | "steam" | "opendota";
export type DotaTeam = "radiant" | "dire";
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

export interface MatchBan extends Hero {
  source?: "manual" | "opendota" | "stratz";
  team?: number | null;
  draftOrder?: number | null;
  inRolePool?: boolean;
}

export interface MatchPick extends Hero {
  playerSlot?: number | null;
  team?: number | null;
  inRolePool?: boolean;
}

export interface MatchParticipant {
  playerSlot: number;
  accountId: number | null;
  personName: string;
  heroId: number;
  heroName: string;
  team: DotaTeam;
  level: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  lastHits: number | null;
  denies: number | null;
  goldPerMinute: number | null;
  xpPerMinute: number | null;
  netWorth: number | null;
  heroDamage: number | null;
  towerDamage: number | null;
  heroHealing: number | null;
  itemIds: Array<number | null>;
  backpackItemIds: Array<number | null>;
  neutralItemId: number | null;
  neutralEnhancementId: number | null;
  hasAghanimsScepter: boolean;
  hasAghanimsShard: boolean;
  isProfilePlayer: boolean;
  inRolePool?: boolean;
}

export type PerformanceTone = "elite" | "strong" | "steady" | "weak" | "critical";
export type TimelineState = "surge" | "progress" | "steady" | "setback" | "out";
export type AnalysisAvailability = "ready" | "partial" | "unavailable";
export interface MatchPositionEvidence { key:string; label:string; weight:number; supports:number[]; }
export interface MatchPositionResolution {
  assignedPosition:number|null;
  detectedPosition:number|null;
  confirmedPosition:number|null;
  confidence:number;
  source:"manual"|"stratz"|"opendota"|"heuristic"|"unknown";
  roleSwapDetected:boolean;
  swapWithPlayerSlot?:number|null;
  evidence?:MatchPositionEvidence[];
}
export interface MatchAnalysisEvent { id:string; minute:number; second:number; type:"kill"|"death"|"item"|"objective"|"buyback"|"ward"|"sentry"|"smoke"|"dust"; label:string; detail?:string; x?:number|null; y?:number|null; positive?:boolean|null; }
export interface MatchMapPoint { x:number; y:number; minute:number|null; weight:number; type:"movement"|"farm"|"vision"|"combat"|"objective"; label?:string; }
export interface MatchFarmWindow { from:number; to:number; lastHits:number|null; netWorth:number|null; xp:number|null; farmGain:number|null; deaths:number; state:TimelineState; note:string; }
export interface MatchObjectiveEvent { type:"tower"|"roshan"|"barracks"|"other"; minute:number; label:string; playerPresent:boolean|null; delayAfterFightSeconds:number|null; convertedFromFight:boolean|null; }
export interface MatchItemTiming { key:string; label:string; minute:number; second:number; category:"core"|"utility"|"detection"|"other"; relativeToReference:"early"|"on_time"|"late"|"unavailable"; deltaMinutes:number|null; referenceMinute:number|null; note:string; }
export interface MatchMapAnalysis {
  availability:AnalysisAvailability; coordinateSource:"timed"|"aggregate"|"unavailable"; points:MatchMapPoint[];
  trail:MatchMapPoint[];
  farm:{availability:AnalysisAvailability;laneCreeps:number|null;neutralCreeps:number|null;ancientCreeps:number|null;stackedCamps:number|null;farmUptimePercent:number|null;recoveryRate:number|null;deathCost:number|null;emptyTravelMinutes:number|null;farmToImpact:number|null;sourceMix:{lane:number|null;neutral:number|null;ancient:number|null};windows:MatchFarmWindow[];note:string};
  objectives:{availability:AnalysisAvailability;towerDamage:number|null;roshanKills:number|null;towerKills:number|null;barracksKills:number|null;conversionCount:number|null;missedConversionCount:number|null;averageConversionDelaySeconds:number|null;events:MatchObjectiveEvent[];note:string};
  utility:{availability:AnalysisAvailability;observersPlaced:number|null;sentriesPlaced:number|null;observersDestroyed:number|null;sentriesDestroyed:number|null;averageObserverLifetimeSeconds:number|null;observersDewardedEarly:number|null;visionValue:number|null;objectiveWardCoverage:number|null;campsStacked:number|null;smokeUses:number|null;successfulSmokes:number|null;dustUses:number|null;gemPurchases:number|null;invisThreat:"none"|"possible"|"active"|"unknown";invisThreats:string[];naturalReveal:string[];firstThreatMinute:number|null;firstDetectionMinute:number|null;preparedBeforeThreat:boolean|null;coverageGapMinutes:number|null;teamDetectionScore:number|null;individualContribution:number|null;responsibilityScore:number|null;note:string};
  movement:{availability:AnalysisAvailability;safeTerritoryPercent:number|null;enemyTerritoryPercent:number|null;combatPoints:number;objectivePoints:number;timedTrailPoints:number;note:string};
}

export interface MatchCohortProfile {
  label:string;
  heroPositionSamples:number;
  positionSamples:number;
  heroPositionWeight:number;
  positionPickRate:number|null;
  metaPickRate?:number|null;
  winRate?:number|null;
  rankTier:number|null;
  patch:string|null;
  gameMode:number|null;
  confidence:"high"|"medium"|"low";
  limitations:string[];
  milestones:Array<{minute:number;gold:number|null;xp:number|null;lastHits:number|null;sampleSize:number}>;
  metaSource?:"stratz"|"unavailable";
  benchmarkSource?:"opendota"|"unavailable";
  snapshotFetchedAt?:string|null;
  stale?:boolean;
}

export interface MatchBenchmarkMetric {
  key: string;
  label: string;
  shortLabel?: string;
  description?: string;
  direction?: "higher" | "lower" | "contextual";
  highlightEligible?: boolean;
  scoreWeight?: number;
  value: number;
  formattedValue: string;
  percentile: number;
  qualityPercentile: number;
  tone: PerformanceTone;
  source: "hero" | "match" | "cohort";
  cohortLabel?: string;
  confidence?: "high" | "medium" | "low";
  sampleSize?: number | null;
  effectiveSampleSize?:number|null;
  heroPositionWeight?:number|null;
  scoreOnly?:boolean;
}

export interface MatchMinuteSnapshot {
  minute: number;
  gold: number | null;
  xp: number | null;
  lastHits: number | null;
  denies: number | null;
  heroDamage: number | null;
  heroHealing: number | null;
  impact: number | null;
  goldDelta: number | null;
  xpDelta: number | null;
  lastHitDelta: number | null;
  state: TimelineState;
  label: string;
}

export interface MatchPlayerAnalysis {
  playerSlot: number;
  accountId: number | null;
  heroId: number;
  heroName: string;
  personName: string;
  team: DotaTeam;
  position: number | null;
  positionLabel: string;
  positionResolution?: MatchPositionResolution;
  isProfilePlayer: boolean;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  performanceScore?: number;
  benchmarks: MatchBenchmarkMetric[];
  scoreMetrics?:MatchBenchmarkMetric[];
  strengths: MatchBenchmarkMetric[];
  weaknesses: MatchBenchmarkMetric[];
  timeline: MatchMinuteSnapshot[];
  events?: MatchAnalysisEvent[];
  map?: MatchMapAnalysis;
  itemTimings?:MatchItemTiming[];
  cohort?:MatchCohortProfile;
  benchmarkSource: "hero" | "match" | "cohort" | "unavailable";
}

export interface MatchTeamMinute {
  minute: number;
  radiantGoldAdvantage: number | null;
  radiantXpAdvantage: number | null;
}

export interface MatchAnalysis {
  status: "ready" | "partial" | "unavailable";
  dotaMatchId: string;
  durationMinutes: number;
  parsed: boolean;
  coverage: {
    benchmarkPlayers: number;
    timelinePlayers: number;
    totalPlayers: number;
  };
  players: MatchPlayerAnalysis[];
  teamTimeline: MatchTeamMinute[];
}

export interface Match {
  id: string;
  number: number;
  heroId: number | null;
  heroName: string;
  bans: MatchBan[];
  picks: MatchPick[];
  legacyBans?: string;
  role: MatchRole | "";
  roleSource?: "manual" | "opendota" | "stratz" | null;
  positionOverrides?: Record<string, number>;
  heroPoolEligible?: boolean;
  heroPoolMatch?: boolean | null;
  heroPoolVersion?: number | null;
  queueType: QueueType | "";
  notes: string;
  positivePoints: string[];
  negativePoints: string[];
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
  radiantWin?: boolean | null;
  radiantScore?: number | null;
  direScore?: number | null;
  participants?: MatchParticipant[];
  images?: MatchImage[];
  imageJobStatus?: ImageJobStatus | null;
  analysis?: MatchAnalysis;
}

export interface Day {
  completed: boolean;
  matches: Match[];
}

export interface Profile {
  username: string;
  registeredDate?: string;
  createdAt?: string;
  updatedAt?: string;
  days: Record<string, Day>;
}

export interface HeroPoolData {
  version: { id: string; number: number; createdAt: string } | null;
  pools: Record<MatchRole, Hero[]>;
}

export interface Session {
  mode: AccessMode;
  username: string;
  steamId?: string;
  steamAccountId?: number;
  displayName?: string;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
  createdAt?: string;
  registeredDate?: string;
  hasPassword?: boolean;
}

export interface PlayerSearchResult {
  steamId: string;
  steamAccountId: number;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ImageQueueJob {
  id: string;
  matchId: string;
  dotaMatchId: string | null;
  heroId: number | null;
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
  stratz?: {
    backfillEnabled: boolean;
    backfillQueued: number;
    processed: number;
    jobs: Array<{
      status: "completed" | "pending" | "failed";
      [key: string]: unknown;
    }>;
  };
}

export interface Summary {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}
