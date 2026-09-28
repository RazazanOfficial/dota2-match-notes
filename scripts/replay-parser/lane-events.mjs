import { spawn } from "node:child_process";
import readline from "node:readline";

const ITEMS = new Set(["item_flask", "item_clarity", "item_enchanted_mango", "item_tango",
  "item_faerie_fire", "item_ward_observer", "item_ward_sentry", "item_ward_dispenser",
  "item_smoke_of_deceit", "item_dust"]);
const SLOTS = [0, 1, 2, 3, 4, 128, 129, 130, 131, 132];
const heroKey = name => typeof name === "string"
  ? name.replace(/^(?:npc_dota_hero_|CDOTA_Unit_Hero_)/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase() : "";

export function createLaneCollector() {
  const indices = new Map(), heroes = new Map(), snapshots = new Map(), lastAssists = new Map();
  const purchases = [], wards = [], combat = [], assistChanges = [];
  function accept(event) {
    if (event.type === "player_slot" && Number.isInteger(Number(event.key)) && SLOTS.includes(Number(event.value))) {
      indices.set(Number(event.key), Number(event.value));
    } else if (event.type === "interval" && event.time >= -300 && event.time <= 600) {
      const slot = indices.get(event.slot);
      if (slot !== undefined) {
        if (event.time === 600) {
          snapshots.set(slot, { slot, heroId: event.hero_id, time: 600, kills: event.kills,
            deaths: event.deaths, assists: event.assists, lh: event.lh, dn: event.denies, networth: event.networth });
          if (typeof event.unit === "string") heroes.set(heroKey(event.unit), slot);
        }
        if (Number.isInteger(event.assists) && event.assists >= 0) {
          const before = lastAssists.get(slot);
          if (before !== undefined && event.assists > before && event.assists - before <= 5) {
            if (assistChanges.length >= 500) throw new Error("Excessive Lane assist changes");
            assistChanges.push({ slot, time: event.time, count: event.assists - before });
          }
          lastAssists.set(slot, event.assists);
        }
      }
    } else if (event.type === "DOTA_COMBATLOG_PURCHASE" && event.time >= -300 && event.time <= 600 && ITEMS.has(event.valuename)) {
      if (purchases.length >= 1000) throw new Error("Excessive Lane purchase events");
      purchases.push({ index: event.slot, buyer: event.targetname, time: event.time,
        item: event.valuename, charges: event.charges ?? null });
    } else if (["obs", "sen", "obs_left", "sen_left"].includes(event.type) && event.time >= -300) {
      if (wards.length >= 1000) throw new Error("Excessive Lane ward events");
      wards.push({ type: event.type, index: event.slot, time: event.time,
        handle: event.ehandle ?? null, attacker: event.attackername ?? null });
    } else if (event.type === "DOTA_COMBATLOG_DEATH" && event.targethero && event.time >= -300 && event.time <= 600) {
      if (combat.length >= 250) throw new Error("Excessive early hero deaths");
      combat.push({ time: event.time, target: event.targetname, attacker: event.attackername });
    }
  }
  function finish() {
    if (snapshots.size !== 10) throw new Error("Incomplete minute-10 Lane snapshots");
    const heroSlot = name => heroes.get(heroKey(name)) ?? null;
    const deaths = combat.map(row => ({ ...row, targetSlot: heroSlot(row.target) }));
    const assists = [], unresolved = [];
    for (const change of assistChanges) {
      const candidates = deaths.filter(row => row.targetSlot !== null &&
        (row.targetSlot < 128) !== (change.slot < 128) &&
        row.time >= change.time - 3 && row.time <= change.time + 1);
      if (change.count !== 1 || candidates.length !== 1) { unresolved.push(change); continue; }
      assists.push({ slot: change.slot, targetSlot: candidates[0].targetSlot, time: candidates[0].time });
    }
    return { version: 1, snapshots: [...snapshots.values()], assists, unresolvedAssistChanges: unresolved.length,
      purchases: purchases.map(row => ({ slot: heroSlot(row.buyer) ?? indices.get(row.index) ?? null,
        time: row.time, item: row.item, charges: row.charges })),
      wards: wards.map(row => ({ slot: indices.get(row.index) ?? null, type: row.type,
        time: row.time, handle: row.handle, attackerSlot: heroSlot(row.attacker) })),
      combat: combat.map(row => ({ time: row.time, targetSlot: heroSlot(row.target), attackerSlot: heroSlot(row.attacker) })) };
  }
  return { accept, finish };
}

export async function extractLaneEvents(jar, work, dem) {
  const collector = createLaneCollector();
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
      collector.accept(JSON.parse(line));
    }
    const code = await closed;
    if (code !== 0) throw new Error(`Lane replay extraction failed (${code}): ${error}`);
    return collector.finish();
  } catch (reason) { child.kill("SIGKILL"); await closed.catch(() => undefined); throw reason; }
  finally { clearTimeout(timer); }
}
