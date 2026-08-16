CREATE TABLE "dismissed_dota_matches" (
	"user_id" uuid NOT NULL,
	"dota_match_id" bigint NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_dota_matches_pkey" PRIMARY KEY("user_id","dota_match_id"),
	CONSTRAINT "dismissed_dota_matches_match_id_check" CHECK ("dismissed_dota_matches"."dota_match_id" > 0)
);
--> statement-breakpoint
ALTER TABLE "dismissed_dota_matches" ADD CONSTRAINT "dismissed_dota_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dismissed_dota_matches_dismissed_at_idx" ON "dismissed_dota_matches" USING btree ("dismissed_at");