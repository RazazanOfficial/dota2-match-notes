import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { listReplayFolder, replayObjectHead, validReplayFolder, validReplayKey } from "@/lib/replay/archive-storage";

describe("replay archive storage", () => {
  it("accepts legacy filenames, limits navigation to the replay folder", () => {
    expect(validReplayKey("replays/2026/09/25/9013078038_724775528.dem.bz2")).toBe(true);
    expect(validReplayKey("replays/2026/09/25/9013078038.dem.bz2")).toBe(true);
    expect(validReplayFolder("replays/2026/09/25/")).toBe(true);
    expect(validReplayFolder("images/")).toBe(false);
    expect(validReplayKey("replays/../../secret")).toBe(false);
  });

  it("distinguishes missing S3 objects from connection failure and lists child folders", async () => {
    const server = createServer((request, response) => {
      if (request.method === "HEAD") {
        response.writeHead(404, { "content-type": "application/xml" }).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/xml" }).end(`<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult><IsTruncated>false</IsTruncated><CommonPrefixes><Prefix>replays/2026/</Prefix></CommonPrefixes></ListBucketResult>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const original = Object.fromEntries(["CLOUD_SPACE_END_POINT_URL", "CLOUD_SPACE_BUCKET", "CLOUD_SPACE_PUBLIC_BASE_URL", "CLOUD_SPACE_ACCESS_KEY", "CLOUD_SPACE_SECRET_KEY"].map((key) => [key, process.env[key]]));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server unavailable");
      process.env.CLOUD_SPACE_END_POINT_URL = `http://127.0.0.1:${address.port}`;
      process.env.CLOUD_SPACE_BUCKET = "test-replays";
      process.env.CLOUD_SPACE_PUBLIC_BASE_URL = `http://127.0.0.1:${address.port}`;
      process.env.CLOUD_SPACE_ACCESS_KEY = "test";
      process.env.CLOUD_SPACE_SECRET_KEY = "test";
      expect(await replayObjectHead("replays/2026/09/25/9015934336.dem.bz2")).toBeNull();
      expect((await listReplayFolder("replays/")).folders).toEqual(["replays/2026/"]);
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
