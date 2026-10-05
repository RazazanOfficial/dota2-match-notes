ALTER TABLE "journal_matches" ADD COLUMN "ban_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "journal_matches" SET "ban_override" = true
WHERE EXISTS (SELECT 1 FROM "match_bans" WHERE "match_bans"."match_id" = "journal_matches"."id" AND "match_bans"."source" = 'manual');
