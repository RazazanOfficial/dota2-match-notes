import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const state = vi.hoisted(() => ({
  controller: null, clients: [], pool: null, query: vi.fn(),
  handle: vi.fn(), updateJob: vi.fn(), failJob: vi.fn(), upload: vi.fn(),
}));
vi.mock("../scripts/env.mjs", () => ({}));
vi.mock("../scripts/node-role.mjs", () => ({ requireComputeNode: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false, mode: 0o700, uid: process.getuid() }),
}));
vi.mock("pg", () => ({ default: { Pool: class {
  constructor() { state.pool = this; }
  async connect() {
    const client = new EventEmitter();
    client.query = vi.fn((...args) => state.query(client, ...args));
    client.release = vi.fn();
    state.clients.push(client);
    return client;
  }
  end = vi.fn();
} } }));
vi.mock("../scripts/replay-parser/run-queue.mjs", () => ({
  abort: { get signal() { return state.controller.signal; }, abort: (...args) => state.controller.abort(...args) },
  incoming: "/fixture/incoming", hooksFor: () => ({}),
  handle: (...args) => state.handle(...args), parsePrepared: (...args) => state.handle(...args),
  updateJob: (...args) => state.updateJob(...args), failJob: (...args) => state.failJob(...args),
}));
vi.mock("../scripts/replay-parser/replay-spool.mjs", () => ({
  inspectSpool: async () => ({ path: "/fixture/replay.part", bytes: 100 }),
  verifyCheckpoint: async () => true, cleanCompletedPipelineSpool: async () => {},
}));
vi.mock("../scripts/replay-parser/replay-queue-utils.mjs", () => ({ replayDescriptor: () => null }));
vi.mock("../scripts/replay-parser/replay-archive.mjs", () => ({
  replayArchiveKey: vi.fn(), archivedReplayExists: vi.fn(), uploadReplay: (...args) => state.upload(...args),
}));

const originalGetuid = Object.getOwnPropertyDescriptor(process, "getuid");
let main;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("LOCAL_REPLAY_WORKER_ENABLED", "true");
  vi.stubEnv("LOCAL_REPLAY_PREPARE_CONCURRENCY", "1");
  vi.stubEnv("LOCAL_REPLAY_PARSE_CONCURRENCY", "1");
  vi.stubEnv("LOCAL_REPLAY_ARCHIVE_CONCURRENCY", "1");
  if (!process.getuid) Object.defineProperty(process, "getuid", { configurable: true, value: () => 123 });
  state.controller = new AbortController();
  state.clients = [];
  state.query.mockReset().mockImplementation(async (_client, sql) => ({
    rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [], rowCount: 0,
  }));
  state.handle.mockReset();
  state.updateJob.mockReset();
  state.failJob.mockReset();
  state.upload.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  ({ main } = await import("../scripts/replay-parser/run-pipeline.mjs"));
});
afterEach(() => {
  state.controller.abort();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (originalGetuid) Object.defineProperty(process, "getuid", originalGetuid);
  else delete process.getuid;
});

async function start() {
  // Attach rejection handling immediately, before triggering asynchronous faults.
  const outcome = main().then(() => ({ ok: true }), error => ({ ok: false, error }));
  await vi.waitFor(() => expect(state.clients).toHaveLength(4));
  await vi.waitFor(() => expect(state.clients.slice(1).every(client => client.query.mock.calls.length > 0)).toBe(true));
  return { outcome };
}
async function expectReleased() {
  for (const client of state.clients) expect(client.release).toHaveBeenCalledOnce();
  expect(state.pool.end).toHaveBeenCalledOnce();
}
const waitForStop = () => new Promise((_, reject) => {
  state.controller.signal.addEventListener("abort", () => reject(new Error("worker_interrupted")), { once: true });
});
function activeJob(lane) {
  let claimed = false;
  state.query.mockImplementation(async (_client, sql, args) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
    const claim = lane === "archive" ? sql.includes("WHERE match_id=(SELECT a.match_id")
      : sql.includes("WHERE match_id=(SELECT j.match_id") && args[0] === "checking_archive";
    if (!claimed && claim) {
      claimed = true;
      return { rows: [{ match_id: 1, lease: "fixture-lease", attempts: 1 }] };
    }
    if (sql.startsWith("SELECT j.*,m.raw_data")) return { rows: [{ spool_name: "fixture", spool_complete: true, archive_key: "fixture-key" }] };
    return { rows: [], rowCount: 1 };
  });
  const work = lane === "archive" ? state.upload : state.handle;
  work.mockImplementation(waitForStop);
  return work;
}

