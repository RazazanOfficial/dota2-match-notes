import { sql } from "drizzle-orm";
import { dotaMatches } from "@/lib/db/schema";

// The journal displays a scoreboard, not the replay timeline. Keep the
// fields read by extractMatchDetails and its position resolver, including
// the small timelines used to detect parsed replays.
const PLAYER_FIELDS = [
  "account_id", "personaname", "player_slot", "hero_id", "level",
  "kills", "deaths", "assists", "last_hits", "denies", "gold_per_min",
  "xp_per_min", "net_worth", "hero_damage", "tower_damage", "hero_healing",
  "item_0", "item_1", "item_2", "item_3", "item_4", "item_5",
  "backpack_0", "backpack_1", "backpack_2", "item_neutral", "item_neutral2",
  "aghanims_scepter", "aghanims_shard", "position_est", "lane_role",
  "is_roaming", "obs_placed", "sen_placed", "purchase_ward_observer",
  "purchase_ward_sentry", "purchase", "lh_t", "times", "gold_t", "xp_t",
];

const raw = dotaMatches.rawData;

export const journalMatchSummary = sql<unknown>`
  CASE WHEN ${raw} IS NULL THEN NULL ELSE jsonb_build_object(
    'match_id', ${raw}->'match_id',
    'start_time', ${raw}->'start_time',
    'duration', ${raw}->'duration',
    'radiant_win', ${raw}->'radiant_win',
    'radiant_score', ${raw}->'radiant_score',
    'dire_score', ${raw}->'dire_score',
    'version', ${raw}->'version',
    'picks_bans', ${raw}->'picks_bans',
    'players', (
      SELECT COALESCE(jsonb_agg(projected.player ORDER BY projected.ordinal), '[]'::jsonb)
      FROM (
        SELECT entry.ordinal,
          (SELECT COALESCE(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
           FROM jsonb_each(entry.player) AS field(key, value)
           WHERE field.key IN (${sql.join(PLAYER_FIELDS.map((field) => sql`${field}`), sql`, `)})) AS player
        FROM jsonb_array_elements(COALESCE(${raw}->'players', '[]'::jsonb))
          WITH ORDINALITY AS entry(player, ordinal)
      ) AS projected
    )
  ) END
`;
