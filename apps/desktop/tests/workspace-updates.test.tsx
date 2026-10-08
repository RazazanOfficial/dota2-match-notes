// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {LiveDashboard,LiveMatches} from "../src/components/LiveWorkspace";
import {MatchTable} from "../src/components/Workspace";
import {messages} from "../src/i18n";
import {previewProfile} from "../src/components/Shared";
import {sampleHistory,summarize,type HistoryQuery} from "../src/history";
import {clearOfflineAccount,setCacheOwner} from "../src/offlineCache";
import {setConnection} from "../src/connection";
const mocks=vi.hoisted(()=>({list:vi.fn(),sync:vi.fn(),api:vi.fn()}));
vi.mock("../src/api",async()=>({...await vi.importActual("../src/api"),listMatches:mocks.list,getSyncStatus:mocks.sync,apiRequest:mocks.api}));
const rows=Array.from({length:41},(_,i)=>({...sampleHistory[0],id:String(9100000000+i),heroId:i%3===0?8:1,position:i%3===0?1:2,analyzed:true,analysisStatus:"ready" as const,score:25+i,itemIds:[50,36,1,108,247,609],buffs:[{key:"legion_commander_duel",label:"Duel damage",stacks:50}]}));
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();clearOfflineAccount();setCacheOwner("test");setConnection("online");document.documentElement.dir="ltr";document.documentElement.lang="en";mocks.sync.mockResolvedValue({ok:true,status:{}});mocks.list.mockImplementation(async(q:HistoryQuery)=>{const filtered=rows.filter(row=>(!q.hero || q.hero==="all" || row.heroId===Number(q.hero)) && (q.position==="all" || row.position===Number(q.position)));const count=q.pageSize || 10,offset=q.offset ?? (q.page-1)*count;return {ok:true,rows:filtered.slice(offset,offset+count),total:filtered.length,page:q.page,pageSize:count,summary:summarize(filtered)};});});
afterEach(()=>{cleanup();clearOfflineAccount();vi.restoreAllMocks();});
describe("updated match workspace",()=>{
 it("loads ten more at a time and switches to the next block after thirty",async()=>{
  const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);
  await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(10));
  fireEvent.click(screen.getByRole("button",{name:messages.en.loadMore}));await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(20));
  fireEvent.click(screen.getByRole("button",{name:messages.en.loadMore}));await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(30));
  expect(screen.queryByRole("button",{name:messages.en.loadMore})).toBeNull();fireEvent.click(within(view.container.querySelector('.pagination')!).getByRole("button",{name:messages.en.next}));
  await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(10));expect(mocks.list.mock.calls.some(([q])=>q.offset===30 && q.pageSize===10)).toBe(true);
 });
 it("shows the entire selected period without eight-match pagination",async()=>{
  const view=render(<LiveMatches session={previewProfile} t={messages.en} onOpen={vi.fn()}/>);await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(41));expect(view.container.querySelector('.pagination')).toBeNull();
 });
 it("combines hero and position filters in either order and resets them",async()=>{
  const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);await screen.findByRole("table");const chart=view.container.querySelector('.distribution')!;
  fireEvent.click(within(chart).getByRole("button",{name:/Juggernaut:/}));await waitFor(()=>expect(mocks.list.mock.calls.some(([q])=>q.hero==="8")).toBe(true));
  fireEvent.click(within(chart).getByRole("button",{name:/Carry:/}));await waitFor(()=>expect(mocks.list.mock.calls.some(([q])=>q.hero==="8" && q.position==="1")).toBe(true));
  expect(within(chart).getByText("100.0%")).toBeTruthy();fireEvent.click(within(chart).getByRole("button",{name:messages.en.resetFilters}));await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(10));
  expect(within(chart).queryByRole("button",{name:messages.en.resetFilters})).toBeNull();
  fireEvent.click(within(chart).getByRole("button",{name:/Carry:/}));await waitFor(()=>expect(mocks.list.mock.calls.some(([q])=>q.hero==="all" && q.position==="1")).toBe(true));
  fireEvent.click(await within(chart).findByRole("button",{name:/Juggernaut:/}));await waitFor(()=>expect(mocks.list.mock.calls.filter(([q])=>q.hero==="8" && q.position==="1").length).toBeGreaterThan(1));
 });
 it("renders the same column order and six items in both languages",()=>{
  const view=render(<MatchTable matches={[rows[0]]} t={messages.en} onOpen={vi.fn()}/>);const header=screen.getAllByRole("columnheader").map(e=>e.textContent);expect(header.slice(-2)).toEqual([messages.en.items,messages.en.details]);expect(view.container.querySelectorAll('.row-items .row-item')).toHaveLength(6);
  expect(view.container.querySelector('.imp-value')?.className).toContain('imp-low');expect(view.container.querySelector('.match-details-button svg')?.getAttribute('class')).toContain('arrow-up-left');
  view.rerender(<MatchTable matches={[rows[0]]} t={messages.fa} onOpen={vi.fn()}/>);expect(screen.getAllByRole("columnheader").slice(-2).map(e=>e.textContent)).toEqual([messages.fa.items,messages.fa.details]);expect(view.container.querySelector('.mode-chip')?.textContent).toBe('توربو');expect(view.container.querySelector('.match-details-button svg')?.getAttribute('class')).toContain('arrow-up-right');
 });
 it("collapses processing stages and shows only a short retry count near the signal",()=>{
  const processing={...rows[0],analyzed:false,analysisStatus:"pending" as const,analysisPreparation:{replay:"pending",progress:{phase:"retry_wait",attempts:2,bytes:0,totalBytes:null,bytesPerSecond:0,nextTryAt:null,phaseStartedAt:null,heartbeatAt:null,retryDeadlineAt:null,errorCode:"replay_metadata_pending"}}};
  const view=render(<MatchTable matches={[processing]} t={messages.en} onOpen={vi.fn()}/>);expect(view.container.querySelector('.row-analysis-progress')).toBeNull();fireEvent.click(screen.getByRole("button",{name:messages.en.analysisQueued}));const progress=view.container.querySelector('.row-analysis-progress')!;expect(progress.querySelector('.signal-retry')).toBeTruthy();expect(progress.textContent).toContain('Attempt 2');expect(progress.querySelector('.analysis-progress-heading')?.textContent).not.toContain(messages.en.analysisRefresh);expect(progress.querySelector('.analysis-progress-heading')?.textContent).not.toContain(messages.en.analysisQueued);
  fireEvent.click(screen.getByRole("button",{name:messages.en.collapseProgress}));expect(view.container.querySelector('.row-analysis-progress')).toBeNull();fireEvent.click(screen.getByRole("button",{name:messages.en.analysisQueued}));expect(view.container.querySelector('.row-analysis-progress')).toBeTruthy();
 });
 it("retains cached rows immediately when returning to a page during an outage",async()=>{
  const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);await waitFor(()=>expect(view.container.querySelectorAll('[data-match-row]')).toHaveLength(10));view.unmount();setConnection('offline');mocks.list.mockRejectedValue(new Error('offline'));
  const cached=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);expect(cached.container.querySelectorAll('[data-match-row]')).toHaveLength(10);expect(cached.container.querySelector('.match-list .loading-view')).toBeNull();
 });
 it.each([messages.en,messages.fa])("keeps a failed analysis closed across remount and exposes a deliberate retry",async(t)=>{
  const failed={...rows[0],analyzed:false,analysisStatus:"failed" as const,analysisPreparation:{replay:"failed",errorCode:"replay_parser_failed"}};
  mocks.api.mockResolvedValue({preparation:{replay:"pending"}});
  const view=render(<MatchTable matches={[failed]} t={t} onOpen={vi.fn()} live/>);
  const button=screen.getByRole("button",{name:t.analysisError});expect(button.className).toContain("failed");expect(button.getAttribute("aria-expanded")).toBe("false");expect(view.container.querySelector('.row-analysis-progress')).toBeNull();expect(mocks.api).not.toHaveBeenCalled();
  fireEvent.click(button);expect(screen.getByRole("alert").textContent).toContain(t.analysisFailed);expect(mocks.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:t.analysisRetryAction}));await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith(expect.stringContaining(failed.id),expect.objectContaining({method:"POST"})));
  view.unmount();const next=render(<MatchTable matches={[failed]} t={t} onOpen={vi.fn()}/>);expect(next.container.querySelector('.row-analysis-progress')).toBeNull();
 });
 it("keeps sticky headers aligned with horizontal scrolling without losing columns",()=>{
  const view=render(<MatchTable matches={[rows[0]]} t={messages.en} onOpen={vi.fn()}/>);
  const scroll=view.container.querySelector('.table-scroll')! as HTMLDivElement;const head=view.container.querySelector('.match-table-sticky')! as HTMLDivElement;
  scroll.scrollLeft=250;fireEvent.scroll(scroll);expect(head.scrollLeft).toBe(250);expect(screen.getAllByRole("columnheader")).toHaveLength(11);
  expect(view.container.querySelectorAll('.row-item')).toHaveLength(6);
 });
 it("opens the calendar offline without a loader or unsolicited error, and explains a submitted request",async()=>{
  const view=render(<LiveDashboard session={previewProfile} t={messages.en} onOpen={vi.fn()} onNavigate={vi.fn()}/>);await screen.findByRole("table");setConnection("offline");mocks.sync.mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button",{name:messages.en.fetchMatches}));const dialog=await screen.findByRole("dialog");
  expect(dialog.querySelector(".calendar")).toBeTruthy();expect(dialog.querySelector(".loading-view")).toBeNull();await act(async()=>{});expect(within(dialog).queryByRole("alert")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button",{name:messages.en.fetchMatches}));expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent",messages.en.offlineRequired);
 });
});
