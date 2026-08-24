CREATE TABLE "match_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"hero_name" varchar(100) NOT NULL,
	"sort_order" smallint NOT NULL,
	"player_slot" smallint,
	"team" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_picks_sort_order_check" CHECK ("match_picks"."sort_order" between 0 and 8)
);
--> statement-breakpoint
CREATE TABLE "password_login_attempts" (
	"key_hash" varchar(64) PRIMARY KEY NOT NULL,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_login_attempts_failed_attempts_check" CHECK ("password_login_attempts"."failed_attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_picks" ADD CONSTRAINT "match_picks_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_picks_match_hero_uidx" ON "match_picks" USING btree ("match_id","hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_picks_match_sort_uidx" ON "match_picks" USING btree ("match_id","sort_order");--> statement-breakpoint
CREATE INDEX "match_picks_match_id_idx" ON "match_picks" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "password_login_attempts_updated_at_idx" ON "password_login_attempts" USING btree ("updated_at");