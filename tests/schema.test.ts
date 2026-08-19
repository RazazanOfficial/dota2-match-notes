import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  adminAuditLogs,
  dismissedDotaMatches,
  externalApiDailyUsage,
  externalApiRateLimits,
  heroPoolEntries,
  heroPoolVersions,
  journalMatches,
  matchImageJobs,
  matchImages,
  releaseNoteReads,
  releaseNotes,
  sessions,
  syncJobs,
  users,
} from "../lib/db/schema";

describe("database schema", () => {
  it("uses stable table names for the core records", () => {
    expect(getTableConfig(users).name).toBe("users");
    expect(getTableConfig(sessions).name).toBe("sessions");
    expect(getTableConfig(journalMatches).name).toBe("journal_matches");
    expect(getTableConfig(matchImages).name).toBe("match_images");
    expect(getTableConfig(matchImageJobs).name).toBe("match_image_jobs");
    expect(getTableConfig(externalApiRateLimits).name).toBe(
      "external_api_rate_limits",
    );
    expect(getTableConfig(externalApiDailyUsage).name).toBe(
      "external_api_daily_usage",
    );
    expect(getTableConfig(syncJobs).name).toBe("sync_jobs");
    expect(getTableConfig(adminAuditLogs).name).toBe("admin_audit_logs");
    expect(getTableConfig(dismissedDotaMatches).name).toBe(
      "dismissed_dota_matches",
    );
    expect(getTableConfig(heroPoolVersions).name).toBe("hero_pool_versions");
    expect(getTableConfig(heroPoolEntries).name).toBe("hero_pool_entries");
    expect(getTableConfig(releaseNotes).name).toBe("release_notes");
    expect(getTableConfig(releaseNoteReads).name).toBe("release_note_reads");
  });

  it("keeps one active versioned hero pool per player", () => {
    const versions = getTableConfig(heroPoolVersions);
    expect(versions.indexes.map((index) => index.config.name)).toContain("hero_pool_versions_one_active_uidx");
    const entries = getTableConfig(heroPoolEntries);
    expect(entries.checks.map((constraint) => constraint.name)).toContain("hero_pool_entries_sort_order_check");
  });

  it("stores durable release reads per user and version", () => {
    const reads = getTableConfig(releaseNoteReads);
    expect(reads.primaryKeys[0]?.columns.map((column) => column.name)).toEqual(["user_id", "release_id"]);
  });

  it("stores persistent external API rate-limit windows", () => {
    const config = getTableConfig(externalApiRateLimits);
    const checkNames = config.checks.map((constraint) => constraint.name);
    expect(checkNames).toContain("external_api_rate_limits_count_check");
  });

  it("keeps daily OpenDota usage for admin charts", () => {
    const config = getTableConfig(externalApiDailyUsage);
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      "provider",
      "day",
    ]);
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "external_api_daily_usage_count_check",
    );
  });

  it("enforces three generated image slots at the database level", () => {
    const config = getTableConfig(matchImages);
    const checkNames = config.checks.map((constraint) => constraint.name);
    const indexNames = config.indexes.map((constraint) => constraint.config.name);

    expect(checkNames).toContain("match_images_sort_order_check");
    expect(indexNames).toContain("match_images_match_sort_uidx");
  });

  it("prevents two active sync jobs for the same user", () => {
    const config = getTableConfig(syncJobs);
    const indexNames = config.indexes.map((constraint) => constraint.config.name);

    expect(indexNames).toContain("sync_jobs_one_active_per_user_uidx");
  });

  it("keeps one durable image job per journal match", () => {
    const config = getTableConfig(matchImageJobs);
    const indexNames = config.indexes.map((constraint) => constraint.config.name);
    const checkNames = config.checks.map((constraint) => constraint.name);

    expect(indexNames).toContain("match_image_jobs_match_id_uidx");
    expect(indexNames).toContain("match_image_jobs_status_run_after_idx");
    expect(checkNames).toContain("match_image_jobs_attempts_check");
  });

  it("keeps one dismissal per user and Dota match", () => {
    const config = getTableConfig(dismissedDotaMatches);
    const primaryKeyColumns = config.primaryKeys[0]?.columns.map(
      (column) => column.name,
    );
    const checkNames = config.checks.map((constraint) => constraint.name);

    expect(primaryKeyColumns).toEqual(["user_id", "dota_match_id"]);
    expect(checkNames).toContain("dismissed_dota_matches_match_id_check");
  });

  it("indexes immutable Super Admin audit records", () => {
    const config = getTableConfig(adminAuditLogs);
    const indexNames = config.indexes.map((constraint) => constraint.config.name);
    const checkNames = config.checks.map((constraint) => constraint.name);

    expect(indexNames).toContain("admin_audit_logs_actor_created_idx");
    expect(indexNames).toContain("admin_audit_logs_action_created_idx");
    expect(checkNames).toContain("admin_audit_logs_action_length_check");
  });
});
