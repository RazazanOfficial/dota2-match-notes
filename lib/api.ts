"use client";

import { normalizeProfile } from "./date";
import type {
  Day,
  HeroPoolData,
  ManualSyncResult,
  PlayerSearchResult,
  PlayerSyncStatus,
  Profile,
  Session,
} from "./types";

interface ErrorPayload {
  error?: string | { code?: string; message?: string; retryAfterSeconds?: number };
  message?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface SessionResponse {
  authenticated: boolean;
  user?: {
    handle: string;
    steamId: string;
    steamAccountId: number;
    displayName: string;
    avatarUrl: string | null;
    isSuperAdmin: boolean;
    createdAt: string;
    registeredDate: string;
    hasPassword: boolean;
  };
}

interface ProfileResponse {
  ok: boolean;
  profile?: unknown;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const payload = body && typeof body === "object" ? (body as ErrorPayload) : {};
    const nestedError =
      payload.error && typeof payload.error === "object" ? payload.error.message : undefined;
    const plainError = typeof payload.error === "string" ? payload.error : undefined;
    const nested = payload.error && typeof payload.error === "object" ? payload.error : undefined;
    throw new ApiError(
      nestedError || plainError || payload.message || "ارتباط برقرار نشد؛ دوباره تلاش کنید",
      response.status,
      nested?.code,
      nested?.retryAfterSeconds,
    );
  }

  return body as T;
}

function journalUrl(path: string, from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return `${path}?${params.toString()}`;
}

function serializeDay(day: Day) {
  return {
    completed: day.completed,
    matches: Object.fromEntries(
      day.matches.map((match) => [
        match.id,
        {
          id: match.id,
          number: match.number,
          heroId: match.heroId,
          heroName: match.heroName,
          banIds: match.bans.map((hero) => hero.id),
          legacyBans: match.legacyBans || "",
          role: match.role,
          queueType: match.queueType,
          notes: match.notes,
          positivePoints: match.positivePoints,
          negativePoints: match.negativePoints,
          result: match.result,
          createdAt: match.createdAt,
        },
      ]),
    ),
  };
}

function normalizeProfileResponse(response: ProfileResponse, username: string) {
  if (!response.ok || !response.profile) {
    throw new Error("اطلاعات مچ‌ها دریافت نشد");
  }
  return normalizeProfile(response.profile, username);
}

export function loginPlayer() {
  window.location.assign("/api/auth/steam");
}

export async function loginWithPassword(steamIdentifier: string, password: string) {
  return requestJson<{ ok: boolean }>("/api/auth/password/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steamIdentifier, password }),
  });
}

export async function updateAccountPassword(password: string, confirmPassword: string) {
  return requestJson<{ ok: boolean; hasPassword: boolean }>("/api/auth/password/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, confirmPassword }),
  });
}

export async function removeAccountPassword() {
  return requestJson<{ ok: boolean; hasPassword: boolean }>("/api/auth/password/me", {
    method: "DELETE",
  });
}

export async function restorePlayer(): Promise<Session | null> {
  const response = await requestJson<SessionResponse>("/api/auth/session");
  if (!response.authenticated || !response.user?.handle) return null;

  return {
    mode: "player",
    username: response.user.handle,
    steamId: response.user.steamId,
    steamAccountId: response.user.steamAccountId,
    displayName: response.user.displayName,
    avatarUrl: response.user.avatarUrl,
    isSuperAdmin: response.user.isSuperAdmin,
    createdAt: response.user.createdAt,
    registeredDate: response.user.registeredDate,
    hasPassword: response.user.hasPassword,
  };
}

export async function getPlayerSyncStatus() {
  const response = await requestJson<{ ok: boolean; status: PlayerSyncStatus }>(
    "/api/sync/me",
  );
  return response.status;
}

export async function syncPlayerMatches() {
  const response = await requestJson<{ ok: boolean; sync: ManualSyncResult }>(
    "/api/sync/me",
    { method: "POST" },
  );
  return response.sync;
}

export async function viewPlayer(username: string, from: string, to: string) {
  const response = await requestJson<ProfileResponse>(
    journalUrl("/api/journal/me", from, to),
  );
  return normalizeProfileResponse(response, username);
}

export async function viewCoach(username: string, from: string, to: string) {
  const response = await requestJson<ProfileResponse>(
    journalUrl(`/api/journal/users/${encodeURIComponent(username)}`, from, to),
  );
  return normalizeProfileResponse(response, username);
}

export async function searchPlayers(
  query: string,
  signal?: AbortSignal,
): Promise<PlayerSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const response = await requestJson<{
    ok: boolean;
    results: PlayerSearchResult[];
  }>(`/api/users/search?${params.toString()}`, { signal });
  return response.results;
}

export async function saveDay(
  session: Session,
  dateKey: string,
  day: Day,
): Promise<Profile> {
  if (session.mode !== "player") throw new Error("این حساب اجازه ثبت اطلاعات ندارد");

  const response = await requestJson<ProfileResponse>(
    `/api/journal/days/${encodeURIComponent(dateKey)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeDay(day)),
    },
  );
  return normalizeProfileResponse(response, session.username);
}

export async function logout(session: Session | null) {
  if (session?.mode !== "player") return;
  await requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function purgeLegacyBrowserCache() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith("dota2-match-notes-")).map((key) => caches.delete(key)),
    );
  }
}

export async function getHeroPool() {
  const response = await requestJson<{ ok: boolean; heroPool: HeroPoolData }>("/api/hero-pool/me");
  return response.heroPool;
}

export async function updateHeroPool(heroPool: HeroPoolData["pools"]) {
  const body = Object.fromEntries(
    Object.entries(heroPool).map(([role, heroes]) => [role, heroes.map((hero) => hero.id)]),
  );
  const response = await requestJson<{ ok: boolean; heroPool: HeroPoolData }>("/api/hero-pool/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.heroPool;
}
