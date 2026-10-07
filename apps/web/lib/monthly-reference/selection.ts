type RankMeta = {
  heroId: number; position: number; rankBracket: string; gameMode: number;
  matchCount: number; winCount: number;
};
type PositionTotal = { position: number; gameMode: number; count: number };

// The scoring population is the pooled Divine + Immortal cohort, independent
// of the individual user's rank. Counts and win rates must be pooled by sample
// size; averaging the two brackets' percentages would skew small cohorts.
export function poolDivineImmortalMeta(rows: RankMeta[], positionTotals: PositionTotal[]) {
  const pooled = new Map<string, Omit<RankMeta, "rankBracket">>();
  const heroTotals = new Map<string, number>();
  const totals = new Map(positionTotals.map(row => [`${row.position}:${row.gameMode}`, Number(row.count)]));
  for (const row of rows) {
    if (row.rankBracket !== "DIVINE" && row.rankBracket !== "IMMORTAL") continue;
    const key = `${row.heroId}:${row.position}:${row.gameMode}`;
    const current = pooled.get(key);
    if (current) { current.matchCount += row.matchCount; current.winCount += row.winCount; }
    else pooled.set(key, { heroId: row.heroId, position: row.position, gameMode: row.gameMode,
      matchCount: row.matchCount, winCount: row.winCount });
    const heroKey = `${row.heroId}:${row.gameMode}`;
    heroTotals.set(heroKey, (heroTotals.get(heroKey) ?? 0) + row.matchCount);
  }
  return [...pooled.values()].filter(row => row.matchCount > 0).map(row => {
    const heroTotal = heroTotals.get(`${row.heroId}:${row.gameMode}`) ?? 0;
    const positionSampleCount = totals.get(`${row.position}:${row.gameMode}`) ?? row.matchCount;
    return { ...row, rankBracket: "DIVINE_IMMORTAL", positionSampleCount,
      positionShare: heroTotal > 0 ? row.matchCount / heroTotal * 100 : 0,
      metaPickRate: positionSampleCount > 0 ? row.matchCount / positionSampleCount * 100 : 0,
      winRate: row.winCount / row.matchCount * 100 };
  });
}
