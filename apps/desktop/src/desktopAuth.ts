import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type { Session } from "@/lib/types";
import { API_ORIGIN, ApiError, apiRequest, currentSession, logout, setBearer } from "./api";

import { clearOfflineAccount, restoreOfflineSession } from "./offlineCache";

const pendingKey = "dota-notes.desktop-login.pending";
export const signupKey = "dota-notes.desktop-signup.pending";
export const signupChoiceKey = "dota-notes.desktop-signup.choice";
const validSecret = /^[A-Za-z0-9_-]{43}$/;
type Pending = { verifier: string; nonce: string; createdAt: number };

function randomSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseDesktopCallback(value: string, pending: Pending | null) {
    if (!pending || Date.now() - pending.createdAt > 10 * 60_000 || !validSecret.test(pending.verifier)) return null;
    let url: URL;
    try { url = new URL(value); } catch { return null; }
    const code = url.searchParams.get("code");
    if (url.protocol !== "dota-notes:" || url.hostname !== "auth" || url.pathname !== "/callback" ||
        url.hash || url.username || url.password || url.searchParams.size !== 2 ||
        !code || !validSecret.test(code) || url.searchParams.get("nonce") !== pending.nonce) return null;
    return { code, verifier: pending.verifier };
}

function pendingLogin(): Pending | null {
    try { return JSON.parse(sessionStorage.getItem(pendingKey) || "null") as Pending | null; }
    catch { return null; }
}

export function useDesktopAuth() {
    const [session, setSession] = useState<Session | null>(null);
    const [busy, setBusy] = useState(false);
    const [restoring, setRestoring] = useState(isTauri());
    const [error, setError] = useState("");
    const authGeneration = useRef(0);
    useEffect(() => {
        if (!isTauri()) return;
        let active = true;
        const restore = async () => {
            const generation = authGeneration.current;
            try {
                const token = await invoke<string | null>("load_session_token");
                if (!active || generation !== authGeneration.current || !token) return;
                setBearer(token);
                const cached = await restoreOfflineSession(token);
                if (!active || generation !== authGeneration.current) return;
                if (cached) { setSession(cached); setRestoring(false); }
                try {
                    const user = await currentSession();
                    if (active && generation === authGeneration.current) setSession(user);
                } catch (failure) {
                    if (failure instanceof ApiError && failure.status === 401) {
                        if (active && generation === authGeneration.current) {
                            clearOfflineAccount(); setSession(null); setBearer(null);
                            try { await invoke("clear_session_token"); }
                            catch { /* Retrying the stale token next launch is harmless. */ }
                        }
                    } else if (active && !cached) setError(String(failure));
                }
            } catch (failure) { if (active) setError(String(failure)); }
            finally { if (active) setRestoring(false); }
        };
        const invalidate = () => {
            authGeneration.current += 1; clearOfflineAccount(); setBearer(null); setSession(null);
            void invoke("clear_session_token").catch(() => {});
        };
        window.addEventListener("dota-notes:auth-invalid", invalidate);
        void restore();
        const handle = async (urls: string[]) => {
            for (const value of urls) {
                const credentials = parseDesktopCallback(value, pendingLogin());
                if (!credentials) continue;
                authGeneration.current += 1;
                sessionStorage.removeItem(pendingKey);
                if (active) setBusy(true);
                try {
                    const grant = await apiRequest<{ token: string }>("/api/auth/desktop/exchange", {
                        method: "POST", body: JSON.stringify(credentials),
                    });
                    setBearer(grant.token);
                    const user = await currentSession();
                    await invoke("save_session_token", { token: grant.token });
                    if (localStorage.getItem(signupKey) === "pending" && user.steamId) localStorage.setItem(signupKey, user.steamId);
                    if (active) { setSession(user); setError(""); }
                } catch (failure) {
                    setBearer(null);
                    if (active) setError(String(failure));
                } finally { if (active) { setBusy(false); setRestoring(false); } }
                break;
            }
        };
        let unlisten: (() => void) | undefined;
        void onOpenUrl(urls => { void handle(urls); }).then(stop => {
            if (active) unlisten = stop;
            else stop();
            return getCurrent();
        }).then(urls => { if (active && urls) void handle(urls); }).catch(failure => { if (active) setError(String(failure)); });
        return () => { active = false; unlisten?.(); window.removeEventListener("dota-notes:auth-invalid", invalidate); };
    }, []);

    async function signIn(signup = false) {
        if (!isTauri()) { setError("Steam sign-in needs the installed desktop app."); return; }
        authGeneration.current += 1;
        setBusy(true); setError("");
        try {
            const verifier = randomSecret(), nonce = randomSecret();
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
            const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
            sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, nonce, createdAt: Date.now() } satisfies Pending));
            if (signup) localStorage.setItem(signupKey, "pending");
            else localStorage.removeItem(signupKey);
            const url = `${API_ORIGIN}/api/auth/desktop/start?${new URLSearchParams({ challenge, nonce })}`;
            await invoke("open_steam_login", { url });
        } catch (failure) { sessionStorage.removeItem(pendingKey); if (signup) localStorage.removeItem(signupKey); setError(String(failure)); }
        finally { setBusy(false); }
    }

    async function signInWithPassword(steamIdentifier: string, password: string) {
        if (!isTauri()) { setError("Password sign-in needs the installed desktop app."); return; }
        authGeneration.current += 1;
        setBusy(true); setError("");
        try {
            const grant = await apiRequest<{ token: string }>("/api/auth/password/login?session=bearer", {
                method: "POST", body: JSON.stringify({ steamIdentifier, password }),
            });
            setBearer(grant.token);
            const user = await currentSession();
            await invoke("save_session_token", { token: grant.token });
            setSession(user);
        } catch (failure) {
            setBearer(null);
            setError(String(failure));
        } finally { setBusy(false); }
    }

    async function signOut() {
        authGeneration.current += 1;
        try { await logout(); }
        catch (failure) { if (!(failure instanceof ApiError && failure.code === "offline_mode")) setError(String(failure)); }
        finally {
            try { await invoke("clear_session_token"); }
            catch (failure) { setError(String(failure)); }
            clearOfflineAccount(); setBearer(null); setSession(null);
        }
    }
    return { session, signIn, signInWithPassword, signOut, refreshSession: async () => setSession(await currentSession()), clearError: () => setError(""), busy, restoring, error };
}
