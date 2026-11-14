import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "./api";
import { connectionState, useConnection } from "./connection";
import { cachedRead } from "./offlineCache";
import { isPersian, type Messages } from "./i18n";

export const adminText = (t: Messages, fa: string, en: string) => isPersian(t) ? fa : en;
export const adminDate = (value: string | null | undefined, t: Messages) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(isPersian(t) ? "fa-IR" : "en-GB", {
    timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short", hourCycle: "h23",
  }).format(date) : "—";
};
export const adminNumber = (value: number, t: Messages) => new Intl.NumberFormat(isPersian(t) ? "fa-IR" : "en-GB", { maximumFractionDigits: 1 }).format(value);
export const adminBytes = (value: string | number | null | undefined) => value == null ? "—" : `${(Number(value) / 1048576).toFixed(1)} MB`;
export function adminStatus(value: string, t: Messages) {
  const labels: Record<string, [string, string]> = {
    pending: ["در صف", "Queued"], processing: ["در حال پردازش", "Processing"],
    completed: ["کامل", "Completed"], failed: ["خطا", "Failed"], active: ["فعال", "Active"],
    building: ["در حال ساخت", "Building"], draft: ["پیش‌نویس", "Draft"], published: ["منتشرشده", "Published"],
    connecting: ["اتصال", "Connecting"], downloading: ["دانلود", "Downloading"], parsing: ["تحلیل", "Parsing"],
    uploading: ["آپلود", "Uploading"], queued: ["در صف", "Queued"],
  };
  return labels[value]?.[isPersian(t) ? 0 : 1] || value;
}

// Only the active tab polls. Requests are serialized, aborted on navigation,
// paused while hidden/offline, and resumed on focus. Admin data is never cached.
export function useAccountRead<T>(path: string, live: boolean, interval = 0) {
  const connection = useConnection();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ path: string; data: T | null; error: unknown; busy: boolean }>({
    path, data: path === "/api/profile/me" ? cachedRead<T>(path) : null, error: null, busy: live,
  });
  useEffect(() => {
    if (!live || !path) return;
    const controller = new AbortController(); let timer = 0, inFlight = false, again = false, forbidden = false;
    const load = async () => {
      if (controller.signal.aborted || forbidden) return;
      if (inFlight) { again = true; return; }
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      if (connectionState() === "offline") {
        setState(current => ({ ...current, busy: false }));
        return;
      }
      inFlight = true;
      setState(current => ({ path, data: current.path === path ? current.data : null, error: null, busy: true }));
      try {
        const data = await apiRequest<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ path, data, error: null, busy: false });
      } catch (error) {
        forbidden = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (!controller.signal.aborted) setState(current => ({ path, data: forbidden || current.path !== path ? null : current.data, error, busy: false }));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted && !forbidden && (interval || again)) timer = window.setTimeout(load, again ? 0 : interval);
        again = false;
      }
    };
    const visible = () => { if (document.visibilityState !== "hidden") void load(); };
    void load(); window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearTimeout(timer); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [path, live, interval, revision, connection]);
  return { ...state, data: state.path === path ? state.data : null, error: state.path === path ? state.error : null, refresh: () => setRevision(value => value + 1) };
}

