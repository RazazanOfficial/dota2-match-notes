import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
    isAdmin: boolean("is_admin").default(false).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastManualSyncAt: timestamp("last_manual_sync_at", { withTimezone: true }),
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
  stratzRawData: jsonb("stratz_raw_data").$type<Record<string, unknown>>(),
  stratzFetchedAt: timestamp("stratz_fetched_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("match_image_jobs_match_id_uidx").on(table.matchId),
    index("match_image_jobs_status_run_after_idx").on(
      table.status,
      table.runAfter,
    ),
    check("match_image_jobs_attempts_check", sql`${table.attempts} >= 0`),
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
    images: many(matchImages),
    imageJobs: many(matchImageJobs),
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

export const stratzEnrichmentJobsRelations = relations(
  stratzEnrichmentJobs,
  ({ one }) => ({
    match: one(journalMatches, {
      fields: [stratzEnrichmentJobs.matchId],
      references: [journalMatches.id],
    }),
  }),
);
