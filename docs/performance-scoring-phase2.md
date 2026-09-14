# Performance Intelligence — Phase 2

## Non-negotiable scoring rule

The Performance Score uses external global hero distributions only. The ten players in the current match and matches stored by Dota2 Notes users are never used as benchmark populations. When no global benchmark exists, the score is unavailable rather than fabricated as zero or derived from the lobby.

## Score pipeline

1. Read the raw global OpenDota hero percentile.
2. Read the seven-day STRATZ `Hero + Position + Rank + Mode` population snapshot.
3. Classify the played position as `main`, `sub`, or `rare` for that hero.
4. Keep the raw percentile for transparency, but shrink position-sensitive hero-level percentiles toward 50 when the played position is unusual or the position sample is small.
5. Apply metric relevance for the resolved Position.
6. Aggregate metrics inside six domains and aggregate available domains into the final score.

The shrinkage is:

`adjusted = 50 + (raw - 50) × applicability`

Applicability depends on position tier, Hero + Position sample confidence, and metric sensitivity. Pick rarity itself is not a reward or penalty. It only limits confidence in a hero-level benchmark that does not separate positions.

## Position priorities

| Position | Higher relevance | Lower relevance |
| --- | --- | --- |
| 1 Carry | GPM, LH, lane economy, tower pressure | assists, utility healing |
| 2 Mid | XPM, lane efficiency, kills, hero damage | utility healing |
| 3 Offlane | fight participation, survival, damage, objectives | pure LH/GPM |
| 4 Soft Support | assists, fight participation, utility | LH and raw GPM |
| 5 Hard Support | assists, fight participation, utility/healing | LH and raw GPM |

These weights change relevance, not the observed percentile.

## Lane Impact

Lane Impact is contextual and is not injected into the global Performance Score until a trustworthy global Position-specific lane distribution exists.

- Core: NW, XP, LH, Deny, kills and deaths through minute 10.
- Support: XP, kills/deaths, lane consumables, Observer and Sentry actions through minute 10.
- A Support is not penalized merely for low LH or Net Worth.
- The lane opponent is selected by physical matchup mapping: Pos 1 ↔ Pos 3, Pos 5 ↔ Pos 4, and Pos 2 ↔ Pos 2.

## Vision and detection

- Observer natural lifetime: 360 seconds; a life of at least 300 seconds is reported as healthy.
- Sentry natural lifetime: 420 seconds; it is tracked separately from Observer.
- Early-lane wards use a more tolerant early-deward threshold than later wards.
- Dust and Gem count as mobile detection. Sentry does not substitute for Dust because it only reveals a fixed area.
- A productive-Sentry value is explicitly an estimate bounded by recorded Observer/Sentry dewards.
- Tango, Healing Salve (`flask`), Mango, Clarity and Faerie Fire purchased before minute 10 are retained as lane-resource context.

## Gem and Divine Rapier ownership

Ownership analysis is evidence-based:

- Purchase Log proves the buyer and purchase time.
- Final inventory proves the final holder.
- A unique buyer and a different unique final holder prove an inferred ally/enemy transfer with high confidence.
- Net Worth changes alone never prove ownership transfer.
- The OpenDota payload does not expose a complete minute-by-minute inventory ownership timeline for dropped Gem/Rapier items. Consequently, transfer time and post-transfer impact are left unavailable instead of guessed.

## Reference regression matches

- `8996016011`: Dark Seer Pos 3
- `8993503674`: Necrophos Pos 3 and Phoenix Pos 3 comparison
- `8993295425`: Necrophos Pos 3 and Bane Pos 5 lane-impact scenario

Tests use curated facts from these matches and synthetic transfer cases. They do not make network calls and do not persist user-match data as a benchmark.
