import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  journalMatches,
  matchImageUploads,
  matchImages,
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
    expect(getTableConfig(matchImageUploads).name).toBe("match_image_uploads");
    expect(getTableConfig(syncJobs).name).toBe("sync_jobs");
  });

  it("tracks short-lived image upload reservations separately", () => {
    const config = getTableConfig(matchImageUploads);
    const indexNames = config.indexes.map((constraint) => constraint.config.name);

    expect(indexNames).toContain("match_image_uploads_object_key_uidx");
    expect(indexNames).toContain("match_image_uploads_expires_at_idx");
  });

  it("enforces three image slots at the database level", () => {
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
});
