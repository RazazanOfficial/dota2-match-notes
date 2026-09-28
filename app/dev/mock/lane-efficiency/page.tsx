import { LaneEfficiencyPanel } from "@/components/MatchAnalysisPanel";
import { calculateLaneEfficiency, type LaneEvents, type LaneReference } from "@/lib/dota/lane-efficiency";
import { notFound } from "next/navigation";

const reference: LaneReference = { month: "2026-08", versionId: "MOCK-2026-08", hero: [
  { heroId: 37, position: 5, sampleCount: 721, cs: 10, deaths: 2, networth: 2000,
    dn: 2, kills: 1, assists: 4 },
], position: [{ position: 5, sampleCount: 100_000, cs: 15, deaths: 1.5,
  networth: 2400, dn: 3, kills: 1.5, assists: 3.2 }] };
const events: LaneEvents = { version: 1, snapshots: [
  { slot: 3, heroId: 37, time: 600, lh: 10, dn: 2, kills: 1, deaths: 0, assists: 4, networth: 2200 },
], purchases: [
  { slot: 3, time: -89, item: "item_tango", charges: 6 },
  { slot: 3, time: -89, item: "item_flask", charges: 1 },
  { slot: 3, time: -89, item: "item_ward_dispenser", charges: 1 },
  { slot: 3, time: 90, item: "item_ward_sentry", charges: null },
  { slot: 3, time: 210, item: "item_smoke_of_deceit", charges: null },
], wards: [
  { slot: 3, type: "obs", time: -40, handle: 11, attackerSlot: null },
  { slot: 3, type: "obs_left", time: 320, handle: 11, attackerSlot: 3 },
  { slot: 3, type: "sen", time: 330, handle: 12, attackerSlot: null },
  { slot: 3, type: "sen_left", time: 750, handle: 12, attackerSlot: 3 },
], combat: [] };
const args = { slot: 3, heroId: 37, position: 5, positions: new Map([[3, 5]]),
  heroIds: new Map([[3, 37]]), duration: 2400, reference, events, gameMode: 22, lobbyType: 7 };

export default function LaneEfficiencyMockPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const ready = calculateLaneEfficiency(args);
  const missing = calculateLaneEfficiency({ ...args, reference: undefined });
  return <main dir="rtl" style={{maxWidth:1050,margin:"30px auto",padding:"0 18px",display:"grid",gap:18,color:"#e8f2f7"}}>
    <header><small>DEV / MOCK</small><h1>Lane Efficiency جدید</h1><p>نمونهٔ نمایشی با عددهای ساختگی؛ در سایت واقعی، Replay مچ و مرجع ماه قبل استفاده می‌شود.</p></header>
    <h2>مرجع Hero + Position موجود است</h2><LaneEfficiencyPanel lane={ready}/>
    <h2>مرجع ماه قبل موجود نیست</h2><LaneEfficiencyPanel lane={missing}/>
  </main>;
}
