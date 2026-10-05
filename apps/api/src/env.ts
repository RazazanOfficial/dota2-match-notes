import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { basename, dirname } from "node:path";
const apiDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const repoEnv = basename(apiDirectory) === "release" ? "../../../../.env.local" : "../../../.env.local";
config({ path: process.env.DOTENV_CONFIG_PATH || fileURLToPath(new URL(repoEnv, import.meta.url)), quiet: true });
export const apiAssetRoot = fileURLToPath(new URL("../public", import.meta.url));
