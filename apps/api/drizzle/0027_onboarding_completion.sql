ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp with time zone;
--> statement-breakpoint
-- Existing password accounts predate the completion marker. Keep their access intact.
-- Passwordless Steam accounts remain provisional and must finish registration.
UPDATE "users" SET "onboarding_completed_at" = "created_at"
WHERE "password_hash" IS NOT NULL AND "onboarding_completed_at" IS NULL;
