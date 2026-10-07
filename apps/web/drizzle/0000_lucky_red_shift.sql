CREATE TYPE "public"."match_result" AS ENUM('win', 'loss');--> statement-breakpoint
CREATE TYPE "public"."match_role" AS ENUM('safe_lane', 'mid_lane', 'off_lane', 'soft_support', 'hard_support');--> statement-breakpoint
CREATE TYPE "public"."match_source" AS ENUM('manual', 'steam', 'opendota');--> statement-breakpoint
CREATE TYPE "public"."queue_type" AS ENUM('role_selected', 'earn_role_queue');--> statement-breakpoint
CREATE TYPE "public"."sync_job_kind" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "dota_matches" (
	"match_id" bigint PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone,
	"duration_seconds" integer,
	"radiant_win" boolean,
	"game_mode" integer,
	"lobby_type" integer,
	"raw_data" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"dota_match_id" bigint,
	"source" "match_source" DEFAULT 'manual' NOT NULL,
	"number" smallint NOT NULL,
	"hero_id" integer,
	"hero_name" varchar(100) DEFAULT '' NOT NULL,
	"role" "match_role",
	"queue_type" "queue_type",
	"result" "match_result" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"duration_seconds" integer,
	"kills" smallint,
	"deaths" smallint,
	"assists" smallint,
	"gold_per_minute" smallint,
	"xp_per_minute" smallint,
	"net_worth" integer,
	"hero_damage" integer,
	"tower_damage" integer,
	"generated_image_key" text,
	"generated_image_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_matches_number_check" CHECK ("journal_matches"."number" > 0),
	CONSTRAINT "journal_matches_duration_check" CHECK ("journal_matches"."duration_seconds" is null or "journal_matches"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"hero_name" varchar(100) NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_bans_sort_order_check" CHECK ("match_bans"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "match_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt_text" varchar(500) DEFAULT '' NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_images_sort_order_check" CHECK ("match_images"."sort_order" between 1 and 3),
	CONSTRAINT "match_images_size_check" CHECK ("match_images"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "sync_job_kind" NOT NULL,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_jobs_attempts_check" CHECK ("sync_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"steam_id" varchar(20) NOT NULL,
	"steam_account_id" bigint NOT NULL,
	"handle" varchar(32) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" text,
	"profile_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_manual_sync_at" timestamp with time zone,
	"last_scheduled_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_length_check" CHECK (char_length("users"."handle") between 3 and 32)
);
--> statement-breakpoint
ALTER TABLE "journal_days" ADD CONSTRAINT "journal_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_day_id_journal_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."journal_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_dota_match_id_dota_matches_match_id_fk" FOREIGN KEY ("dota_match_id") REFERENCES "public"."dota_matches"("match_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_bans" ADD CONSTRAINT "match_bans_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_images" ADD CONSTRAINT "match_images_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_days_user_day_uidx" ON "journal_days" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "journal_days_user_id_idx" ON "journal_days" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_matches_day_number_uidx" ON "journal_matches" USING btree ("day_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_matches_user_dota_match_uidx" ON "journal_matches" USING btree ("user_id","dota_match_id");--> statement-breakpoint
CREATE INDEX "journal_matches_user_started_at_idx" ON "journal_matches" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "journal_matches_day_id_idx" ON "journal_matches" USING btree ("day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_bans_match_hero_uidx" ON "match_bans" USING btree ("match_id","hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_bans_match_sort_uidx" ON "match_bans" USING btree ("match_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "match_images_object_key_uidx" ON "match_images" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "match_images_match_sort_uidx" ON "match_images" USING btree ("match_id","sort_order");--> statement-breakpoint
CREATE INDEX "match_images_match_id_idx" ON "match_images" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_run_after_idx" ON "sync_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "sync_jobs_user_id_idx" ON "sync_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_active_per_user_uidx" ON "sync_jobs" USING btree ("user_id") WHERE "sync_jobs"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE UNIQUE INDEX "users_steam_id_uidx" ON "users" USING btree ("steam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_steam_account_id_uidx" ON "users" USING btree ("steam_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_uidx" ON "users" USING btree (lower("handle"));