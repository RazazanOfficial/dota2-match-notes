import { toJournalDateKey } from "@/lib/date";
import { heroById } from "@/data/heroes";
import { calculatePerformanceScoreOrNull } from "@/lib/dota/performance-score";
import { LANE_WEIGHTS, type LaneKey } from "@/lib/dota/lane-efficiency";
import type { Match, MatchParticipant } from "@/lib/types";
import { mockAnalysis } from "./analysisFixture";
import { buildPersianCalendarMonth } from "@/lib/persian-calendar";
import type { ReplayProgress } from "@/lib/replay/progress";
export type AnalysisPreparation = { replay: string; progress?: ReplayProgress | null; errorCode?: string | null };
export type Period = "week" | "month";
export type Scope = "day" | Period;
export const COOLDOWNS: Record<Scope, number> = { day: 90000, week: 180000, month: 7200000 };
export const PAGE_SIZE = 10;
export const SAMPLE_DATE = "2026-10-02";
export const roles = ["", "Carry", "Mid", "Offlane", "Soft Support", "Hard Support"];
const pool = [85, 8, 11, 2, 86, 5, 14, 47, 26, 30];
export interface HistoryMatch {
    id: string;
    journalId?: string;
    heroId: number;
    position: number;
    won: boolean;
    k: number;
    d: number;
    a: number;
    score: number | null;
    mode: string;
    duration: number;
    startedAt: string;
    analyzed: boolean;
    analysisStatus?: "basic" | "pending" | "processing" | "failed" | "ready";
    analysisPreparation?: AnalysisPreparation | null;
    itemIds?: Array<number | null>;
    buffs?: import("@/lib/types").MatchBuff[];
}
// Lightweight rows only. Full analysis is created lazily for the selected match.
export const sampleHistory: HistoryMatch[] = Array.from({ length: 72 }, (_, index) => {
    const day = Math.floor(index / 4);
    const date = new Date(`${SAMPLE_DATE}T20:00:00Z`);
    date.setUTCDate(date.getUTCDate() - day);
    date.setUTCHours(20 - index % 4 * 2);
    return { id: String(9026000101 - index), heroId: pool[(index * 3) % pool.length], position: (index % 5) + 1, won: index % 5 !== 2 && index % 5 !== 4, k: 5 + index % 14, d: 2 + index % 9, a: 8 + index % 23, score: index % 4 === 0 ? null : 38 + index % 57, mode: index % 6 === 0 ? "Turbo" : index % 8 === 0 ? "All Pick" : "Ranked", duration: 1700 + index % 21 * 61, startedAt: date.toISOString(), analyzed: index % 4 !== 0 };
});
export function periodRange(period: Period, anchor: string) {
    if (period === "month") {
        const month = buildPersianCalendarMonth(anchor);
        return { from: month.firstKey, to: month.lastKey };
    }
    const date = new Date(`${anchor}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
    const from = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 6);
    return { from, to: date.toISOString().slice(0, 10) };
}
export const matchDateKey = (match: HistoryMatch) => toJournalDateKey(new Date(match.startedAt));
export function filterHistory(period: Period, anchor: string, query = "", mode = "all", position = "all") {
    const range = periodRange(period, anchor);
    return sampleHistory.filter(m => matchDateKey(m) >= range.from && matchDateKey(m) <= range.to && `${m.id} ${heroById(m.heroId)?.name}`.toLowerCase().includes(query.toLowerCase()) && (mode === "all" || m.mode === mode) && (position === "all" || m.position === Number(position)));
}
export interface HistoryQuery {
    period: Period;
    anchor: string;
    query: string;
    mode: string;
    position: string;
    page: number;
    pageSize?: number;
    offset?: number;
    hero?: string;
    from?: string;
    to?: string;
}
// The same contract can be backed by a paginated API when account integration is added.
export async function loadHistoryPage(query: HistoryQuery, signal: AbortSignal) {
    await Promise.resolve();
    if (signal.aborted)
        throw new DOMException("Aborted", "AbortError");
    const matches = filterHistory(query.period, query.anchor, query.query, query.mode, query.position);
    return { rows: matches.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE), total: matches.length, summary: summarize(matches) };
}
export function summarize(matches: HistoryMatch[]) {
    const groups = (key: "position" | "heroId") => {
        const ids = [...new Set(matches.map(m => m[key]))].sort((a, b) => a - b);
        return ids.map(id => { const rows = matches.filter(m => m[key] === id), wins = rows.filter(m => m.won).length; return { id, count: rows.length, wins, losses: rows.length - wins }; });
    };
    const wins = matches.filter(m => m.won).length;
    const scored = matches.filter(m => m.score !== null);
    return { total: matches.length, wins, losses: matches.length - wins, winRate: matches.length ? wins / matches.length * 100 : 0, score: scored.length ? scored.reduce((s, m) => s + (m.score || 0), 0) / scored.length : null, positions: groups("position"), heroes: groups("heroId") };
}
export type Summary = ReturnType<typeof summarize>;
export const durationText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export function detailFor(row: HistoryMatch): Match {
    const analysis = mockAnalysis();
    analysis.dotaMatchId = row.id;
    analysis.durationMinutes = Math.floor(row.duration / 60);
    // Keep summary, scoreboard and detail telemetry consistent within the fictional match.
    const duplicate = analysis.players.slice(1).find(p => p.heroId === row.heroId);
    if (duplicate) {
        duplicate.heroId = 85;
        duplicate.heroName = "Undying";
    }
    for (const [i, p] of analysis.players.entries()) {
        p.position = (i % 5) + 1;
        if (i > 0 && i < 5 && p.position === row.position)
            p.position = 1;
        p.positionLabel = roles[p.position];
        p.positionResolution = undefined;
        if (i === 0) {
            const hero = heroById(row.heroId)!;
            p.heroId = hero.id;
            p.heroName = hero.name;
            p.personName = "MeriJ";
            p.position = row.position;
            p.positionLabel = roles[row.position];
            p.kills = row.k;
            p.deaths = row.d;
            p.assists = row.a;
            p.positionResolution = undefined;
        }
        p.timeline = p.timeline.filter(x => x.minute <= analysis.durationMinutes);
        p.events = p.events?.filter(x => x.second <= row.duration);
        p.itemTimings = p.itemTimings?.filter(x => x.second <= row.duration);
        if (p.map) {
            p.map.objectives.events = p.map.objectives.events.filter(x => x.minute <= analysis.durationMinutes);
            p.map.farm.windows = p.map.farm.windows.filter(x => x.to <= analysis.durationMinutes);
            p.map.points = p.map.points.filter(x => x.minute === null || x.minute <= analysis.durationMinutes);
            p.map.trail = p.map.trail.filter(x => x.minute === null || x.minute <= analysis.durationMinutes);
        }
        for (const m of p.benchmarks) {
            if (m.key === "kills_per_min")
                m.value = (p.kills || 0) / analysis.durationMinutes;
            if (m.key === "deaths_per_min")
                m.value = (p.deaths || 0) / analysis.durationMinutes;
            if (m.key === "assists_per_min")
                m.value = (p.assists || 0) / analysis.durationMinutes;
            if (m.key === "tower_damage")
                m.value = (p.towerDamage || 0) / analysis.durationMinutes;
        }
        for (const m of p.benchmarks) {
            if (["kills_per_min", "deaths_per_min", "assists_per_min", "tower_damage"].includes(m.key))
                m.formattedValue = m.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
        }
        if (i === 0 && row.score !== null) {
            for (const m of p.benchmarks) {
                m.percentile = row.score;
                m.qualityPercentile = row.score;
            }
        }
        p.performanceScore = calculatePerformanceScoreOrNull(p.benchmarks, analysis.durationMinutes, p.position) ?? undefined;
        const weights = LANE_WEIGHTS[p.position || 1];
        const parts = (Object.keys(weights) as LaneKey[]).map(key => ({ key, label: { lh: "LH", deaths: "Death", networth: "Net Worth", dn: "Deny", kills: "Kill", assists: "Assist", ward: "Ward", resources: "Resources" }[key], value: weights[key] * .76, maximum: weights[key], actual: 4, mean: 3 }));
        p.laneEfficiency = { score: 76, subtotal: 76, covered: 100, bonus: 0, referenceMonth: "2026-09-01", referenceVersion: "sample", cohort: "hero-position", samples: 320, parts, notes: ["Offline sample reference"] };
        p.laneImpact = { availability: "partial", roleGroup: (p.position || 1) > 3 ? "support" : "core", laneRole: p.position, opponentPlayerSlot: analysis.players[(i + 5) % 10].playerSlot, lastHitsAt10: 54, deniesAt10: 8, netWorthAt10: 4700, xpAt10: 5100, killsAt10: 2, deathsAt10: 1, laneEfficiency: 76, resourcePurchasesAt10: 3, observerPlacementsAt10: 1, sentryPlacementsAt10: 1, netWorthDelta: 420, xpDelta: 290, lastHitDelta: 7, assessment: i < 5 ? "ahead" : "behind", confidence: "medium", evidence: [], note: "Offline sample" };
    }
    analysis.players[0].ownershipEvents = [{ item: "gem", purchaserPlayerSlot: 0, holderPlayerSlot: 128, purchasedAtSecond: 1200, transferAtSecond: null, transfer: "enemy", confidence: "medium", evidence: ["Offline sample"], limitation: "Transfer time is not available in this sample." }];
    analysis.teamTimeline = analysis.teamTimeline.filter(x => x.minute <= analysis.durationMinutes);
    const participants: MatchParticipant[] = analysis.players.map((p, i) => ({ playerSlot: p.playerSlot, accountId: p.accountId, personName: p.personName, heroId: p.heroId, heroName: p.heroName, team: p.team, position: p.position, level: 18 + i % 8, kills: p.kills || 0, deaths: p.deaths || 0, assists: p.assists || 0, lastHits: p.lastHits || 0, denies: p.denies || 0, goldPerMinute: p.benchmarks[0].value, xpPerMinute: p.benchmarks[1].value, netWorth: p.timeline.at(-1)?.gold ?? 0, heroDamage: p.heroDamage || 0, towerDamage: p.towerDamage || 0, heroHealing: p.heroHealing || 0, itemIds: i % 2 ? [50, 36, 1, 108, 116, 112] : [180, 110, 90, 36, 1, 42], backpackItemIds: [38, null, null], neutralItemId: null, neutralEnhancementId: null, hasAghanimsScepter: i % 3 === 0, hasAghanimsShard: i % 2 === 0, isProfilePlayer: i === 0 }));
    const radiantScore = participants.filter(p => p.team === "dire").reduce((s, p) => s + (p.deaths || 0), 0), direScore = participants.filter(p => p.team === "radiant").reduce((s, p) => s + (p.deaths || 0), 0);
    return { id: row.id, number: 1, heroId: row.heroId, heroName: heroById(row.heroId)?.name || "", role: ["", "safe_lane", "mid_lane", "off_lane", "soft_support", "hard_support"][row.position] as Match["role"], queueType: "", bans: [], picks: [], notes: "", positivePoints: [], negativePoints: [], result: row.won ? "win" : "loss", createdAt: row.startedAt, startedAt: row.startedAt, dotaMatchId: row.id, durationSeconds: row.duration, gameModeName: row.mode, radiantWin: row.won, radiantScore, direScore, participants, analysis, analysisStatus: "ready" };
}
