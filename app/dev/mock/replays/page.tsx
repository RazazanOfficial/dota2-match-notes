import { notFound } from "next/navigation";
import ReplayLookup from "@/components/ReplayLookup";
export default function ReplayMockPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReplayLookup previewMode />;
}
