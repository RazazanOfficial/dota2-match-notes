import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SOURCE_ROOT =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";
const projectRoot = process.cwd();
const heroesSource = await readFile(path.join(projectRoot, "data", "heroes.ts"), "utf8");
const slugs = [...heroesSource.matchAll(/slug:\s*"([a-z0-9_]+)"/g)].map(
  (match) => match[1],
);

if (!slugs.length || new Set(slugs).size !== slugs.length) {
  throw new Error("Hero slugs could not be read or contain duplicates");
}

const outputDirectory = path.join(projectRoot, "public", "heroes");
await mkdir(outputDirectory, { recursive: true });

for (const slug of slugs) {
  const destination = path.join(outputDirectory, `${slug}.png`);
  const temporary = `${destination}.download`;
  const response = await fetch(`${SOURCE_ROOT}/${slug}.png`, {
    headers: { Accept: "image/png", "User-Agent": "Dota2MatchNotes/1.0" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download hero portrait: ${slug} (${response.status})`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "image/png") {
    throw new Error(`Unexpected portrait content type for ${slug}: ${contentType}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_024 || bytes.byteLength > 1_572_864) {
    throw new Error(`Unexpected portrait size for ${slug}: ${bytes.byteLength}`);
  }
  await writeDownload(temporary, bytes);
  await rename(temporary, destination);
}

for (const slug of slugs) {
  const details = await stat(path.join(outputDirectory, `${slug}.png`));
  if (!details.isFile() || details.size < 1_024) {
    throw new Error(`Portrait verification failed: ${slug}`);
  }
}

console.log(`Synchronized ${slugs.length} local hero portraits.`);

async function writeDownload(filePath, bytes) {
  try {
    await writeFile(filePath, bytes, { flag: "wx" });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      await rm(filePath, { force: true });
      await writeFile(filePath, bytes, { flag: "wx" });
      return;
    }
    throw error;
  }
}
