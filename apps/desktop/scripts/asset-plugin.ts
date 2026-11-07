import initialManifest from "../asset-manifest.json";
import ts from "typescript";
import type { Plugin } from "vite";
// Rewrites only this desktop build, including components shared with the website.
// Website URLs and source files retain their existing behavior.
export function desktopAssets(): Plugin {
  let paths = new Set(initialManifest.files.map((file) => `/${file.path}`));
  let roots = new Set(
    initialManifest.files
      .filter((file) => file.path.includes("/"))
      .map((file) => file.path.split("/")[0]),
  );
  const match = (value: string) =>
    paths.has(value) ||
    [...roots].some((root) => value.startsWith(`/${root}/`));
  const base =
    process.env.TAURI_ENV_PLATFORM === "windows" || process.platform === "win32"
      ? "http://dota-assets.localhost"
      : "dota-assets://localhost";
  return {
    name: "desktop-assets",
    enforce: "post",
    async buildStart() {
      const { generateAssetManifest } = await import("./asset-pack.mjs");
      const manifest = await generateAssetManifest(false);
      paths = new Set(manifest.files.map((file) => `/${file.path}`));
      roots = new Set(
        manifest.files
          .filter((file) => file.path.includes("/"))
          .map((file) => file.path.split("/")[0]),
      );
    },
    renderChunk(code) {
      const source = ts.createSourceFile(
        "bundle.js",
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const edits: { start: number; end: number; text: string }[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) && match(node.text))
          edits.push({
            start: node.getStart(source),
            end: node.end,
            text: JSON.stringify(base + node.text),
          });
        else if (ts.isNoSubstitutionTemplateLiteral(node) && match(node.text))
          edits.push({
            start: node.getStart(source),
            end: node.end,
            text: JSON.stringify(base + node.text),
          });
        else if (ts.isTemplateHead(node) && match(node.text))
          edits.push({
            start: node.getStart(source) + 1,
            end: node.getStart(source) + 1,
            text: base,
          });
        ts.forEachChild(node, visit);
      };
      visit(source);
      if (!edits.length) return null;
      for (const edit of edits.sort((a, b) => b.start - a.start))
        code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
      return { code, map: null };
    },
    async writeBundle(options, bundle) {
      const { copyEssentialAssets } = await import("./asset-pack.mjs");
      await copyEssentialAssets(options.dir!);
      const { writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      for (const [name, item] of Object.entries(bundle))
        if (item.type === "asset" && name.endsWith(".css")) {
          const css = String(item.source).replace(
            /url\((['"]?)(\/[^)'"\s]+)\1\)/g,
            (original, _quote, path) =>
              match(path) ? `url("${base}${path}")` : original,
          );
          await writeFile(join(options.dir!, name), css);
        }
    },
  };
}
