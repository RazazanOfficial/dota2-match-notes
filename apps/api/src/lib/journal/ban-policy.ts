// Imported matches show only the actual provider draft. Preserve historic
// manual bans only for entries without an OpenDota match summary.
export function selectVisibleBans<A, B>(openDotaSummary: unknown, providerBans: A[], historicBans: B[]): Array<A | B> {
  return openDotaSummary === null || openDotaSummary === undefined ? historicBans : providerBans;
}
