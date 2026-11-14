import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function fixture(path: string) {
  return readFileSync(resolve(fileURLToPath(new URL("../../..", import.meta.url)), path), "utf8");
}

describe("production reverse proxy", () => {
  const nginx = fixture("deploy/nginx/dota2notes.ir.conf");

  it("routes the public website to the local Next.js server", () => {
    expect(nginx).toContain("server_name dota2notes.ir;");
    expect(nginx).toContain("server_name www.dota2notes.ir;");
    expect(nginx).toContain("return 301 https://dota2notes.ir$request_uri;");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3000;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:4100;");
  });

  it("blocks every internal worker endpoint at Nginx", () => {
    expect(nginx).toMatch(
      /location = \/api\/internal\/sync\/tick\s*\{\s*return 404;/,
    );
    expect(nginx).toMatch(
      /location = \/api\/internal\/images\/tick\s*\{\s*return 404;/,
    );
    expect(nginx).toContain("location ~* ^/api/(v1/)?internal(/|$)");
  });
});

describe("production systemd units", () => {
  const appService = fixture("deploy/systemd/dota2notes.service");
  const syncService = fixture("deploy/systemd/dota2notes-sync-daemon.service");
  const replayService = fixture("deploy/systemd/dota2notes-replay.service");
  const imageTimer = fixture("deploy/systemd/dota2notes-images.timer");
  const referenceTimer = fixture("deploy/systemd/dota2notes-performance-reference.timer");
  const monitorTimer = fixture("deploy/systemd/dota2notes-monitor.timer");

  it("runs Next.js as the restricted app user on localhost", () => {
    expect(appService).toContain("User=dota2notes");
    expect(appService).toContain("--hostname 127.0.0.1 --port 3000");
    expect(appService).toContain("ProtectSystem=strict");
    expect(appService).toContain(
      "ReadWritePaths=/var/www/dota2notes/apps/web/.next",
    );
    expect(appService).toContain("MemoryMax=2048M");
  });

  it("runs sync and replay continuously and schedules images, references and monitoring", () => {
    expect(syncService).toContain("Type=simple");
    expect(syncService).toContain("dist/worker.js sync --watch");
    expect(syncService).toContain("Requires=dota2notes-link.service");
    expect(replayService).toContain("Type=simple");
    expect(replayService).toContain("scripts/replay-parser/run-pipeline.mjs");
    expect(replayService).toContain("Restart=on-failure");
    expect(imageTimer).toContain("OnCalendar=*-*-* *:*:00");
    expect(imageTimer).toContain("Persistent=true");
    expect(referenceTimer).toContain("OnUnitActiveSec=1m");
    expect(referenceTimer).toContain("Unit=dota2notes-performance-reference.service");
    expect(monitorTimer).toContain("OnUnitActiveSec=1m");
    expect(monitorTimer).toContain("Unit=dota2notes-monitor.service");
  });

  it("does not distribute retired worker units in either deployment directory", () => {
    for (const name of [
      "dota2notes-sync.timer", "dota2notes-sync-manual.timer", "dota2notes-sync.service",
      "dota2notes-replay.timer", "dota2notes-stratz.timer", "dota2notes-stratz.service",
      "dota2notes-opendota-parse.timer", "dota2notes-opendota-parse.service",
    ]) {
      for (const directory of ["deploy/systemd", "apps/web/deploy/systemd"]) {
        expect(existsSync(new URL(`../../../${directory}/${name}`, import.meta.url))).toBe(false);
      }
    }
  });

  it("starts the current continuous workers and timers in the deployment guide", () => {
    const guide = fixture("docs/deployment-ubuntu.md");
    expect(guide).not.toContain("enable --now dota2notes-sync.timer");
    expect(guide).toMatch(/systemctl start dota2notes-images\.timer(?:\s|$)/);
    expect(guide).toContain("systemctl start dota2notes-replay.service dota2notes-sync-daemon.service");
  });
});

describe("production worker invocation", () => {
  const worker = fixture("deploy/scripts/call-worker.sh");
  const drizzleConfig = fixture("apps/api/drizzle.config.ts") + fixture("apps/api/src/env.ts");

  it("allows only known localhost worker paths and hides the secret from argv", () => {
    expect(worker).toContain('endpoint="/api/internal/images/tick"');
    expect(worker).toContain('endpoint="/api/internal/performance-reference/tick"');
    expect(worker).not.toMatch(/endpoint="\/api\/internal\/(?:sync|stratz|opendota-parse)\/tick"/);
    expect(worker).toContain("curl --config -");
    expect(worker).not.toContain("curl -H");
  });

  it("lets production migration select a non-local env file explicitly", () => {
    expect(drizzleConfig).toContain("process.env.DOTENV_CONFIG_PATH");
    expect(drizzleConfig).toContain('basename(apiDirectory) === "release"');
    expect(drizzleConfig).toContain('"../../../../.env.local" : "../../../.env.local"');
  });
});
