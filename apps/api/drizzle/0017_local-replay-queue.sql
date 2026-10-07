CREATE TABLE "local_replay_jobs" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"source" varchar(16),
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_replay_jobs_status_check" CHECK ("local_replay_jobs"."status" in ('pending','processing','waiting_file','completed','failed')),
	CONSTRAINT "local_replay_jobs_attempts_check" CHECK ("local_replay_jobs"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD CONSTRAINT "local_replay_jobs_match_id_dota_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."dota_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_replay_jobs_status_run_after_idx" ON "local_replay_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "dota_matches_started_at_idx" ON "dota_matches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "journal_matches_dota_match_id_idx" ON "journal_matches" USING btree ("dota_match_id");