export interface AccountProfile {
  user: { id: string; handle: string; displayName: string; steamId: string; steamAccountId: number;
    avatarUrl: string | null; isAdmin: boolean; isSuperAdmin: boolean; createdAt: string;
    lastLoginAt: string | null; lastManualSyncAt: string | null; lastScheduledSyncAt: string | null;
    onboardingCompletedAt: string | null; hasPassword: boolean; hasVerifiedEmail: boolean; hasSavedRecoveryCodes: boolean };
  stats: { total: number; wins: number; losses: number; analyzed: number; winRate: number };
  recent: { matchId: number | null; heroId: number | null; heroName: string; result: "win" | "loss"; startedAt: string | null; duration: number | null }[];
}
export interface AdminUser {
  id: string; steamId: string; steamAccountId: number; handle: string; displayName: string; avatarUrl: string | null;
  hasPassword: boolean; isAdmin: boolean; isSuperAdmin: boolean; createdAt: string; lastLoginAt: string | null;
  lastManualSyncAt: string | null;
}
export interface AdminOverview {
  counts: { users: number; usersWithLogin: number; databaseAdmins: number; activeSessions: number;
    journalMatches: number; cachedDotaMatches: number; generatedImages: number; generatedImageBytes: number;
    adminAuditLogs: number; newUsersToday: number; analyzedMatchesToday: number };
  imageJobs: Record<string, number>; syncJobs: Record<string, number>;
  openDotaUsage: { key: string; used: number; limit: number; remaining: number; percent: number; resetAt: string | null }[];
  analytics: { daily: { day: string; newUsers: number; analyzedMatches: number; openDotaRequests: number }[] };
  recentImageJobs: { id: string; dotaMatchId: string | null; heroName: string; status: string; attempts: number; errorCode: string | null; userHandle: string; updatedAt: string }[];
  recentAuditLogs: { id: string; action: string; createdAt: string; actorUserId: string | null; targetUserId: string | null; metadata: Record<string, unknown> }[];
}
export interface MonitorUnit { id: string; properties: Record<string, string>; logs: { at: string | null; priority: number; message: string }[]; error: string | null }
export interface MonitorHost { id: "iran" | "germany"; label: string; capturedAt: string | null; stale: boolean; snapshotError: string | null; units: MonitorUnit[] }
export type MonitorState = "running" | "waiting" | "idle" | "disabled" | "failed" | "stopped" | "stale" | "retrying" | "unknown";
export interface ServiceMonitor { capturedAt: string | null; stale: boolean; snapshotError: string | null; units: MonitorUnit[];
  hosts?: MonitorHost[]; stages?: { id: "prepare" | "parse" | "archive"; active: number; pending: number; failed: number | null }[];
  queues: { source: string; status: string; total: number }[]; failures: { source: string; at: string; detail: string }[] }
export function unitState(unit: MonitorUnit, context: { now?: number; stale?: boolean; target?: MonitorUnit } = {}): MonitorState {
  const p = unit.properties;
  if (context.stale) return "stale";
  if (unit.error) return "unknown";
  if (p.LoadState === "not-found" || p.ActiveState === "failed") return "failed";
  if (p.SubState === "auto-restart") return "retrying";
  const active = p.ActiveState === "active" || p.ActiveState === "activating";
  if (!active && p.ExpectedActive === "no") return "disabled";
  if (p.Result && !["success", "done"].includes(p.Result)) return "failed";
  if (unit.id.endsWith(".timer")) {
    if (!active) return p.ExpectedActive === "yes" ? "stopped" : p.UnitFileState === "disabled" || p.ExpectedActive === "no" ? "disabled" : "unknown";
    const next = Date.parse(p.NextRunAt || "");
    const targetActive = ["active", "activating"].includes(context.target?.properties.ActiveState || "");
    if (targetActive) return "running";
    if (!Number.isFinite(next)) return "unknown";
    const accuracy = Number(p.TimerAccuracySec);
    const grace = Math.max(0, Number.isFinite(accuracy) ? accuracy : 60) * 1000 + 15_000;
    return (context.now ?? Date.now()) > next + grace ? "failed" : "waiting";
  }
  if (active) return "running";
  const oneshot = /^dota2notes-(?:images|performance-reference|monitor)\.service$/.test(unit.id);
  if (oneshot) {
    if (p.ExpectedActive === "no") return "disabled";
    if (p.Result === "success" && p.ExecMainStatus === "0" && Number.isFinite(Date.parse(p.ExecMainExitTimestamp || ""))) return "idle";
    return "unknown";
  }
  return "stopped";
}
