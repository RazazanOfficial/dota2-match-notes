import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("Companion desktop IPC permissions", () => {
  it("allows every command invoked by the automatic setup and Launch Options screens", () => {
    const screens = ["../src/components/CompanionSetup.tsx", "../src/components/LaunchOptionsPage.tsx"];
    const permissions = read("../src-tauri/permissions/replay-library.toml") +
      read("../src-tauri/permissions/steam-launch.toml");
    const allowed = new Set([...permissions.matchAll(/"([a-z_]+)"/g)].map(match => match[1]));
    for (const screen of screens) {
      const commands = [...read(screen).matchAll(/\binvoke(?:<[^>]+>)?\("([a-z_]+)"/g)]
        .map(match => match[1]);
      expect(commands.length).toBeGreaterThan(0);
      for (const command of commands) expect(allowed.has(command), `${screen}: ${command}`).toBe(true);
    }
  });
});
