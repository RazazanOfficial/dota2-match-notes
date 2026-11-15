import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../src/lib/db", () => ({ getDb: () => state.db }));
import { ensureMonthlyReference, runMonthlyMetaTick, runMonthlyPerformanceTick } from "../src/lib/monthly-reference/service";
import { REFERENCE_PARENTS, MonthlyReferencePartitionsError } from "../src/lib/monthly-reference/partitions";
import { monthDate, monthKey, previousMonth } from "../src/lib/monthly-reference/model";
import * as providers from "../src/lib/monthly-reference/providers";
import { monthlyReferenceVersions, monthlyHeroPositionMeta } from "../src/lib/db/schema";
import { HttpRequest } from "../src/http/protocol";
import { POST as tick } from "../src/routes/internal/performance-reference/tick/route";
import { POST as adminPost } from "../src/routes/admin/monthly-references/route";
import { createSession } from "../src/lib/auth/session";

const client = new PGlite(), db = drizzle(client); state.db = db;
const realNow = new Date();
const now = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth(), 15, 12));
const month = previousMonth(now), lower = monthDate(month), suffix = monthKey(month);
const upper = monthDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)));
const ownerSql = await readFile(fileURLToPath(new URL("../../../deploy/scripts/prepare-monthly-reference-partitions.sql", import.meta.url)), "utf8");
let adminToken = "";

beforeAll(async () => {
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(now);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await client.exec(`
    CREATE ROLE dota_notes_app NOSUPERUSER NOINHERIT;
    CREATE ROLE dota_notes_compute NOSUPERUSER NOINHERIT;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE, CREATE ON SCHEMA public TO dota_notes_app;
    GRANT USAGE ON SCHEMA public TO dota_notes_compute;
  `);
  for (const table of [...REFERENCE_PARENTS, "monthly_reference_versions", "monthly_reference_events"]) {
    await client.exec(`ALTER TABLE public.${table} OWNER TO dota_notes_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO dota_notes_compute;`);
  }
  vi.stubEnv("APP_URL", "https://dota.example");
  vi.stubEnv("SUPER_ADMIN_STEAM_IDS", "76561197960265729");
  vi.stubEnv("SYNC_WORKER_SECRET", "reference-test-worker-secret-123456789");
  vi.stubEnv("DOTA_NODE_ROLE", "compute");
  const user = await client.query<{ id: string }>(`INSERT INTO users(steam_id,steam_account_id,handle,display_name)
    VALUES('76561197960265729',1,'reference_admin','Reference Admin') RETURNING id`);
  adminToken = (await createSession(user.rows[0].id)).token;
}, 60_000);
afterAll(async () => { await client.exec("RESET ROLE"); await client.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });
beforeEach(async () => {
  await client.exec("RESET ROLE; SET DateStyle = 'ISO, YMD'; DELETE FROM monthly_reference_events");
  for (const parent of REFERENCE_PARENTS) await client.exec(`DELETE FROM ${parent}; DROP TABLE IF EXISTS ${parent}_${suffix}`);
  await client.exec("DELETE FROM monthly_reference_versions");
});

function mockMeta() {
  return vi.spyOn(providers,"fetchMonthlyMeta").mockResolvedValue([{
    heroId:1,position:1,rankBracket:"DIVINE",gameMode:22,matchCount:1000,winCount:500,
    positionShare:100,metaPickRate:100,winRate:50,
  }]);
}
async function seedProgress() {
  await client.exec(ownerSql);
  await client.exec("SET ROLE dota_notes_compute");
  const fetch = mockMeta();
  try { await ensureMonthlyReference(now); await runMonthlyMetaTick(now); }
  finally { fetch.mockRestore(); await client.exec("RESET ROLE"); }
}

