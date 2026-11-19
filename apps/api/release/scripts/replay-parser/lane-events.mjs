import { spawn } from "node:child_process";
import readline from "node:readline";
import { createMatchBuffCollector } from "./match-buffs.mjs";

const ITEMS = new Set(["item_flask", "item_clarity", "item_enchanted_mango", "item_tango",
  "item_faerie_fire", "item_ward_observer", "item_ward_sentry", "item_ward_dispenser",
  "item_smoke_of_deceit", "item_dust"]);
const SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
const LANE_END = 600;
const LOCATION_TOLERANCE = 2;
const heroKey = name => typeof name === "string"
  ? name.replace(/^(?:npc_dota_hero_|CDOTA_Unit_Hero_)/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase() : "";

export function createLaneCollector() {
  const indices = new Map(), heroes = new Map(), snapshots = new Map(), lastAssists = new Map(), locations = new Map();
  const purchases = [], wards = [], combat = [], assistChanges = [];
  function accept(event) {
    if (event.type === "player_slot" && Number.isInteger(Number(event.key)) && SLOTS.includes(Number(event.value))) {
      indices.set(Number(event.key), Number(event.value));
    } else if (event.type === "interval" && Number.isInteger(event.time) && event.time >= -300 && event.time <= LANE_END + LOCATION_TOLERANCE) {
      const slot = indices.get(event.slot);
      if (slot !== undefined) {
        const key = heroKey(event.unit);
        if (key) heroes.set(key, slot);
        // Preserve invalid/dead samples too: do not jump across them to an older
        // alive location or interpolate through a teleport to manufacture presence.
        const samples = locations.get(slot) ?? new Map();
        samples.set(event.time, { x: event.x, y: event.y, lifeState: event.life_state });
        locations.set(slot, samples);
        if (event.time === LANE_END) {
          snapshots.set(slot, { slot, heroId: event.hero_id, time: LANE_END, kills: event.kills,
            deaths: event.deaths, assists: event.assists, lh: event.lh, dn: event.denies, networth: event.networth });
        }
        if (event.time <= LANE_END && Number.isInteger(event.assists) && event.assists >= 0) {
          const before = lastAssists.get(slot);
          if (before !== undefined && event.assists > before && event.assists - before <= 5) {
            if (assistChanges.length >= 500) throw new Error("Excessive Lane assist changes");
            assistChanges.push({ slot, time: event.time, count: event.assists - before });
          }
          lastAssists.set(slot, event.assists);
        }
      }
    } else if (event.type === "DOTA_COMBATLOG_PURCHASE" && event.time >= -300 && event.time <= LANE_END && ITEMS.has(event.valuename)) {
      if (purchases.length >= 1000) throw new Error("Excessive Lane purchase events");
      purchases.push({ index: event.slot, buyer: event.targetname, time: event.time,
        item: event.valuename, charges: event.charges ?? null });
    } else if (["obs", "sen", "obs_left", "sen_left"].includes(event.type) && event.time >= -300) {
      if (wards.length >= 1000) throw new Error("Excessive Lane ward events");
      wards.push({ type: event.type, index: event.slot, time: event.time,
        handle: event.ehandle ?? null, attacker: event.attackername ?? null });
    } else if (event.type === "DOTA_COMBATLOG_DEATH" && event.targethero && event.time >= -300 && event.time <= LANE_END) {
      if (combat.length >= 250) throw new Error("Excessive early hero deaths");
      combat.push({ time: event.time, target: event.targetname, attacker: event.attackername });
    }
  }
  function actorLocation(slot, time) {
    if (slot === null) return null;
    let nearest = null;
    for (const [sampledAt, sample] of locations.get(slot) ?? []) {
      const distance = Math.abs(sampledAt - time);
      if (distance > LOCATION_TOLERANCE || (nearest && (distance > nearest.distance ||
          (distance === nearest.distance && sampledAt >= nearest.sampledAt)))) continue;
      nearest = { ...sample, sampledAt, distance };
    }
    if (!nearest || nearest.lifeState !== 0 || !Number.isFinite(nearest.x) || !Number.isFinite(nearest.y) ||
        nearest.x < 0 || nearest.x > 255 || nearest.y < 0 || nearest.y > 255) return null;
    return { x: nearest.x, y: nearest.y, sampledAt: nearest.sampledAt, source: "interval" };
  }
  function targetLocation(slot, time) {
    if (slot === null) return null;
    let nearest = null;
    for (const [sampledAt, sample] of locations.get(slot) ?? []) {
      // The death tick may already contain a corpse/respawn position. Only the
      // most recent alive sample at or before the death can locate the fight.
      if (sampledAt > time || time - sampledAt > LOCATION_TOLERANCE || sample.lifeState !== 0 ||
          (nearest && sampledAt <= nearest.sampledAt)) continue;
      nearest = { ...sample, sampledAt };
    }
    if (!nearest || !Number.isFinite(nearest.x) || !Number.isFinite(nearest.y) ||
        nearest.x < 0 || nearest.x > 255 || nearest.y < 0 || nearest.y > 255) return null;
    return { x: nearest.x, y: nearest.y, sampledAt: nearest.sampledAt, source: "interval" };
  }
  function finish() {
    if (snapshots.size !== 10) throw new Error("Incomplete minute-10 Lane snapshots");
    const heroSlot = name => heroes.get(heroKey(name)) ?? null;
    const deaths = combat.map(row => {
      const targetSlot = heroSlot(row.target);
      return { ...row, targetSlot, targetLocation: targetLocation(targetSlot, row.time) };
    });
    const assists = [], unresolved = [];
    for (const change of assistChanges) {
      const candidates = deaths.filter(row => row.targetSlot !== null &&
        (row.targetSlot < 128) !== (change.slot < 128) &&
        row.time >= change.time - 3 && row.time <= change.time + 1);
      if (change.count !== 1 || candidates.length !== 1) { unresolved.push(change); continue; }
      const time = candidates[0].time;
      assists.push({ slot: change.slot, targetSlot: candidates[0].targetSlot, time,
        actorLocation: actorLocation(change.slot, time), targetLocation: candidates[0].targetLocation });
    }
    return { version: 2, snapshotAt: LANE_END, coordinateSystem: "dota-grid",
      snapshots: [...snapshots.values()], assists, unresolvedAssistChanges: unresolved.length,
      purchases: purchases.map(row => ({ slot: heroSlot(row.buyer) ?? indices.get(row.index) ?? null,
        time: row.time, item: row.item, charges: row.charges })),
      wards: wards.map(row => ({ slot: indices.get(row.index) ?? null, type: row.type,
        time: row.time, handle: row.handle, attackerSlot: heroSlot(row.attacker) })),
      combat: deaths.map(row => {
        const attackerSlot = heroSlot(row.attacker);
        return { time: row.time, targetSlot: row.targetSlot, attackerSlot,
          actorLocation: actorLocation(attackerSlot, row.time), targetLocation: row.targetLocation };
      }) };
  }
  return { accept, finish };
}

export async function extractLaneEvents(jar, work, dem) {
  const collector = createLaneCollector(), buffs = createMatchBuffCollector();
  const child = spawn("java", ["-Xmx1200m", "-cp", `${jar}:${work}`, "LaneEvents", dem],
    { stdio: ["ignore", "pipe", "pipe"] });
  let error = "", count = 0;
  child.stderr.on("data", data => { error = (error + data.toString()).slice(-1000); });
  const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  try {
    for await (const line of readline.createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (++count > 1_500_000 || line.length > 32_768) throw new Error("Excessive parser event output");
      const event = JSON.parse(line); collector.accept(event); buffs.accept(event);
    }
    const code = await closed;
    if (code !== 0) throw new Error(`Lane replay extraction failed (${code}): ${error}`);
    return { ...collector.finish(), trackGold: buffs.finish() };
  } catch (reason) { child.kill("SIGKILL"); await closed.catch(() => undefined); throw reason; }
  finally { clearTimeout(timer); }
}
