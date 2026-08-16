import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function fixture(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production reverse proxy", () => {
  const nginx = fixture("deploy/nginx/dota2notes.ir.conf");

  it("proxies the public domain only to the local Next.js port", () => {
    expect(nginx).toContain("server_name dota2notes.ir;");
    expect(nginx).toContain("server_name www.dota2notes.ir;");
    expect(nginx).toContain("return 301 https://dota2notes.ir$request_uri;");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3000;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
  });

  it("blocks both internal worker endpoints at Nginx", () => {
    expect(nginx).toMatch(
      /location = \/api\/internal\/sync\/tick\s*\{\s*return 404;/,
    );
    expect(nginx).toMatch(
      /location = \/api\/internal\/images\/tick\s*\{\s*return 404;/,
    );
  });
});

describe("production systemd units", () => {
  const appService = fixture("deploy/systemd/dota2notes.service");
  const syncTimer = fixture("deploy/systemd/dota2notes-sync.timer");
  const imageTimer = fixture("deploy/systemd/dota2notes-images.timer");

  it("runs Next.js as the restricted app user on localhost", () => {
    expect(appService).toContain("User=dota2notes");
    expect(appService).toContain("--hostname 127.0.0.1 --port 3000");
    expect(appService).toContain("ProtectSystem=strict");
    expect(appService).toContain(
      "ReadWritePaths=/var/www/dota2notes/.next",
    );
    expect(appService).toContain("MemoryMax=2048M");
  });

  it("schedules independent sync and image workers", () => {
    expect(syncTimer).toContain("OnCalendar=hourly");
    expect(syncTimer).toContain("Persistent=true");
    expect(imageTimer).toContain("OnCalendar=*-*-* *:*:00");
    expect(imageTimer).toContain("Persistent=true");
  });
});

describe("production worker invocation", () => {
  const worker = fixture("deploy/scripts/call-worker.sh");
  const drizzleConfig = fixture("drizzle.config.ts");

  it("allows only known localhost worker paths and hides the secret from argv", () => {
    expect(worker).toContain('endpoint="/api/internal/sync/tick"');
    expect(worker).toContain('endpoint="/api/internal/images/tick"');
    expect(worker).toContain("curl --config -");
    expect(worker).not.toContain("curl -H");
  });

  it("lets production migration select a non-local env file explicitly", () => {
    expect(drizzleConfig).toContain("process.env.DOTENV_CONFIG_PATH");
    expect(drizzleConfig).toContain('|| ".env.local"');
  });
});
