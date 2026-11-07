ALTER TABLE sync_jobs ADD COLUMN manual_snapshot jsonb;
--> statement-breakpoint
CREATE TABLE sync_history_cache (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 from_day varchar(10) NOT NULL, history jsonb NOT NULL,
 checked_at timestamptz NOT NULL, reconciled_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE companion_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE match_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 match_id bigint NOT NULL CHECK (match_id>0), ended_at timestamptz NOT NULL,
 run_after timestamptz NOT NULL, deadline_at timestamptz NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), locked_at timestamptz, error_code varchar(64),
 CONSTRAINT match_observations_user_match_uidx UNIQUE(user_id, match_id)
);
--> statement-breakpoint
CREATE INDEX match_observations_due_idx ON match_observations(status,run_after);

--> statement-breakpoint
ALTER TABLE local_replay_jobs ADD COLUMN download_requested_at timestamptz;
