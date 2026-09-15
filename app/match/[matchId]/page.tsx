import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import MatchDetailsPage from "@/components/MatchDetailsPage";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import {
  findJournalOwnerByIdentifier,
  loadJournalMatchPage,
} from "@/lib/journal/repository";
import { parsePublicPlayerIdentifier } from "@/lib/journal/validation";

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
  const [{ matchId }, query, cookieStore] = await Promise.all([
    params,
    searchParams,
    cookies(),
  ]);
  const session = await getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
  const rawPlayer = Array.isArray(query.player) ? query.player[0] : query.player;

  let ownerId = session?.id;
  if (rawPlayer) {
    const identifier = parsePublicPlayerIdentifier(rawPlayer);
    if (!identifier) notFound();
    const requestedOwner = await findJournalOwnerByIdentifier(identifier);
    if (!requestedOwner) notFound();
    ownerId = requestedOwner.id;
  }

  const pageData = await loadJournalMatchPage(matchId, ownerId);
  if (!pageData) notFound();

  const ownerIdentifier = String(pageData.owner.steamAccountId || pageData.owner.handle);
  return (
    <MatchDetailsPage
      initialMatch={pageData.match}
      initialDay={pageData.day}
      dateKey={pageData.dateKey}
      readonly={session?.id !== pageData.owner.id}
      fallbackHref={`/user/${encodeURIComponent(ownerIdentifier)}`}
    />
  );
}
