// Compatibility entry point; the API collector is the maintained implementation.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export * from "../../../api/scripts/service-monitor/collect.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../../api/scripts/service-monitor/collect.mjs", import.meta.url))], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
