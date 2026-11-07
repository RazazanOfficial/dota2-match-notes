import { spawnSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && command === "npm",
  });
  if (result.status !== 0) process.exit(result.status || 1);
};
run("npm", ["run", "build"], root);
if (process.platform === "win32") {
  run("cargo", ["build", "--release", "--locked"], join(root, "companion"));
  await mkdir(join(root, "src-tauri/resources"), { recursive: true });
  await copyFile(
    join(root, "companion/target/release/dota-notes-companion.exe"),
    join(root, "src-tauri/resources/dota-notes-companion.exe"),
  );
}
