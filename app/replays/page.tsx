import type { Metadata } from "next";
import ReplayLookup from "@/components/ReplayLookup";

export const metadata: Metadata = { title: "Replay مچ | Dota2Notes", robots: { index: false, follow: false } };
export default function ReplaysPage() { return <ReplayLookup />; }
