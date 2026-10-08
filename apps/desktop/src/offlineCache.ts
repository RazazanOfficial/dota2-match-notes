import { periodRange, summarize, matchDateKey } from "./history";
import { heroById } from "@/data/heroes";
import type { Session } from "@/lib/types";
const prefix = "dota-notes.offline.v1.";
const budget = 2 * 1024 * 1024;
let sessionRevision = 0;
let owner = "", memory = new Map<string, unknown>(), savedTimes = new Map<string, number>();
let lastSavedAt = 0;
function remember(path: string, value: unknown, time: number) {
    memory.delete(path); memory.set(path,value); savedTimes.set(path,time);
    if (memory.size > 80) { const first=memory.keys().next().value!; memory.delete(first); savedTimes.delete(first); }
}
export function cacheOwner() { return owner; }
export function setCacheOwner(value: string) { if (value !== owner) { memory.clear(); savedTimes.clear(); sessionRevision++; } owner = value; }
const keyFor = (path: string) => `${prefix}${owner}.data.${path}`;
export function cachedRead<T>(path: string): T | null {
    if (!owner) return null;
    if (memory.has(path)) return memory.get(path) as T;
    try { const entry = JSON.parse(localStorage.getItem(keyFor(path)) || "null"); if (entry?.version === 1) { remember(path, entry.value, entry.savedAt || 0); return entry.value as T; } } catch { /* A corrupt cache is a miss. */ }
    return null;
}
export function cachedWrite(path: string, value: unknown) {
    if (!owner) return;
    const time=lastSavedAt=Math.max(Date.now(),lastSavedAt+1);
    remember(path,value,time);
    try {
        const encoded = JSON.stringify({ version: 1, savedAt: time, value });
        if (encoded.length > budget / 2) return;
        const entries = Object.keys(localStorage).filter(key => key.startsWith(`${prefix}${owner}.data.`) && key !== keyFor(path)).map(key => ({ key, value: localStorage.getItem(key) || "" }));
        let size = entries.reduce((total, entry) => total + entry.value.length, 0);
        for (const entry of entries.sort((a,b) => { try { return JSON.parse(a.value).savedAt - JSON.parse(b.value).savedAt; } catch { return 0; } })) {
            if (size + encoded.length <= budget) break;
            localStorage.removeItem(entry.key); size -= entry.value.length;
        }
        localStorage.setItem(keyFor(path), encoded);
    } catch { /* Low disk space must not interrupt rendering. */ }
}
export function clearOfflineAccount() {
    sessionRevision++;
    const previous = owner; owner = ""; memory.clear(); savedTimes.clear();
    try { for (const key of Object.keys(localStorage)) if (key.startsWith(`${prefix}${previous}.`) || key === `${prefix}session`) localStorage.removeItem(key); } catch { }
}
async function fingerprint(token: string) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2,"0")).join("");
}
export async function saveOfflineSession(token: string, session: Session) {
    setCacheOwner(session.steamId || session.username);
    const revision = ++sessionRevision;
    try { const digest = await fingerprint(token); if (revision !== sessionRevision) return; localStorage.setItem(`${prefix}session`, JSON.stringify({ version: 1, fingerprint: digest, session })); } catch { }
}
export async function restoreOfflineSession(token: string): Promise<Session | null> {
    const revision=sessionRevision;
    try {
        const entry = JSON.parse(localStorage.getItem(`${prefix}session`) || "null");
        if (entry?.version !== 1 || entry.fingerprint !== await fingerprint(token) || revision !== sessionRevision || typeof entry.session?.username !== "string" || !entry.session.steamId) return null;
        setCacheOwner(entry.session.steamId); return entry.session;
    } catch { return null; }
}
export const cacheableRead = (path: string) => /^\/api\/(?:matches\/me\?|journal\/matches\/[^/]+\/page\?|matches\/[^/]+\/analysis(?:\?|$)|sync\/me$)/.test(path);

// Seed a new view from already-known rows of this account, even when its page
// size differs. Exact responses retain their complete server totals.
export function cachedHistory(query: import("./history").HistoryQuery, all = false): import("./api").MatchListResponse | null {
    if (!owner) return null;
    const range = query.from && query.to ? {from:query.from,to:query.to} : periodRange(query.period,query.anchor);
    const paths=new Set([...memory.keys()]);
    try { for (const key of Object.keys(localStorage)) if (key.startsWith(`${prefix}${owner}.data.`)) paths.add(key.slice(`${prefix}${owner}.data.`.length)); } catch { }
    const rows=new Map<string,import("./history").HistoryMatch>(); let source:import("./api").MatchListResponse|null=null;
    const snapshots=[...paths].flatMap(path=>{
        if (!path.includes("/api/matches/me?")) return [];
        const response=cachedRead<import("./api").MatchListResponse>(path);
        return response?.rows ? [{path,response,time:savedTimes.get(path) || 0}] : [];
    }).sort((a,b)=>a.time-b.time);
    for (const {path,response} of snapshots) {
        if (!path.includes("/api/matches/me?")) continue;
        for (const row of response.rows) if (matchDateKey(row)>=range.from && matchDateKey(row)<=range.to && (!query.query || `${row.id} ${heroById(row.heroId)?.name || ""}`.toLowerCase().includes(query.query.toLowerCase())) && (query.mode==="all" || row.mode===query.mode) && (query.position==="all" || row.position===Number(query.position)) && (!query.hero || query.hero==="all" || row.heroId===Number(query.hero))) rows.set(row.id,row);
        const params=new URLSearchParams(path.split("?")[1]);
        if (params.get("from")===range.from && params.get("to")===range.to && (params.get("query") || "")===query.query && (params.get("mode") || "all")===query.mode && (params.get("position") || "all")===query.position && (params.get("hero") || "all")===(query.hero || "all")) source=response;
    }
    const known=[...rows.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id));
    if (!known.length && !source) return null;
    const pageSize=query.pageSize || 10, offset=query.offset ?? (query.page-1)*pageSize, slice=all?known:known.slice(offset,offset+pageSize);
    if (!all && !slice.length && (source?.total || known.length)>0) return null;
    return {ok:true,rows:slice,total:source?.total ?? known.length,summary:source?.summary || summarize(known),page:query.page,pageSize,summaryPending:source?.summaryPending};
}
