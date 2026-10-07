ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "recovery_email" varchar(254);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "recovery_email_verified_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_recovery_email_verified_uidx" ON "users" (lower("recovery_email")) WHERE "recovery_email_verified_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_recovery_codes" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "code_hash" varchar(255) NOT NULL,
 "used_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_recovery_codes_user_idx" ON "account_recovery_codes" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_email_challenges" (
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "purpose" varchar(16) NOT NULL,
 "email" varchar(254) NOT NULL,
 "code_hash" varchar(255) NOT NULL,
 "attempts" integer DEFAULT 0 NOT NULL,
 "expires_at" timestamp with time zone NOT NULL,
 "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "account_email_challenges_pk" PRIMARY KEY ("user_id","purpose"),
 CONSTRAINT "account_email_challenges_purpose_check" CHECK ("purpose" in ('verify','reset'))
);
