"use client";

import { API_URL, SESSION_COOKIE, SESSION_DAYS } from "./constants";
import { normalizeProfile } from "./date";
import type { Day, Profile, Session } from "./types";

interface ApiResponse {
  ok: boolean;
  error?: string;
  channel?: string;
  profile?: unknown;
  token?: string;
  isNew?: boolean;
}

function createChannel() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireApiUrl() {
  if (!API_URL) throw new Error("اتصال سرور پیکربندی نشده است");
  return API_URL;
}

function jsonp(action: string, params: Record<string, string>) {
  return new Promise<ApiResponse>((resolve, reject) => {
    const callbackName = `dotaNotes_${createChannel()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(
      () => cleanup(new Error("پاسخی از سرور دریافت نشد")),
      25_000,
    );

    function cleanup(error?: Error, value?: ApiResponse) {
      window.clearTimeout(timeout);
      script.remove();
      delete (window as unknown as Record<string, unknown>)[callbackName];
      if (error) reject(error);
      else resolve(value as ApiResponse);
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (response: ApiResponse) => {
      if (!response?.ok) {
        cleanup(new Error(response?.error || "دریافت اطلاعات انجام نشد"));
        return;
      }
      cleanup(undefined, response);
    };

    const url = new URL(requireApiUrl());
    url.searchParams.set("action", action);
    url.searchParams.set("prefix", callbackName);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    script.src = url.toString();
    script.onerror = () => cleanup(new Error("ارتباط با سرور برقرار نشد"));
    document.head.appendChild(script);
  });
}

function post(action: string, payload: Record<string, unknown>) {
  return new Promise<ApiResponse>((resolve, reject) => {
    const channel = createChannel();
    const frameName = `dotaNotesFrame_${channel}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const input = document.createElement("input");
    const timeout = window.setTimeout(
      () => cleanup(new Error("پاسخی از سرور دریافت نشد")),
      30_000,
    );

    function cleanup(error?: Error, value?: ApiResponse) {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
      form.remove();
      iframe.remove();
      if (error) reject(error);
      else resolve(value as ApiResponse);
    }

    function handleMessage(event: MessageEvent<ApiResponse>) {
      if (event.source !== iframe.contentWindow || event.data?.channel !== channel) return;
      if (!event.data?.ok) {
        cleanup(new Error(event.data?.error || "عملیات انجام نشد"));
        return;
      }
      cleanup(undefined, event.data);
    }

    window.addEventListener("message", handleMessage);
    iframe.name = frameName;
    iframe.hidden = true;
    form.hidden = true;
    form.method = "POST";
    form.action = requireApiUrl();
    form.target = frameName;
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify({
      action,
      channel,
      origin: window.location.origin,
      ...payload,
    });
    form.appendChild(input);
    document.body.append(iframe, form);
    form.submit();
  });
}

function readCookie() {
  const prefix = `${SESSION_COOKIE}=`;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as { username?: string; token?: string };
    return value.username && value.token ? { username: value.username, token: value.token } : null;
  } catch {
    return null;
  }
}

function writeCookie(username: string, token: string) {
  const value = encodeURIComponent(JSON.stringify({ username, token }));
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const path = basePath ? `${basePath}/` : "/";
  document.cookie = `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=${path}; Secure; SameSite=Strict`;
}

function clearCookie() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const path = basePath ? `${basePath}/` : "/";
  document.cookie = `${SESSION_COOKIE}=; Max-Age=0; Path=${path}; Secure; SameSite=Strict`;
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

export async function loginPlayer(username: string, password: string): Promise<Session> {
  const response = await post("auth", { username, password });
  if (!response.token) throw new Error("توکن ورود دریافت نشد");
  writeCookie(username, response.token);
  return {
    mode: "player",
    username,
    token: response.token,
    isNew: Boolean(response.isNew),
  };
}

export async function restorePlayer(): Promise<{ session: Session; profile: Profile } | null> {
  const saved = readCookie();
  if (!saved) return null;
  try {
    const response = await post("session", saved);
    return {
      session: { mode: "player", username: saved.username, token: saved.token },
      profile: normalizeProfile(response.profile, saved.username),
    };
  } catch {
    clearCookie();
    return null;
  }
}

export async function viewCoach(username: string) {
  const response = await jsonp("view", { username });
  return normalizeProfile(response.profile, username);
}

export async function saveDay(
  session: Session,
  dateKey: string,
  day: Day,
): Promise<Profile> {
  if (!session.token) throw new Error("نشست ورود معتبر نیست");
  const response = await post("saveDay", {
    username: session.username,
    token: session.token,
    dateKey,
    day: serializeDay(day),
  });
  return normalizeProfile(response.profile, session.username);
}

export async function logout(session: Session | null) {
  try {
    if (session?.mode === "player" && session.token) {
      await post("logout", { username: session.username, token: session.token });
    }
  } finally {
    clearCookie();
  }
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
