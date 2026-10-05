import { logFailure } from "./http/log";
import "./env";
import { createApp } from "./app";
import { closeDatabase } from "./lib/db";

const port = Number(process.env.API_PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid API_PORT");
const host = process.env.API_HOST || "127.0.0.1";
const origins = (process.env.API_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
const server = createApp(origins).listen(port, host, () => console.info(`Express API listening on ${host}:${port}`));
server.headersTimeout = 15_000;
server.requestTimeout = 45_000;
server.on("error", error => { logFailure("API listener failed", error); process.exitCode = 1; });
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(error => { void closeDatabase().finally(() => { process.exitCode = error ? 1 : 0; }); });
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000).unref();
  });
}
