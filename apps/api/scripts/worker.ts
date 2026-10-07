import "../src/env";
import { HttpRequest } from "../src/http/protocol";
import { closeDatabase } from "../src/lib/db";
import { getSyncWorkerConfig } from "../src/lib/sync/config";
import { routes } from "../src/routes/registry";
import type { HttpHandler } from "../src/http/protocol";
import { setTimeout } from "node:timers/promises";

const kinds = ["sync", "images", "stratz", "performance-reference", "opendota-parse"];
const kind = process.argv[2];
if (!kinds.includes(kind)) throw new Error(`Worker kind must be one of ${kinds.join(", ")}`);
if (process.argv.slice(3).some(arg => arg !== "--watch")) throw new Error("Unknown worker option");
const watch = process.argv.includes("--watch");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());
const route = routes.find(route => route.path === `/internal/${kind}/tick` && route.method === "POST")!;
const handler = route.handler as unknown as HttpHandler;
try {
  do {
    const request = new HttpRequest(`http://localhost/api${route.path}`, {
      method: "POST", headers: { authorization: `Bearer ${getSyncWorkerConfig().secret}` },
    });
    const result = await handler(request, { params: Promise.resolve({}) });
    const body = await result.json();
    console.info({ worker: kind, status: result.status, result: body });
    if (!result.ok && !watch) process.exitCode = 1;
    if (!watch || controller.signal.aborted) break;
    await setTimeout(kind === "sync" ? 5_000 : 60_000, undefined, { signal: controller.signal }).catch(error => {
      if (!controller.signal.aborted) throw error;
    });
  } while (!controller.signal.aborted);
} finally { await closeDatabase(); }
