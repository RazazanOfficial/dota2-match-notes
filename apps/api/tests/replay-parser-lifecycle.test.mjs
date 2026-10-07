import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { parserFailure, stopParserProcess } from "../scripts/replay-parser/run-queue.mjs";

describe("parser diagnostics and process lifetime", () => {
  it("keeps identity failures distinct and removes URLs and credentials from diagnostics", () => {
    const error = parserFailure(1, "replay_identity_mismatch: wrong roster https://private.test/file?token=secret password=private");
    expect(error.code).toBe("replay_identity_mismatch");
    expect(error.detail).not.toContain("private.test");
    expect(error.detail).not.toContain("password=private");
    expect(error.message).not.toContain("wrong roster");
    expect(parserFailure(null, "").code).toBe("replay_parser_timeout");
    expect(parserFailure(1, "java failed (timeout)").code).toBe("replay_parser_timeout");
    expect(parserFailure(1, "java failed (1)").code).toBe("replay_parser_failed");
  });
  it.skipIf(process.platform === "win32")("stops an importer and its running descendant together", async () => {
    const program = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',process.stdout,process.stderr]});
      console.log(child.pid);setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ["-e", program], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const closed = once(child, "close");
    try {
      await once(child.stdout, "data");
      stopParserProcess(child);
      // close waits for descendant stdout too; killing only the parent leaves it open.
      const [, signal] = await closed;
      expect(signal).toBe("SIGKILL");
    } finally { stopParserProcess(child); }
  }, 5000);
});
