import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const matchResultEnum = pgEnum("match_result", ["win", "loss"]);
export const matchRoleEnum = pgEnum("match_role", [
  "safe_lane",
  "mid_lane",
  "off_lane",
  "soft_support",
  "hard_support",
]);
export const queueTypeEnum = pgEnum("queue_type", [
  "role_selected",
  "earn_role_queue",
]);
export const matchSourceEnum = pgEnum("match_source", [
  "manual",
  "steam",
  "opendota",
]);
export const syncJobKindEnum = pgEnum("sync_job_kind", [
  "manual",
  "scheduled",
]);
export const syncJobStatusEnum = pgEnum("sync_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const matchImageJobStatusEnum = pgEnum("match_image_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const matchBanSourceEnum = pgEnum("match_ban_source", [
  "manual",
  "opendota",
  "stratz",
]);
export const matchRoleSourceEnum = pgEnum("match_role_source", [
  "manual",
  "opendota",
  "stratz",
]);
export const releaseStatusEnum = pgEnum("release_status", ["draft", "published"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    steamId: varchar("steam_id", { length: 20 }).notNull(),
    steamAccountId: bigint("steam_account_id", { mode: "number" }).notNull(),
    handle: varchar("handle", { length: 32 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    avatarUrl: text("avatar_url"),
    profileUrl: text("profile_url"),
    passwordHash: varchar("password_hash", { length: 255 }),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    recoveryCodesSavedAt: timestamp("recovery_codes_saved_at", { withTimezone: true }),
    recoveryEmail: varchar("recovery_email", { length: 254 }),
    recoveryEmailVerifiedAt: timestamp("recovery_email_verified_at", { withTimezone: true }),
    isAdmin: boolean("is_admin").default(false).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastManualSyncAt: timestamp("last_manual_sync_at", { withTimezone: true }),
    lastDaySyncAt: timestamp("last_day_sync_at", { withTimezone: true }),
    lastWeekSyncAt: timestamp("last_week_sync_at", { withTimezone: true }),
    lastMonthSyncAt: timestamp("last_month_sync_at", { withTimezone: true }),
    manualSyncCursorAt: timestamp("manual_sync_cursor_at", {
      withTimezone: true,
    }),
    lastScheduledSyncAt: timestamp("last_scheduled_sync_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_steam_id_uidx").on(table.steamId),
    uniqueIndex("users_steam_account_id_uidx").on(table.steamAccountId),
    uniqueIndex("users_handle_lower_uidx").on(sql`lower(${table.handle})`),
    uniqueIndex("users_recovery_email_verified_uidx").on(sql`lower(${table.recoveryEmail})`).where(sql`${table.recoveryEmailVerifiedAt} is not null`),
    check("users_handle_length_check", sql`char_length(${table.handle}) between 3 and 32`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/** One-use, short-lived PKCE grants for returning Steam sign-in to Tauri. */
export const desktopAuthCodes = pgTable(
  "desktop_auth_codes",
  {
    codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    challenge: varchar("challenge", { length: 43 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("desktop_auth_codes_expires_at_idx").on(table.expiresAt)],
);

export const accountRecoveryCodes = pgTable("account_recovery_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("account_recovery_codes_user_idx").on(table.userId)]);

export const accountEmailChallenges = pgTable("account_email_challenges", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 16 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.userId, table.purpose] }), check("account_email_challenges_purpose_check", sql`${table.purpose} in ('verify','reset')`)]);

export const journalDays = pgTable(
  "journal_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    completed: boolean("completed").default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("journal_days_user_day_uidx").on(table.userId, table.day),
    index("journal_days_user_id_idx").on(table.userId),
  ],
);

export const dotaMatches = pgTable("dota_matches", {
  matchId: bigint("match_id", { mode: "number" }).primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  radiantWin: boolean("radiant_win"),
  gameMode: integer("game_mode"),
  lobbyType: integer("lobby_type"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>(),
  localReplayData: jsonb("local_replay_data").$type<Record<string, unknown>>(),
  localReplayParsedAt: timestamp("local_replay_parsed_at", { withTimezone: true }),
  stratzRawData: jsonb("stratz_raw_data").$type<Record<string, unknown>>(),
  stratzFetchedAt: timestamp("stratz_fetched_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [index("dota_matches_started_at_idx").on(table.startedAt)]);

// One replay per Dota match, even when several journals reference that match.
export const localReplayJobs = pgTable(
  "local_replay_jobs",
  {
    matchId: bigint("match_id", { mode: "number" }).primaryKey()
      .references(() => dotaMatches.matchId, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    intent: varchar("intent", { length: 16 }).default("analysis").notNull(),
    phase: varchar("phase", { length: 24 }).default("queued").notNull(),
    phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true }).defaultNow().notNull(),
    retryDeadlineAt: timestamp("retry_deadline_at", { withTimezone: true }).default(sql`now() + interval '24 hours'`).notNull(),
    downloadedBytes: bigint("downloaded_bytes", { mode: "number" }).default(0).notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }),
    transferBytes: bigint("transfer_bytes", { mode: "number" }).default(0).notNull(),
    uploadBytes: bigint("upload_bytes", { mode: "number" }).default(0).notNull(),
    downloadBps: integer("download_bps").default(0).notNull(),
    spoolName: varchar("spool_name", { length: 64 }),
    spoolCreatedAt: timestamp("spool_created_at", { withTimezone: true }),
    spoolComplete: boolean("spool_complete").default(false).notNull(),
    spoolEtag: varchar("spool_etag", { length: 256 }),
    spoolSha256: varchar("spool_sha256", { length: 64 }),
    lastEndpoint: text("last_endpoint"),
    lastAddress: varchar("last_address", { length: 64 }),
    archiveKey: text("archive_key"),
    archiveStatus: varchar("archive_status", { length: 16 }).default("missing").notNull(),
    archiveBytes: integer("archive_bytes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    attempts: smallint("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    source: varchar("source", { length: 16 }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    index("local_replay_jobs_status_run_after_idx").on(table.status, table.runAfter),
    check("local_replay_jobs_status_check", sql`${table.status} in ('pending','processing','waiting_file','completed','failed')`),
    check("local_replay_jobs_intent_check", sql`${table.intent} in ('download','analysis')`),
    check("local_replay_jobs_archive_status_check", sql`${table.archiveStatus} in ('active','missing','deleted')`),
    check("local_replay_jobs_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

// Route health survives the one-shot replay worker process.
export const replayTransportRoutes = pgTable("replay_transport_routes", {
  routeKey: text("route_key").primaryKey(),
  endpoint: text("endpoint").notNull(),
  address: varchar("address", { length: 64 }).notNull(),
  failures: integer("failures").default(0).notNull(),
  openUntil: timestamp("open_until", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastErrorCode: varchar("last_error_code", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const replayJobEvents = pgTable("replay_job_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: bigint("match_id", { mode: "number" }).notNull().references(() => dotaMatches.matchId, { onDelete: "cascade" }),
  phase: varchar("phase", { length: 24 }).notNull(),
  code: varchar("code", { length: 64 }),
  detail: text("detail").notNull(),
  endpoint: text("endpoint"),
  address: varchar("address", { length: 64 }),
  httpStatus: integer("http_status"),
  transferredBytes: bigint("transferred_bytes", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("replay_job_events_match_created_idx").on(table.matchId, table.createdAt),
  index("replay_job_events_created_idx").on(table.createdAt)]);

export const performanceReferenceSnapshots = pgTable(
  "performance_reference_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: varchar("status", { length: 16 }).default("building").notNull(),
    windowDays: smallint("window_days").default(7).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourceSummary: varchar("source_summary", { length: 80 }).default("stratz+opendota").notNull(),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    index("performance_reference_snapshots_status_activated_idx").on(table.status, table.activatedAt),
    check("performance_reference_snapshots_status_check", sql`${table.status} in ('building','active','retired','failed')`),
    check("performance_reference_snapshots_window_check", sql`${table.windowDays} between 1 and 30`),
  ],
);

export const heroPositionMeta = pgTable(
  "hero_position_meta",
  {
    snapshotId: uuid("snapshot_id").notNull().references(() => performanceReferenceSnapshots.id, { onDelete: "cascade" }),
    heroId: integer("hero_id").notNull(),
    position: smallint("position").notNull(),
    rankBracket: varchar("rank_bracket", { length: 20 }).notNull(),
    gameMode: integer("game_mode").notNull(),
    matchCount: integer("match_count").notNull(),
    winCount: integer("win_count").notNull(),
    positionShare: real("position_share").notNull(),
    metaPickRate: real("meta_pick_rate").notNull(),
    winRate: real("win_rate").notNull(),
  },
  (table) => [
    primaryKey({ name: "hero_position_meta_pkey", columns: [table.snapshotId, table.heroId, table.position, table.rankBracket, table.gameMode] }),
    index("hero_position_meta_lookup_idx").on(table.heroId, table.position, table.rankBracket, table.gameMode),
    check("hero_position_meta_position_check", sql`${table.position} between 1 and 5`),
    check("hero_position_meta_counts_check", sql`${table.matchCount} >= 0 and ${table.winCount} >= 0 and ${table.winCount} <= ${table.matchCount}`),
    check("hero_position_meta_rates_check", sql`${table.positionShare} between 0 and 100 and ${table.metaPickRate} between 0 and 100 and ${table.winRate} between 0 and 100`),
  ],
);

export const heroBenchmarkDistributions = pgTable(
  "hero_benchmark_distributions",
  {
    snapshotId: uuid("snapshot_id").notNull().references(() => performanceReferenceSnapshots.id, { onDelete: "cascade" }),
    heroId: integer("hero_id").notNull(),
    position: smallint("position").default(0).notNull(),
    rankBracket: varchar("rank_bracket", { length: 20 }).default("ALL").notNull(),
    gameMode: integer("game_mode").default(0).notNull(),
    patch: varchar("patch", { length: 32 }).default("").notNull(),
    metric: varchar("metric", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 20 }).notNull(),
    sampleCount: integer("sample_count"),
    quantiles: jsonb("quantiles").$type<Array<{ percentile: number; value: number }>>().default([]).notNull(),
  },
  (table) => [
    primaryKey({ name: "hero_benchmark_distributions_pkey", columns: [table.snapshotId, table.heroId, table.position, table.rankBracket, table.gameMode, table.patch, table.metric, table.provider] }),
    index("hero_benchmark_distributions_lookup_idx").on(table.heroId, table.position, table.rankBracket, table.gameMode, table.metric),
    check("hero_benchmark_distributions_position_check", sql`${table.position} between 0 and 5`),
    check("hero_benchmark_distributions_sample_check", sql`${table.sampleCount} is null or ${table.sampleCount} >= 0`),
  ],
);

// Monthly reference partitions are created by the monthly workers. The reference
// month is part of every primary key because PostgreSQL requires the partition
// key to be included in unique constraints on a partitioned table.
export const monthlyReferenceVersions = pgTable("monthly_reference_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  referenceMonth: date("reference_month").notNull(),
  status: varchar("status", { length: 16 }).default("building").notNull(),
  metaCursor: integer("meta_cursor").default(0).notNull(),
  performanceCursor: integer("performance_cursor").default(0).notNull(),
  metaRows: integer("meta_rows").default(0).notNull(),
  heroRows: integer("hero_rows").default(0).notNull(),
  positionRows: integer("position_rows").default(0).notNull(),
  sourcePolicy: varchar("source_policy", { length: 40 }).default("stratz-ranked-assumed").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  metaLastSuccessAt: timestamp("meta_last_success_at", { withTimezone: true }),
  performanceLastSuccessAt: timestamp("performance_last_success_at", { withTimezone: true }),
  metaLastErrorAt: timestamp("meta_last_error_at", { withTimezone: true }),
  performanceLastErrorAt: timestamp("performance_last_error_at", { withTimezone: true }),
  metaLastError: text("meta_last_error"),
  performanceLastError: text("performance_last_error"),
  ...timestamps,
}, (table) => [
  index("monthly_reference_versions_month_status_idx").on(table.referenceMonth, table.status),
  check("monthly_reference_versions_status_check", sql`${table.status} in ('building','active','retired','failed')`),
  check("monthly_reference_versions_cursors_check", sql`${table.metaCursor} >= 0 and ${table.performanceCursor} >= 0`),
]);

export const monthlyReferenceEvents = pgTable("monthly_reference_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => monthlyReferenceVersions.id),
  service: varchar("service", { length: 16 }).notNull(),
  level: varchar("level", { length: 12 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("monthly_reference_events_version_time_idx").on(table.versionId, table.createdAt),
  check("monthly_reference_events_service_check", sql`${table.service} in ('meta','performance','system')`),
  check("monthly_reference_events_level_check", sql`${table.level} in ('info','success','error')`),
]);

export const monthlyHeroPositionMeta = pgTable("monthly_hero_position_meta", {
  referenceMonth: date("reference_month").notNull(),
  versionId: uuid("version_id").notNull().references(() => monthlyReferenceVersions.id),
  heroId: integer("hero_id").notNull(),
  position: smallint("position").notNull(),
  rankBracket: varchar("rank_bracket", { length: 20 }).notNull(),
  gameMode: integer("game_mode").notNull(),
  matchCount: integer("match_count").notNull(),
  winCount: integer("win_count").notNull(),
  positionShare: doublePrecision("position_share").notNull(),
  metaPickRate: doublePrecision("meta_pick_rate").notNull(),
  winRate: doublePrecision("win_rate").notNull(),
}, table => [
  primaryKey({ columns: [table.referenceMonth, table.versionId, table.heroId, table.position, table.rankBracket, table.gameMode] }),
  check("monthly_meta_position_check", sql`${table.position} between 1 and 5`),
  check("monthly_meta_count_check", sql`${table.matchCount} >= 0 and ${table.winCount} >= 0 and ${table.winCount} <= ${table.matchCount}`),
]);

const monthlyMeans = () => ({
  sampleCount: integer("sample_count").notNull(),
  cs: doublePrecision("cs").notNull(),
  dn: doublePrecision("dn").notNull(),
  kills: doublePrecision("kills").notNull(),
  deaths: doublePrecision("deaths").notNull(),
  assists: doublePrecision("assists").notNull(),
  networth: doublePrecision("networth").notNull(),
  xp: doublePrecision("xp").notNull(),
  heroDamage: doublePrecision("hero_damage").notNull(),
  towerDamage: doublePrecision("tower_damage").notNull(),
  healingAllies: doublePrecision("healing_allies").notNull(),
  campsStacked: doublePrecision("camps_stacked").notNull(),
  neutrals: doublePrecision("neutrals").notNull(),
  ancients: doublePrecision("ancients").notNull(),
  teamKills: doublePrecision("team_kills").notNull(),
});

export const monthlyHeroPerformance = pgTable("monthly_hero_performance_reference", {
  referenceMonth: date("reference_month").notNull(),
  versionId: uuid("version_id").notNull().references(() => monthlyReferenceVersions.id),
  heroId: integer("hero_id").notNull(),
  position: smallint("position").notNull(),
  rankGroup: varchar("rank_group", { length: 24 }).notNull(),
  minute: smallint("minute").notNull(),
  ...monthlyMeans(),
}, table => [
  primaryKey({ columns: [table.referenceMonth, table.versionId, table.heroId, table.position, table.rankGroup, table.minute] }),
  check("monthly_hero_performance_minute_check", sql`${table.minute} between 0 and 75`),
  check("monthly_hero_performance_count_check", sql`${table.sampleCount} > 0`),
]);

export const monthlyPositionPerformance = pgTable("monthly_position_performance_reference", {
  referenceMonth: date("reference_month").notNull(),
  versionId: uuid("version_id").notNull().references(() => monthlyReferenceVersions.id),
  position: smallint("position").notNull(),
  rankGroup: varchar("rank_group", { length: 24 }).notNull(),
  minute: smallint("minute").notNull(),
  ...monthlyMeans(),
}, table => [
  primaryKey({ columns: [table.referenceMonth, table.versionId, table.position, table.rankGroup, table.minute] }),
  check("monthly_position_performance_minute_check", sql`${table.minute} between 0 and 75`),
  check("monthly_position_performance_count_check", sql`${table.sampleCount} > 0`),
]);

export const heroPoolVersions = pgTable(
  "hero_pool_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("hero_pool_versions_user_version_uidx").on(table.userId, table.version),
    uniqueIndex("hero_pool_versions_one_active_uidx")
      .on(table.userId)
      .where(sql`${table.isActive}`),
    check("hero_pool_versions_version_check", sql`${table.version} > 0`),
  ],
);

export const heroPoolEntries = pgTable(
  "hero_pool_entries",
  {
    poolVersionId: uuid("pool_version_id")
      .notNull()
      .references(() => heroPoolVersions.id, { onDelete: "cascade" }),
    role: matchRoleEnum("role").notNull(),
    heroId: integer("hero_id").notNull(),
    heroName: varchar("hero_name", { length: 100 }).notNull(),
    sortOrder: smallint("sort_order").notNull(),
  },
  (table) => [
    primaryKey({
      name: "hero_pool_entries_pkey",
      columns: [table.poolVersionId, table.role, table.heroId],
    }),
    uniqueIndex("hero_pool_entries_role_sort_uidx").on(
      table.poolVersionId,
      table.role,
      table.sortOrder,
    ),
    check("hero_pool_entries_sort_order_check", sql`${table.sortOrder} between 0 and 7`),
  ],
);

export const journalMatches = pgTable(
  "journal_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayId: uuid("day_id")
      .notNull()
      .references(() => journalDays.id, { onDelete: "cascade" }),
    dotaMatchId: bigint("dota_match_id", { mode: "number" }).references(
      () => dotaMatches.matchId,
      { onDelete: "set null" },
    ),
    source: matchSourceEnum("source").default("manual").notNull(),
    number: smallint("number").notNull(),
    heroId: integer("hero_id"),
    heroName: varchar("hero_name", { length: 100 }).default("").notNull(),
    role: matchRoleEnum("role"),
    roleSource: matchRoleSourceEnum("role_source"),
    positionOverrides: jsonb("position_overrides").$type<Record<string, number>>().default({}).notNull(),
    heroPoolVersionId: uuid("hero_pool_version_id").references(
      () => heroPoolVersions.id,
      { onDelete: "set null" },
    ),
    heroPoolEligible: boolean("hero_pool_eligible").default(false).notNull(),
    queueType: queueTypeEnum("queue_type"),
    result: matchResultEnum("result").notNull(),
    notes: text("notes").default("").notNull(),
    positivePoints: jsonb("positive_points").$type<string[]>().default([]).notNull(),
    negativePoints: jsonb("negative_points").$type<string[]>().default([]).notNull(),
    legacyBans: varchar("legacy_bans", { length: 500 }).default("").notNull(),
    banOverride: boolean("ban_override").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    kills: smallint("kills"),
    deaths: smallint("deaths"),
    assists: smallint("assists"),
    goldPerMinute: smallint("gold_per_minute"),
    xpPerMinute: smallint("xp_per_minute"),
    netWorth: integer("net_worth"),
    heroDamage: integer("hero_damage"),
    towerDamage: integer("tower_damage"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    generatedImageKey: text("generated_image_key"),
    generatedImageAt: timestamp("generated_image_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("journal_matches_day_number_uidx").on(table.dayId, table.number),
    uniqueIndex("journal_matches_user_dota_match_uidx").on(
      table.userId,
      table.dotaMatchId,
    ),
    index("journal_matches_user_started_at_idx").on(table.userId, table.startedAt),
    index("journal_matches_dota_match_id_idx").on(table.dotaMatchId),
    index("journal_matches_day_id_idx").on(table.dayId),
    check("journal_matches_number_check", sql`${table.number} > 0`),
    check(
      "journal_matches_duration_check",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
    check(
      "journal_matches_positive_points_check",
      sql`jsonb_typeof(${table.positivePoints}) = 'array' and jsonb_array_length(${table.positivePoints}) <= 20`,
    ),
    check(
      "journal_matches_negative_points_check",
      sql`jsonb_typeof(${table.negativePoints}) = 'array' and jsonb_array_length(${table.negativePoints}) <= 20`,
    ),
  ],
);

export const dismissedDotaMatches = pgTable(
  "dismissed_dota_matches",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dotaMatchId: bigint("dota_match_id", { mode: "number" }).notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "dismissed_dota_matches_pkey",
      columns: [table.userId, table.dotaMatchId],
    }),
    index("dismissed_dota_matches_dismissed_at_idx").on(table.dismissedAt),
    check(
      "dismissed_dota_matches_match_id_check",
      sql`${table.dotaMatchId} > 0`,
    ),
  ],
);

export const matchBans = pgTable(
  "match_bans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => journalMatches.id, { onDelete: "cascade" }),
    heroId: integer("hero_id").notNull(),
    heroName: varchar("hero_name", { length: 100 }).notNull(),
    sortOrder: smallint("sort_order").notNull(),
    source: matchBanSourceEnum("source").default("manual").notNull(),
    team: smallint("team"),
    draftOrder: smallint("draft_order"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("match_bans_match_hero_uidx").on(table.matchId, table.heroId),
    uniqueIndex("match_bans_match_sort_uidx").on(table.matchId, table.sortOrder),
    check("match_bans_sort_order_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const matchPicks = pgTable(
  "match_picks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => journalMatches.id, { onDelete: "cascade" }),
    heroId: integer("hero_id").notNull(),
    heroName: varchar("hero_name", { length: 100 }).notNull(),
    sortOrder: smallint("sort_order").notNull(),
    playerSlot: smallint("player_slot"),
    team: smallint("team"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("match_picks_match_hero_uidx").on(table.matchId, table.heroId),
    uniqueIndex("match_picks_match_sort_uidx").on(table.matchId, table.sortOrder),
    index("match_picks_match_id_idx").on(table.matchId),
    check("match_picks_sort_order_check", sql`${table.sortOrder} between 0 and 8`),
  ],
);

export const passwordLoginAttempts = pgTable(
  "password_login_attempts",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    failedAttempts: smallint("failed_attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("password_login_attempts_updated_at_idx").on(table.updatedAt),
    check(
      "password_login_attempts_failed_attempts_check",
      sql`${table.failedAttempts} >= 0`,
    ),
  ],
);

export const releaseNotes = pgTable(
  "release_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: varchar("version", { length: 32 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    summary: varchar("summary", { length: 500 }).default("").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: releaseStatusEnum("status").default("draft").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("release_notes_version_uidx").on(table.version),
    index("release_notes_status_published_idx").on(table.status, table.publishedAt),
    check("release_notes_version_length_check", sql`char_length(${table.version}) between 1 and 32`),
  ],
);

export const releaseNoteReads = pgTable(
  "release_note_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => releaseNotes.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: "release_note_reads_pkey", columns: [table.userId, table.releaseId] }),
    index("release_note_reads_release_idx").on(table.releaseId),
  ],
);

export const matchImages = pgTable(
  "match_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => journalMatches.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    altText: varchar("alt_text", { length: 500 }).default("").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("match_images_object_key_uidx").on(table.objectKey),
    uniqueIndex("match_images_match_sort_uidx").on(table.matchId, table.sortOrder),
    index("match_images_match_id_idx").on(table.matchId),
    check(
      "match_images_sort_order_check",
      sql`${table.sortOrder} between 1 and 3`,
    ),
    check("match_images_size_check", sql`${table.sizeBytes} > 0`),
  ],
);

export const externalApiRateLimits = pgTable(
  "external_api_rate_limits",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "external_api_rate_limits_count_check",
      sql`${table.requestCount} >= 0`,
    ),
  ],
);

export const externalApiDailyUsage = pgTable(
  "external_api_daily_usage",
  {
    provider: varchar("provider", { length: 32 }).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "external_api_daily_usage_pkey",
      columns: [table.provider, table.day],
    }),
    index("external_api_daily_usage_day_idx").on(table.day),
    check(
      "external_api_daily_usage_count_check",
      sql`${table.requestCount} >= 0`,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 64 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("admin_audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("admin_audit_logs_target_created_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
    index("admin_audit_logs_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
    check(
      "admin_audit_logs_action_length_check",
      sql`char_length(${table.action}) between 3 and 64`,
    ),
  ],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: syncJobKindEnum("kind").notNull(),
    status: syncJobStatusEnum("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    manualRequest: jsonb("manual_request").$type<Record<string, unknown>>(),
    manualAttempted: jsonb("manual_attempted").$type<number[]>().default([]).notNull(),
    manualResult: jsonb("manual_result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sync_jobs_status_run_after_idx").on(table.status, table.runAfter),
    index("sync_jobs_user_id_idx").on(table.userId),
    uniqueIndex("sync_jobs_one_active_per_user_uidx")
      .on(table.userId)
      .where(sql`${table.status} in ('pending', 'processing')`),
    check("sync_jobs_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const matchImageJobs = pgTable(
  "match_image_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => journalMatches.id, { onDelete: "cascade" }),
    status: matchImageJobStatusEnum("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    progressStage: varchar("progress_stage", { length: 24 }).default("queued").notNull(),
    currentImage: smallint("current_image").default(0).notNull(),
    completedImages: smallint("completed_images").default(0).notNull(),
    expectedImages: smallint("expected_images").default(3).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("match_image_jobs_match_id_uidx").on(table.matchId),
    index("match_image_jobs_status_run_after_idx").on(
      table.status,
      table.runAfter,
    ),
    check("match_image_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check("match_image_jobs_progress_stage_check", sql`${table.progressStage} in ('queued','preparing','rendering','uploading','completed','failed')`),
    check("match_image_jobs_progress_check", sql`${table.currentImage} between 0 and ${table.expectedImages} and ${table.completedImages} between 0 and ${table.expectedImages} and ${table.expectedImages} between 1 and 10`),
  ],
);

export const openDotaParseJobs = pgTable(
  "open_dota_parse_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").notNull().references(() => journalMatches.id, { onDelete: "cascade" }),
    dotaMatchId: bigint("dota_match_id", { mode: "number" }).notNull(),
    status: syncJobStatusEnum("status").default("pending").notNull(),
    providerJobId: varchar("provider_job_id", { length: 32 }),
    attempts: smallint("attempts").default(0).notNull(),
    pollAttempts: smallint("poll_attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("open_dota_parse_jobs_match_id_uidx").on(table.matchId),
    index("open_dota_parse_jobs_status_run_after_idx").on(table.status, table.runAfter),
    check("open_dota_parse_jobs_attempts_check", sql`${table.attempts} >= 0 and ${table.pollAttempts} >= 0`),
  ],
);

export const stratzEnrichmentJobs = pgTable(
  "stratz_enrichment_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => journalMatches.id, { onDelete: "cascade" }),
    status: syncJobStatusEnum("status").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stratz_enrichment_jobs_match_id_uidx").on(table.matchId),
    index("stratz_enrichment_jobs_status_run_after_idx").on(
      table.status,
      table.runAfter,
    ),
    check(
      "stratz_enrichment_jobs_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  days: many(journalDays),
  matches: many(journalMatches),
  dismissedDotaMatches: many(dismissedDotaMatches),
  syncJobs: many(syncJobs),
  heroPoolVersions: many(heroPoolVersions),
  releaseNoteReads: many(releaseNoteReads),
}));

export const heroPoolVersionsRelations = relations(heroPoolVersions, ({ one, many }) => ({
  user: one(users, { fields: [heroPoolVersions.userId], references: [users.id] }),
  entries: many(heroPoolEntries),
  matches: many(journalMatches),
}));

export const heroPoolEntriesRelations = relations(heroPoolEntries, ({ one }) => ({
  version: one(heroPoolVersions, {
    fields: [heroPoolEntries.poolVersionId],
    references: [heroPoolVersions.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const journalDaysRelations = relations(journalDays, ({ one, many }) => ({
  user: one(users, {
    fields: [journalDays.userId],
    references: [users.id],
  }),
  matches: many(journalMatches),
}));

export const dotaMatchesRelations = relations(dotaMatches, ({ many }) => ({
  journalMatches: many(journalMatches),
}));

export const journalMatchesRelations = relations(
  journalMatches,
  ({ one, many }) => ({
    user: one(users, {
      fields: [journalMatches.userId],
      references: [users.id],
    }),
    day: one(journalDays, {
      fields: [journalMatches.dayId],
      references: [journalDays.id],
    }),
    dotaMatch: one(dotaMatches, {
      fields: [journalMatches.dotaMatchId],
      references: [dotaMatches.matchId],
    }),
    heroPoolVersion: one(heroPoolVersions, {
      fields: [journalMatches.heroPoolVersionId],
      references: [heroPoolVersions.id],
    }),
    bans: many(matchBans),
    picks: many(matchPicks),
    images: many(matchImages),
    imageJobs: many(matchImageJobs),
    openDotaParseJob: one(openDotaParseJobs, {
      fields: [journalMatches.id],
      references: [openDotaParseJobs.matchId],
    }),
    stratzEnrichmentJob: one(stratzEnrichmentJobs, {
      fields: [journalMatches.id],
      references: [stratzEnrichmentJobs.matchId],
    }),
  }),
);

export const matchBansRelations = relations(matchBans, ({ one }) => ({
  match: one(journalMatches, {
    fields: [matchBans.matchId],
    references: [journalMatches.id],
  }),
}));

export const matchPicksRelations = relations(matchPicks, ({ one }) => ({
  match: one(journalMatches, {
    fields: [matchPicks.matchId],
    references: [journalMatches.id],
  }),
}));

export const matchImagesRelations = relations(matchImages, ({ one }) => ({
  match: one(journalMatches, {
    fields: [matchImages.matchId],
    references: [journalMatches.id],
  }),
}));

export const releaseNotesRelations = relations(releaseNotes, ({ one, many }) => ({
  author: one(users, { fields: [releaseNotes.authorUserId], references: [users.id] }),
  reads: many(releaseNoteReads),
}));

export const releaseNoteReadsRelations = relations(releaseNoteReads, ({ one }) => ({
  user: one(users, { fields: [releaseNoteReads.userId], references: [users.id] }),
  release: one(releaseNotes, {
    fields: [releaseNoteReads.releaseId],
    references: [releaseNotes.id],
  }),
}));

export const dismissedDotaMatchesRelations = relations(
  dismissedDotaMatches,
  ({ one }) => ({
    user: one(users, {
      fields: [dismissedDotaMatches.userId],
      references: [users.id],
    }),
  }),
);

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  user: one(users, {
    fields: [syncJobs.userId],
    references: [users.id],
  }),
}));

export const matchImageJobsRelations = relations(
  matchImageJobs,
  ({ one }) => ({
    match: one(journalMatches, {
      fields: [matchImageJobs.matchId],
      references: [journalMatches.id],
    }),
  }),
);

export const openDotaParseJobsRelations = relations(openDotaParseJobs, ({ one }) => ({
  match: one(journalMatches, {
    fields: [openDotaParseJobs.matchId],
    references: [journalMatches.id],
  }),
}));

export const stratzEnrichmentJobsRelations = relations(
  stratzEnrichmentJobs,
  ({ one }) => ({
    match: one(journalMatches, {
      fields: [stratzEnrichmentJobs.matchId],
      references: [journalMatches.id],
    }),
  }),
);
