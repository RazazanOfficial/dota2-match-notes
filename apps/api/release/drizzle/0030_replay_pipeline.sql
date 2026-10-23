ALTER TABLE local_replay_jobs ADD COLUMN requested_by uuid;
--> statement-breakpoint
ALTER TABLE local_replay_jobs ADD COLUMN dispatched_at timestamptz;
--> statement-breakpoint
ALTER TABLE local_replay_jobs ADD COLUMN reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0);
--> statement-breakpoint
CREATE TABLE replay_archive_jobs (
 match_id bigint PRIMARY KEY REFERENCES dota_matches(match_id) ON DELETE CASCADE,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
 attempts integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 heartbeat_at timestamptz, error_code varchar(64), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX replay_archive_jobs_due_idx ON replay_archive_jobs(status, run_after);
--> statement-breakpoint
CREATE INDEX local_replay_jobs_owner_dispatch_idx ON local_replay_jobs(requested_by, dispatched_at);
--> statement-breakpoint
-- Preserve every checkpoint; adopt backups still outstanding.
INSERT INTO replay_archive_jobs(match_id) SELECT match_id FROM local_replay_jobs
 WHERE spool_complete AND spool_name IS NOT NULL AND archive_status='missing';
--> statement-breakpoint
UPDATE local_replay_jobs SET status='pending',phase='queued',run_after=now(),locked_at=NULL,
 error_code=NULL,error_message=NULL,updated_at=now()
 WHERE spool_complete AND spool_name IS NOT NULL AND status IN ('pending','processing')
 AND (phase IN ('uploading','checking_archive') OR error_code LIKE 'replay_archive%');
--> statement-breakpoint