describe("replay pipeline failure and shutdown lifecycle", () => {
  it.each([["owner", 0], ["idle lane", 1]])("fails on an asynchronous %s connection error so systemd can restart it", async (_name, index) => {
    const { outcome } = await start();
    const error = new Error("connection terminated unexpectedly");
    state.clients[index].emit("error", error);
    expect(await outcome).toEqual({ ok: false, error });
    await expectReleased();
  });

  it("preserves the first connection failure when other lanes disconnect too", async () => {
    const { outcome } = await start();
    const error = new Error("first connection failure");
    state.clients[0].emit("error", error);
    state.clients[1].emit("error", new Error("second connection failure"));
    expect(await outcome).toEqual({ ok: false, error });
    await expectReleased();
  });

  it("keeps intentional shutdown successful even if a connection closes during cleanup", async () => {
    const { outcome } = await start();
    state.controller.abort(); // SIGTERM/SIGINT use this same graceful abort path.
    state.clients[0].emit("error", new Error("connection closing during shutdown"));
    expect(await outcome).toEqual({ ok: true });
    await expectReleased();
  });

  it.each(["foreground", "archive"])("keeps intentional shutdown successful while %s work persists its retry", async lane => {
    const work = activeJob(lane);
    const { outcome } = await start();
    await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());
    state.controller.abort();
    expect(await outcome).toEqual({ ok: true });
    if (lane === "foreground") expect(state.failJob).toHaveBeenCalledOnce();
    else expect(state.query.mock.calls.some(([, sql]) => sql.includes("UPDATE replay_archive_jobs SET status=$3"))).toBe(true);
    await expectReleased();
  });

  it("ignores an in-flight heartbeat rejection after intentional shutdown has started", async () => {
    activeJob("foreground");
    let rejectWork, rejectHeartbeat;
    state.handle.mockImplementation(() => new Promise((_, reject) => { rejectWork = reject; }));
    state.updateJob.mockImplementation(() => new Promise((_, reject) => { rejectHeartbeat = reject; }));
    const { outcome } = await start();
    await vi.waitFor(() => expect(state.handle).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.updateJob).toHaveBeenCalledOnce();
    state.controller.abort();
    rejectHeartbeat(Object.assign(new Error("heartbeat interrupted by shutdown"), { code: "55P03" }));
    // Let the heartbeat catch run while foreground work has not finished yet.
    await vi.advanceTimersByTimeAsync(0);
    rejectWork(new Error("worker_interrupted"));
    expect(await outcome).toEqual({ ok: true });
    expect(state.failJob).toHaveBeenCalledOnce();
    await expectReleased();
  });

  it("does not hide a rejected lane query when intentional shutdown happens concurrently", async () => {
    const error = new Error("query failed");
    let rejectQuery;
    state.query.mockImplementation(async (_client, sql, args) => {
      if (sql.includes("WHERE match_id=(SELECT j.match_id") && args[0] === "checking_archive") {
        return new Promise((_, reject) => { rejectQuery = reject; });
      }
      return { rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [], rowCount: 0 };
    });
    const { outcome } = await start();
    state.controller.abort();
    rejectQuery(error);
    expect(await outcome).toEqual({ ok: false, error });
    await expectReleased();
  });

  it("still fails on a rejected lane query", async () => {
    const error = new Error("query failed");
    state.query.mockImplementation(async (_client, sql) => {
      if (sql.includes("WHERE match_id=(SELECT j.match_id")) throw error;
      return { rows: sql.includes("pg_try_advisory_lock") ? [{ locked: true }] : [], rowCount: 0 };
    });
    expect(await main().then(() => ({ ok: true }), error => ({ ok: false, error }))).toEqual({ ok: false, error });
    await expectReleased();
  });

  it("fails on a foreground heartbeat failure even when failJob handles the interrupted job", async () => {
    const error = Object.assign(new Error("heartbeat lock unavailable"), { code: "55P03" });
    let claimed = false;
    state.query.mockImplementation(async (_client, sql, args) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (!claimed && sql.includes("WHERE match_id=(SELECT j.match_id") && args[0] === "checking_archive") {
        claimed = true;
        return { rows: [{ match_id: 1, lease: "fixture-lease" }] };
      }
      return { rows: [], rowCount: 0 };
    });
    state.handle.mockImplementation(waitForStop);
    state.updateJob.mockRejectedValue(error);
    const { outcome } = await start();
    await vi.waitFor(() => expect(state.handle).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toEqual({ ok: false, error });
    expect(state.failJob).toHaveBeenCalledOnce();
    expect(state.controller.signal.reason).toBe(error);
    await expectReleased();
  });

  it("fails on an archive heartbeat failure even when the archive retry is persisted", async () => {
    const error = new Error("archive heartbeat query failed");
    let claimed = false;
    state.query.mockImplementation(async (_client, sql) => {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
      if (!claimed && sql.includes("WHERE match_id=(SELECT a.match_id")) {
        claimed = true;
        return { rows: [{ match_id: 1, lease: "fixture-lease", attempts: 1 }] };
      }
      if (sql.startsWith("SELECT j.*,m.raw_data")) return { rows: [{ spool_name: "fixture", spool_complete: true, archive_key: "fixture-key" }] };
      if (sql.startsWith("UPDATE replay_archive_jobs SET heartbeat_at=now()")) throw error;
      return { rows: [], rowCount: 1 };
    });
    state.upload.mockImplementation(waitForStop);
    const { outcome } = await start();
    await vi.waitFor(() => expect(state.upload).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toEqual({ ok: false, error });
    expect(state.query.mock.calls.some(([, sql]) => sql.includes("UPDATE replay_archive_jobs SET status=$3"))).toBe(true);
    await expectReleased();
  });
});
