import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { enqueueLocalReplayImages } from "../scripts/replay-parser/local-replay-images.mjs";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE TABLE journal_matches(id text PRIMARY KEY,dota_match_id bigint);
    CREATE TABLE match_image_jobs(match_id text PRIMARY KEY REFERENCES journal_matches(id),
      status text NOT NULL DEFAULT 'pending',attempts int NOT NULL DEFAULT 0,
      run_after timestamptz DEFAULT now(),started_at timestamptz,locked_at timestamptz,
      finished_at timestamptz,error_code text,error_message text,progress_stage text DEFAULT 'queued',
      current_image int DEFAULT 0,completed_images int DEFAULT 0,updated_at timestamptz DEFAULT now());
    INSERT INTO journal_matches VALUES ('owner',42),('other-user',42),('unrelated',99);`);
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("DELETE FROM match_image_jobs"); });

describe("images after a local replay import", () => {
  it("queues every journal entry for the parsed match and preserves an active renderer", async () => {
    await db.exec(`INSERT INTO match_image_jobs(match_id,status,attempts,current_image,completed_images)
      VALUES ('owner','processing',1,2,1),('other-user','failed',3,0,0),('unrelated','completed',1,3,3)`);
    await enqueueLocalReplayImages(db, 42);
    await enqueueLocalReplayImages(db, 42);
    const { rows } = await db.query("SELECT match_id,status,attempts,current_image,completed_images FROM match_image_jobs ORDER BY match_id");
    expect(rows).toEqual([
      { match_id: "other-user", status: "pending", attempts: 0, current_image: 0, completed_images: 0 },
      { match_id: "owner", status: "processing", attempts: 1, current_image: 2, completed_images: 1 },
      { match_id: "unrelated", status: "completed", attempts: 1, current_image: 3, completed_images: 3 },
    ]);
  });

  it("participates in the parser transaction so a rollback never publishes image work", async () => {
    await db.exec("BEGIN");
    await enqueueLocalReplayImages(db, 42);
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT * FROM match_image_jobs")).rows).toEqual([]);
    await enqueueLocalReplayImages(db, 42);
    expect((await db.query("SELECT match_id FROM match_image_jobs ORDER BY match_id")).rows)
      .toEqual([{ match_id: "other-user" }, { match_id: "owner" }]);
  });
});
