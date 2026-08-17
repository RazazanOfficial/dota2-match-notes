import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildQueueAheadExpression,
  serializePlayerSyncSnapshot,
} from "../lib/player-dashboard/repository";

describe("player sync dashboard", () => {
  it("uses the real image-job table with a correlated queue alias", () => {
    const query = new PgDialect().sqlToQuery(buildQueueAheadExpression());

    expect(query.sql).toContain(
      'from "match_image_jobs" as "queued_image_jobs"',
    );
    expect(query.sql).not.toContain('from "queued_image_jobs"');
  });

  it("exposes cooldown and live image queue positions without storage secrets", () => {
    const lastSyncAt = new Date("2026-08-16T10:00:00.000Z");
    const status = serializePlayerSyncSnapshot(
      {
        user: {
          createdAt: new Date("2026-08-16T08:00:00.000Z"),
          lastManualSyncAt: lastSyncAt,
          manualSyncCursorAt: lastSyncAt,
        },
        counts: { pending: 1, processing: 0, completed: 0, failed: 0 },
        jobs: [
          {
            id: "job-1",
            matchId: "match-1",
            dotaMatchId: 8_940_973_270,
            heroName: "Shadow Fiend",
            status: "pending" as const,
            attempts: 0,
            runAfter: lastSyncAt,
            finishedAt: null,
            errorCode: null,
            updatedAt: lastSyncAt,
            imageCount: 0,
            queueAhead: 2,
          },
        ],
      },
      300,
    );

    expect(status.nextAllowedAt).toBe("2026-08-16T10:05:00.000Z");
    expect(status.imageQueue.jobs[0]).toMatchObject({
      dotaMatchId: "8940973270",
      position: 3,
      status: "pending",
    });
    expect(JSON.stringify(status)).not.toContain("objectKey");
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
