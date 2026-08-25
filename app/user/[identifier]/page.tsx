import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import MatchJournal from "@/components/MatchJournal";
import { findJournalOwnerByIdentifier } from "@/lib/journal/repository";
import { parsePublicPlayerIdentifier } from "@/lib/journal/validation";

export const dynamic = "force-dynamic";

interface UserPageProps {
  params: Promise<{ identifier: string }>;
}

const getPublicPlayer = cache(async (rawIdentifier: string) => {
  const identifier = parsePublicPlayerIdentifier(rawIdentifier);
  if (!identifier) return null;
  return findJournalOwnerByIdentifier(identifier);
});

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const { identifier } = await params;
  const player = await getPublicPlayer(identifier);

  if (!player) {
    return {
      title: "بازیکن پیدا نشد | Dota2Notes",
      robots: { index: false, follow: false },
    };
  }

  const canonical = `https://dota2notes.ir/user/${player.steamAccountId}`;
  const description = `دفتر مچ‌ها و روند بازی ${player.displayName} در Dota2Notes`;

  return {
    title: `${player.displayName} | Dota2Notes`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${player.displayName} | Dota2Notes`,
      description,
      url: canonical,
      siteName: "Dota2Notes",
      type: "profile",
      images: player.avatarUrl ? [{ url: player.avatarUrl }] : undefined,
    },
  };
}

export default async function UserPage({ params }: UserPageProps) {
  const { identifier } = await params;
  const player = await getPublicPlayer(identifier);
  if (!player) notFound();

  const canonicalIdentifier = String(player.steamAccountId);
  if (identifier.trim().toLowerCase() !== canonicalIdentifier) {
    redirect(`/user/${canonicalIdentifier}`);
  }

  return <MatchJournal initialPublicIdentifier={canonicalIdentifier} />;
}
