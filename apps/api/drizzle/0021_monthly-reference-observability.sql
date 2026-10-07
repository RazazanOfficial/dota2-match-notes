CREATE TABLE "monthly_reference_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"service" varchar(16) NOT NULL,
	"level" varchar(12) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_reference_events_service_check" CHECK ("monthly_reference_events"."service" in ('meta','performance','system')),
	CONSTRAINT "monthly_reference_events_level_check" CHECK ("monthly_reference_events"."level" in ('info','success','error'))
);
--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "meta_last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "performance_last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "meta_last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "performance_last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "meta_last_error" text;--> statement-breakpoint
ALTER TABLE "monthly_reference_versions" ADD COLUMN "performance_last_error" text;--> statement-breakpoint
ALTER TABLE "monthly_reference_events" ADD CONSTRAINT "monthly_reference_events_version_id_monthly_reference_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."monthly_reference_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_reference_events_version_time_idx" ON "monthly_reference_events" USING btree ("version_id","created_at");