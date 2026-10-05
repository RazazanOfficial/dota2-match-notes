interface ExistingJournalMatch {
  id: string;
  dotaMatchId: number | null;
}

export function collectDismissedDotaMatchIds(
  existingMatches: ExistingJournalMatch[],
  incomingIds: ReadonlySet<string>,
) {
  return existingMatches.flatMap((match) =>
    !incomingIds.has(match.id) && match.dotaMatchId !== null
      ? [match.dotaMatchId]
      : [],
  );
}
