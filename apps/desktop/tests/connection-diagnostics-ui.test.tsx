// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionDiagnostics } from "../src/components/ConnectionDiagnostics";
import { messages } from "../src/i18n";
import { clearConnectionReport, recordConnectionEvent } from "../src/connectionDiagnostics";
beforeEach(() => { vi.useFakeTimers(); clearConnectionReport(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("connection report control", () => {
    it.each([messages.en, messages.fa])("copies a sanitized report and clears its confirmation after 5s", async t => {
        const copy = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
        recordConnectionEvent({ source: "request", method: "GET", path: "/api/tasks?private=never-copy-this", success: true,
            status: 200, errorName: null, durationMs: 123, attempt: 1, connectionBefore: "online", connectionAfter: "online" });
        render(<ConnectionDiagnostics t={t}/>);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.copyConnectionReport })); });
        expect(copy).toHaveBeenCalledOnce(); expect(copy.mock.calls[0][0]).not.toContain("never-copy-this");
        expect(screen.getByRole("status").textContent).toBe(t.connectionReportCopied);
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); }); expect(screen.queryByRole("status")).toBeNull();
    });
    it("reports clipboard failure without leaving a hidden textarea behind", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
        Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
        render(<ConnectionDiagnostics t={messages.en}/>);
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: messages.en.copyConnectionReport })); });
        expect(screen.getByRole("status").textContent).toBe(messages.en.connectionReportCopyFailed);
        expect(document.querySelector("textarea")).toBeNull();
    });
});
