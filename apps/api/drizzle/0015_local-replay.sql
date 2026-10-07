ALTER TABLE "dota_matches" ADD COLUMN "local_replay_data" jsonb;--> statement-breakpoint
ALTER TABLE "dota_matches" ADD COLUMN "local_replay_parsed_at" timestamp with time zone;