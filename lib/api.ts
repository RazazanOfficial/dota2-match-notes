"use client";

import { normalizeProfile } from "./date";
import type { Day, Profile, Session } from "./types";

interface ErrorPayload {
  error?: string | { code?: string; message?: string };
  message?: string;
}

interface SessionResponse {
  authenticated: boolean;
  user?: {
    handle: string;
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
    throw new Error(
      nestedError || plainError || payload.message || "ارتباط با سرور انجام نشد",
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
          result: match.result,
          createdAt: match.createdAt,
        },
      ]),
    ),
  };
}

function normalizeProfileResponse(response: ProfileResponse, username: string) {
  if (!response.ok || !response.profile) {
    throw new Error("اطلاعات دفتر مچ از سرور دریافت نشد");
  }
  return normalizeProfile(response.profile, username);
}

export function loginPlayer() {
  window.location.assign("/api/auth/steam");
}

export async function restorePlayer(): Promise<Session | null> {
  const response = await requestJson<SessionResponse>("/api/auth/session");
  if (!response.authenticated || !response.user?.handle) return null;

  return {
    mode: "player",
    username: response.user.handle,
  };
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
