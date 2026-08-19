CREATE TYPE "public"."match_ban_source" AS ENUM('manual', 'opendota');--> statement-breakpoint
CREATE TYPE "public"."match_role_source" AS ENUM('manual', 'opendota');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "hero_pool_entries" (
	"pool_version_id" uuid NOT NULL,
	"role" "match_role" NOT NULL,
	"hero_id" integer NOT NULL,
	"hero_name" varchar(100) NOT NULL,
	"sort_order" smallint NOT NULL,
	CONSTRAINT "hero_pool_entries_pkey" PRIMARY KEY("pool_version_id","role","hero_id"),
	CONSTRAINT "hero_pool_entries_sort_order_check" CHECK ("hero_pool_entries"."sort_order" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "hero_pool_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_pool_versions_version_check" CHECK ("hero_pool_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "release_note_reads" (
	"user_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_note_reads_pkey" PRIMARY KEY("user_id","release_id")
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(32) NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" varchar(500) DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"status" "release_status" DEFAULT 'draft' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_notes_version_length_check" CHECK (char_length("release_notes"."version") between 1 and 32)
);
--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "role_source" "match_role_source";--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "hero_pool_version_id" uuid;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "hero_pool_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "positive_points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD COLUMN "negative_points" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "match_bans" ADD COLUMN "source" "match_ban_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_bans" ADD COLUMN "team" smallint;--> statement-breakpoint
ALTER TABLE "match_bans" ADD COLUMN "draft_order" smallint;--> statement-breakpoint
ALTER TABLE "hero_pool_entries" ADD CONSTRAINT "hero_pool_entries_pool_version_id_hero_pool_versions_id_fk" FOREIGN KEY ("pool_version_id") REFERENCES "public"."hero_pool_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_pool_versions" ADD CONSTRAINT "hero_pool_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_reads" ADD CONSTRAINT "release_note_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_note_reads" ADD CONSTRAINT "release_note_reads_release_id_release_notes_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hero_pool_entries_role_sort_uidx" ON "hero_pool_entries" USING btree ("pool_version_id","role","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "hero_pool_versions_user_version_uidx" ON "hero_pool_versions" USING btree ("user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "hero_pool_versions_one_active_uidx" ON "hero_pool_versions" USING btree ("user_id") WHERE "hero_pool_versions"."is_active";--> statement-breakpoint
CREATE INDEX "release_note_reads_release_idx" ON "release_note_reads" USING btree ("release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_notes_version_uidx" ON "release_notes" USING btree ("version");--> statement-breakpoint
CREATE INDEX "release_notes_status_published_idx" ON "release_notes" USING btree ("status","published_at");--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_hero_pool_version_id_hero_pool_versions_id_fk" FOREIGN KEY ("hero_pool_version_id") REFERENCES "public"."hero_pool_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_positive_points_check" CHECK (jsonb_typeof("journal_matches"."positive_points") = 'array' and jsonb_array_length("journal_matches"."positive_points") <= 20);--> statement-breakpoint
ALTER TABLE "journal_matches" ADD CONSTRAINT "journal_matches_negative_points_check" CHECK (jsonb_typeof("journal_matches"."negative_points") = 'array' and jsonb_array_length("journal_matches"."negative_points") <= 20);