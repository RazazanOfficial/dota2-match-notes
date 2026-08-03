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
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
    queueType: queueTypeEnum("queue_type"),
    result: matchResultEnum("result").notNull(),
    notes: text("notes").default("").notNull(),
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

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  days: many(journalDays),
  matches: many(journalMatches),
  syncJobs: many(syncJobs),
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
    bans: many(matchBans),
    images: many(matchImages),
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

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  user: one(users, {
    fields: [syncJobs.userId],
    references: [users.id],
  }),
}));
