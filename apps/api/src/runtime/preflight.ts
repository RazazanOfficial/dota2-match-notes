import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, isAbsolute, join } from "node:path";
import { apiAssetRoot } from "../env";
import { getApiPublicUrl, getAppUrl } from "../lib/auth/config";
import { configuredOrigins } from "../http/security";
import { getSyncWorkerConfig } from "../lib/sync/config";
import { getOpenDotaConfig } from "../lib/opendota/config";
import { getStorageConfig } from "../lib/storage/config";
import { getMatchImageConfig } from "../lib/match-image/config";
import { HEROES, heroPortraitFileName } from "../data/heroes";
import { getStratzConfig } from "../lib/stratz/config";
import { getOpenDotaParseConfig } from "../lib/opendota-parse/config";
import { getMatchImageJobConfig } from "../lib/match-image-job/config";

export const PREFLIGHT_ROLES = ["api", "sync", "images", "stratz", "performance-reference", "opendota-parse", "replay"] as const;
export type PreflightRole = typeof PREFLIGHT_ROLES[number];
export async function preflight(role: PreflightRole = "api") {
  const failures: string[] = [];
  const warnings: string[] = [];
  const checked: string[] = [];
  async function check(name: string, run: () => unknown | Promise<unknown>) {
    try { await run(); checked.push(name); } catch { failures.push(name); }
  }
  await check("DATABASE_URL", () => {
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
  });
  await check("public_origins", () => {
    const app = getAppUrl(); const api = getApiPublicUrl(); configuredOrigins();
    if (process.env.NODE_ENV === "production" && (!app.startsWith("https:") || !api.startsWith("https:"))) throw new Error();
  });
  await check("worker_secret_and_sync_config", () => {
    getSyncWorkerConfig();
    if (/CHANGE_ME|YOUR_|REPLACE_|AT_LEAST/i.test(process.env.SYNC_WORKER_SECRET || "")) throw new Error();
  });
  await check("opendota_config", () => getOpenDotaConfig());
  await check("opendota_parse_config", () => getOpenDotaParseConfig());
  await check("api_port", () => {
    const port = Number(process.env.API_PORT || 4100);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  });
  if (role === "images") {
    await check("image_storage_config", () => getStorageConfig());
    await check("image_render_config", () => getMatchImageConfig());
    await check("image_job_config", () => getMatchImageJobConfig());
    await check("backend_hero_portraits", async () => {
      const root = process.env.API_ASSET_ROOT || apiAssetRoot;
      if (!isAbsolute(root)) throw new Error();
      const portraits = new Set(await readdir(join(root, "heroes")));
      if (HEROES.some(hero => !portraits.has(heroPortraitFileName(hero)))) throw new Error();
    });
  }
  if (role === "stratz" || role === "performance-reference") {
    await check("stratz_config", () => {
      getStratzConfig();
      if (/CHANGE_ME|YOUR_|REPLACE_/i.test(process.env.STRATZ_API_TOKEN || "")) throw new Error();
    });
  }
  if (role === "images" || role === "replay") {
    await check("storage_credentials", () => {
      for (const name of ["CLOUD_SPACE_ACCESS_KEY", "CLOUD_SPACE_SECRET_KEY"]) {
        if (/CHANGE_ME|YOUR_|REPLACE_/i.test(process.env[name] || "")) throw new Error();
      }
    });
  }
  if (role === "replay") {
    await check("replay_parser_jar", async () => {
      const jar = process.env.REPLAY_PARSER_JAR;
      if (!jar || !isAbsolute(jar)) throw new Error();
      await access(jar, constants.R_OK);
    });
    await check("replay_incoming_directory", async () => {
      const path = process.env.LOCAL_REPLAY_INCOMING_DIR || "/var/lib/dota2notes/replays/incoming";
      if (!isAbsolute(path)) throw new Error();
      await access(resolve(path), constants.R_OK | constants.W_OK);
    });
    await check("replay_storage_config", () => getStorageConfig());
    warnings.push("Java availability and live replay/provider connectivity require server verification.");
  }
  if (!process.env.API_PUBLIC_ORIGIN) warnings.push("API_PUBLIC_ORIGIN falls back to APP_URL for the legacy same-origin deployment.");
  return { ok: failures.length === 0, role, checked, failures, warnings };
}
