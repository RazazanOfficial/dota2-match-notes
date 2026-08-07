CREATE TABLE "match_image_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_image_uploads_size_check" CHECK ("match_image_uploads"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "match_image_uploads" ADD CONSTRAINT "match_image_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_image_uploads" ADD CONSTRAINT "match_image_uploads_match_id_journal_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."journal_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_image_uploads_object_key_uidx" ON "match_image_uploads" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "match_image_uploads_user_match_idx" ON "match_image_uploads" USING btree ("user_id","match_id");--> statement-breakpoint
CREATE INDEX "match_image_uploads_expires_at_idx" ON "match_image_uploads" USING btree ("expires_at");