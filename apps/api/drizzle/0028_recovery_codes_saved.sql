ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "recovery_codes_saved_at" timestamp with time zone;
--> statement-breakpoint
-- Accounts completed before this milestone are grandfathered; provisional accounts must save their codes.
UPDATE "users" SET "recovery_codes_saved_at" = "onboarding_completed_at"
WHERE "onboarding_completed_at" IS NOT NULL AND "recovery_codes_saved_at" IS NULL;
