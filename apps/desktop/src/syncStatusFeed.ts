import { getBearer, getSyncStatus, type SyncJob } from "./api";
import { connectionState, subscribeConnection } from "./connection";
import { cachedRead } from "./offlineCache";

export type SyncStatusResponse = Awaited<ReturnType<typeof getSyncStatus>>;
interface Snapshot { data: SyncStatusResponse | null; error: unknown; loading: boolean }
export const SYNC_POLL_ACTIVE_MS = 5_000;
export const SYNC_POLL_IDLE_MS = 30_000;
export const syncJobRunning = (job?: SyncJob | null) => job?.status === "pending" || job?.status === "processing";

// One owner for /api/sync/me, shared by the task dock, workspace and dialog.
// Subscribers own the lifetime: changing pages never creates another poller.
export class SyncStatusFeed {
    private state: Snapshot = { data: null, error: null, loading: false };
    private listeners = new Set<() => void>();
    private timer = 0;
    private controller: AbortController | null = null;
    private generation = 0;
    private requestedAgain = false;
    private fingerprint = "";
    private stopConnection?: () => void;
    private account = getBearer();
    constructor(private fetchStatus = getSyncStatus) {}

    snapshot = () => {
        if (this.account !== getBearer()) { this.account = getBearer(); this.state = { data: null, error: null, loading: false }; }
        return this.state;
    };
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        if (this.listeners.size === 1) this.start();
        return () => { this.listeners.delete(listener); if (!this.listeners.size) this.stop(); };
    };
    private publish(state: Snapshot) { this.state = state; this.listeners.forEach(listener => listener()); }
    private interval() { return syncJobRunning(this.state.data?.status.manualJob) ? SYNC_POLL_ACTIVE_MS : SYNC_POLL_IDLE_MS; }
    private schedule(delay = this.interval()) {
        window.clearTimeout(this.timer);
        if (this.listeners.size && document.visibilityState !== "hidden") this.timer = window.setTimeout(() => void this.refresh(), delay);
    }
    private visibility = () => {
        if (document.visibilityState === "hidden") { window.clearTimeout(this.timer); this.controller?.abort(); }
        else void this.refresh();
    };
    private focus = () => { if (!this.timer) void this.refresh(); };
    private accountChanged = () => {
        this.account = getBearer();
        this.generation++; this.controller?.abort(); this.controller = null; this.requestedAgain = false; this.fingerprint = "";
        this.publish({ data: null, error: null, loading: false });
        this.schedule();
    };
    private requested = (event: Event) => {
        const job = (event as CustomEvent<SyncJob>).detail;
        if (job) {
            this.publish({ data: { ok: true, status: { nextAllowedAt: null, nextDayAllowedAt: null, nextWeekAllowedAt: null,
                nextMonthAllowedAt: null, ...this.state.data?.status, manualJob: job } }, error: null, loading: this.state.loading });
        }
        if (this.controller) this.requestedAgain = true;
        else void this.refresh();
    };
    private start() {
        const cached = cachedRead<SyncStatusResponse>("/api/sync/me");
        this.publish({ data: cached, error: null, loading: false });
        window.addEventListener("dota-notes:sync-requested", this.requested);
        window.addEventListener("dota-notes:account-changed", this.accountChanged);
        window.addEventListener("focus", this.focus);
        document.addEventListener("visibilitychange", this.visibility);
        let previous = connectionState();
        this.stopConnection = subscribeConnection(() => {
            const next = connectionState();
            if (next === "online" && previous === "offline") void this.refresh();
            previous = next;
        });
        void this.refresh();
    }
    private stop() {
        this.generation++; window.clearTimeout(this.timer); this.timer = 0;
        this.controller?.abort(); this.controller = null; this.requestedAgain = false;
        this.stopConnection?.();
        window.removeEventListener("dota-notes:sync-requested", this.requested);
        window.removeEventListener("dota-notes:account-changed", this.accountChanged);
        window.removeEventListener("focus", this.focus);
        document.removeEventListener("visibilitychange", this.visibility);
    }
    async refresh() {
        if (!this.listeners.size || document.visibilityState === "hidden" || this.controller) return;
        window.clearTimeout(this.timer); this.timer = 0;
        if (connectionState() === "offline") { this.schedule(SYNC_POLL_IDLE_MS); return; }
        const controller = new AbortController(), generation = this.generation;
        this.controller = controller;
        this.publish({ ...this.state, loading: true });
        try {
            const data = await this.fetchStatus(controller.signal);
            if (generation !== this.generation || controller.signal.aborted || this.requestedAgain) return;
            this.publish({ data, error: null, loading: false });
            const job = data.status.manualJob;
            const fingerprint = job ? `${job.id}:${job.status}:${job.attempted?.length || 0}:${job.result?.imported?.length || 0}` : "";
            const changed = !!fingerprint && this.fingerprint !== fingerprint;
            this.fingerprint = fingerprint;
            if (changed) window.dispatchEvent(new Event("dota-notes:matches-updated"));
        } catch (error) {
            if (generation === this.generation && !controller.signal.aborted) this.publish({ ...this.state, error, loading: false });
        } finally {
            if (generation === this.generation) {
                this.controller = null;
                if (this.state.loading) this.publish({ ...this.state, loading: false });
                const again = this.requestedAgain; this.requestedAgain = false;
                // A visibility return may occur before an aborted read unwinds.
                this.schedule(again || controller.signal.aborted ? 0 : this.interval());
            }
        }
    }
}

export const syncStatusFeed = new SyncStatusFeed();
