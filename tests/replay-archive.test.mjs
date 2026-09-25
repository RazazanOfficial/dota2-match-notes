import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { replayArchiveKey, retrieveReplay, uploadReplay } from "../scripts/replay-parser/replay-archive.mjs";
import { replayDescriptor } from "../scripts/replay-parser/replay-queue-utils.mjs";

describe("private replay archive layout", () => {
  const descriptor = replayDescriptor({ match_id: 9013078038, cluster: 189, replay_salt: 724775528 }, 9013078038);

  it("uses the match start date in UTC and a stable match/salt filename", () => {
    expect(replayArchiveKey("2026-09-23T23:59:00.000Z", descriptor))
      .toBe("replays/2026/09/23/9013078038_724775528.dem.bz2");
    expect(replayArchiveKey("2026-09-23T23:59:00.000Z", descriptor))
      .toBe(replayArchiveKey("2026-09-23T23:59:00.000Z", descriptor));
  });

  it("refuses an invalid date or filename", () => {
    expect(() => replayArchiveKey("invalid", descriptor)).toThrow();
    expect(() => replayArchiveKey("2026-09-23", { filename: "../secret" })).toThrow();
  });

  it("streams the file to S3 and verifies the stored bytes before marking it archived", async () => {
    const directory = await mkdtemp(join(tmpdir(), "replay-archive-test-"));
    const body = Buffer.from("PBDEMS2 archived replay");
    const source = join(directory, "match.dem");
    await writeFile(source, body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    let stored = null;
    const server = createServer(async (request, response) => {
      if (request.method === "PUT") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        stored = Buffer.concat(chunks);
        response.writeHead(200, { etag: '"replay"' }).end();
      } else if (request.method === "HEAD") {
        response.writeHead(200, { "content-length": stored.length, "x-amz-meta-sha256": sha256 }).end();
      } else if (request.method === "GET") {
        response.writeHead(200, { "content-length": stored.length, "x-amz-meta-sha256": sha256 }).end(stored);
      } else response.writeHead(405).end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const prior = Object.fromEntries([
      "CLOUD_SPACE_END_POINT_URL", "CLOUD_SPACE_BUCKET", "CLOUD_SPACE_ACCESS_KEY",
      "CLOUD_SPACE_SECRET_KEY", "CLOUD_SPACE_REGION", "CLOUD_SPACE_FORCE_PATH_STYLE",
    ].map((key) => [key, process.env[key]]));
    try {
      process.env.CLOUD_SPACE_END_POINT_URL = `http://127.0.0.1:${server.address().port}`;
      process.env.CLOUD_SPACE_BUCKET = "replay-test";
      process.env.CLOUD_SPACE_ACCESS_KEY = "test";
      process.env.CLOUD_SPACE_SECRET_KEY = "test";
      process.env.CLOUD_SPACE_FORCE_PATH_STYLE = "true";
      const key = replayArchiveKey("2026-09-23", descriptor);
      expect(await uploadReplay(source, key)).toEqual({ key, bytes: body.length });
      expect(stored).toEqual(body);
      const downloaded = await retrieveReplay(key, body.length, directory);
      expect(await readFile(downloaded)).toEqual(body);
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
