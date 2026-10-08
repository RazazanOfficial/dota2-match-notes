import type { Session } from "@/lib/types";
import type { HistoryMatch, HistoryQuery, Summary } from "./history";
import { periodRange } from "./history";
import { cacheableRead, cachedRead, cachedWrite, clearOfflineAccount, saveOfflineSession } from "./offlineCache";
import { connectionState, setConnection } from "./connection";

const configuredOrigin = import.meta.env.VITE_API_ORIGIN || (import.meta.env.DEV ? "http://127.0.0.1:4100" : "https://api.dota2notes.ir");
export const API_ORIGIN = new URL(configuredOrigin).origin;
if (configuredOrigin !== API_ORIGIN) throw new Error("VITE_API_ORIGIN must be an origin without a path");
let bearer: string | null = null;
export class ApiError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "ApiError"; }
}

export function setBearer(token: string | null) { bearer = token; }
export function hasBearer() { return bearer !== null; }
export function getBearer() { return bearer; }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/api/") || path.startsWith("//")) throw new Error("Invalid API path");
    const method = (init.method || "GET").toUpperCase(), read = method === "GET" && cacheableRead(path);
    if (method !== "GET" && connectionState() === "offline") throw new ApiError("Offline mode", 0, "offline_mode");
    if (read && connectionState() === "offline") { const cached = cachedRead<T>(path); if (cached !== null) return cached; }
    const requestToken = bearer;
    const headers = new Headers(init.headers);
    if (requestToken) headers.set("Authorization", `Bearer ${requestToken}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const controller = new AbortController(), abort = () => controller.abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) controller.abort();
    const timeout = window.setTimeout(abort, 12000);
    try {
        const response = await fetch(`${API_ORIGIN}${path}`, { ...init, signal: controller.signal, headers, credentials: "omit", cache: "no-store" });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            if (response.status >= 500) setConnection("offline"); else setConnection("online");
            const error = body?.error, code = typeof error?.code === "string" ? error.code : undefined;
            if (response.status === 401 && requestToken && requestToken === bearer) { clearOfflineAccount(); window.dispatchEvent(new Event("dota-notes:auth-invalid")); }
            throw new ApiError(typeof error?.message === "string" ? error.message : code || `API ${response.status}`, response.status, code);
        }
        if (requestToken !== bearer) throw new DOMException("Account changed", "AbortError");
        setConnection("online");
        if (read) cachedWrite(path, body);
        return body as T;
    } catch (failure) {
        if (init.signal?.aborted || requestToken !== bearer) throw failure;
        const unavailable = !(failure instanceof ApiError) || failure.status >= 500 || failure.status === 0;
        if (unavailable) {
            setConnection("offline");
            const cached = read ? cachedRead<T>(path) : null;
            if (cached !== null) return cached;
            throw new ApiError("Offline mode", 0, "offline_mode");
        }
        throw failure;
    } finally { window.clearTimeout(timeout); init.signal?.removeEventListener("abort", abort); }
}

export async function currentSession() {
    const result = await apiRequest<{ authenticated: boolean; user?: { handle: string; steamId: string; steamAccountId: number; displayName: string; avatarUrl: string | null; createdAt: string; registeredDate: string; isSuperAdmin: boolean; hasPassword: boolean; hasVerifiedEmail: boolean; onboardingCompletedAt: string | null; recoveryCodesSavedAt: string | null } }>("/api/auth/session");
    if (!result.authenticated || !result.user) {
        clearOfflineAccount(); window.dispatchEvent(new Event("dota-notes:auth-invalid"));
        throw new ApiError("Session expired", 401);
    }
    const user = result.user;
    const session = { mode: "player", username: user.handle, steamId: user.steamId, steamAccountId: user.steamAccountId,
        displayName: user.displayName, avatarUrl: user.avatarUrl, createdAt: user.createdAt,
        registeredDate: user.registeredDate, isSuperAdmin: user.isSuperAdmin, hasPassword: user.hasPassword,
        hasVerifiedEmail: user.hasVerifiedEmail, onboardingCompletedAt: user.onboardingCompletedAt, recoveryCodesSavedAt: user.recoveryCodesSavedAt } satisfies Session;
    if (bearer) await saveOfflineSession(bearer, session);
    return session;
}

export interface MatchListResponse { ok: true; rows: HistoryMatch[]; total: number; page: number; pageSize: number; summary: Summary; summaryPending?: boolean }
export function matchListPath(query: HistoryQuery) {
    const range = query.from && query.to ? { from: query.from, to: query.to } : periodRange(query.period, query.anchor);
    return `/api/matches/me?${new URLSearchParams({ ...range, page: String(query.page), pageSize: String(query.pageSize || 10), ...(query.offset == null ? {} : { offset: String(query.offset) }), query: query.query, mode: query.mode, position: query.position, hero: query.hero || "all" })}`;
}
export async function listMatches(query: HistoryQuery, signal?: AbortSignal): Promise<MatchListResponse> {
    const result = await apiRequest<MatchListResponse>(matchListPath(query), { signal });
    return { ...result, rows: result.rows.map(row => ({ ...row, heroId: row.heroId || 0, position: row.position || 0, duration: row.duration || 0,
        k: row.k ?? 0, d: row.d ?? 0, a: row.a ?? 0 })) };
}

export async function requestMatchSync(payload: { scope: string; from: string; to: string; mode: "basic"; gameModes: string[] }) {
    return apiRequest<{ ok: true; jobId: string }>("/api/sync/me", { method: "POST", body: JSON.stringify(payload) });
}

export interface SyncJob {
    id: string;
    status: string;
    attempted?: string[];
    request?: { scope: "day" | "week" | "month"; from: string; to: string };
    result?: { imported?: string[]; checked?: number; failed?: unknown[] };
}
export async function getSyncStatus() {
    return apiRequest<{ ok: true; status: { nextAllowedAt: string | null; nextDayAllowedAt: string | null; nextWeekAllowedAt: string | null; nextMonthAllowedAt: string | null; manualJob?: SyncJob | null } }>("/api/sync/me");
}

export async function logout() {
    try { await apiRequest("/api/auth/logout", { method: "POST" }); }
    finally { setBearer(null); }
}
