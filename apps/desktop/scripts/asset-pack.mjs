import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  copyFile,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative, extname } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  source = join(root, "public");
const essential = new Set(["logo.png", "fonts", "favicon.ico"]);
export const isEssential = (path) => essential.has(path.split("/")[0]);
async function walk(dir) {
  const rows = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw Error("Asset symlink rejected");
    const path = join(dir, e.name);
    if (e.isDirectory()) rows.push(...(await walk(path)));
    else rows.push(path);
  }
  return rows;
}
export async function generateAssetManifest(publish = false) {
  const files = [];
  const output = join(root, "../api/public/desktop-assets/objects");
  if (publish) await mkdir(output, { recursive: true });
  for (const file of (await walk(source)).sort()) {
    const path = relative(source, file).replaceAll("\\", "/");
    if (
      isEssential(path) ||
      !/\.(png|jpe?g|webp|svg|gif|ico|woff2?|mp4|webm)$/i.test(path)
    )
      continue;
    // Folder selection is automatic; obsolete folder-selection screenshots are not distributed.
    if (
      /^tutorials\/replay-folder\//.test(path) &&
      !path.endsWith("/step-01.png")
    )
      continue;
    const bytes = await readFile(file),
      sha256 = createHash("sha256").update(bytes).digest("hex"),
      object = `${sha256}${extname(path).toLowerCase()}`;
    files.push({ path, bytes: bytes.length, sha256, object });
    if (publish) await copyFile(file, join(output, object));
  }
  const version = createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  const manifest = { version, files };
  const manifestPath = join(root, "asset-manifest.json"), encoded = JSON.stringify(manifest, null, 2) + "\n";
  const existing = await readFile(manifestPath, "utf8").catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  // Vite imports this manifest from its config. Rewriting identical bytes on
  // every buildStart triggers a config restart and another buildStart forever.
  if (existing !== encoded) await writeFile(manifestPath, encoded);
  if (publish)
    await writeFile(
      join(output, "../manifest.json"),
      JSON.stringify(manifest) + "\n",
    );
  return manifest;
}
export async function copyEssentialAssets(output) {
  for (const file of await walk(source)) {
    const path = relative(source, file).replaceAll("\\", "/");
    if (!isEssential(path)) continue;
    await mkdir(join(output, path, ".."), { recursive: true });
    await copyFile(file, join(output, path));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await generateAssetManifest(
    process.argv.includes("--publish"),
  );
  console.log(
    JSON.stringify({
      assets: manifest.files.length,
      bytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
      version: manifest.version,
    }),
  );
}