describe("monthly reference under restricted compute privileges", () => {
  it("reproduces the old 42501 and returns actionable 503 before changing any builder", async () => {
    await client.exec("SET ROLE dota_notes_compute");
    await expect(client.exec(`CREATE TABLE IF NOT EXISTS public.monthly_hero_position_meta_${suffix}
      PARTITION OF public.monthly_hero_position_meta FOR VALUES FROM ('${lower}') TO ('${upper}')`)).rejects.toMatchObject({code:"42501"});
    await expect(ensureMonthlyReference(now)).rejects.toBeInstanceOf(MonthlyReferencePartitionsError);
    const response = await tick(new HttpRequest("http://localhost/api/internal/performance-reference/tick", {
      method:"POST", headers:{authorization:"Bearer reference-test-worker-secret-123456789"},
    }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("monthly_reference_partitions_missing");
    expect((await db.select().from(monthlyReferenceVersions))).toHaveLength(0);
    await client.exec("RESET ROLE");
    const admin = await adminPost(new HttpRequest("https://dota.example/api/admin/monthly-references", {
      method:"POST", headers:{authorization:`Bearer ${adminToken}`,"content-type":"application/json"},
      body:JSON.stringify({month:lower.slice(0,7)}),
    }));
    expect(admin.status).toBe(503);
    expect((await admin.json()).error.code).toBe("monthly_reference_partitions_missing");
  });

  it("provisions idempotently as owner while retaining compute DML-only access", async () => {
    await client.exec(ownerSql);
    await client.exec(ownerSql);
    const count = await client.query<{total:number}>(`SELECT count(*)::int total FROM pg_inherits i
      JOIN pg_class p ON p.oid=i.inhparent WHERE p.relname = ANY($1)`, [[...REFERENCE_PARENTS]]);
    expect(count.rows[0].total).toBe(39);
    await client.exec("SET ROLE dota_notes_compute");
    const privileges = await client.query<{can_create:boolean}>("SELECT has_schema_privilege(current_user,'public','CREATE') can_create");
    expect(privileges.rows[0].can_create).toBe(false);
    // IF NOT EXISTS still requires CREATE even with the owner's partition present.
    await expect(client.exec(`CREATE TABLE IF NOT EXISTS public.monthly_hero_position_meta_${suffix}
      PARTITION OF public.monthly_hero_position_meta FOR VALUES FROM ('${lower}') TO ('${upper}')`)).rejects.toMatchObject({code:"42501"});
    await client.exec("SET DateStyle = 'SQL, DMY'");
    const scheduled = await ensureMonthlyReference(now);
    expect(scheduled.status).toBe("created");
    expect((await ensureMonthlyReference(now)).versionId).toBe(scheduled.versionId);
    // The catalog guard normalizes only its transaction; batch date strings use
    // the application's existing ISO connection convention.
    await client.exec("SET DateStyle = 'ISO, YMD'");
    const fetch = mockMeta();
    try {
      expect((await runMonthlyMetaTick(now)).status).toBe("progress");
      expect((await db.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id,scheduled.versionId!)))[0].metaCursor).toBe(1);
      expect(await db.select().from(monthlyHeroPositionMeta).where(eq(monthlyHeroPositionMeta.versionId,scheduled.versionId!))).toHaveLength(1);
    } finally { fetch.mockRestore(); await client.exec("RESET ROLE; SET DateStyle = 'ISO, YMD'"); }
  });

  it("rejects a detached partition before resuming an existing builder, preserving its cursor", async () => {
    await seedProgress();
    const [before] = await db.select().from(monthlyReferenceVersions);
    const eventsBefore = await client.query<{total:number}>("SELECT count(*)::int total FROM monthly_reference_events");
    await client.exec(`ALTER TABLE public.monthly_hero_position_meta DETACH PARTITION public.monthly_hero_position_meta_${suffix}; SET ROLE dota_notes_compute`);
    await expect(ensureMonthlyReference(now,true)).rejects.toBeInstanceOf(MonthlyReferencePartitionsError);
    await expect(ensureMonthlyReference(now)).rejects.toBeInstanceOf(MonthlyReferencePartitionsError);
    const response = await tick(new HttpRequest("http://localhost/api/internal/performance-reference/tick", {
      method:"POST", headers:{authorization:"Bearer reference-test-worker-secret-123456789"},
    }));
    expect(response.status).toBe(503);
    const [after] = await db.select().from(monthlyReferenceVersions);
    expect(after).toEqual(before);
    expect((await client.query<{total:number}>("SELECT count(*)::int total FROM monthly_reference_events")).rows).toEqual(eventsBefore.rows);
    await client.exec("RESET ROLE");
    await expect(client.exec(ownerSql)).rejects.toThrow("Unexpected partition owner, attachment or bounds");
    await client.exec("ROLLBACK");
    const stillThere = await client.query<{total:number}>(`SELECT count(*)::int total FROM public.monthly_hero_position_meta_${suffix}`);
    expect(stillThere.rows[0].total).toBe(1);
    await client.exec(`ALTER TABLE public.monthly_hero_position_meta ATTACH PARTITION public.monthly_hero_position_meta_${suffix} FOR VALUES FROM ('${lower}') TO ('${upper}')`);
  });

  it("refuses an attached partition with the expected name but wrong bounds without dropping data", async () => {
    await seedProgress();
    const date = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
    const next = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
    const wrong = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+24,1));
    const wrongNext = new Date(Date.UTC(wrong.getUTCFullYear(),wrong.getUTCMonth()+1,1));
    const name = `monthly_hero_position_meta_${monthKey(date)}`;
    await client.exec(`ALTER TABLE monthly_hero_position_meta DETACH PARTITION ${name};
      ALTER TABLE ${name} RENAME TO ${name}_saved;
      CREATE TABLE ${name} PARTITION OF monthly_hero_position_meta FOR VALUES FROM ('${monthDate(wrong)}') TO ('${monthDate(wrongNext)}');
      ALTER TABLE ${name} OWNER TO dota_notes_app;`);
    await expect(client.exec(ownerSql)).rejects.toThrow("Unexpected partition owner, attachment or bounds");
    await client.exec("ROLLBACK");
    const rows = await client.query<{total:number}>(`SELECT count(*)::int total FROM monthly_hero_position_meta_${suffix}`);
    expect(rows.rows[0].total).toBe(1);
    await client.exec(`DROP TABLE ${name}; ALTER TABLE ${name}_saved RENAME TO ${name};
      ALTER TABLE monthly_hero_position_meta ATTACH PARTITION ${name} FOR VALUES FROM ('${monthDate(date)}') TO ('${monthDate(next)}');`);
  });

  it("checks the historical builder actually selected by the worker before fetching or recording failure", async () => {
    await client.exec(ownerSql);
    const oldMonth = previousMonth(month), oldSuffix = monthKey(oldMonth);
    const scheduled = await ensureMonthlyReference(now,false,monthDate(oldMonth).slice(0,7));
    await ensureMonthlyReference(now);
    const before = await db.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id,scheduled.versionId!));
    await client.exec(`ALTER TABLE monthly_hero_position_meta DETACH PARTITION monthly_hero_position_meta_${oldSuffix}; SET ROLE dota_notes_compute`);
    const meta = vi.spyOn(providers,"fetchMonthlyMeta"), performance = vi.spyOn(providers,"fetchMonthlyPerformance");
    try {
      const response = await tick(new HttpRequest("http://localhost/api/internal/performance-reference/tick", {
        method:"POST",headers:{authorization:"Bearer reference-test-worker-secret-123456789"},
      }));
      expect(response.status).toBe(503);
      await expect(runMonthlyPerformanceTick()).rejects.toBeInstanceOf(MonthlyReferencePartitionsError);
      expect(meta).not.toHaveBeenCalled(); expect(performance).not.toHaveBeenCalled();
      expect(await db.select().from(monthlyReferenceVersions).where(eq(monthlyReferenceVersions.id,scheduled.versionId!))).toEqual(before);
    } finally {
      meta.mockRestore(); performance.mockRestore(); await client.exec("RESET ROLE");
      await client.exec(`ALTER TABLE monthly_hero_position_meta ATTACH PARTITION monthly_hero_position_meta_${oldSuffix} FOR VALUES FROM ('${monthDate(oldMonth)}') TO ('${lower}')`);
    }
  });

  it("stops on an unexpected existing partition owner instead of silently failing its grants", async () => {
    await client.exec(ownerSql);
    const name = `monthly_hero_position_meta_${suffix}`;
    await client.exec(`ALTER TABLE ${name} OWNER TO postgres`);
    await expect(client.exec(ownerSql)).rejects.toThrow("Unexpected partition owner, attachment or bounds");
    await client.exec("ROLLBACK");
    const owner = await client.query<{owner:string}>("SELECT tableowner AS owner FROM pg_tables WHERE schemaname='public' AND tablename=$1",[name]);
    expect(owner.rows[0].owner).toBe("postgres");
    await client.exec(`ALTER TABLE ${name} OWNER TO dota_notes_app`);
  });
});
