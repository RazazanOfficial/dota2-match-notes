import { cookies } from "next/headers";
import { backendOrigin } from "./proxy";
import type { SessionUser } from "../auth/session";
import type { JournalMatchPageData, JournalOwner } from "../journal/repository";

async function get<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const response = await fetch(new URL(path, backendOrigin()), { headers: { cookie: cookieStore.toString() },
    cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Backend page data unavailable");
  return response.json() as Promise<T>;
}
export async function backendSession() {
  const result = await get<{ authenticated: boolean; user?: Omit<SessionUser, "passwordHash"> }>("/api/auth/session");
  return result?.authenticated ? result.user || null : null;
}
export async function backendPlayer(identifier: string) {
  return (await get<{ player: JournalOwner }>(`/api/players/${encodeURIComponent(identifier)}`))?.player || null;
}
export async function backendMatchPage(matchId: string, player?: string) {
  const query = player ? `?player=${encodeURIComponent(player)}` : "";
  return get<{ page: JournalMatchPageData; readonly: boolean }>(`/api/journal/matches/${encodeURIComponent(matchId)}/page${query}`);
}
