// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { messages } from "../src/i18n";
import { previewProfile } from "../src/components/Shared";
import { sampleHistory } from "../src/history";
import { Calendar } from "../src/components/Calendar";
import { MatchTable } from "../src/components/Workspace";
import { LiveDashboard } from "../src/components/LiveWorkspace";
import { App } from "../src/App";
import { AnalysisProgress } from "../src/components/AnalysisProgress";
import { ApiError } from "../src/api";
import type { MatchListResponse, SyncJob } from "../src/api";
const mocks = vi.hoisted(() => ({ api: vi.fn(), list: vi.fn(), sync: vi.fn(), enqueue: vi.fn(), auth: vi.fn() }));
vi.mock("../src/api", async () => ({ ...await vi.importActual("../src/api"), apiRequest: mocks.api, listMatches: mocks.list, getSyncStatus: mocks.sync, requestMatchSync: mocks.enqueue }));
vi.mock("../src/desktopAuth", async () => ({ ...await vi.importActual("../src/desktopAuth"), useDesktopAuth: mocks.auth }));
const row = { ...sampleHistory[0], journalId: "00000000-0000-4000-8000-000000000001", position: 0, score: null, analyzed: false, analysisStatus: "basic" as const };
const data: MatchListResponse = { ok:true, rows:[row], page:1,pageSize:8,total:1,summary:{total:1,wins:1,losses:0,score:null,winRate:100,heroes:[{id:row.heroId,count:1,wins:1,losses:0}],positions:[{id:0,count:1,wins:1,losses:0}]} };
const idle = { ok:true, status: { manualJob:{id:"old",status:"completed"},nextDayAllowedAt:null,nextWeekAllowedAt:null,nextMonthAllowedAt:null } };
beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); document.documentElement.lang="en";document.documentElement.dir="ltr";
    vi.stubGlobal("scrollTo",vi.fn());vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
    mocks.list.mockResolvedValue(data);mocks.sync.mockResolvedValue(idle);mocks.enqueue.mockResolvedValue({ok:true,jobId:"new-job"});
    mocks.api.mockResolvedValue({analysis:null,preparation:{replay:"processing",progress:{phase:"downloading",bytes:1024,totalBytes:2048,bytesPerSecond:1024}}});
});
afterEach(() => { cleanup();vi.unstubAllGlobals();vi.restoreAllMocks(); });
describe("match workspace regressions",()=>{
    it("restores persisted processing immediately and refreshes its stage from history", () => {
        const processing = { ...row, analysisStatus: "processing" as const, analysisPreparation: { replay: "processing", progress: { phase: "parsing", bytes: 1024, totalBytes: 1024, bytesPerSecond: 0, attempts: 1, nextTryAt: null, phaseStartedAt: null, heartbeatAt: null, retryDeadlineAt: null, errorCode: null } } };
        const view = render(<MatchTable matches={[processing]} t={messages.fa} onOpen={vi.fn()} live/>);
        expect(screen.getByRole("button", { name: messages.fa.analysisQueued }).disabled).toBe(true);
        expect(view.container.querySelector('.analysis-steps [aria-current="step"]')?.textContent).toContain(messages.fa.analysisParse);
        expect(mocks.api).not.toHaveBeenCalled();
        view.rerender(<MatchTable matches={[{ ...processing, analyzed: true, analysisPreparation: { ...processing.analysisPreparation, progress: { ...processing.analysisPreparation.progress, phase: "uploading" } } }]} t={messages.fa} onOpen={vi.fn()} live/>);
        expect(screen.getByRole("button", { name: messages.fa.analysisQueued }).disabled).toBe(true);
        expect(view.container.querySelector('.analysis-steps [aria-current="step"]')?.textContent).toContain(messages.fa.analysisSave);
    });
    it.each([messages.fa, messages.en])("shows a readable red failure at the parser stage without developer codes", t => {
        const prep = { replay: "failed", errorCode: "replay_parser_failed" };
        const view = render(<AnalysisProgress preparation={prep} t={t}/>);
        expect(screen.getByRole("alert").textContent).toContain(t.analysisFailed);
        expect(view.container.textContent).not.toContain("replay_parser_failed");
        expect(view.container.textContent).not.toContain(t.analysisReady);
        expect(view.container.querySelector('.analysis-steps li.failed')?.textContent).toContain(t.analysisParse);
    });
    it("restores a failed request and keeps retry available", () => {
        render(<MatchTable matches={[{ ...row, analysisStatus: "failed", analysisPreparation: { replay: "failed", errorCode: "replay_identity_mismatch" } }]} t={messages.en} onOpen={vi.fn()} live/>);
        expect(screen.getByRole("alert").textContent).toContain("verify");
        expect(screen.getByRole("button", { name: messages.en.analyze }).disabled).toBe(false);
    });
    it("translates an API request failure without leaking its technical message", async () => {
        mocks.api.mockRejectedValue(new ApiError("private stack trace", 500, "analysis_request_failed"));
        render(<MatchTable matches={[row]} t={messages.en} onOpen={vi.fn()} live/>);
        fireEvent.click(screen.getByRole("button", { name: messages.en.analyze }));
        expect((await screen.findByRole("alert")).textContent).not.toContain("private stack trace");
        expect(screen.getByRole("alert").textContent).toContain("try again");
    });
    it("uses localized error cards when loading the match history fails", async () => {
        mocks.list.mockRejectedValue(new ApiError("private request details", 502, "upstream_failed"));
        render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);
        const errors = await screen.findAllByRole("alert");
        expect(errors[0].textContent).toContain("This step couldn't finish");
        expect(document.body.textContent).not.toContain("private request details");
    });
    it("shows loading instead of Login while restoring a saved native session",()=>{
        mocks.auth.mockReturnValue({ restoring:true,session:null });
        render(<App/>);expect(screen.getByRole("status").textContent).toContain(messages.en.restoringSession);
        expect(screen.queryByRole("button",{name:messages.en.loginWithSteam})).toBeNull();
        expect(screen.queryByText(messages.en.loginTitle)).toBeNull();
    });
    it("waits for history before showing totals or the empty-history state",async()=>{
        let complete!: (value:MatchListResponse)=>void;
        mocks.list.mockReturnValue(new Promise<MatchListResponse>(resolve=>{complete=resolve}));
        const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);
        expect(view.container.querySelector(".stat-grid")).toBeNull();expect(screen.queryByText(messages.en.noData)).toBeNull();
        expect(screen.getByRole("status").textContent).toBe(messages.en.loading);
        await act(async()=>complete(data));expect(await screen.findByRole("table")).toBeTruthy();
    });
    it("starts analysis directly with the journal ID, displays progress and preserves separate details navigation",async()=>{
        const open=vi.fn();const view=render(<MatchTable matches={[row]} t={messages.en} onOpen={open} live/>);
        fireEvent.click(screen.getByRole("button",{name:messages.en.analyze}));
        await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith(`/api/matches/${row.journalId}/analysis`,expect.objectContaining({method:"POST"})));
        expect(open).not.toHaveBeenCalled();expect((await screen.findAllByText(messages.en.analysisDownload)).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole("button",{name:`${messages.en.details} ${row.id}`}));expect(open).toHaveBeenCalledWith(row);
        expect(view.container.querySelector(".match-row")?.classList.contains("details-first")).toBe(true);
        view.rerender(<MatchTable matches={[{...row,analyzed:true,position:2,score:83,analysisStatus:"ready"}]} t={messages.fa} onOpen={open} live/>);
        expect(screen.getByRole("button",{name:messages.fa.analysisDone}).classList.contains("ready")).toBe(true);
        expect(view.container.querySelector(".match-row")?.classList.contains("details-last")).toBe(true);
        expect(view.container.querySelector('.imp-score')?.textContent).toBe("83");
    });
    it("handles an already-ready analysis POST without leaving the row pending",async()=>{
        mocks.api.mockResolvedValue({preparation:{replay:"ready"}});
        render(<MatchTable matches={[row]} t={messages.en} onOpen={vi.fn()} live/>);
        fireEvent.click(screen.getByRole("button",{name:messages.en.analyze}));
        expect(await screen.findByRole("button",{name:messages.en.analysisDone})).toBeTruthy();
    });
    it("shows localized question-mark hints in a portal and readable mode labels",()=>{
        const view=render(<MatchTable matches={[row]} t={messages.fa} onOpen={vi.fn()}/>);
        fireEvent.mouseEnter(screen.getByLabelText(messages.fa.unknownPosition));
        expect(screen.getByRole("tooltip").textContent).toBe(messages.fa.analyzeForPosition);
        expect(view.container.contains(screen.getByRole("tooltip"))).toBe(false);
        fireEvent.mouseLeave(screen.getByLabelText(messages.fa.unknownPosition));
        fireEvent.focus(screen.getByLabelText("IMP"));expect(screen.getByRole("tooltip").textContent).toBe(messages.fa.analyzeForScore);
        expect(view.container.querySelector('.mode-chip')?.textContent).toBe(row.mode);
    });
    it("closes the calendar after enqueue, shows live status and includes the unknown ring segment",async()=>{
        const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);
        await screen.findByRole("table");
        const chart=view.container.querySelector('.distribution') as HTMLElement;
        expect(within(chart).queryByRole('button',{name:messages.en.selectedDate})).toBeNull();
        expect(await within(chart).findByRole('button',{name:/Unknown position: 1/})).toBeTruthy();
        fireEvent.click(within(chart).getByRole('button',{name:/Unknown position: 1/}));expect(within(chart).getByText('100.0%')).toBeTruthy();
        fireEvent.click(screen.getByRole('button',{name:messages.en.fetchMatches}));
        const dialog=await screen.findByRole('dialog');await waitFor(()=>expect(within(dialog).getByRole('button',{name:messages.en.fetchMatches}).disabled).toBe(false));
        expect(within(dialog).queryByText(messages.en.syncCompleted)).toBeNull();expect(within(dialog).getByRole('checkbox',{name:/Turbo/})).toBeTruthy();
        const job:SyncJob={id:'new-job',status:'pending',request:{scope:'day',from:'2026-10-07',to:'2026-10-07'},result:{imported:[],checked:0}};
        mocks.sync.mockResolvedValue({ok:true,status:{manualJob:job}});
        fireEvent.click(within(dialog).getByRole('button',{name:messages.en.fetchMatches}));
        await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(await screen.findByText(messages.en.syncLive)).toBeTruthy();
        expect(view.container.querySelector('.sync-notice')).toBeTruthy();
    });
    it("uses Latin Gregorian digits, Persian Jalali digits and reverses only the RTL navigation arrows",()=>{
        const props={value:'2026-10-07',onChange:vi.fn(),scope:'month' as const,min:'2026-09-01',max:'2026-10-07'};
        const view=render(<Calendar {...props} t={messages.en}/>);
        const selected=screen.getByRole('button',{name:'2026-10-07'});
        expect(selected.querySelector('.latin-digits')?.textContent).toBe('7');expect(selected.querySelector('.persian-digits')?.textContent).toMatch(/[۰-۹]/);
        expect(screen.getByRole('button',{name:messages.en.previousMonth}).querySelector('.lucide-chevron-left')).toBeTruthy();
        view.rerender(<Calendar {...props} t={messages.fa}/>);
        expect(screen.getByRole('button',{name:messages.fa.previousMonth}).querySelector('.lucide-chevron-right')).toBeTruthy();
        expect(view.container.querySelectorAll('.in-range')).toHaveLength(15);
    });
});
