// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReplayProgress } from "@/lib/replay/progress";
import { AnalysisProgress } from "../src/components/AnalysisProgress";
import { messages } from "../src/i18n";

const progress = (phase: string, patch: Partial<ReplayProgress> = {}): ReplayProgress => ({
    requestStartedAt: "2026-11-13T01:00:00Z", phase, bytes: 0, totalBytes: null, bytesPerSecond: 0,
    attempts: 1, nextTryAt: null, phaseStartedAt: null, heartbeatAt: null, retryDeadlineAt: null, errorCode: null, ...patch,
});
afterEach(cleanup);

describe("truthful analysis milestones", () => {
    it("shows measured zero without any liquid and starts a wave only after data advances", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("downloading", { totalBytes: 100 }) }}/>);
        expect(screen.getByRole("progressbar").getAttribute("value")).toBe("0");
        expect(view.container.querySelector(".analysis-liquid")).toBeNull();
        view.rerender(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("downloading", { bytes: 62, totalBytes: 100 }) }}/>);
        expect(screen.getByRole("progressbar").getAttribute("value")).toBe("62");
        expect(view.container.querySelectorAll(".analysis-liquid")).toHaveLength(1);
        expect(view.container.querySelector("li.active .analysis-liquid")?.getAttribute("style")).toContain("62%");
        expect(view.container.querySelectorAll("li.done .analysis-liquid,li.waiting .analysis-liquid")).toHaveLength(0);
    });
    it("shows server progress from a restored snapshot without resetting to zero or delaying later stages", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("downloading", { bytes: 80, totalBytes: 100, bytesPerSecond: 1048576 }) }}/>);
        expect(screen.getByRole("progressbar").getAttribute("value")).toBe("80");
        expect(view.container.textContent).toContain("1.0 MiB/s");
        view.rerender(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("parsing") }}/>);
        expect(view.container.querySelector("[aria-current=step] b")?.textContent).toBe(messages.en.analysisParse);
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(view.container.querySelectorAll("li.done")).toHaveLength(3);
        expect(view.container.querySelectorAll("li.done .analysis-liquid")).toHaveLength(0);
        expect(view.container.querySelectorAll("li.active .analysis-liquid")).toHaveLength(1);
        expect(view.container.querySelector("li.active")?.textContent).not.toContain("%");
    });
    it.each(["checking_archive", "resolving_metadata", "connecting", "restoring_archive", "validating", "parsing"])("keeps %s activity indeterminate rather than inventing a percentage", phase => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress(phase, { bytes: 90, totalBytes: 100 }) }}/>);
        expect(view.container.querySelectorAll(".analysis-liquid")).toHaveLength(1);
        expect(view.container.querySelector(".analysis-step-symbol")?.textContent).not.toContain("%");
        expect(screen.queryByRole("progressbar")).toBeNull();
        expect(view.container.textContent).not.toContain("90%");
    });
    it("does not turn an unknown total into zero or a fabricated percentage", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("downloading", { bytes: 123 }) }}/>);
        expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
        expect(view.container.textContent).toContain(messages.en.analysisUnknownSize);
        expect(view.container.textContent).not.toContain("%");
        expect(view.container.textContent).not.toContain("MiB/s");
    });
    it.each(["queued", "awaiting_parse", "retry_wait", "failed", "completed", "uploading"])("has no waves for %s", phase => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: phase === "failed" ? "failed" : "processing", progress: progress(phase, { errorCode: "replay_connect_failed" }) }}/>);
        expect(view.container.querySelectorAll(".analysis-liquid")).toHaveLength(0);
    });
    it.each([messages.fa, messages.en])("finishes all five milestones immediately and preserves language direction", t => {
        const view = render(<AnalysisProgress t={t} compact preparation={{ replay: "processing", progress: progress("parsing") }}/>);
        view.rerender(<AnalysisProgress t={t} compact preparation={{ replay: "ready", progress: progress("completed") }}/>);
        expect(view.container.querySelectorAll("li.done")).toHaveLength(5);
        expect(view.container.querySelector("li.active")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain(t.analysisReady);
        expect(view.container.querySelector(".analysis-progress")?.getAttribute("dir")).toBe(t === messages.fa ? "rtl" : "ltr");
    });
    it("replaces a request without retaining completed steps or previous transfer telemetry", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "ready", progress: progress("completed") }}/>);
        view.rerender(<AnalysisProgress t={messages.en} preparation={{ replay: "pending", progress: progress("queued", { requestStartedAt: "new-request" }) }}/>);
        expect(view.container.querySelectorAll("li.done")).toHaveLength(1);
        expect(view.container.querySelector("[aria-current=step] b")?.textContent).toBe(messages.en.analysisConnect);
        expect(view.container.querySelector(".analysis-liquid")).toBeNull();
    });
    it("shows only the current lane's measured queue position and hides retry internals", () => {
        const queue = { queueLane: "prepare" as const, queuePosition: 3, activeCount: 2 };
        const view = render(<AnalysisProgress t={messages.fa} preparation={{ replay: "pending", progress: progress("queued") }} queue={queue}/>);
        expect(view.container.querySelectorAll("li.done")).toHaveLength(1);
        expect(view.container.querySelector(".analysis-queue-status")?.textContent).toContain("نوبت ۳ در صف آماده‌سازی");
        view.rerender(<AnalysisProgress t={messages.fa} preparation={{ replay: "pending", progress: progress("retry_wait", { errorCode: "replay_metadata_pending", nextTryAt: "2026-11-13T04:00:00Z" }) }} queue={queue}/>);
        expect(view.container.querySelector(".analysis-queue-status")).toBeNull();
        expect(view.container.querySelector(".analysis-retry-disclosure")?.hasAttribute("open")).toBe(false);
    });
    it.each([
        ["replay_archive_check_failed", messages.en.analysisConnect],
        ["replay_not_found", messages.en.analysisConnect],
        ["replay_download_failed", messages.en.analysisDownload],
        ["replay_checksum_mismatch", messages.en.analysisDownload],
        ["replay_body_incomplete", messages.en.analysisDownload],
        ["replay_payload_invalid", messages.en.analysisDownload],
        ["replay_range_invalid", messages.en.analysisDownload],
        ["replay_parser_failed", messages.en.analysisParse],
    ])("places %s at its known milestone without suggesting completion", (errorCode, label) => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "failed", progress: progress("failed", { errorCode }) }}/>);
        expect(view.container.querySelector("li.failed b")?.textContent).toBe(label);
        expect(screen.getByRole("alert").textContent).toContain(label);
        expect(view.container.querySelector("li.failed .analysis-liquid")).toBeNull();
        expect(view.container.querySelector(".is-ready")).toBeNull();
    });
    it("does not infer a failed milestone from an unknown error or archive background failure", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "failed", errorCode: "replay_processing_failed" }}/>);
        expect(view.container.querySelector("li.failed")).toBeNull();
        expect(view.container.querySelectorAll("li.done")).toHaveLength(0);
        view.rerender(<AnalysisProgress t={messages.en} preparation={{ replay: "ready", progress: progress("completed", { errorCode: "replay_archive_upload_failed" }) }}/>);
        expect(view.container.querySelectorAll("li.done")).toHaveLength(5);
        expect(screen.queryByRole("alert")).toBeNull();
    });
    it("keeps legacy archive work separate without claiming that analysis is ready", () => {
        const view = render(<AnalysisProgress t={messages.en} preparation={{ replay: "processing", progress: progress("uploading") }}/>);
        expect(view.container.querySelector(".analysis-archive-note")?.textContent).toBe(messages.en.analysisArchiveIndependent);
        expect(view.container.querySelectorAll("li.done")).toHaveLength(0);
        expect(screen.getByRole("status").textContent).toContain(messages.en.analysisArchiving);
    });
    it("keeps collapse keyboard accessible", () => {
        let collapsed = false;
        render(<AnalysisProgress t={messages.en} preparation={{ replay: "pending" }} onCollapse={() => { collapsed = true; }}/>);
        const button = screen.getByRole("button", { name: messages.en.collapseProgress });
        button.focus(); expect(document.activeElement).toBe(button);
        fireEvent.click(button); expect(collapsed).toBe(true);
    });
});
