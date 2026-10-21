import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivedReplayExists, replayArchiveKey, retrieveReplay, uploadReplay } from "../scripts/replay-parser/replay-archive.mjs";
import { replayDescriptor } from "../scripts/replay-parser/replay-queue-utils.mjs";

describe("private replay archive layout", () => {
  const descriptor = replayDescriptor({ match_id: 9013078038, cluster: 189, replay_salt: 724775528 }, 9013078038);

  it("uses the match start date in UTC and only the match ID in new filenames", () => {
    expect(replayArchiveKey("2026-09-23T23:59:00.000Z", descriptor))
      .toBe("replays/2026/09/23/9013078038.dem.bz2");
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
      expect(await archivedReplayExists(key, body.length)).toBe(true);
      const downloaded = await retrieveReplay(key, body.length, directory);
      expect(await readFile(downloaded)).toEqual(body);
      // Existing ParsPack objects keep their historical salt-based key.
      const legacy = key.replace("9013078038.dem", "9013078038_724775528.dem");
      expect(await archivedReplayExists(legacy, body.length)).toBe(true);
      expect(await readFile(await retrieveReplay(legacy, body.length, directory))).toEqual(body);
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

it.each([false, true])("uploads bounded multipart ranges, retries transient failures and cleans up permanent failure=%s", async permanent => {
  const directory = await mkdtemp(join(tmpdir(), "replay-multipart-"));
  const bytes = Buffer.alloc(17 * 1024 * 1024, 7), source = join(directory,"replay.dem");
  await writeFile(source,bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const attempts = new Map(), parts = new Map();
  let completed=false, aborted=false, reported=0, confirmed=false, checked=false;
  const server=createServer(async(request,response)=>{
    const url=new URL(request.url,"http://localhost");
    const chunks=[];for await(const chunk of request) chunks.push(chunk);
    const body=Buffer.concat(chunks);
    if(request.method==="POST" && url.searchParams.has("uploads")) {
      response.writeHead(200,{"Content-Type":"application/xml"}).end('<InitiateMultipartUploadResult><UploadId>test-id</UploadId></InitiateMultipartUploadResult>');
    } else if(request.method==="PUT") {
      const part=Number(url.searchParams.get("partNumber"));attempts.set(part,(attempts.get(part)||0)+1);
      if(permanent || part===2 && attempts.get(part)===1) {
        response.writeHead(permanent?403:503,{"Content-Type":"application/xml"})
          .end(`<Error><Code>${permanent?"AccessDenied":"SlowDown"}</Code><Message>Test only</Message></Error>`);
      } else {parts.set(part,body);response.writeHead(200,{ETag:`"part-${part}"`}).end();}
    } else if(request.method==="POST") {
      expect(parts.size).toBe(3);expect(body.toString()).toContain("<PartNumber>3</PartNumber>");completed=true;
      response.writeHead(200,{"Content-Type":"application/xml"}).end('<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>');
    } else if(request.method==="HEAD") {
      checked=true;response.writeHead(200,{"Content-Length":bytes.length,"x-amz-meta-sha256":sha256}).end();
    } else if(request.method==="DELETE") {aborted=true;response.writeHead(204).end();}
    else response.writeHead(400).end();
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const names=["CLOUD_SPACE_END_POINT_URL","CLOUD_SPACE_BUCKET","CLOUD_SPACE_ACCESS_KEY","CLOUD_SPACE_SECRET_KEY","CLOUD_SPACE_FORCE_PATH_STYLE"];
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    Object.assign(process.env,{CLOUD_SPACE_END_POINT_URL:`http://127.0.0.1:${server.address().port}`,CLOUD_SPACE_BUCKET:"test",CLOUD_SPACE_ACCESS_KEY:"test",CLOUD_SPACE_SECRET_KEY:"test",CLOUD_SPACE_FORCE_PATH_STYLE:"true"});
    const promise=uploadReplay(source,"replays/2026/10/21/9000000001.dem.bz2",{onProgress:delta=>{reported+=delta;},onUploaded:()=>{confirmed=true;}});
    if(permanent) {
      await expect(promise).rejects.toMatchObject({$metadata:{httpStatusCode:403}});
      expect(aborted).toBe(true);expect(completed).toBe(false);expect(confirmed).toBe(false);expect(reported).toBe(0);
    } else {
      await expect(promise).resolves.toMatchObject({bytes:bytes.length});
      expect(createHash("sha256").update(Buffer.concat([...parts.values()])).digest("hex")).toBe(sha256);
      expect([...parts.values()].every(part=>part.length<=8*1024*1024)).toBe(true);
      expect(attempts.get(2)).toBe(2);expect(reported).toBe(bytes.length);
      expect(completed && confirmed && checked).toBe(true);expect(aborted).toBe(false);
    }
  } finally {
    for(const [name,value] of Object.entries(prior)) {if(value===undefined)delete process.env[name];else process.env[name]=value;}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
  }
});
