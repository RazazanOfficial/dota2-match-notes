import type { Session } from "@/lib/types";
import type { HistoryMatch, HistoryQuery, Summary } from "./history";
import { periodRange } from "./history";

const configuredOrigin = import.meta.env.VITE_API_ORIGIN || (import.meta.env.DEV ? "http://127.0.0.1:4100" : "https://api.dota2notes.ir");
export const API_ORIGIN = new URL(configuredOrigin).origin;
if (configuredOrigin !== API_ORIGIN) throw new Error("VITE_API_ORIGIN must be an origin without a path");
let bearer: string | null = null;
export class ApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

export function setBearer(token: string | null) { bearer = token; }
export function hasBearer() { return bearer !== null; }
export function getBearer() { return bearer; }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/api/") || path.startsWith("//")) throw new Error("Invalid API path");
    const headers = new Headers(init.headers);
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_ORIGIN}${path}`, { ...init, headers, credentials: "omit", cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = body?.error;
        throw new ApiError(typeof error?.message === "string" ? error.message : typeof error?.code === "string" ? error.code : `API ${response.status}`, response.status);
    }
    return body as T;
}

export async function currentSession() {
    const result = await apiRequest<{ authenticated: boolean; user?: { handle: string; steamId: string; steamAccountId: number; displayName: string; avatarUrl: string | null; createdAt: string; registeredDate: string; isSuperAdmin: boolean; hasPassword: boolean } }>("/api/auth/session");
    if (!result.authenticated || !result.user) throw new Error("Session expired");
    const user = result.user;
    return { mode: "player", username: user.handle, steamId: user.steamId, steamAccountId: user.steamAccountId,
        displayName: user.displayName, avatarUrl: user.avatarUrl, createdAt: user.createdAt,
        registeredDate: user.registeredDate, isSuperAdmin: user.isSuperAdmin, hasPassword: user.hasPassword } satisfies Session;
}

export interface MatchListResponse { ok: true; rows: HistoryMatch[]; total: number; page: number; pageSize: number; summary: Summary }
export async function listMatches(query: HistoryQuery, signal?: AbortSignal): Promise<MatchListResponse> {
    const { from, to } = periodRange(query.period, query.anchor);
    const params = new URLSearchParams({ from, to, page: String(query.page), query: query.query, mode: query.mode, position: query.position });
    const result = await apiRequest<MatchListResponse>(`/api/matches/me?${params}`, { signal });
    return { ...result, rows: result.rows.map(row => ({ ...row, heroId: row.heroId || 0, duration: row.duration || 0,
        k: row.k ?? 0, d: row.d ?? 0, a: row.a ?? 0 })) };
}

export async function requestMatchSync(payload: { scope: string; from: string; to: string; mode: "basic"; gameModes: string[] }) {
    return apiRequest<{ ok: true; jobId: string }>("/api/sync/me", { method: "POST", body: JSON.stringify(payload) });
}

export interface SyncJob {
    id: string;
    status: string;
    attempted?: string[];
    result?: { imported?: string[] };
}
export async function getSyncStatus() {
    return apiRequest<{ ok: true; status: { nextAllowedAt: string | null; nextDayAllowedAt: string | null; nextWeekAllowedAt: string | null; nextMonthAllowedAt: string | null; manualJob?: SyncJob | null } }>("/api/sync/me");
}

export async function logout() {
    try { await apiRequest("/api/auth/logout", { method: "POST" }); }
    finally { setBearer(null); }
}
