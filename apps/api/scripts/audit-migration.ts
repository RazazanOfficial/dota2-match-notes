import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import { routes } from "../src/routes/registry";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(apiRoot, "../..");
type FileEntry = { path: string; sha256: string; exports?: string[] };
const inventory = JSON.parse(readFileSync(join(root, "docs/backend-source-inventory.json"), "utf8")) as {
  sourceCommit: string;
  routes: { path: string; methods: string[]; source: string; sha256: string }[];
  domainFiles: FileEntry[]; dataFiles: FileEntry[]; migrations: FileEntry[]; scripts: FileEntry[];
};
const errors: string[] = [];
function exportsOf(path: string) {
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const node of file.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const entry of node.exportClause.elements) names.add(entry.name.text);
    }
    if (!ts.canHaveModifiers(node) || !ts.getModifiers(node)?.some(x => x.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    } else if ("name" in node && node.name && ts.isIdentifier(node.name as ts.Node)) {
      names.add((node.name as ts.Identifier).text);
    }
  }
  return names;
}
for (const entry of inventory.routes) {
  const path = entry.path.replace(/^\/api/, "").replace(/\[([^\]]+)\]/g, ":$1");
  const target = join(apiRoot, "src/routes", entry.source.replace(/^app\/api\//, ""));
  if (!existsSync(target)) { errors.push(`Missing controller: ${entry.source}`); continue; }
  const exported = exportsOf(target);
  const body = readFileSync(target, "utf8");
  if (/forwardApiRequest|next\/server/.test(body)) errors.push(`Controller depends on Next.js: ${entry.source}`);
  for (const method of entry.methods) {
    if (!exported.has(method)) errors.push(`Missing handler: ${method} ${entry.path}`);
    if (!routes.some(route => route.path === path && route.method === method)) errors.push(`Missing registration: ${method} ${entry.path}`);
  }
}
for (const entry of inventory.domainFiles) {
  const target = join(apiRoot, "src", entry.path);
  if (!existsSync(target)) { errors.push(`Missing domain module: ${entry.path}`); continue; }
  const exported = exportsOf(target);
  for (const name of entry.exports || []) if (!exported.has(name)) errors.push(`Missing domain export: ${entry.path} :: ${name}`);
}
for (const entry of [...inventory.dataFiles, ...inventory.migrations]) {
  const target = join(apiRoot, entry.path.startsWith("data/") ? `src/${entry.path}` : entry.path);
  if (!existsSync(target)) { errors.push(`Missing preserved file: ${entry.path}`); continue; }
  if (createHash("sha256").update(readFileSync(target)).digest("hex") !== entry.sha256) errors.push(`Changed preserved file: ${entry.path}`);
}
for (const entry of inventory.scripts) if (!existsSync(join(apiRoot, entry.path))) errors.push(`Missing standalone service script: ${entry.path}`);
function checkSource(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { checkSource(path); continue; }
    if (!entry.name.endsWith(".ts")) continue;
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      let specifier: string | undefined;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier === "server-only" || specifier?.startsWith("next/")) errors.push(`Next.js dependency: ${path} -> ${specifier}`);
      if (specifier?.startsWith("@/")) errors.push(`Unresolved workspace alias: ${path} -> ${specifier}`);
      if (specifier?.startsWith(".")) {
        const base = resolve(dirname(path), specifier);
        if (![base, `${base}.ts`, `${base}.json`, `${base}.mjs`, join(base, "index.ts")].some(existsSync)) errors.push(`Missing dependency: ${path} -> ${specifier}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
checkSource(join(apiRoot, "src"));
const report = {
  sourceCommit: inventory.sourceCommit,
  sourceRouteFiles: inventory.routes.length,
  sourceHttpOperations: inventory.routes.reduce((total, entry) => total + entry.methods.length, 0),
  expressHttpOperations: routes.length,
  preservedDomainModules: inventory.domainFiles.length,
  preservedCatalogs: inventory.dataFiles.length,
  unchangedSqlMigrations: inventory.migrations.length,
  standaloneServiceScripts: inventory.scripts.length,
  checkScope: "Controller exports and registration, domain exports, immutable SQL/catalog hashes, script presence, and source dependency resolution; behavioral validation is provided by the test suite.",
  errors, complete: errors.length === 0,
};
writeFileSync(join(root, "docs/backend-migration-coverage.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exitCode = errors.length ? 1 : 0;
