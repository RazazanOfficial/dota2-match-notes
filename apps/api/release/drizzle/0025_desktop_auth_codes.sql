CREATE TABLE IF NOT EXISTS "desktop_auth_codes" (
  "code_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "challenge" varchar(43) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_auth_codes_expires_at_idx" ON "desktop_auth_codes" ("expires_at");
