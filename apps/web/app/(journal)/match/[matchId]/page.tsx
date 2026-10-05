import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MatchDetailsPage from "@/components/MatchDetailsPage";
import { backendMatchPage } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "جزئیات مچ | Dota2Notes",
  description: "جزئیات، تحلیل عملکرد، یادداشت‌ها و تصاویر مچ Dota 2",
  robots: { index: false, follow: false },
};

interface MatchPageProps {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ player?: string | string[] }>;
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  const [{ matchId }, query] = await Promise.all([params, searchParams]);
  const rawPlayer = Array.isArray(query.player) ? query.player[0] : query.player;
  const result = await backendMatchPage(matchId, rawPlayer);
  if (!result) notFound();
  const pageData = result.page;

  const ownerIdentifier = String(pageData.owner.steamAccountId || pageData.owner.handle);
  return (
    <MatchDetailsPage
      initialMatch={pageData.match}
      initialDay={pageData.day}
      dateKey={pageData.dateKey}
      readonly={result.readonly}
      fallbackHref={`/user/${encodeURIComponent(ownerIdentifier)}`}
    />
  );
}
