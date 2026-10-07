CREATE TABLE "monthly_hero_performance_reference" (
	"reference_month" date NOT NULL,
	"version_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"rank_group" varchar(24) NOT NULL,
	"minute" smallint NOT NULL,
	"sample_count" integer NOT NULL,
	"cs" double precision NOT NULL,
	"dn" double precision NOT NULL,
	"kills" double precision NOT NULL,
	"deaths" double precision NOT NULL,
	"assists" double precision NOT NULL,
	"networth" double precision NOT NULL,
	"xp" double precision NOT NULL,
	"hero_damage" double precision NOT NULL,
	"tower_damage" double precision NOT NULL,
	"healing_allies" double precision NOT NULL,
	"camps_stacked" double precision NOT NULL,
	"neutrals" double precision NOT NULL,
	"ancients" double precision NOT NULL,
	"team_kills" double precision NOT NULL,
	CONSTRAINT "monthly_hero_performance_reference_reference_month_version_id_hero_id_position_rank_group_minute_pk" PRIMARY KEY("reference_month","version_id","hero_id","position","rank_group","minute"),
	CONSTRAINT "monthly_hero_performance_minute_check" CHECK ("monthly_hero_performance_reference"."minute" between 0 and 75),
	CONSTRAINT "monthly_hero_performance_count_check" CHECK ("monthly_hero_performance_reference"."sample_count" > 0)
 ) PARTITION BY RANGE ("reference_month");
--> statement-breakpoint
CREATE TABLE "monthly_hero_position_meta" (
	"reference_month" date NOT NULL,
	"version_id" uuid NOT NULL,
	"hero_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"rank_bracket" varchar(20) NOT NULL,
	"game_mode" integer NOT NULL,
	"match_count" integer NOT NULL,
	"win_count" integer NOT NULL,
	"position_share" double precision NOT NULL,
	"meta_pick_rate" double precision NOT NULL,
	"win_rate" double precision NOT NULL,
	CONSTRAINT "monthly_hero_position_meta_reference_month_version_id_hero_id_position_rank_bracket_game_mode_pk" PRIMARY KEY("reference_month","version_id","hero_id","position","rank_bracket","game_mode"),
	CONSTRAINT "monthly_meta_position_check" CHECK ("monthly_hero_position_meta"."position" between 1 and 5),
	CONSTRAINT "monthly_meta_count_check" CHECK ("monthly_hero_position_meta"."match_count" >= 0 and "monthly_hero_position_meta"."win_count" >= 0 and "monthly_hero_position_meta"."win_count" <= "monthly_hero_position_meta"."match_count")
 ) PARTITION BY RANGE ("reference_month");
--> statement-breakpoint
CREATE TABLE "monthly_position_performance_reference" (
	"reference_month" date NOT NULL,
	"version_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"rank_group" varchar(24) NOT NULL,
	"minute" smallint NOT NULL,
	"sample_count" integer NOT NULL,
	"cs" double precision NOT NULL,
	"dn" double precision NOT NULL,
	"kills" double precision NOT NULL,
	"deaths" double precision NOT NULL,
	"assists" double precision NOT NULL,
	"networth" double precision NOT NULL,
	"xp" double precision NOT NULL,
	"hero_damage" double precision NOT NULL,
	"tower_damage" double precision NOT NULL,
	"healing_allies" double precision NOT NULL,
	"camps_stacked" double precision NOT NULL,
	"neutrals" double precision NOT NULL,
	"ancients" double precision NOT NULL,
	"team_kills" double precision NOT NULL,
	CONSTRAINT "monthly_position_performance_reference_reference_month_version_id_position_rank_group_minute_pk" PRIMARY KEY("reference_month","version_id","position","rank_group","minute"),
	CONSTRAINT "monthly_position_performance_minute_check" CHECK ("monthly_position_performance_reference"."minute" between 0 and 75),
	CONSTRAINT "monthly_position_performance_count_check" CHECK ("monthly_position_performance_reference"."sample_count" > 0)
 ) PARTITION BY RANGE ("reference_month");
--> statement-breakpoint
CREATE TABLE "monthly_reference_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_month" date NOT NULL,
	"status" varchar(16) DEFAULT 'building' NOT NULL,
	"meta_cursor" integer DEFAULT 0 NOT NULL,
	"performance_cursor" integer DEFAULT 0 NOT NULL,
	"meta_rows" integer DEFAULT 0 NOT NULL,
	"hero_rows" integer DEFAULT 0 NOT NULL,
	"position_rows" integer DEFAULT 0 NOT NULL,
	"source_policy" varchar(40) DEFAULT 'stratz-ranked-assumed' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_reference_versions_status_check" CHECK ("monthly_reference_versions"."status" in ('building','active','retired','failed')),
	CONSTRAINT "monthly_reference_versions_cursors_check" CHECK ("monthly_reference_versions"."meta_cursor" >= 0 and "monthly_reference_versions"."performance_cursor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "monthly_hero_performance_reference" ADD CONSTRAINT "monthly_hero_performance_reference_version_id_monthly_reference_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."monthly_reference_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_hero_position_meta" ADD CONSTRAINT "monthly_hero_position_meta_version_id_monthly_reference_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."monthly_reference_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_position_performance_reference" ADD CONSTRAINT "monthly_position_performance_reference_version_id_monthly_reference_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."monthly_reference_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_reference_versions_month_status_idx" ON "monthly_reference_versions" USING btree ("reference_month","status");
