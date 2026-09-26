import { notFound } from "next/navigation";
import AdminReplayArchive from "@/components/AdminReplayArchive";
export default function ReplayArchiveMockPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="replay-page app-shell"><a className="secondary-button" href="/dev/mock">بازگشت به Mock</a><AdminReplayArchive previewMode /></main>;
}
