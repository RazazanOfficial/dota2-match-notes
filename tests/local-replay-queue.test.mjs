import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupStaleDownloads, downloadReplay, incomingFile, replayDescriptor, replayProxySettings, retryDelaySeconds } from "../scripts/replay-parser/replay-queue-utils.mjs";

const raw = {
  match_id: 9013078038, cluster: 189, replay_salt: 724775528,
  replay_url: "http://replay189.valve.net/570/9013078038_724775528.dem.bz2",
};
const folders = [];
async function folder() { const result = await mkdtemp(join(tmpdir(), "replay-queue-test-")); folders.push(result); return result; }
afterEach(async () => { for (const path of folders.splice(0)) await rm(path, { recursive: true, force: true }); });

describe("local replay queue boundaries", () => {
  it("uses only a Valve URL with the same cluster, salt and match ID", () => {
    const descriptor = replayDescriptor(raw, raw.match_id);
    expect(descriptor).toEqual({
      filename: "9013078038_724775528.dem.bz2",
      matchId: raw.match_id, cluster: 189, salt: raw.replay_salt,
      urls: [
        "https://replay189.valve.net/570/9013078038_724775528.dem.bz2",
        "http://replay189.valve.net/570/9013078038_724775528.dem.bz2",
      ],
    });
    expect(replayDescriptor({ match_id: raw.match_id, cluster: 189, replay_salt: raw.replay_salt }, raw.match_id)).toEqual(descriptor);
    for (const url of [
      "http://replay189.valve.net.evil/570/9013078038_724775528.dem.bz2",
      "http://replay189.valve.net/570/9013078038_724775528.dem.bz2?next=localhost",
      "http://replay189.valve.net/570/9013078039_724775528.dem.bz2",
      "http://replay189.valve.net/570/9013078038_1.dem.bz2",
      "http://replay190.valve.net/570/9013078038_724775528.dem.bz2",
    ]) expect(replayDescriptor({ ...raw, replay_url: url }, raw.match_id)).toBeNull();
  });

  it("avoids following redirects and records a 403 as a blocked download", async () => {
    const directory = await folder();
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url, redirect: options.redirect || "" });
      return new Response(null, { status: 403 });
    };
    await expect(downloadReplay(replayDescriptor(raw, raw.match_id), directory, fakeFetch))
      .rejects.toMatchObject({ code: "valve_access_blocked" });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.redirect === "error")).toBe(true);
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects an oversized response without retaining a partial replay", async () => {
    const directory = await folder();
    const fakeFetch = async () => new Response("oversized", { status: 200, headers: { "content-length": "209715201" } });
    await expect(downloadReplay(replayDescriptor(raw, raw.match_id), directory, fakeFetch))
      .rejects.toMatchObject({ code: "replay_download_failed" });
    expect(await readdir(directory)).toEqual([]);
  });

  it("stores a replay payload and refuses an HTML error returned as HTTP 200", async () => {
    const directory = await folder();
    const descriptor = replayDescriptor(raw, raw.match_id);
    const body = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x01, 0x02, 0x03]);
    const result = await downloadReplay(descriptor, directory, async () => new Response(body));
    expect(result.downloaded).toBe(true);
    expect(result.source).toBe("valve");
    expect(await readFile(result.path)).toEqual(body);
    expect((await readdir(directory))[0]).toMatch(/^\.replay-[0-9a-f-]{36}\.part$/);
    await rm(result.path);
    await expect(downloadReplay(descriptor, directory, async () => new Response("<html>403</html>")))
      .rejects.toMatchObject({ code: "replay_download_failed" });
    expect(await readdir(directory)).toEqual([]);
  });

  it("recognizes a safely staged file and rejects symlinks", async () => {
    const directory = await folder();
    const path = join(directory, "9013078038_724775528.dem.bz2");
    await writeFile(path, "PBDEMS2 valid bytes");
    expect(await incomingFile(directory, "9013078038_724775528.dem.bz2")).toBe(path);
    if (process.platform !== "win32") {
      await symlink(path, join(directory, "symlink.dem.bz2"));
      await expect(incomingFile(directory, "symlink.dem.bz2")).rejects.toThrow("regular file");
    }
    expect(retryDelaySeconds(1)).toBe(60);
    expect(retryDelaySeconds(9)).toBe(3_600);
  });

  it("uses only an explicit HTTPS relay, authenticates and keeps outages retryable", async () => {
    const directory = await folder();
    const proxy = replayProxySettings({
      LOCAL_REPLAY_PROXY_URL: "https://replay.example.org",
      LOCAL_REPLAY_PROXY_TOKEN: "a".repeat(64),
    });
    const descriptor = replayDescriptor(raw, raw.match_id);
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 503 });
    };
    await expect(downloadReplay(descriptor, directory, fakeFetch, proxy))
      .rejects.toMatchObject({ code: "replay_proxy_unavailable" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://replay.example.org/v1/replay/189/9013078038/724775528");
    expect(calls[0].options.headers.Authorization).toBe(`Bearer ${proxy.token}`);
    expect(calls[0].options.redirect).toBe("error");
    expect(await readdir(directory)).toEqual([]);
    await expect(downloadReplay(descriptor, directory, async () => new Response(null, { status: 401 }), proxy))
      .rejects.toMatchObject({ code: "replay_proxy_auth_failed" });
    for (const value of ["http://relay.example.org", "https://127.0.0.1", "https://relay.example.org/?x=1"]) {
      expect(() => replayProxySettings({ LOCAL_REPLAY_PROXY_URL: value, LOCAL_REPLAY_PROXY_TOKEN: proxy.token })).toThrow();
    }
  });

  it("removes orphaned temporary files without touching operator replay files", async () => {
    const directory = await folder();
    const orphan = ".replay-01234567-89ab-cdef-0123-456789abcdef.part";
    await writeFile(join(directory, orphan), "temporary");
    await writeFile(join(directory, "9013078038_724775528.dem.bz2"), "operator replay");
    const now = Date.now() + 3_700_000;
    expect(await cleanupStaleDownloads(directory, now)).toBe(1);
    expect(await readdir(directory)).toEqual(["9013078038_724775528.dem.bz2"]);
  });
});
