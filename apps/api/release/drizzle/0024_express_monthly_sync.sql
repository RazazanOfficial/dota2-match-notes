ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_month_sync_at" timestamp with time zone;
