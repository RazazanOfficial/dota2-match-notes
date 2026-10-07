import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const release = join(root, "release");
const source = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const prod = JSON.parse(await readFile(join(release, "package-lock.json"), "utf8"));
const sourcePackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const prodPackage = JSON.parse(await readFile(join(release, "package.json"), "utf8"));
if (JSON.stringify(sourcePackage.dependencies) !== JSON.stringify(prodPackage.dependencies)) {
  throw new Error("Production lock is out of date with API dependencies");
}
for (const [name, details] of Object.entries(prod.packages)) {
  if (name === "") continue;
  if (JSON.stringify(source.packages[name]) !== JSON.stringify(details)) {
    throw new Error(`Production lock is out of date for ${name}`);
  }
}
if (!source.packages[""] || Object.entries(sourcePackage.dependencies).some(([name, range]) => source.packages[""].dependencies?.[name] !== range)) {
  throw new Error("API package-lock is out of date");
}
// Copy only generated and runtime files. This release does not need the Next project or tsx.
for (const directory of ["dist", "drizzle", "public"]) {
  const sourcePath = join(root, directory);
  if (!(await readdir(sourcePath)).length) throw new Error(`Missing ${directory}; run the API build first`);
  await rm(join(release, directory), { recursive: true, force: true });
  await cp(sourcePath, join(release, directory), { recursive: true });
}
// Keep standalone maintenance scripts that are distributed only with the runtime.
await rm(join(release, "scripts/replay-parser"), { recursive: true, force: true });
await mkdir(join(release, "scripts"), { recursive: true });
await cp(join(root, "scripts/env.mjs"), join(release, "scripts/env.mjs"));
await cp(join(root, "scripts/replay-parser"), join(release, "scripts/replay-parser"), { recursive: true });
await writeFile(join(release, "RELEASE-MANIFEST.txt"), "Express runtime files, original SQL history, hero portraits and native replay scripts. Install dependencies with npm ci in this directory.\n");
console.info(`Prepared independent Express runtime in ${release}`);
