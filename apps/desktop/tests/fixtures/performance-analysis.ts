import { heroById } from "../../../web/data/heroes";
import { calculateLaneEfficiency, type LaneEvents, type LaneReference } from "../../../web/lib/dota/lane-efficiency";
import type { MatchAnalysis, MatchPlayerAnalysis } from "../../../web/lib/types";

export function performanceFixture(): MatchAnalysis {
  const slots = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
  const heroIds = new Map(slots.map((slot, i) => [slot, i + 1]));
  const positions = new Map(slots.map((slot, i) => [slot, i % 5 + 1]));
  const reference: LaneReference = { month: "2026-10-01", versionId: "fixture", hero: [], position: [1, 2, 3, 4, 5].map(position => ({ position, sampleCount: 18420, cs: 45, deaths: 1.5, networth: 4200, dn: 7, kills: 2, assists: 3 })) };
  const events: LaneEvents = { version: 2, snapshotAt: 600, coordinateSystem: "dota-grid",
    snapshots: slots.map(slot => ({ slot, heroId: heroIds.get(slot)!, time: 600, lh: positions.get(slot)! < 4 ? 58 : 12, dn: 8, kills: 3, deaths: 1, assists: 4, networth: 4400 })),
    purchases: slots.flatMap(slot => [{ slot, time: -89, item: "item_tango", charges: 3 }, { slot, time: 120, item: "item_flask", charges: 1 }]),
    wards: slots.flatMap((slot, i) => [{ slot, time: 60, type: "obs", handle: i, attackerSlot: null }, { slot, time: 400, type: "obs_left", handle: i, attackerSlot: null }]),
    combat: [{ time: 320, attackerSlot: 0, targetSlot: 129, actorLocation: { x: 75, y: 140, sampledAt: 320, source: "interval" }, targetLocation: { x: 77, y: 140, sampledAt: 320, source: "interval" } }], assists: [],
  };
  const players: MatchPlayerAnalysis[] = slots.map((slot, i) => ({ playerSlot: slot, accountId: null, heroId: heroIds.get(slot)!, heroName: heroById(heroIds.get(slot)!)?.name ?? "Hero", personName: `Player ${i + 1}`, team: slot < 128 ? "radiant" : "dire", position: positions.get(slot)!, positionLabel: "Carry", isProfilePlayer: slot === 0, kills: 6, deaths: 2, assists: 8, netWorth: 18240, heroDamage: 24300, towerDamage: 3200, performanceScore: 72, benchmarks: [], timeline: [], benchmarkSource: "unavailable",
    laneEfficiency: calculateLaneEfficiency({ slot, heroId: heroIds.get(slot)!, position: positions.get(slot)!, positions, heroIds, duration: 2400, gameMode: 22, lobbyType: 7, events, reference }) }));
  return { status: "ready", dotaMatchId: "9017352046", durationMinutes: 40, parsed: true, replaySource: "local", coverage: { benchmarkPlayers: 10, timelinePlayers: 10, totalPlayers: 10 }, players, teamTimeline: [] };
}
