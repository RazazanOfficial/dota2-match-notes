CREATE TABLE "replay_job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" bigint NOT NULL,
	"phase" varchar(24) NOT NULL,
	"code" varchar(64),
	"detail" text NOT NULL,
	"endpoint" text,
	"address" varchar(64),
	"http_status" integer,
	"transferred_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replay_transport_routes" (
	"route_key" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"address" varchar(64) NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"open_until" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "phase" varchar(24) DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "phase_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "request_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "retry_deadline_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "downloaded_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "total_bytes" bigint;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "transfer_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "upload_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "download_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "spool_name" varchar(64);--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "spool_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "spool_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "spool_etag" varchar(256);--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "spool_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "last_endpoint" text;--> statement-breakpoint
ALTER TABLE "local_replay_jobs" ADD COLUMN "last_address" varchar(64);--> statement-breakpoint
ALTER TABLE "replay_job_events" ADD CONSTRAINT "replay_job_events_match_id_dota_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."dota_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "replay_job_events_match_created_idx" ON "replay_job_events" USING btree ("match_id","created_at");--> statement-breakpoint
CREATE INDEX "replay_job_events_created_idx" ON "replay_job_events" USING btree ("created_at");
--> statement-breakpoint
UPDATE local_replay_jobs SET phase = CASE WHEN status = 'completed' THEN 'completed' WHEN status = 'failed' THEN 'failed'
 WHEN status = 'processing' THEN 'checking_archive' ELSE 'queued' END;
