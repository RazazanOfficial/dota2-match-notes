CREATE TABLE "hero_benchmark_distributions" (
	"snapshot_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"rank_bracket" varchar(20) DEFAULT 'ALL' NOT NULL,
	"game_mode" integer DEFAULT 0 NOT NULL,
	"patch" varchar(32) DEFAULT '' NOT NULL,
	"metric" varchar(64) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"sample_count" integer,
	"quantiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "hero_benchmark_distributions_pkey" PRIMARY KEY("snapshot_id","hero_id","position","rank_bracket","game_mode","patch","metric","provider"),
	CONSTRAINT "hero_benchmark_distributions_position_check" CHECK ("hero_benchmark_distributions"."position" between 0 and 5),
	CONSTRAINT "hero_benchmark_distributions_sample_check" CHECK ("hero_benchmark_distributions"."sample_count" is null or "hero_benchmark_distributions"."sample_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hero_position_meta" (
	"snapshot_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"rank_bracket" varchar(20) NOT NULL,
	"game_mode" integer NOT NULL,
	"match_count" integer NOT NULL,
	"win_count" integer NOT NULL,
	"position_share" real NOT NULL,
	"meta_pick_rate" real NOT NULL,
	"win_rate" real NOT NULL,
	CONSTRAINT "hero_position_meta_pkey" PRIMARY KEY("snapshot_id","hero_id","position","rank_bracket","game_mode"),
	CONSTRAINT "hero_position_meta_position_check" CHECK ("hero_position_meta"."position" between 1 and 5),
	CONSTRAINT "hero_position_meta_counts_check" CHECK ("hero_position_meta"."match_count" >= 0 and "hero_position_meta"."win_count" >= 0 and "hero_position_meta"."win_count" <= "hero_position_meta"."match_count"),
	CONSTRAINT "hero_position_meta_rates_check" CHECK ("hero_position_meta"."position_share" between 0 and 100 and "hero_position_meta"."meta_pick_rate" between 0 and 100 and "hero_position_meta"."win_rate" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "performance_reference_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(16) DEFAULT 'building' NOT NULL,
	"window_days" smallint DEFAULT 7 NOT NULL,
	"fetched_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"source_summary" varchar(80) DEFAULT 'stratz+opendota' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_reference_snapshots_status_check" CHECK ("performance_reference_snapshots"."status" in ('building','active','retired','failed')),
	CONSTRAINT "performance_reference_snapshots_window_check" CHECK ("performance_reference_snapshots"."window_days" between 1 and 30)
);
--> statement-breakpoint
ALTER TABLE "hero_benchmark_distributions" ADD CONSTRAINT "hero_benchmark_distributions_snapshot_id_performance_reference_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."performance_reference_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_position_meta" ADD CONSTRAINT "hero_position_meta_snapshot_id_performance_reference_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."performance_reference_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hero_benchmark_distributions_lookup_idx" ON "hero_benchmark_distributions" USING btree ("hero_id","position","rank_bracket","game_mode","metric");--> statement-breakpoint
CREATE INDEX "hero_position_meta_lookup_idx" ON "hero_position_meta" USING btree ("hero_id","position","rank_bracket","game_mode");--> statement-breakpoint
CREATE INDEX "performance_reference_snapshots_status_activated_idx" ON "performance_reference_snapshots" USING btree ("status","activated_at");